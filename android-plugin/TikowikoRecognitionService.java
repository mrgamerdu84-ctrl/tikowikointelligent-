package com.tikowiko.intelligent;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionService;

/**
 * Service de reconnaissance déclaré pour que Tikowiko soit reconnu comme assistant vocal Android.
 * La reconnaissance principale de l'application reste gérée par le plugin Capacitor existant.
 */
public class TikowikoRecognitionService extends RecognitionService {
    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        Bundle extras = new Bundle();
        listener.error(android.speech.SpeechRecognizer.ERROR_RECOGNIZER_BUSY);
    }

    @Override
    protected void onCancel(Callback listener) {
        // Rien à annuler ici : le moteur de reconnaissance est géré par l'application.
    }

    @Override
    protected void onStopListening(Callback listener) {
        // Pas de session interne persistante dans ce service de compatibilité.
    }
}
