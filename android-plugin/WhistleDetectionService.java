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

/** Détection locale d'un sifflement soutenu. Aucun audio n'est enregistré ni envoyé. */
public class WhistleDetectionService extends Service {
    public static final String PREFS = "tikowiko_settings";
    public static final String PREF_ENABLED = "whistle_enabled";
    public static final String PREF_STAGE = "whistle_stage";
    public static final String PREF_STAGE_AT = "whistle_stage_at";
    public static final String PREF_FREQ = "whistle_frequency";

    private static final String CHANNEL_ID = "whistle_activation";
    private static final int NOTIFICATION_ID = 2412;
    private static final int SAMPLE_RATE = 16000;
    private static final double MIN_FREQ = 1200.0;
    private static final double MAX_FREQ = 4200.0;
    private static final int REQUIRED_STABLE_FRAMES = 10;
    private static final long COOLDOWN_MS = 3500L;
    private static final long CLOSE_GUARD_MS = 5000L;

    private volatile boolean running = false;
    private AudioRecord recorder;
    private Thread worker;
    private double noiseFloor = 300.0;
    private double previousFreq = 0.0;
    private int stableFrames = 0;
    private long lastTriggerAt = 0L;
    private long suppressLaunchUntil = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_ENABLED, true).apply();
        setStage("Écoute du sifflement active");
        startForeground(NOTIFICATION_ID, buildNotification("Sifflement actif — siffle environ une demi-seconde"));
        if (!running) startDetector();
        return START_STICKY;
    }

    private void startDetector() {
        int minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufferSize = Math.max(minBuffer, 1600);
        try {
            recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize * 2);
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                setStage("Micro indisponible"); stopSelf(); return;
            }
            recorder.startRecording();
        } catch (SecurityException e) {
            setStage("Permission micro nécessaire"); stopSelf(); return;
        }
        running = true;
        worker = new Thread(this::detectLoop, "TikowikoWhistleDetector");
        worker.start();
    }

    private void detectLoop() {
        short[] buffer = new short[800];
        while (running && recorder != null) {
            int read = recorder.read(buffer, 0, buffer.length);
            if (read <= 0) continue;

            long sumSq = 0L;
            int peak = 0;
            int crossings = 0;
            int previous = buffer[0];
            for (int i = 0; i < read; i++) {
                int v = buffer[i];
                int a = Math.abs(v);
                peak = Math.max(peak, a);
                sumSq += (long) v * v;
                if (i > 0 && ((v >= 0 && previous < 0) || (v < 0 && previous >= 0))) crossings++;
                previous = v;
            }

            double rms = Math.sqrt(sumSq / (double) read);
            if (rms < noiseFloor * 1.45) {
                noiseFloor = Math.max(180.0, Math.min(3000.0, noiseFloor * 0.96 + rms * 0.04));
            }

            double freq = crossings * SAMPLE_RATE / (2.0 * read);
            double crest = rms > 1.0 ? peak / rms : 99.0;
            boolean loudEnough = rms > Math.max(650.0, noiseFloor * 1.75);
            boolean whistleBand = freq >= MIN_FREQ && freq <= MAX_FREQ;
            boolean tonalEnough = crest >= 1.15 && crest <= 2.65;

            if (loudEnough && whistleBand && tonalEnough) {
                double tolerance = previousFreq <= 0.0 ? 1.0 : Math.abs(freq - previousFreq) / previousFreq;
                stableFrames = tolerance <= 0.20 ? stableFrames + 1 : 1;
                previousFreq = freq;
                saveFreq(freq);
                setStage("Sifflement détecté — vérification");
                if (stableFrames >= REQUIRED_STABLE_FRAMES) onWhistle(freq);
            } else {
                stableFrames = Math.max(0, stableFrames - 2);
                if (stableFrames == 0) previousFreq = 0.0;
            }
        }
    }

    private void onWhistle(double freq) {
        long now = SystemClock.elapsedRealtime();
        if (now < suppressLaunchUntil) {
            stableFrames = 0;
            previousFreq = 0.0;
            setStage("Fermeture récente — sifflement ignoré quelques secondes");
            return;
        }
        if (now - lastTriggerAt < COOLDOWN_MS) return;
        lastTriggerAt = now;
        stableFrames = 0;
        previousFreq = 0.0;
        setStage("Sifflement reconnu — ouverture de Tikowiko");
        updateForegroundText("Sifflement reconnu — ouverture de Tikowiko");
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(launch); }
        catch (Exception ignored) { updateForegroundText("Sifflement reconnu — touche ici pour ouvrir Tikowiko"); }
    }

    private void saveFreq(double freq) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putFloat(PREF_FREQ, (float) freq).apply();
    }

    private void setStage(String stage) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(PREF_STAGE, stage)
                .putLong(PREF_STAGE_AT, System.currentTimeMillis())
                .apply();
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Tikowiko Smart Assistant")
                .setContentText(text)
                .setContentIntent(pending)
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
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Activation par sifflement", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Indique que la détection locale du sifflement est active.");
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        suppressLaunchUntil = SystemClock.elapsedRealtime() + CLOSE_GUARD_MS;
        stableFrames = 0;
        previousFreq = 0.0;
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (p.getBoolean(PREF_ENABLED, false)) updateForegroundText("Sifflement actif en arrière-plan");
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            recorder.release(); recorder = null;
        }
        if (worker != null) { worker.interrupt(); worker = null; }
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
