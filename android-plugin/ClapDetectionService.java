package com.tikowiko.intelligent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
 *
 * Le profil personnel n'est PAS une biométrie ni une preuve d'identité : il apprend
 * seulement quelques caractéristiques acoustiques des claquements de l'utilisateur
 * afin de réduire les faux déclenchements. Aucun échantillon audio n'est sauvegardé
 * ou envoyé : seuls quelques nombres (ratios moyens) restent dans SharedPreferences.
 */
public class ClapDetectionService extends Service {
    public static final String PREFS = "tikowiko_settings";
    public static final String PREF_CLAP_ENABLED = "clap_enabled";
    public static final String PREF_CLAP_SENSITIVITY = "clap_sensitivity";

    public static final String PREF_PROFILE_TRAINED = "clap_profile_trained";
    public static final String PREF_PROFILE_ENABLED = "clap_profile_enabled";
    public static final String PREF_PROFILE_TRAINING = "clap_profile_training";
    public static final String PREF_PROFILE_TRAINING_COUNT = "clap_profile_training_count";
    public static final String PREF_PROFILE_F1 = "clap_profile_f1";
    public static final String PREF_PROFILE_F2 = "clap_profile_f2";
    public static final String PREF_PROFILE_F3 = "clap_profile_f3";

    public static final String ACTION_TRAIN_PROFILE = "com.tikowiko.intelligent.TRAIN_CLAP_PROFILE";
    public static final String EXTRA_TRAINING_ONLY = "training_only";
    public static final int PROFILE_SAMPLE_TARGET = 6;

    public static final String SENSITIVITY_LOW = "low";
    public static final String SENSITIVITY_NORMAL = "normal";
    public static final String SENSITIVITY_HIGH = "high";

    private static final String CHANNEL_ID = "clap_activation";
    private static final int NOTIFICATION_ID = 2401;
    private static final int SAMPLE_RATE = 16000;

    private volatile boolean running = false;
    private volatile boolean trainingProfile = false;
    private boolean trainingOnly = false;

    private AudioRecord recorder;
    private Thread worker;
    private long firstClapAt = 0L;
    private long lastCandidateAt = 0L;
    private double noiseFloor = 700.0;

    private int trainingCount = 0;
    private double trainingSumF1 = 0.0;
    private double trainingSumF2 = 0.0;
    private double trainingSumF3 = 0.0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean wantsTraining = intent != null && ACTION_TRAIN_PROFILE.equals(intent.getAction());

        if (wantsTraining) {
            trainingOnly = intent.getBooleanExtra(EXTRA_TRAINING_ONLY, false);
            beginProfileTraining();
            startForeground(NOTIFICATION_ID, buildNotification("Apprentissage de tes claquements : 0/" + PROFILE_SAMPLE_TARGET));
        } else {
            prefs.edit().putBoolean(PREF_CLAP_ENABLED, true).apply();
            trainingOnly = false;
            startForeground(NOTIFICATION_ID, buildNotification("Activation par double claquement active"));
        }

        if (!running) startDetector();
        return wantsTraining && trainingOnly ? START_NOT_STICKY : START_STICKY;
    }

    private void beginProfileTraining() {
        trainingProfile = true;
        trainingCount = 0;
        trainingSumF1 = 0.0;
        trainingSumF2 = 0.0;
        trainingSumF3 = 0.0;
        lastCandidateAt = 0L;
        firstClapAt = 0L;

        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean(PREF_PROFILE_TRAINING, true)
                .putInt(PREF_PROFILE_TRAINING_COUNT, 0)
                .apply();
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
            if (sharpTransient) onClapCandidate(peak, rms);
        }
    }

    private DetectionProfile getDetectionProfile() {
        String sensitivity = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(PREF_CLAP_SENSITIVITY, SENSITIVITY_NORMAL);

        if (SENSITIVITY_LOW.equals(sensitivity)) {
            return new DetectionProfile(9000.0, 5.0, 2.5);
        }
        if (SENSITIVITY_HIGH.equals(sensitivity)) {
            return new DetectionProfile(4200.0, 3.0, 1.9);
        }
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

    private void onClapCandidate(int peak, double rms) {
        long now = SystemClock.elapsedRealtime();

        // Un même claquement traverse plusieurs buffers : on ne le compte qu'une fois.
        if (now - lastCandidateAt < 170) return;
        lastCandidateAt = now;

        if (trainingProfile) {
            collectTrainingSample(peak, rms);
            return;
        }

        if (!matchesPersonalProfile(peak, rms)) return;

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

    private double[] extractFeatures(int peak, double rms) {
        double safeNoise = Math.max(noiseFloor, 350.0);
        double safeRms = Math.max(rms, 1.0);

        // Ratios normalisés : ils dépendent moins du volume absolu du micro.
        double f1 = peak / safeNoise;
        double f2 = peak / safeRms;
        double f3 = safeRms / safeNoise;
        return new double[]{f1, f2, f3};
    }

    private void collectTrainingSample(int peak, double rms) {
        double[] f = extractFeatures(peak, rms);
        trainingSumF1 += f[0];
        trainingSumF2 += f[1];
        trainingSumF3 += f[2];
        trainingCount++;

        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putInt(PREF_PROFILE_TRAINING_COUNT, trainingCount)
                .apply();

        updateForegroundText("Apprentissage de tes claquements : " + trainingCount + "/" + PROFILE_SAMPLE_TARGET);

        if (trainingCount >= PROFILE_SAMPLE_TARGET) finishProfileTraining();
    }

    private void finishProfileTraining() {
        double count = Math.max(trainingCount, 1);
        float avgF1 = (float) (trainingSumF1 / count);
        float avgF2 = (float) (trainingSumF2 / count);
        float avgF3 = (float) (trainingSumF3 / count);

        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putFloat(PREF_PROFILE_F1, avgF1)
                .putFloat(PREF_PROFILE_F2, avgF2)
                .putFloat(PREF_PROFILE_F3, avgF3)
                .putBoolean(PREF_PROFILE_TRAINED, true)
                .putBoolean(PREF_PROFILE_ENABLED, true)
                .putBoolean(PREF_PROFILE_TRAINING, false)
                .putInt(PREF_PROFILE_TRAINING_COUNT, PROFILE_SAMPLE_TARGET)
                .apply();

        trainingProfile = false;
        updateForegroundText("Profil de claquement appris — protection personnelle active");

        if (trainingOnly) {
            stopSelf();
        }
    }

    private boolean matchesPersonalProfile(int peak, double rms) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(PREF_PROFILE_ENABLED, false);
        boolean trained = prefs.getBoolean(PREF_PROFILE_TRAINED, false);
        if (!enabled || !trained) return true;

        double[] f = extractFeatures(peak, rms);
        double ref1 = Math.max(prefs.getFloat(PREF_PROFILE_F1, (float) f[0]), 0.001);
        double ref2 = Math.max(prefs.getFloat(PREF_PROFILE_F2, (float) f[1]), 0.001);
        double ref3 = Math.max(prefs.getFloat(PREF_PROFILE_F3, (float) f[2]), 0.001);

        double d1 = Math.abs(f[0] - ref1) / ref1;
        double d2 = Math.abs(f[1] - ref2) / ref2;
        double d3 = Math.abs(f[2] - ref3) / ref3;
        double score = d1 * 0.35 + d2 * 0.45 + d3 * 0.20;

        String sensitivity = prefs.getString(PREF_CLAP_SENSITIVITY, SENSITIVITY_NORMAL);
        double allowed = SENSITIVITY_LOW.equals(sensitivity) ? 0.26
                : (SENSITIVITY_HIGH.equals(sensitivity) ? 0.52 : 0.38);
        return score <= allowed;
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

    private void updateForegroundText(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(text));
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
        trainingProfile = false;
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            recorder.release();
            recorder = null;
        }
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }

        SharedPreferences.Editor editor = getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean(PREF_PROFILE_TRAINING, false);
        if (!trainingOnly) editor.putBoolean(PREF_CLAP_ENABLED, false);
        editor.apply();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
