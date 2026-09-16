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
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Deque;
import java.util.Locale;

@CapacitorPlugin(name = "ActivityPoints")
public class ActivityPointsPlugin extends Plugin implements SensorEventListener {
    private static final String PREFS = "tikowiko_activity";
    private static final int REQ_ACTIVITY = 8842;

    // Anti-triche local : la marche doit rester humaine et régulière.
    private static final long WALK_IDLE_MS = 1800L;
    private static final long MIN_WALK_INTERVAL_MS = 430L;
    private static final long MAX_WALK_INTERVAL_MS = 1250L;
    private static final int REQUIRED_STABLE_STEPS = 3;
    private static final int CADENCE_WINDOW = 6;
    private static final double MAX_INTERVAL_VARIATION_RATIO = 0.34;
    private static final long DUPLICATE_BURST_MS = 220L;

    private SensorManager sensorManager;
    private Sensor stepCounter;
    private Sensor stepDetector;

    private int todaySteps = 0;
    private int validatedRewardSteps = 0;
    private int rejectedSteps = 0;
    private String dayKey = "";
    private float counterBase = -1f;
    private float lastCounter = -1f;
    private boolean listenersRegistered = false;

    private long lastDetectorMs = 0L;
    private long lastCounterSampleMs = 0L;
    private int stableWalkSteps = 0;
    private int pendingWalkSteps = 0;
    private String motionState = "idle"; // idle | checking | walking
    private String blockedReason = "";
    private final Deque<Long> recentIntervals = new ArrayDeque<>();

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
        stableWalkSteps = 0;
        pendingWalkSteps = 0;
        motionState = "idle";
        blockedReason = "";
        recentIntervals.clear();
    }

    private void rolloverIfNeeded() {
        String now = currentDay();
        if (!now.equals(dayKey)) {
            dayKey = now;
            todaySteps = 0;
            validatedRewardSteps = 0;
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
            validatedRewardSteps = 0;
            rejectedSteps = 0;
            counterBase = -1f;
            lastCounter = -1f;
            resetMotionState();
            save();
            return;
        }
        todaySteps = p.getInt("steps", 0);
        validatedRewardSteps = p.getInt("validatedRewardSteps", todaySteps);
        rejectedSteps = p.getInt("rejectedSteps", 0);
        counterBase = p.getFloat("counterBase", -1f);
        lastCounter = p.getFloat("lastCounter", -1f);
        resetMotionState();
    }

    private void save() {
        prefs().edit()
                .putString("day", dayKey)
                .putInt("steps", todaySteps)
                .putInt("validatedRewardSteps", validatedRewardSteps)
                .putInt("rejectedSteps", rejectedSteps)
                .putFloat("counterBase", counterBase)
                .putFloat("lastCounter", lastCounter)
                .apply();
    }

    private void refreshMotionState() {
        long now = SystemClock.elapsedRealtime();
        if (("walking".equals(motionState) || "checking".equals(motionState)) &&
                lastDetectorMs > 0L && now - lastDetectorMs > WALK_IDLE_MS) {
            if (pendingWalkSteps > 0 && stableWalkSteps < REQUIRED_STABLE_STEPS) {
                rejectedSteps += pendingWalkSteps;
            }
            stableWalkSteps = 0;
            pendingWalkSteps = 0;
            recentIntervals.clear();
            motionState = "idle";
            blockedReason = "";
            lastDetectorMs = 0L;
            save();
        }
    }

    private void rejectSequence(String reason, int extraRejected) {
        rejectedSteps += Math.max(0, pendingWalkSteps + extraRejected);
        stableWalkSteps = 0;
        pendingWalkSteps = 0;
        recentIntervals.clear();
        motionState = "idle";
        blockedReason = reason;
        save();
    }

    private boolean cadenceLooksHuman(long interval) {
        recentIntervals.addLast(interval);
        while (recentIntervals.size() > CADENCE_WINDOW) recentIntervals.removeFirst();
        if (recentIntervals.size() < 3) return true;

        double sum = 0.0;
        for (long v : recentIntervals) sum += v;
        double mean = sum / recentIntervals.size();
        double variance = 0.0;
        for (long v : recentIntervals) {
            double d = v - mean;
            variance += d * d;
        }
        variance /= recentIntervals.size();
        double std = Math.sqrt(variance);
        double ratio = mean > 0 ? std / mean : 1.0;

        // Une secousse mécanique/répétitive est souvent trop régulière. Une vraie marche varie naturellement.
        if (recentIntervals.size() >= 5 && ratio < 0.035) return false;
        // Une séquence très irrégulière ressemble plus à des faux déclenchements qu'à une marche continue.
        return ratio <= MAX_INTERVAL_VARIATION_RATIO;
    }

    private void creditValidatedStep(int count) {
        if (count <= 0) return;
        todaySteps += count;
        validatedRewardSteps += count;
        blockedReason = "";
        save();
    }

    private void handleDetectedStep() {
        rolloverIfNeeded();
        long now = SystemClock.elapsedRealtime();

        if (lastDetectorMs <= 0L || now - lastDetectorMs > WALK_IDLE_MS) {
            lastDetectorMs = now;
            stableWalkSteps = 1;
            pendingWalkSteps = 1;
            recentIntervals.clear();
            motionState = "checking";
            blockedReason = "";
            save();
            return;
        }

        long interval = now - lastDetectorMs;
        lastDetectorMs = now;

        if (interval < DUPLICATE_BURST_MS) {
            rejectSequence("secousse", 1);
            return;
        }
        if (interval < MIN_WALK_INTERVAL_MS) {
            rejectSequence("course_ou_secousse", 1);
            return;
        }
        if (interval > MAX_WALK_INTERVAL_MS) {
            rejectSequence("cadence_incoherente", 1);
            return;
        }
        if (!cadenceLooksHuman(interval)) {
            rejectSequence("secousse_repetitive", 1);
            return;
        }

        stableWalkSteps++;

        if (!"walking".equals(motionState) && stableWalkSteps >= REQUIRED_STABLE_STEPS) {
            // On valide la petite séquence de départ, puis chaque pas suivant sera crédité immédiatement.
            creditValidatedStep(pendingWalkSteps + 1);
            pendingWalkSteps = 0;
            motionState = "walking";
            save();
            return;
        }

        if ("walking".equals(motionState)) {
            creditValidatedStep(1);
            motionState = "walking";
            return;
        }

        pendingWalkSteps++;
        motionState = "checking";
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

        // STEP_DETECTOR reste la source principale afin d'éviter le double comptage.
        if (stepDetector != null) {
            counterBase = total - todaySteps;
            save();
            return;
        }

        if (delta <= 0f || delta >= 100000f) return;

        // Fallback si le téléphone ne possède pas STEP_DETECTOR : très conservateur pour les récompenses.
        double rate = elapsed > 0L ? (delta * 1000.0) / elapsed : 0.0;
        if (rate >= 0.80 && rate <= 1.85 && delta <= 6f) {
            int add = Math.max(1, Math.round(delta));
            todaySteps += add;
            validatedRewardSteps += add;
            counterBase = total - todaySteps;
            motionState = "walking";
            blockedReason = "";
        } else {
            rejectedSteps += Math.max(1, Math.round(delta));
            motionState = "idle";
            blockedReason = "mouvement_non_valide";
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
        result.put("validatedRewardSteps", validatedRewardSteps);
        result.put("rejectedSteps", rejectedSteps);
        result.put("sensorAvailable", stepCounter != null || stepDetector != null);
        result.put("stepCounterAvailable", stepCounter != null);
        result.put("stepDetectorAvailable", stepDetector != null);
        result.put("shakeFilterAvailable", true);
        result.put("strictWalkingFilter", true);
        result.put("activityPermissionRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        result.put("activityPermissionGranted", permissionGranted());
        result.put("listenersRegistered", listenersRegistered);
        result.put("countsWhileClosed", stepDetector == null && stepCounter != null);
        result.put("motionState", motionState);
        result.put("blockedReason", blockedReason);
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
