// Correctif Android pour la reconnaissance vocale Tikowikointelligent.
// Le détecteur de claquement utilise lui aussi le micro : on le met en pause pendant la dictée.
(function () {
  const previousToggleListening = window.toggleListening;

  async function getClapWasEnabled() {
    try {
      if (!AppLauncher || typeof AppLauncher.getClapActivationStatus !== 'function') return false;
      const status = await AppLauncher.getClapActivationStatus();
      return !!status?.enabled;
    } catch (_) {
      return false;
    }
  }

  async function pauseClapIfNeeded() {
    const wasEnabled = await getClapWasEnabled();
    if (!wasEnabled) return false;
    try {
      await AppLauncher.stopClapActivation();
      // Laisse un court instant à Android pour libérer réellement le microphone.
      await new Promise(resolve => setTimeout(resolve, 300));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function restoreClapIfNeeded(wasEnabled) {
    if (!wasEnabled) return;
    try {
      await new Promise(resolve => setTimeout(resolve, 250));
      await AppLauncher.startClapActivation();
    } catch (e) {
      addBubble('Le micro vocal a fonctionné, mais le double claquement n’a pas pu être réactivé automatiquement.', 'system error');
    }
  }

  window.toggleListening = async function toggleListeningReliable() {
    if (!SpeechRecognition) {
      addBubble('Reconnaissance vocale indisponible sur cette version.', 'system error');
      return;
    }

    if (listening) {
      try { await SpeechRecognition.stop(); } catch (_) {}
      setListeningUI(false);
      return;
    }

    try {
      if (typeof SpeechRecognition.available === 'function') {
        const availability = await SpeechRecognition.available();
        if (availability && availability.available === false) {
          addBubble('La reconnaissance vocale Android n’est pas disponible sur ce téléphone.', 'system error');
          return;
        }
      }
    } catch (_) {
      // Certains téléphones ne répondent pas correctement à available(); on tente quand même l’écoute.
    }

    const granted = await ensureMicrophonePermission();
    if (!granted) {
      addBubble('Autorise le microphone pour utiliser les commandes vocales.', 'system error');
      return;
    }

    const clapWasEnabled = await pauseClapIfNeeded();
    setListeningUI(true);
    await refreshApps();

    try {
      // popup:true est nettement plus fiable sur Android avec ce plugin.
      // La fenêtre système se ferme automatiquement après la phrase.
      const result = await SpeechRecognition.start({
        language: 'fr-FR',
        maxResults: 3,
        prompt: 'Dis une commande à Tikowiko',
        partialResults: false,
        popup: true,
      });

      const matches = Array.isArray(result?.matches) ? result.matches.filter(Boolean) : [];
      if (matches.length > 0) {
        handleTranscript(matches[0]);
      } else {
        addBubble('Je n’ai rien entendu. Réessaie en parlant près du téléphone.', 'system');
      }
    } catch (e) {
      const message = e?.message || String(e || 'erreur inconnue');
      addBubble('Erreur de reconnaissance vocale : ' + message, 'system error');
    } finally {
      setListeningUI(false);
      await restoreClapIfNeeded(clapWasEnabled);
      if (typeof refreshClapStatus === 'function') refreshClapStatus();
    }
  };

  // Garde une référence au comportement précédent pour diagnostic si besoin.
  window.toggleListeningOriginal = previousToggleListening;
})();