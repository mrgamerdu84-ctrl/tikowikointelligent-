# Tikowikointelligent

**Tikowikointelligent** est un assistant personnel Android pensé pour piloter le téléphone à la voix et garder les fonctions utiles simples, rapides et aussi locales que possible.

## À quoi sert l'application ?

L'application peut :

- **Ouvrir les applications à la voix** : « ouvre YouTube », « lance Spotify », etc.
- **Préparer des rendez-vous dans l'agenda Android** : « rendez-vous dentiste demain à 14 h ».
- **Créer des rappels vocaux** : « rappelle-moi d'acheter du pain demain à 18 h ».
- **Préparer des appels en sécurité** : « appelle Maman » ouvre le contact ou le composeur afin que l'utilisateur confirme l'appel.
- **Programmer un rappel d'appel** : « jeudi à 18 h appelle Maman » prépare un événement dans l'agenda.
- **Gérer une liste de courses locale** : ajouter, retirer, lire, cocher et vider les articles.
- **Réveiller l'application avec un double claquement de mains** quand Android l'autorise en arrière-plan.
- **Régler la sensibilité des claquements** : faible, normale ou forte.
- **Apprendre un profil personnel de claquement** à partir de plusieurs essais pour réduire les faux déclenchements. Ce profil n'est pas une biométrie et ne garantit pas l'identité d'une personne.
- **Retrouver le téléphone** : « où est mon téléphone ? » peut déclencher une sonnerie forte, des vibrations et réveiller brièvement l'écran lorsque l'assistant est déjà en écoute.

## Exemples de commandes

- « Ouvre YouTube »
- « Rendez-vous médecin le 18 septembre à 14 h 30 »
- « Rappelle-moi de sortir la poubelle vendredi à 19 h »
- « Appelle Maman »
- « Jeudi à 18 h appelle Maman »
- « Ajoute lait, œufs et pain à ma liste de courses »
- « Enlève les tomates de ma liste de courses »
- « Montre ma liste de courses »
- « Où est mon téléphone ? »

## Confidentialité

Tikowikointelligent essaie de garder les traitements sur le téléphone :

- la liste de courses est stockée localement ;
- la détection des claquements ne conserve pas les enregistrements audio ;
- le profil personnel de claquement ne garde que quelques valeurs numériques calculées localement ;
- les fonctions Tikowiko n'envoient pas les échantillons audio de claquement vers un serveur Tikowiko.

La reconnaissance vocale elle-même utilise le service de reconnaissance installé sur Android. Selon le téléphone et ses réglages, ce service système peut fonctionner hors ligne ou utiliser Internet.

## Sécurité des actions

Les actions sensibles gardent une confirmation utilisateur :

- un appel n'est pas lancé silencieusement ; le contact ou le composeur Android est ouvert ;
- un rendez-vous ou un rappel est préparé dans l'agenda Android pour vérification ;
- le mode « Ne pas déranger » reste contrôlé par Android.

## Technologie

- HTML / CSS / JavaScript pour l'interface
- Capacitor pour Android
- Plugin Android natif `AppLauncherPlugin`
- Service local `ClapDetectionService` pour la détection des claquements
- GitHub Actions pour construire automatiquement l'APK

## Construction Android

Le workflow `.github/workflows/build-apk.yml` génère le projet Android avec Capacitor, installe les composants natifs Tikowiko puis construit un APK debug et le publie comme artefact GitHub Actions.

## Copyright

© 2026 **tikowikoFamily**
