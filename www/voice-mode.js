// Tikowikointelligent — mode vocal direct.
// À l'ouverture : désactive l'ancien mode claquement, puis lance automatiquement l'écoute.
// Accepte aussi les commandes préfixées par « Tikowiko ».
(function () {
  const AppLauncherVoiceMode = window.Capacitor?.Plugins?.AppLauncher;
  const previousHandleTranscript = window.handleTranscript;
  let autoListenStarted = false;

  function cleanPrefix(text) {
    const raw = String(text || '').trim();
    const normalized = raw
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    if (!/^tiko\s*wiko\b|^tikowiko\b|^tikowikointelligent\b/.test(normalized)) {
      return raw;
    }

    return raw
      .replace(/^\s*(?:tiko\s*wiko|tikowiko(?:intelligent)?)\s*[,;:\-–—]?\s*/i, '')
      .trim();
  }

  window.handleTranscript = function handleTranscriptVoiceMode(text) {
    const command = cleanPrefix(text);
    if (!command) {
      window.addBubble?.('Oui ? Dis-moi ce que tu veux faire, par exemple « ouvre YouTube » ou « ouvre mes courses ».', 'system');
      return;
    }
    if (typeof previousHandleTranscript === 'function') return previousHandleTranscript(command);
  };

  function hideClapUI() {
    const clapToggle = document.getElementById('clapToggle');
    const settingsCard = clapToggle?.closest('.setting-card');
    if (settingsCard) settingsCard.style.display = 'none';

    document.querySelectorAll('#aboutPanel .setting-card').forEach(card => {
      const title = card.querySelector('.setting-title')?.textContent?.trim().toLowerCase();
      if (title === 'double claquement') card.style.display = 'none';
    });

    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'À l’ouverture, Tikowiko écoute automatiquement. Dis « Tikowiko, ouvre YouTube », « appelle Maman » ou « ouvre mes courses ».';
  }

  async function disableLegacyClap() {
    try {
      if (!AppLauncherVoiceMode || typeof AppLauncherVoiceMode.getClapActivationStatus !== 'function') return;
      const status = await AppLauncherVoiceMode.getClapActivationStatus();
      if (status?.enabled && typeof AppLauncherVoiceMode.stopClapActivation === 'function') {
        await AppLauncherVoiceMode.stopClapActivation();
      }
    } catch (_) {
      // Le mode vocal direct reste utilisable même si l'ancien service ne répond pas.
    }
  }

  async function startAutoListening() {
    if (autoListenStarted) return;
    autoListenStarted = true;

    await disableLegacyClap();

    // Le correctif speech-fix.js est chargé dynamiquement par navigation-menu.js.
    // On lui laisse le temps de remplacer toggleListening avant de démarrer l'écoute.
    await new Promise(resolve => setTimeout(resolve, 850));

    try {
      if (typeof window.toggleListening === 'function' && !window.listening) {
        await window.toggleListening();
      }
    } catch (e) {
      window.addBubble?.('Appuie sur le micro pour parler à Tikowiko.', 'system');
    }
  }

  function initVoiceMode() {
    hideClapUI();
    startAutoListening();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoiceMode);
  } else {
    initVoiceMode();
  }
})();