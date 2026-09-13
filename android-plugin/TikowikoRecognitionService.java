package com.tikowiko.intelligent;

import android.content.Intent;
import android.os.RemoteException;
import android.speech.RecognitionService;

/**
 * Service de reconnaissance déclaré pour que Tikowiko soit reconnu comme assistant vocal Android.
 * La reconnaissance principale de l'application reste gérée par le plugin Capacitor existant.
 */
public class TikowikoRecognitionService extends RecognitionService {
    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        try {
            listener.error(android.speech.SpeechRecognizer.ERROR_RECOGNIZER_BUSY);
        } catch (RemoteException ignored) {
            // Le client a pu disparaître entre-temps ; rien d'autre à faire.
        }
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
