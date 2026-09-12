package com.tikowiko.intelligent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Détection locale d'un double claquement de mains.
 * Aucun échantillon audio n'est sauvegardé ni envoyé : on ne calcule que
 * l'intensité/transitoire du son en mémoire, puis on jette le buffer.
 */
public class ClapDetectionService extends Service {
    public static final String PREFS = "tikowiko_settings";
    public static final String PREF_CLAP_ENABLED = "clap_enabled";
    public static final String PREF_CLAP_SENSITIVITY = "clap_sensitivity";

    public static final String SENSITIVITY_LOW = "low";
    public static final String SENSITIVITY_NORMAL = "normal";
    public static final String SENSITIVITY_HIGH = "high";

    private static final String CHANNEL_ID = "clap_activation";
    private static final int NOTIFICATION_ID = 2401;
    private static final int SAMPLE_RATE = 16000;

    private volatile boolean running = false;
    private AudioRecord recorder;
    private Thread worker;
    private long firstClapAt = 0L;
    private long lastCandidateAt = 0L;
    private double noiseFloor = 700.0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit().putBoolean(PREF_CLAP_ENABLED, true).apply();

        startForeground(NOTIFICATION_ID, buildNotification("Activation par double claquement active"));
        if (!running) startDetector();
        return START_STICKY;
    }

    private void startDetector() {
        int minBuffer = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBuffer, 2048);

        try {
            recorder = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize * 2
            );
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                stopSelf();
                return;
            }
            recorder.startRecording();
        } catch (SecurityException e) {
            stopSelf();
            return;
        }

        running = true;
        worker = new Thread(() -> detectLoop(bufferSize), "TikowikoClapDetector");
        worker.start();
    }

    private void detectLoop(int bufferSize) {
        short[] buffer = new short[bufferSize];

        while (running && recorder != null) {
            int read = recorder.read(buffer, 0, buffer.length);
            if (read <= 0) continue;

            long sumSquares = 0L;
            int peak = 0;
            for (int i = 0; i < read; i++) {
                int value = Math.abs((int) buffer[i]);
                if (value > peak) peak = value;
                sumSquares += (long) value * value;
            }

            double rms = Math.sqrt(sumSquares / (double) read);
            if (peak < noiseFloor * 2.2) {
                noiseFloor = noiseFloor * 0.96 + rms * 0.04;
                noiseFloor = Math.max(350.0, Math.min(noiseFloor, 5000.0));
            }

            DetectionProfile profile = getDetectionProfile();
            double threshold = Math.max(profile.minimumPeak, noiseFloor * profile.noiseMultiplier);
            boolean sharpTransient = peak > threshold && peak > rms * profile.transientRatio;
            if (sharpTransient) onClapCandidate();
        }
    }

    private DetectionProfile getDetectionProfile() {
        String sensitivity = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(PREF_CLAP_SENSITIVITY, SENSITIVITY_NORMAL);

        if (SENSITIVITY_LOW.equals(sensitivity)) {
            // Faible : demande un claquement plus franc, donc moins de faux déclenchements.
            return new DetectionProfile(9000.0, 5.0, 2.5);
        }
        if (SENSITIVITY_HIGH.equals(sensitivity)) {
            // Forte : détecte des claquements plus légers, mais peut réagir davantage aux bruits secs.
            return new DetectionProfile(4200.0, 3.0, 1.9);
        }
        // Normale : compromis par défaut.
        return new DetectionProfile(6500.0, 4.0, 2.2);
    }

    private static class DetectionProfile {
        final double minimumPeak;
        final double noiseMultiplier;
        final double transientRatio;

        DetectionProfile(double minimumPeak, double noiseMultiplier, double transientRatio) {
            this.minimumPeak = minimumPeak;
            this.noiseMultiplier = noiseMultiplier;
            this.transientRatio = transientRatio;
        }
    }

    private void onClapCandidate() {
        long now = SystemClock.elapsedRealtime();

        // Ignore les buffers successifs produits par le même claquement.
        if (now - lastCandidateAt < 140) return;
        lastCandidateAt = now;

        if (firstClapAt == 0L || now - firstClapAt > 950) {
            firstClapAt = now;
            return;
        }

        long gap = now - firstClapAt;
        if (gap >= 180 && gap <= 950) {
            firstClapAt = 0L;
            openTikowiko();
        }
    }

    private void openTikowiko() {
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(launch);
        } catch (Exception ignored) {
            // Certains Android bloquent l'ouverture automatique depuis l'arrière-plan.
            // La notification persistante permet toujours de revenir à l'application.
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Tikowikointelligent")
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Activation par claquement",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Indique que l'écoute locale des doubles claquements est active.");
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            recorder.release();
            recorder = null;
        }
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit().putBoolean(PREF_CLAP_ENABLED, false).apply();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
