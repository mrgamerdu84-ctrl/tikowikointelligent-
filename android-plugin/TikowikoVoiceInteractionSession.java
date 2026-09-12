package com.tikowiko.intelligent;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

/**
 * Session visible de l'assistant. Pour l'instant elle ouvre l'interface Tikowiko,
 * qui gère déjà les commandes vocales, les applications, les appels et les courses.
 */
public class TikowikoVoiceInteractionSession extends VoiceInteractionSession {
    public TikowikoVoiceInteractionSession(Context context) {
        super(context);
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);

        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        try {
            startVoiceActivity(intent);
        } catch (Exception ignored) {
            getContext().startActivity(intent);
        }

        hide();
    }
}
