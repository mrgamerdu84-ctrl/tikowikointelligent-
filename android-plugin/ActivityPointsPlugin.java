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

    private SensorManager sensorManager;
    private Sensor stepCounter;
    private Sensor stepDetector;

    private int todaySteps = 0;
    private String dayKey = "";
    private float counterBase = -1f;
    private float lastCounter = -1f;
    private boolean listenersRegistered = false;

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
    protected void handleOnPause() {
        super.handleOnPause();
        // On garde les capteurs actifs tant que le processus de l'app existe.
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
        if (sensorManager == null || !permissionGranted()) return;
        if (listenersRegistered) return;

        boolean registered = false;
        if (stepCounter != null) {
            registered = sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_NORMAL) || registered;
        }
        if (stepDetector != null) {
            registered = sensorManager.registerListener(this, stepDetector, SensorManager.SENSOR_DELAY_NORMAL) || registered;
        }
        listenersRegistered = registered;
    }

    private void unregisterSensors() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        listenersRegistered = false;
    }

    private void rolloverIfNeeded() {
        String now = currentDay();
        if (!now.equals(dayKey)) {
            dayKey = now;
            todaySteps = 0;
            counterBase = -1f;
            lastCounter = -1f;
            save();
        }
    }

    private void readSaved() {
        SharedPreferences p = prefs();
        dayKey = p.getString("day", currentDay());
        if (!currentDay().equals(dayKey)) {
            dayKey = currentDay();
            todaySteps = 0;
            counterBase = -1f;
            lastCounter = -1f;
            save();
            return;
        }
        todaySteps = p.getInt("steps", 0);
        counterBase = p.getFloat("counterBase", -1f);
        lastCounter = p.getFloat("lastCounter", -1f);
    }

    private void save() {
        prefs().edit()
                .putString("day", dayKey)
                .putInt("steps", todaySteps)
                .putFloat("counterBase", counterBase)
                .putFloat("lastCounter", lastCounter)
                .apply();
    }

    @PluginMethod
    public void getToday(PluginCall call) {
        rolloverIfNeeded();
        registerSensorsIfAllowed();

        JSObject result = new JSObject();
        result.put("steps", todaySteps);
        result.put("sensorAvailable", stepCounter != null || stepDetector != null);
        result.put("stepCounterAvailable", stepCounter != null);
        result.put("stepDetectorAvailable", stepDetector != null);
        result.put("activityPermissionRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        result.put("activityPermissionGranted", permissionGranted());
        result.put("listenersRegistered", listenersRegistered);
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
        rolloverIfNeeded();

        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            float total = event.values[0];

            if (counterBase < 0f || (lastCounter >= 0f && total < lastCounter)) {
                // Première lecture du jour ou redémarrage du téléphone :
                // on commence à compter à partir de cette valeur système.
                counterBase = total - todaySteps;
                if (counterBase < 0f) counterBase = total;
            }

            lastCounter = total;
            int candidate = Math.max(0, Math.round(total - counterBase));
            if (candidate >= todaySteps && candidate - todaySteps < 5000) {
                todaySteps = candidate;
                save();
            }
            return;
        }

        if (event.sensor.getType() == Sensor.TYPE_STEP_DETECTOR && stepCounter == null) {
            // Secours pour les téléphones sans TYPE_STEP_COUNTER.
            int detected = Math.max(1, Math.round(event.values[0]));
            todaySteps += detected;
            save();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
