package com.tikowiko.intelligent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppLauncherPlugin.class);
        registerPlugin(DirectCallPlugin.class);
        registerPlugin(ActivityPointsPlugin.class);
        registerPlugin(TikowikoTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
