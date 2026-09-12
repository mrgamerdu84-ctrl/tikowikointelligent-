package com.tikowiko.intelligent;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

/** Héberge les sessions de l'assistant Tikowiko. */
public class TikowikoVoiceInteractionSessionService extends VoiceInteractionSessionService {
    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new TikowikoVoiceInteractionSession(this);
    }
}
