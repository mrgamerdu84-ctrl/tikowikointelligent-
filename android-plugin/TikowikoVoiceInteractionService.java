package com.tikowiko.intelligent;

import android.os.Bundle;
import android.service.voice.VoiceInteractionService;

/**
 * Service système de l'assistant Tikowiko.
 *
 * Quand l'utilisateur choisit Tikowiko comme assistant numérique Android,
 * Android garde ce service disponible en arrière-plan. La détection du mot
 * de réveil « Tikowiko » sera branchée séparément sur ce service afin de rester
 * locale et de ne pas dépendre du service de claquement.
 */
public class TikowikoVoiceInteractionService extends VoiceInteractionService {
    @Override
    public void onReady() {
        super.onReady();
    }

    @Override
    public void onLaunchVoiceAssistFromKeyguard() {
        showSession(new Bundle(), 0);
    }
}
