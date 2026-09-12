# Confidentialité — Tikowikointelligent

**© 2026 tikowikoFamily — Application privée et confidentielle**

Tikowikointelligent est conçu comme une application Android privée, sans publicité, sans boutique, sans compte utilisateur et sans système d’analytics intégré.

## Données utilisées

L’application peut accéder uniquement aux éléments nécessaires à ses fonctions :

- au microphone, lorsque l’utilisateur lance une commande vocale ;
- à la liste des applications installées, afin de reconnaître et lancer l’application demandée ;
- au nom technique des applications (package Android) afin de les ouvrir.

## Stockage

La liste des applications détectées est utilisée localement par l’application. Les associations apprises entre une phrase vocale et une application sont conservées uniquement pendant la session en cours et ne sont pas envoyées vers un serveur de TikowikoFamily.

## Réseau et services tiers

Tikowikointelligent ne contient pas de serveur applicatif, de publicité, de boutique, ni d’outil d’analytics.

La reconnaissance vocale utilise toutefois le service de reconnaissance vocale Android disponible sur le téléphone. Selon l’appareil, la version Android et les réglages de l’utilisateur, ce service peut fonctionner localement ou utiliser les services réseau du fournisseur du téléphone. TikowikoFamily ne reçoit pas directement les enregistrements vocaux traités par ce service.

## Confidentialité

Les informations affichées dans l’application sont destinées à un usage privé. Tikowikointelligent ne cherche pas à vendre, partager ou monétiser les données de l’utilisateur.

## Permissions Android

- `RECORD_AUDIO` : nécessaire pour écouter une commande vocale.
- `QUERY_ALL_PACKAGES` : nécessaire pour détecter les applications installées que l’utilisateur peut demander d’ouvrir.

## Règle principale

Tout le fonctionnement propre à Tikowikointelligent doit rester local et privé, sauf lorsqu’une fonction Android du téléphone dépend elle-même d’un service externe contrôlé par le système ou par le fournisseur de l’appareil.
