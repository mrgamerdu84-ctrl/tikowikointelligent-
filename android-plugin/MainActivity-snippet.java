// Dans : android/app/src/main/java/com/tikowiko/intelligent/MainActivity.java
// (ce fichier existe déjà, généré par Capacitor — ajoute juste la ligne registerPlugin)

package com.tikowiko.intelligent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppLauncherPlugin.class); // <-- à ajouter AVANT super.onCreate()
        super.onCreate(savedInstanceState);
    }
}
