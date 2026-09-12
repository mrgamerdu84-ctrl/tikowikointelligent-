package com.tikowiko.intelligent;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

// Plugin maison : liste/lance les applications et contrôle l'activation par double claquement.
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
        call.resolve(result);
    }
}
