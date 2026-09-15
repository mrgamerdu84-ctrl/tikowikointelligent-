package com.tikowiko.intelligent;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Whistle")
public class WhistlePlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(WhistleDetectionService.PREFS, 0);
    }

    private boolean hasMicPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject status() {
        SharedPreferences p = prefs();
        JSObject out = new JSObject();
        out.put("enabled", p.getBoolean(WhistleDetectionService.PREF_ENABLED, false));
        out.put("stage", p.getString(WhistleDetectionService.PREF_STAGE, "Désactivé"));
        out.put("stageAt", p.getLong(WhistleDetectionService.PREF_STAGE_AT, 0L));
        out.put("frequency", p.getFloat(WhistleDetectionService.PREF_FREQ, 0f));
        out.put("thresholdDb", p.getFloat(WhistleDetectionService.PREF_THRESHOLD_DB, -45f));
        out.put("microphonePermission", hasMicPermission());
        return out;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasMicPermission()) {
            call.reject("PERMISSION_MICRO_REQUIRED");
            return;
        }
        try {
            prefs().edit().putBoolean(WhistleDetectionService.PREF_ENABLED, true).apply();
            Intent service = new Intent(getContext(), WhistleDetectionService.class);
            ContextCompat.startForegroundService(getContext(), service);
            call.resolve(status());
        } catch (Exception e) {
            call.reject("Impossible d'activer le sifflement : " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), WhistleDetectionService.class));
            prefs().edit()
                    .putBoolean(WhistleDetectionService.PREF_ENABLED, false)
                    .putString(WhistleDetectionService.PREF_STAGE, "Désactivé")
                    .apply();
            call.resolve(status());
        } catch (Exception e) {
            call.reject("Impossible de désactiver le sifflement : " + e.getMessage());
        }
    }

    @PluginMethod
    public void setThreshold(PluginCall call) {
        Double value = call.getDouble("thresholdDb");
        if (value == null) {
            call.reject("thresholdDb manquant");
            return;
        }

        double safe = Math.max(-70.0, Math.min(-15.0, value));
        prefs().edit()
                .putFloat(WhistleDetectionService.PREF_THRESHOLD_DB, (float) safe)
                .apply();
        call.resolve(status());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }
}
