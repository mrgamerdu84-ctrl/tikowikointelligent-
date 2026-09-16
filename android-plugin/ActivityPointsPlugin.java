package com.tikowiko.intelligent;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.SystemClock;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(name = "ActivityPoints")
public class ActivityPointsPlugin extends Plugin implements SensorEventListener {
    private static final String PREFS = "tikowiko_activity";
    private static final int REQ_ACTIVITY = 8842;

    // Chaque événement STEP_DETECTOR fait bouger la jauge immédiatement.
    private static final long WALK_IDLE_MS = 2600L;
    private static final long MIN_STEP_INTERVAL_MS = 260L;
    private static final long MAX_STEP_INTERVAL_MS = 3000L;

    private SensorManager sensorManager;
    private Sensor stepCounter;
    private Sensor stepDetector;

    private int todaySteps = 0;
    private int rejectedSteps = 0;
    private String dayKey = "";
    private float counterBase = -1f;
    private float lastCounter = -1f;
    private boolean listenersRegistered = false;

    private long lastDetectorMs = 0L;
    private long lastCounterSampleMs = 0L;
    private String motionState = "idle"; // idle | walking
    private String blockedReason = "";

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
            stepDetector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        }
        readSaved();
        registerSensorsIfAllowed();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        rolloverIfNeeded();
        registerSensorsIfAllowed();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterSensors();
        super.handleOnDestroy();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String currentDay() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE).format(new Date());
    }

    private boolean permissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private void registerSensorsIfAllowed() {
        if (sensorManager == null || !permissionGranted() || listenersRegistered) return;
        boolean registered = false;
        if (stepCounter != null) {
            registered = sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_NORMAL) || registered;
        }
        if (stepDetector != null) {
            registered = sensorManager.registerListener(this, stepDetector, SensorManager.SENSOR_DELAY_FASTEST) || registered;
        }
        listenersRegistered = registered;
    }

    private void unregisterSensors() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        listenersRegistered = false;
    }

    private void resetMotionState() {
        lastDetectorMs = 0L;
        lastCounterSampleMs = 0L;
        motionState = "idle";
        blockedReason = "";
    }

    private void rolloverIfNeeded() {
        String now = currentDay();
        if (!now.equals(dayKey)) {
            dayKey = now;
            todaySteps = 0;
            rejectedSteps = 0;
            counterBase = -1f;
            lastCounter = -1f;
            resetMotionState();
            save();
        }
    }

    private void readSaved() {
        SharedPreferences p = prefs();
        dayKey = p.getString("day", currentDay());
        if (!currentDay().equals(dayKey)) {
            dayKey = currentDay();
            todaySteps = 0;
            rejectedSteps = 0;
            counterBase = -1f;
            lastCounter = -1f;
            resetMotionState();
            save();
            return;
        }
        todaySteps = p.getInt("steps", 0);
        rejectedSteps = p.getInt("rejectedSteps", 0);
        counterBase = p.getFloat("counterBase", -1f);
        lastCounter = p.getFloat("lastCounter", -1f);
        resetMotionState();
    }

    private void save() {
        prefs().edit()
                .putString("day", dayKey)
                .putInt("steps", todaySteps)
                .putInt("rejectedSteps", rejectedSteps)
                .putFloat("counterBase", counterBase)
                .putFloat("lastCounter", lastCounter)
                .apply();
    }

    private void refreshMotionState() {
        long now = SystemClock.elapsedRealtime();
        if ("walking".equals(motionState) && lastDetectorMs > 0L && now - lastDetectorMs > WALK_IDLE_MS) {
            motionState = "idle";
            lastDetectorMs = 0L;
        }
    }

    private void handleDetectedStep() {
        rolloverIfNeeded();
        long now = SystemClock.elapsedRealtime();

        if (lastDetectorMs > 0L) {
            long interval = now - lastDetectorMs;
            if (interval < MIN_STEP_INTERVAL_MS) return;
            if (interval > MAX_STEP_INTERVAL_MS) {
                // Nouveau départ de marche : le pas reste valide mais on repart d'un état propre.
                motionState = "idle";
            }
        }

        lastDetectorMs = now;
        todaySteps += 1;
        motionState = "walking";
        blockedReason = "";
        save();
    }

    private void syncFromSystemCounter(float total) {
        rolloverIfNeeded();
        long now = SystemClock.elapsedRealtime();

        if (lastCounter < 0f) {
            if (counterBase < 0f) {
                counterBase = total - todaySteps;
                if (counterBase < 0f) counterBase = total;
            }
            lastCounter = total;
            lastCounterSampleMs = now;
            save();
            return;
        }

        if (total < lastCounter) {
            counterBase = total;
            lastCounter = total;
            lastCounterSampleMs = now;
            save();
            return;
        }

        float delta = total - lastCounter;
        long elapsed = lastCounterSampleMs > 0L ? now - lastCounterSampleMs : 0L;
        lastCounter = total;
        lastCounterSampleMs = now;

        // Sur les appareils avec STEP_DETECTOR, on évite de compter deux fois.
        if (stepDetector != null) {
            counterBase = total - todaySteps;
            save();
            return;
        }

        if (delta <= 0f || delta >= 100000f) return;

        // Fallback sans STEP_DETECTOR : accepte uniquement une cadence de marche plausible.
        double rate = elapsed > 0L ? (delta * 1000.0) / elapsed : 0.0;
        if (rate >= 0.30 && rate <= 3.2) {
            int add = Math.max(1, Math.round(delta));
            todaySteps += add;
            counterBase = total - todaySteps;
            motionState = "walking";
            blockedReason = "";
        }
        save();
    }

    @PluginMethod
    public void getToday(PluginCall call) {
        rolloverIfNeeded();
        registerSensorsIfAllowed();
        refreshMotionState();

        JSObject result = new JSObject();
        result.put("steps", todaySteps);
        result.put("rejectedSteps", rejectedSteps);
        result.put("sensorAvailable", stepCounter != null || stepDetector != null);
        result.put("stepCounterAvailable", stepCounter != null);
        result.put("stepDetectorAvailable", stepDetector != null);
        result.put("shakeFilterAvailable", false);
        result.put("strictWalkingFilter", stepDetector != null);
        result.put("activityPermissionRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        result.put("activityPermissionGranted", permissionGranted());
        result.put("listenersRegistered", listenersRegistered);
        result.put("countsWhileClosed", stepDetector == null && stepCounter != null);
        result.put("motionState", motionState);
        result.put("blockedReason", "");
        result.put("day", dayKey);
        call.resolve(result);
    }

    @PluginMethod
    public void requestActivityPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || permissionGranted()) {
            registerSensorsIfAllowed();
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }

        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.ACTIVITY_RECOGNITION},
                REQ_ACTIVITY
        );

        JSObject r = new JSObject();
        r.put("granted", false);
        r.put("requested", true);
        call.resolve(r);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!permissionGranted()) return;

        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            syncFromSystemCounter(event.values[0]);
            return;
        }

        if (event.sensor.getType() == Sensor.TYPE_STEP_DETECTOR) {
            if (event.values.length > 0 && event.values[0] >= 1f) handleDetectedStep();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }
}