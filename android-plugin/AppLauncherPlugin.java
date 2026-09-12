package com.tikowiko.intelligent;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

// Plugin maison : lance les applications, prépare les rendez-vous, ouvre les contacts / le composeur,
// aide à retrouver le téléphone et contrôle la détection locale / le profil personnel de claquement.
@CapacitorPlugin(name = "AppLauncher")
public class AppLauncherPlugin extends Plugin {

    private final Handler findPhoneHandler = new Handler(Looper.getMainLooper());
    private Ringtone findPhoneRingtone;
    private Vibrator findPhoneVibrator;
    private AudioManager findPhoneAudioManager;
    private Integer previousAlarmVolume;
    private final Runnable stopFindPhoneRunnable = this::stopFindPhoneInternal;

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

    /** Ouvre directement l'écran Android où l'utilisateur peut choisir son assistant numérique. */
    @PluginMethod
    public void openAssistantSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                intent = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossible d'ouvrir les réglages de l'assistant : " + e.getMessage());
        }
    }

    /** Indique si Tikowiko est actuellement l'assistant Android par défaut. */
    @PluginMethod
    public void getAssistantStatus(PluginCall call) {
        JSObject result = new JSObject();
        try {
            // Le nom de cette clé Secure n'est pas exposé comme constante publique sur
            // toutes les versions du SDK Android, on utilise donc sa clé système stable.
            String assistant = Settings.Secure.getString(
                    getContext().getContentResolver(),
                    "assistant"
            );
            ComponentName selected = assistant == null || assistant.isEmpty()
                    ? null
                    : ComponentName.unflattenFromString(assistant);
            boolean isTikowiko = selected != null
                    && getContext().getPackageName().equals(selected.getPackageName());

            result.put("isDefault", isTikowiko);
            result.put("selectedPackage", selected == null ? "" : selected.getPackageName());
            call.resolve(result);
        } catch (Exception e) {
            result.put("isDefault", false);
            result.put("selectedPackage", "");
            result.put("statusUnavailable", true);
            call.resolve(result);
        }
    }

    /**
     * Fait sonner et vibrer le téléphone pendant quelques secondes pour le retrouver.
     * Le volume d'alarme est temporairement augmenté puis restauré. Le mode Ne pas déranger
     * reste sous le contrôle d'Android : Tikowiko ne cherche pas à le contourner.
     */
    @PluginMethod
    public void findMyPhone(PluginCall call) {
        Integer requestedSeconds = call.getInt("seconds");
        int seconds = requestedSeconds == null ? 12 : Math.max(5, Math.min(requestedSeconds, 30));

        try {
            stopFindPhoneInternal();

            Context context = getContext();
            findPhoneAudioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (findPhoneAudioManager != null) {
                previousAlarmVolume = findPhoneAudioManager.getStreamVolume(AudioManager.STREAM_ALARM);
                int max = findPhoneAudioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                findPhoneAudioManager.setStreamVolume(AudioManager.STREAM_ALARM, max, 0);
            }

            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            if (sound != null) {
                findPhoneRingtone = RingtoneManager.getRingtone(context, sound);
                if (findPhoneRingtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        findPhoneRingtone.setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                    }
                    findPhoneRingtone.play();
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                findPhoneVibrator = manager == null ? null : manager.getDefaultVibrator();
            } else {
                findPhoneVibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }

            if (findPhoneVibrator != null && findPhoneVibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 550, 250, 550, 250, 900};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    findPhoneVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    findPhoneVibrator.vibrate(pattern, 0);
                }
            }

            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (powerManager != null && !powerManager.isInteractive()) {
                PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "tikowiko:find-phone"
                );
                wakeLock.acquire(3000L);
            }

            findPhoneHandler.removeCallbacks(stopFindPhoneRunnable);
            findPhoneHandler.postDelayed(stopFindPhoneRunnable, seconds * 1000L);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("seconds", seconds);
            call.resolve(result);
        } catch (Exception e) {
            stopFindPhoneInternal();
            call.reject("Impossible de faire sonner le téléphone : " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopFindMyPhone(PluginCall call) {
        stopFindPhoneInternal();
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    private void stopFindPhoneInternal() {
        findPhoneHandler.removeCallbacks(stopFindPhoneRunnable);

        if (findPhoneRingtone != null) {
            try { findPhoneRingtone.stop(); } catch (Exception ignored) {}
            findPhoneRingtone = null;
        }

        if (findPhoneVibrator != null) {
            try { findPhoneVibrator.cancel(); } catch (Exception ignored) {}
            findPhoneVibrator = null;
        }

        if (findPhoneAudioManager != null && previousAlarmVolume != null) {
            try {
                findPhoneAudioManager.setStreamVolume(
                        AudioManager.STREAM_ALARM,
                        previousAlarmVolume,
                        0
                );
            } catch (Exception ignored) {}
        }

        previousAlarmVolume = null;
        findPhoneAudioManager = null;
    }

    @PluginMethod
    public void openContactOrDialer(PluginCall call) {
        String target = call.getString("target");
        if (target == null || target.trim().isEmpty()) {
            call.reject("Contact ou numéro manquant");
            return;
        }

        String value = target.trim();
        Intent intent;
        String mode;

        if (value.matches("^[+0-9][0-9 .()\\-]{3,}$")) {
            String number = value.replaceAll("[^0-9+]", "");
            intent = new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null));
            mode = "dialer";
        } else {
            Uri searchUri = Uri.withAppendedPath(
                    ContactsContract.Contacts.CONTENT_FILTER_URI,
                    Uri.encode(value)
            );
            intent = new Intent(Intent.ACTION_VIEW, searchUri);
            mode = "contact-search";
        }

        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Aucune application Téléphone/Contacts compatible n'est disponible");
            return;
        }

        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("mode", mode);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossible d'ouvrir le téléphone : " + e.getMessage());
        }
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
        if (!hasMicrophonePermission()) {
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
            prefs().edit().putBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false).apply();

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
        boolean enabled = prefs().getBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false);

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

        boolean enabled = prefs().getBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false);
        prefs().edit().putString(ClapDetectionService.PREF_CLAP_SENSITIVITY, sensitivity).apply();

        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("sensitivity", sensitivity);
        call.resolve(result);
    }

    @PluginMethod
    public void startClapProfileTraining(PluginCall call) {
        if (!hasMicrophonePermission()) {
            call.reject("PERMISSION_MICRO_REQUIRED");
            return;
        }

        try {
            boolean activationAlreadyEnabled = prefs()
                    .getBoolean(ClapDetectionService.PREF_CLAP_ENABLED, false);

            Intent service = new Intent(getContext(), ClapDetectionService.class);
            service.setAction(ClapDetectionService.ACTION_TRAIN_PROFILE);
            service.putExtra(ClapDetectionService.EXTRA_TRAINING_ONLY, !activationAlreadyEnabled);
            ContextCompat.startForegroundService(getContext(), service);

            JSObject result = buildProfileStatus();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossible de démarrer l'apprentissage : " + e.getMessage());
        }
    }

    @PluginMethod
    public void getClapProfileStatus(PluginCall call) {
        call.resolve(buildProfileStatus());
    }

    @PluginMethod
    public void setPersonalClapMode(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Paramètre enabled manquant");
            return;
        }

        if (enabled && !prefs().getBoolean(ClapDetectionService.PREF_PROFILE_TRAINED, false)) {
            call.reject("Il faut d'abord apprendre ton profil de claquement");
            return;
        }

        prefs().edit().putBoolean(ClapDetectionService.PREF_PROFILE_ENABLED, enabled).apply();
        call.resolve(buildProfileStatus());
    }

    @PluginMethod
    public void resetClapProfile(PluginCall call) {
        prefs().edit()
                .remove(ClapDetectionService.PREF_PROFILE_F1)
                .remove(ClapDetectionService.PREF_PROFILE_F2)
                .remove(ClapDetectionService.PREF_PROFILE_F3)
                .putBoolean(ClapDetectionService.PREF_PROFILE_TRAINED, false)
                .putBoolean(ClapDetectionService.PREF_PROFILE_ENABLED, false)
                .putBoolean(ClapDetectionService.PREF_PROFILE_TRAINING, false)
                .putInt(ClapDetectionService.PREF_PROFILE_TRAINING_COUNT, 0)
                .apply();

        call.resolve(buildProfileStatus());
    }

    private JSObject buildProfileStatus() {
        SharedPreferences p = prefs();
        JSObject result = new JSObject();
        result.put("trained", p.getBoolean(ClapDetectionService.PREF_PROFILE_TRAINED, false));
        result.put("enabled", p.getBoolean(ClapDetectionService.PREF_PROFILE_ENABLED, false));
        result.put("training", p.getBoolean(ClapDetectionService.PREF_PROFILE_TRAINING, false));
        result.put("samples", p.getInt(ClapDetectionService.PREF_PROFILE_TRAINING_COUNT, 0));
        result.put("target", ClapDetectionService.PROFILE_SAMPLE_TARGET);
        return result;
    }

    private boolean hasMicrophonePermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(ClapDetectionService.PREFS, 0);
    }

    private String getSavedSensitivity() {
        String saved = prefs().getString(
                ClapDetectionService.PREF_CLAP_SENSITIVITY,
                ClapDetectionService.SENSITIVITY_NORMAL
        );
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
