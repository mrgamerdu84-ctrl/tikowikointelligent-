package com.tikowiko.intelligent;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppLauncherPlugin.class);
        registerPlugin(DirectCallPlugin.class);
        registerPlugin(ActivityPointsPlugin.class);
        registerPlugin(WhistlePlugin.class);
        registerPlugin(TikowikoTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

@CapacitorPlugin(name = "TikowikoTts")
class TikowikoTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ready = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (ready && tts != null) {
            int result = tts.setLanguage(Locale.FRANCE);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.FRENCH);
            }
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String voice = call.getString("voice", "robot");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Texte vide");
            return;
        }
        if (!ready || tts == null) {
            call.reject("Synthèse vocale en cours d'initialisation");
            return;
        }

        float pitch = 1.0f;
        float rate = 1.0f;
        if ("robot".equalsIgnoreCase(voice)) {
            pitch = 0.72f;
            rate = 0.90f;
        } else if ("femme".equalsIgnoreCase(voice)) {
            pitch = 1.18f;
            rate = 1.0f;
        } else if ("homme".equalsIgnoreCase(voice)) {
            pitch = 0.82f;
            rate = 0.95f;
        }

        tts.setPitch(pitch);
        tts.setSpeechRate(rate);
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tikowiko-voice");
        JSObject out = new JSObject();
        out.put("started", result == TextToSpeech.SUCCESS);
        out.put("voice", voice);
        call.resolve(out);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        ready = false;
        super.handleOnDestroy();
    }
}
