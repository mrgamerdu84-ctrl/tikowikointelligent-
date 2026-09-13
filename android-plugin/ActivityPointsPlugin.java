package com.tikowiko.intelligent;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.provider.Settings;

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
    private SensorManager sensorManager;
    private Sensor stepCounter;
    private float bootSteps = -1f;
    private int todaySteps = 0;
    private String dayKey = "";

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounter = sensorManager != null ? sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) : null;
        dayKey = currentDay();
        readSaved();
        if (stepCounter != null) sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_NORMAL);
    }

    @Override
    protected void handleOnDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        super.handleOnDestroy();
    }

    private String currentDay() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE).format(new Date());
    }

    private void rolloverIfNeeded() {
        String now = currentDay();
        if (!now.equals(dayKey)) {
            dayKey = now;
            todaySteps = 0;
            bootSteps = -1f;
            save();
        }
    }

    private void readSaved() {
        Context c = getContext();
        String savedDay = c.getSharedPreferences("tikowiko_activity", Context.MODE_PRIVATE).getString("day", currentDay());
        if (!savedDay.equals(currentDay())) {
            dayKey = currentDay();
            todaySteps = 0;
        } else {
            dayKey = savedDay;
            todaySteps = c.getSharedPreferences("tikowiko_activity", Context.MODE_PRIVATE).getInt("steps", 0);
        }
    }

    private void save() {
        getContext().getSharedPreferences("tikowiko_activity", Context.MODE_PRIVATE)
                .edit().putString("day", dayKey).putInt("steps", todaySteps).apply();
    }

    @PluginMethod
    public void getToday(PluginCall call) {
        rolloverIfNeeded();
        JSObject result = new JSObject();
        result.put("steps", todaySteps);
        result.put("sensorAvailable", stepCounter != null);
        result.put("activityPermissionRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        result.put("activityPermissionGranted", Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED);
        result.put("day", dayKey);
        call.resolve(result);
    }

    @PluginMethod
    public void requestActivityPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return;
        }
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED) {
            JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return;
        }
        ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, 8842);
        JSObject r = new JSObject(); r.put("granted", false); r.put("requested", true); call.resolve(r);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) return;
        rolloverIfNeeded();
        float total = event.values[0];
        if (bootSteps < 0f) {
            bootSteps = total - todaySteps;
            if (bootSteps < 0f) bootSteps = total;
        }
        int candidate = Math.max(0, Math.round(total - bootSteps));
        if (candidate >= todaySteps && candidate - todaySteps < 2000) {
            todaySteps = candidate;
            save();
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
