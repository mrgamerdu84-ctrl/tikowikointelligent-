package com.tikowiko.intelligent;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Détection locale d'un sifflement par FFT.
 * Aucun échantillon audio n'est enregistré dans un fichier ni envoyé sur un serveur.
 */
public class WhistleDetectionService extends Service {
    public static final String PREFS = "tikowiko_settings";
    public static final String PREF_ENABLED = "whistle_enabled";
    public static final String PREF_STAGE = "whistle_stage";
    public static final String PREF_STAGE_AT = "whistle_stage_at";
    public static final String PREF_FREQ = "whistle_frequency";
    public static final String PREF_THRESHOLD_DB = "whistle_threshold_db";

    private static final String CHANNEL_ID = "whistle_activation";
    private static final int NOTIFICATION_ID = 2412;

    private static final int SAMPLE_RATE = 16000;
    private static final int FFT_SIZE = 2048;
    private static final double MIN_FREQ = 800.0;
    private static final double MAX_FREQ = 4000.0;
    private static final double MIN_PEAK_SNR_DB = 12.0;
    private static final double MIN_TONAL_RATIO = 0.18;
    private static final int REQUIRED_STABLE_FRAMES = 4;
    private static final long COOLDOWN_MS = 3500L;
    private static final long CLOSE_GUARD_MS = 5000L;

    private volatile boolean running = false;
    private AudioRecord recorder;
    private Thread worker;
    private double previousFreq = 0.0;
    private int stableFrames = 0;
    private long lastTriggerAt = 0L;
    private long suppressLaunchUntil = 0L;

    private NoiseSuppressor noiseSuppressor;
    private AcousticEchoCanceler echoCanceler;
    private AutomaticGainControl automaticGainControl;

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
        int minBuffer = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        if (minBuffer <= 0) {
            setStage("Configuration microphone non compatible");
            stopSelf();
            return;
        }

        int bufferSize = Math.max(minBuffer, FFT_SIZE * 4);
        try {
            recorder = new AudioRecord(
                    chooseAudioSource(),
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize
            );
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                setStage("Micro indisponible");
                stopSelf();
                return;
            }
            disableAudioProcessing(recorder.getAudioSessionId());
            recorder.startRecording();
        } catch (SecurityException e) {
            setStage("Permission micro nécessaire");
            stopSelf();
            return;
        } catch (Exception e) {
            setStage("Erreur micro : " + e.getMessage());
            stopSelf();
            return;
        }

        running = true;
        worker = new Thread(this::detectLoop, "TikowikoWhistleFFT");
        worker.start();
    }

    private int chooseAudioSource() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                String supported = audioManager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED);
                if ("true".equalsIgnoreCase(supported)) {
                    return MediaRecorder.AudioSource.UNPROCESSED;
                }
            }
        }
        return MediaRecorder.AudioSource.VOICE_RECOGNITION;
    }

    private void disableAudioProcessing(int sessionId) {
        try {
            if (NoiseSuppressor.isAvailable()) {
                noiseSuppressor = NoiseSuppressor.create(sessionId);
                if (noiseSuppressor != null) noiseSuppressor.setEnabled(false);
            }
        } catch (Exception ignored) {}

        try {
            if (AcousticEchoCanceler.isAvailable()) {
                echoCanceler = AcousticEchoCanceler.create(sessionId);
                if (echoCanceler != null) echoCanceler.setEnabled(false);
            }
        } catch (Exception ignored) {}

        try {
            if (AutomaticGainControl.isAvailable()) {
                automaticGainControl = AutomaticGainControl.create(sessionId);
                if (automaticGainControl != null) automaticGainControl.setEnabled(false);
            }
        } catch (Exception ignored) {}
    }

    private void detectLoop() {
        short[] pcm = new short[FFT_SIZE];

        while (running && recorder != null) {
            int offset = 0;
            while (running && offset < FFT_SIZE) {
                int read = recorder.read(pcm, offset, FFT_SIZE - offset);
                if (read <= 0) {
                    offset = 0;
                    break;
                }
                offset += read;
            }
            if (offset != FFT_SIZE) continue;

            WhistleResult result = analyseFrame(pcm);
            if (result.whistleCandidate) {
                checkStableWhistle(result.frequency);
            } else {
                stableFrames = Math.max(0, stableFrames - 1);
                if (stableFrames == 0) previousFreq = 0.0;
            }
        }
    }

    private WhistleResult analyseFrame(short[] pcm) {
        double[] real = new double[FFT_SIZE];
        double[] imag = new double[FFT_SIZE];
        double sumSquares = 0.0;

        for (int i = 0; i < FFT_SIZE; i++) {
            double normalized = pcm[i] / 32768.0;
            sumSquares += normalized * normalized;
            double hann = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * i / (FFT_SIZE - 1));
            real[i] = normalized * hann;
            imag[i] = 0.0;
        }

        double rms = Math.sqrt(sumSquares / FFT_SIZE);
        double rmsDb = 20.0 * Math.log10(Math.max(rms, 1e-9));
        double thresholdDb = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getFloat(PREF_THRESHOLD_DB, -45.0f);

        if (rmsDb < thresholdDb) {
            return new WhistleResult(false, 0.0, rmsDb, 0.0, 0.0);
        }

        fft(real, imag);

        double binHz = SAMPLE_RATE / (double) FFT_SIZE;
        int minBin = Math.max(1, (int) Math.ceil(MIN_FREQ / binHz));
        int maxBin = Math.min(FFT_SIZE / 2 - 1, (int) Math.floor(MAX_FREQ / binHz));

        double maxPower = 0.0;
        double bandPower = 0.0;
        int maxIndex = -1;

        for (int i = minBin; i <= maxBin; i++) {
            double power = real[i] * real[i] + imag[i] * imag[i];
            bandPower += power;
            if (power > maxPower) {
                maxPower = power;
                maxIndex = i;
            }
        }

        if (maxIndex < 0 || bandPower <= 0.0) {
            return new WhistleResult(false, 0.0, rmsDb, 0.0, 0.0);
        }

        double noisePower = 0.0;
        int noiseBins = 0;
        for (int i = minBin; i <= maxBin; i++) {
            if (Math.abs(i - maxIndex) <= 3) continue;
            noisePower += real[i] * real[i] + imag[i] * imag[i];
            noiseBins++;
        }

        double averageNoise = noiseBins > 0 ? noisePower / noiseBins : 1e-12;
        double peakSnrDb = 10.0 * Math.log10((maxPower + 1e-12) / (averageNoise + 1e-12));
        double tonalRatio = maxPower / Math.max(bandPower, 1e-12);
        double frequency = maxIndex * binHz;

        boolean candidate = frequency >= MIN_FREQ
                && frequency <= MAX_FREQ
                && peakSnrDb >= MIN_PEAK_SNR_DB
                && tonalRatio >= MIN_TONAL_RATIO;

        return new WhistleResult(candidate, frequency, rmsDb, peakSnrDb, tonalRatio);
    }

    private void checkStableWhistle(double frequency) {
        if (previousFreq <= 0.0) {
            previousFreq = frequency;
            stableFrames = 1;
        } else {
            double difference = Math.abs(frequency - previousFreq);
            double tolerance = Math.max(40.0, previousFreq * 0.06);
            if (difference <= tolerance) {
                stableFrames++;
                previousFreq = previousFreq * 0.7 + frequency * 0.3;
            } else {
                previousFreq = frequency;
                stableFrames = 1;
            }
        }

        saveFreq(frequency);
        setStage("Sifflement détecté — " + Math.round(frequency) + " Hz");

        if (stableFrames >= REQUIRED_STABLE_FRAMES) {
            stableFrames = 0;
            onWhistle(frequency);
        }
    }

    private void onWhistle(double frequency) {
        long now = SystemClock.elapsedRealtime();
        if (now < suppressLaunchUntil) {
            previousFreq = 0.0;
            setStage("Fermeture récente — sifflement ignoré quelques secondes");
            return;
        }
        if (now - lastTriggerAt < COOLDOWN_MS) return;

        lastTriggerAt = now;
        previousFreq = 0.0;
        setStage("Sifflement reconnu — " + Math.round(frequency) + " Hz");

        KeyguardManager keyguardManager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        boolean locked = keyguardManager != null && keyguardManager.isKeyguardLocked();
        if (locked) {
            updateForegroundText("Sifflement reconnu — déverrouille le téléphone pour ouvrir Tikowiko");
            return;
        }

        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(launch);
        } catch (Exception ignored) {
            updateForegroundText("Sifflement reconnu — touche ici pour ouvrir Tikowiko");
        }
    }

    /** FFT radix-2 sans dépendance externe. */
    private static void fft(double[] real, double[] imag) {
        int n = real.length;
        int j = 0;
        for (int i = 1; i < n; i++) {
            int bit = n >> 1;
            while ((j & bit) != 0) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if (i < j) {
                double temp = real[i]; real[i] = real[j]; real[j] = temp;
                temp = imag[i]; imag[i] = imag[j]; imag[j] = temp;
            }
        }

        for (int length = 2; length <= n; length <<= 1) {
            double angle = -2.0 * Math.PI / length;
            double wLengthReal = Math.cos(angle);
            double wLengthImag = Math.sin(angle);

            for (int i = 0; i < n; i += length) {
                double wReal = 1.0;
                double wImag = 0.0;

                for (int k = 0; k < length / 2; k++) {
                    int even = i + k;
                    int odd = even + length / 2;

                    double oddReal = real[odd] * wReal - imag[odd] * wImag;
                    double oddImag = real[odd] * wImag + imag[odd] * wReal;
                    double evenReal = real[even];
                    double evenImag = imag[even];

                    real[even] = evenReal + oddReal;
                    imag[even] = evenImag + oddImag;
                    real[odd] = evenReal - oddReal;
                    imag[odd] = evenImag - oddImag;

                    double nextWReal = wReal * wLengthReal - wImag * wLengthImag;
                    double nextWImag = wReal * wLengthImag + wImag * wLengthReal;
                    wReal = nextWReal;
                    wImag = nextWImag;
                }
            }
        }
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
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Activation par sifflement",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Détection locale du sifflement Tikowiko.");
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
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
            recorder.release();
            recorder = null;
        }
        if (noiseSuppressor != null) {
            try { noiseSuppressor.release(); } catch (Exception ignored) {}
            noiseSuppressor = null;
        }
        if (echoCanceler != null) {
            try { echoCanceler.release(); } catch (Exception ignored) {}
            echoCanceler = null;
        }
        if (automaticGainControl != null) {
            try { automaticGainControl.release(); } catch (Exception ignored) {}
            automaticGainControl = null;
        }
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }

        super.onDestroy();
    }

    private static class WhistleResult {
        final boolean whistleCandidate;
        final double frequency;
        final double rmsDb;
        final double snrDb;
        final double tonalRatio;

        WhistleResult(boolean whistleCandidate, double frequency, double rmsDb, double snrDb, double tonalRatio) {
            this.whistleCandidate = whistleCandidate;
            this.frequency = frequency;
            this.rmsDb = rmsDb;
            this.snrDb = snrDb;
            this.tonalRatio = tonalRatio;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
