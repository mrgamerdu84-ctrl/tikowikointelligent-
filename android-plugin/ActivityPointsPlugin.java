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

    // Marche normale : environ 30 à 139 pas/minute.
    // Au-dessus, Tikowiko considère la cadence comme trop rapide pour les récompenses.
    private static final long MIN_WALK_INTERVAL_MS = 430L;
    private static final long MAX_WALK_INTERVAL_MS = 2000L;
    private static final long WALK_IDLE_MS = 3400L;
    private static final long BLOCK_DURATION_MS = 3200L;
    private static final int REQUIRED_STABLE_STEPS = 3;
    private static final int FAST_HITS_TO_BLOCK = 3;

    // Anti-secousse : une seule accélération forte ne suffit jamais à bloquer une vraie marche.
    // Il faut une rafale de plusieurs mouvements très rapides, typique d'un téléphone secoué.
    private static final long SHAKE_BURST_WINDOW_MS = 650L;
    private static final int SHAKE_HITS_TO_BLOCK = 4;
    private static final double LINEAR_SHAKE_THRESHOLD = 13.5;
    private static final double RAW_SHAKE_DELTA_THRESHOLD = 12.0;
    private static final long SHAKE_STEP_BLOCK_WINDOW_MS = 650L;

    private SensorManager sensorManager;
    private Sensor stepCounter;
    private Sensor stepDetector;
    private Sensor accelerometer;
    private Sensor linearAcceleration;

    private int todaySteps = 0;
    private int rejectedSteps = 0;
    private String dayKey = "";
    private float counterBase = -1f;
    private float lastCounter = -1f;
    private boolean listenersRegistered = false;

    private long lastDetectorMs = 0L;
    private long lastCounterSampleMs = 0L;
    private long blockedUntilMs = 0L;
    private long lastStrongShakeMs = 0L;
    private long shakeBurstStartMs = 0L;
    private int shakeBurstCount = 0;
    private int stableWalkSteps = 0;
    private int pendingWalkSteps = 0;
    private int fastMotionStrikes = 0;
    private String motionState = "idle"; // idle | checking | walking | blocked
    private String blockedReason = "";

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
            stepDetector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
            linearAcceleration = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
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
            registered = sensorManager.registerListener(this, stepDetector, SensorManager.SENSOR_DELAY_NORMAL) || registered;
        }
        if (linearAcceleration != null) {
            registered = sensorManager.registerListener(this, linearAcceleration, SensorManager.SENSOR_DELAY_GAME) || registered;
        } else if (accelerometer != null) {
            registered = sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME) || registered;
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
        blockedUntilMs = 0L;
        lastStrongShakeMs = 0L;
        shakeBurstStartMs = 0L;
        shakeBurstCount = 0;
        stableWalkSteps = 0;
        pendingWalkSteps = 0;
        fastMotionStrikes = 0;
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

    private void enterBlocked(String reason, int rejectedNow) {
        rejectedSteps += Math.max(1, rejectedNow);
        blockedUntilMs = SystemClock.elapsedRealtime() + BLOCK_DURATION_MS;
        motionState = "blocked";
        blockedReason = reason;
        stableWalkSteps = 0;
        pendingWalkSteps = 0;
        fastMotionStrikes = 0;
        save();
    }

    private void noteShakeHit() {
        long now = SystemClock.elapsedRealtime();
        if (now < blockedUntilMs) return;

        if (shakeBurstStartMs == 0L || now - shakeBurstStartMs > SHAKE_BURST_WINDOW_MS) {
            shakeBurstStartMs = now;
            shakeBurstCount = 1;
            return;
        }

        shakeBurstCount++;
        if (shakeBurstCount >= SHAKE_HITS_TO_BLOCK) {
            lastStrongShakeMs = now;
            shakeBurstCount = 0;
            shakeBurstStartMs = 0L;
            enterBlocked("secousses répétées du téléphone détectées", 1);
        }
    }

    private void refreshMotionState() {
        long now = SystemClock.elapsedRealtime();
        if (shakeBurstStartMs > 0L && now - shakeBurstStartMs > SHAKE_BURST_WINDOW_MS) {
            shakeBurstStartMs = 0L;
            shakeBurstCount = 0;
        }

        if ("blocked".equals(motionState)) {
            if (now >= blockedUntilMs) {
                motionState = "idle";
                blockedReason = "";
                stableWalkSteps = 0;
                pendingWalkSteps = 0;
                fastMotionStrikes = 0;
                lastDetectorMs = 0L;
            }
            return;
        }
        if (("walking".equals(motionState) || "checking".equals(motionState)) &&
                lastDetectorMs > 0L && now - lastDetectorMs > WALK_IDLE_MS) {
            motionState = "idle";
            stableWalkSteps = 0;
            pendingWalkSteps = 0;
            fastMotionStrikes = 0;
            lastDetectorMs = 0L;
        }
    }

    private void handleDetectedStep() {
        rolloverIfNeeded();
        long now = SystemClock.elapsedRealtime();

        if (now < blockedUntilMs) {
            rejectedSteps++;
            lastDetectorMs = now;
            save();
            return;
        }

        if (lastStrongShakeMs > 0L && now - lastStrongShakeMs <= SHAKE_STEP_BLOCK_WINDOW_MS) {
            lastDetectorMs = now;
            enterBlocked("secousse du téléphone détectée", 1);
            return;
        }

        if (lastDetectorMs <= 0L || now - lastDetectorMs > WALK_IDLE_MS) {
            lastDetectorMs = now;
            stableWalkSteps = 1;
            pendingWalkSteps = 1;
            fastMotionStrikes = 0;
            motionState = "checking";
            blockedReason = "";
            return;
        }

        long interval = now - lastDetectorMs;
        lastDetectorMs = now;

        if (interval < MIN_WALK_INTERVAL_MS) {
            fastMotionStrikes++;
            stableWalkSteps = 0;
            pendingWalkSteps = 0;
            motionState = "checking";
            blockedReason = "";
            if (fastMotionStrikes >= FAST_HITS_TO_BLOCK) {
                enterBlocked("cadence trop rapide : marche très rapide ou course", fastMotionStrikes);
            }
            return;
        }

        fastMotionStrikes = 0;

        if (interval > MAX_WALK_INTERVAL_MS) {
            stableWalkSteps = 1;
            pendingWalkSteps = 1;
            motionState = "checking";
            blockedReason = "";
            return;
        }

        stableWalkSteps++;
        pendingWalkSteps++;
        motionState = "checking";

        // Dès que trois pas réguliers confirment une vraie marche, les trois premiers sont crédités.
        // Ensuite chaque pas valide fait monter le compteur immédiatement.
        if (stableWalkSteps >= REQUIRED_STABLE_STEPS) {
            todaySteps += pendingWalkSteps;
            pendingWalkSteps = 0;
            motionState = "walking";
            blockedReason = "";
            save();
        }
    }

    /**
     * Le compteur système sert de référence quand STEP_DETECTOR existe.
     * Sans STEP_DETECTOR, on garde un fallback prudent plutôt que de désactiver totalement les pas.
     */
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

        if (stepDetector != null) {
            counterBase = total - todaySteps;
            save();
            return;
        }

        if (delta <= 0f || delta >= 100000f) return;

        double rate = elapsed > 0L ? (delta * 1000.0) / elapsed : 0.0;
        if (elapsed > 0L && elapsed < 6000L && rate > 2.35) {
            enterBlocked("cadence trop rapide détectée", Math.max(1, Math.round(delta)));
            return;
        }

        if (rate >= 0.45 && rate <= 2.35) {
            todaySteps += Math.round(delta);
            counterBase = total - todaySteps;
            motionState = "walking";
            blockedReason = "";
        } else {
            motionState = "checking";
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
        result.put("shakeFilterAvailable", linearAcceleration != null || accelerometer != null);
        result.put("strictWalkingFilter", stepDetector != null);
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

        if (event.sensor.getType() == Sensor.TYPE_LINEAR_ACCELERATION) {
            double x = event.values[0];
            double y = event.values[1];
            double z = event.values[2];
            double magnitude = Math.sqrt(x * x + y * y + z * z);
            if (magnitude >= LINEAR_SHAKE_THRESHOLD) noteShakeHit();
            return;
        }

        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER && linearAcceleration == null) {
            double x = event.values[0];
            double y = event.values[1];
            double z = event.values[2];
            double magnitude = Math.sqrt(x * x + y * y + z * z);
            double deltaFromGravity = Math.abs(magnitude - SensorManager.GRAVITY_EARTH);
            if (deltaFromGravity >= RAW_SHAKE_DELTA_THRESHOLD) noteShakeHit();
            return;
        }

        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            syncFromSystemCounter(event.values[0]);
            return;
        }

        if (event.sensor.getType() == Sensor.TYPE_STEP_DETECTOR) {
            handleDetectedStep();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
