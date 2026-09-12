# Tikowikointelligent

Assistant vocal local pour lancer des applications Android par la voix, sans API cloud payante.

## Ce que fait le projet

- Reconnaissance vocale **native Android** (le même moteur que Google Assistant, pas de clé API)
- Détection **automatique** de toutes les applications installées (mise à jour à chaque ouverture)
- Lancement d'une appli en disant : *"ouvre Spotify"*, *"lance WhatsApp"*, etc.

## Structure du projet

```
tikowikointelligent/
├── package.json
├── capacitor.config.json
├── www/
│   ├── index.html        → interface
│   └── app.js             → logique (écoute, correspondance, lancement)
├── android-plugin/
│   ├── AppLauncherPlugin.java        → à copier dans le projet Android généré
│   ├── MainActivity-snippet.java     → modif à faire dans MainActivity.java
│   └── AndroidManifest-additions.xml → permissions à ajouter
└── README.md
```

## Étapes pour compiler (sur ton PC)

### 1. Prérequis
- [Node.js](https://nodejs.org) installé
- [Android Studio](https://developer.android.com/studio) installé

### 2. Installer les dépendances
Ouvre un terminal dans le dossier `tikowikointelligent/` :
```bash
npm install
```

### 3. Ajouter la plateforme Android
```bash
npx cap add android
```
Cette commande génère le dossier `android/` (le vrai projet Android Studio).

### 4. Copier le plugin natif
Copie `android-plugin/AppLauncherPlugin.java` vers :
```
android/app/src/main/java/com/tikowiko/intelligent/AppLauncherPlugin.java
```
(crée les dossiers `com/tikowiko/intelligent/` s'ils n'existent pas — ils doivent
correspondre à l'`appId` dans `capacitor.config.json`)

### 5. Modifier MainActivity.java
Ouvre :
```
android/app/src/main/java/com/tikowiko/intelligent/MainActivity.java
```
Et applique le changement montré dans `android-plugin/MainActivity-snippet.java`
(ajouter `registerPlugin(AppLauncherPlugin.class);` avant `super.onCreate(...)`).

### 6. Ajouter les permissions
Ouvre :
```
android/app/src/main/AndroidManifest.xml
```
Et ajoute les deux lignes de `android-plugin/AndroidManifest-additions.xml`
juste avant la balise `<application>`.

### 7. Synchroniser puis ouvrir dans Android Studio
```bash
npx cap sync android
npx cap open android
```
Android Studio s'ouvre avec le projet complet. Clique sur ▶️ (Run) avec ton
téléphone branché en USB (mode développeur + débogage USB activés) pour
installer l'appli directement, ou fais **Build > Build APK(s)** pour obtenir
un fichier `.apk` à installer manuellement.

## Limites à connaître

- La reconnaissance vocale native Android **fonctionne hors-ligne uniquement**
  si le pack de langue française a été téléchargé sur le téléphone
  (Paramètres > Système > Langues > Reconnaissance vocale hors-ligne).
  Sinon, elle utilise le service Google en ligne — mais sans clé API ni
  compte développeur, c'est le moteur système qui s'en charge.
- `QUERY_ALL_PACKAGES` est une permission sensible : elle est acceptée sans
  justification pour une appli non publiée sur le Play Store, mais Google la
  refuserait telle quelle si tu publiais l'appli publiquement un jour.
- La correspondance nom parlé → appli est approximative (tolère les fautes
  de reconnaissance vocale) mais peut se tromper sur des noms très proches.

## Prochaines améliorations possibles

- Mot de réveil ("Hey Tiko") pour une écoute passive continue
- Historique des commandes
- Raccourcis personnalisés ("ouvre mes messages" → appli précise choisie par toi)
