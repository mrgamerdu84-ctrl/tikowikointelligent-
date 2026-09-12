package com.tikowiko.intelligent;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.CalendarContract;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

// Plugin maison : liste/lance les applications, contrôle le double claquement
// et prépare des rendez-vous dans l'agenda Android.
@CapacitorPlugin(name = "AppLauncher")
public class AppLauncherPlugin extends Plugin {

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent launchable = new Intent(Intent.ACTION_MAIN, null);
        launchable.addCategory(Intent.CATEGORY_LAUNCHER);
        List<android.content.pm.ResolveInfo> resolved = pm.queryIntentActivities(launchable, 0);

        JSArray apps = new JSArray();
        for (android.content.pm.ResolveInfo info : resolved) {
            ApplicationInfo appInfo = info.activityInfo.applicationInfo;
            String label = pm.getApplicationLabel(appInfo).toString();
            String packageName = appInfo.packageName;

            JSObject app = new JSObject();
            app.put("label", label);
            app.put("packageName", packageName);
            apps.put(app);
        }

        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null) {
            call.reject("packageName manquant");
            return;
        }

        PackageManager pm = getContext().getPackageManager();
        Intent launchIntent = pm.getLaunchIntentForPackage(packageName);

        if (launchIntent == null) {
            call.reject("Impossible de trouver ou lancer : " + packageName);
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launchIntent);
        call.resolve();
    }

    @PluginMethod
    public void createCalendarEvent(PluginCall call) {
        String title = call.getString("title");
        Long startMillis = call.getLong("startMillis");
        Long endMillis = call.getLong("endMillis");

        if (title == null || title.trim().isEmpty()) {
            call.reject("Titre du rendez-vous manquant");
            return;
        }
        if (startMillis == null) {
            call.reject("Date ou heure du rendez-vous manquante");
            return;
        }
        if (endMillis == null || endMillis <= startMillis) {
            endMillis = startMillis + 60L * 60L * 1000L;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_INSERT)
                    .setData(CalendarContract.Events.CONTENT_URI)
                    .putExtra(CalendarContract.Events.TITLE, title.trim())
                    .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
                    .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("Aucune application d'agenda compatible n'est installée");
                return;
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossible d'ouvrir l'agenda : " + e.getMessage());
        }
    }

    @PluginMethod
    public void startClapActivation(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("PERMISSION_MICRO_REQUIRED");
            return;
        }

        try {
            Intent service = new Intent(getContext(), ClapDetectionService.class);
            ContextCompat.startForegroundService(getContext(), service);
            JSObject result = new JSObject();
            result.put("enabled", true);
            result.put("sensitivity", getSavedSensitivity());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossible d'activer le double claquement : " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopClapActivation(PluginCall call) {
        try {
            Intent service = new Intent(getContext(), ClapDetectionService.class);
            getContext().stopService(service);
            getContext().getSharedPreferences(ClapDetectionService.PREFS, 0)
                    .edit().putBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false).apply();

            JSObject result = new JSObject();
            result.put("enabled", false);
            result.put("sensitivity", getSavedSensitivity());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossible de désactiver le double claquement : " + e.getMessage());
        }
    }

    @PluginMethod
    public void getClapActivationStatus(PluginCall call) {
        boolean enabled = getContext()
                .getSharedPreferences(ClapDetectionService.PREFS, 0)
                .getBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false);

        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("sensitivity", getSavedSensitivity());
        call.resolve(result);
    }

    @PluginMethod
    public void setClapSensitivity(PluginCall call) {
        String sensitivity = normalizeSensitivity(call.getString("sensitivity"));
        if (sensitivity == null) {
            call.reject("Sensibilité invalide. Valeurs possibles : low, normal, high");
            return;
        }

        boolean enabled = getContext()
                .getSharedPreferences(ClapDetectionService.PREFS, 0)
                .getBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false);

        getContext().getSharedPreferences(ClapDetectionService.PREFS, 0)
                .edit().putString(ClapDetectionService.PREF_CLAP_SENSITIVITY, sensitivity).apply();

        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("sensitivity", sensitivity);
        call.resolve(result);
    }

    private String getSavedSensitivity() {
        String saved = getContext()
                .getSharedPreferences(ClapDetectionService.PREFS, 0)
                .getString(ClapDetectionService.PREF_CLAP_SENSITIVITY, ClapDetectionService.SENSITIVITY_NORMAL);
        String normalized = normalizeSensitivity(saved);
        return normalized == null ? ClapDetectionService.SENSITIVITY_NORMAL : normalized;
    }

    private String normalizeSensitivity(String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase();
        if (ClapDetectionService.SENSITIVITY_LOW.equals(normalized)
                || ClapDetectionService.SENSITIVITY_NORMAL.equals(normalized)
                || ClapDetectionService.SENSITIVITY_HIGH.equals(normalized)) {
            return normalized;
        }
        return null;
    }
}
