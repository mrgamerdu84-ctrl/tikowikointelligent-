// Tikowikointelligent — configuration de l'assistant Android.
(function () {
  const AppLauncherAssistant = window.Capacitor?.Plugins?.AppLauncher;

  function statusText(isDefault, unavailable) {
    if (unavailable) return 'État non lisible sur ce téléphone';
    return isDefault
      ? 'Tikowiko est l’assistant Android actif'
      : 'Tikowiko n’est pas encore l’assistant Android par défaut';
  }

  async function refreshAssistantStatus() {
    const status = document.getElementById('tikowikoAssistantStatus');
    const button = document.getElementById('tikowikoAssistantButton');
    if (!status || !button) return;

    if (!AppLauncherAssistant || typeof AppLauncherAssistant.getAssistantStatus !== 'function') {
      status.textContent = 'Disponible uniquement dans l’application Android';
      button.disabled = true;
      return;
    }

    try {
      const result = await AppLauncherAssistant.getAssistantStatus();
      status.textContent = statusText(!!result?.isDefault, !!result?.statusUnavailable);
      button.textContent = result?.isDefault
        ? 'Tikowiko est déjà sélectionné ✓'
        : 'Choisir Tikowiko comme assistant';
      button.disabled = !!result?.isDefault;
    } catch (_) {
      status.textContent = 'Impossible de vérifier l’assistant actuel';
      button.disabled = false;
    }
  }

  async function openAssistantSettings() {
    if (!AppLauncherAssistant || typeof AppLauncherAssistant.openAssistantSettings !== 'function') return;
    const button = document.getElementById('tikowikoAssistantButton');
    if (button) button.disabled = true;
    try {
      await AppLauncherAssistant.openAssistantSettings();
    } catch (e) {
      window.addBubble?.('Impossible d’ouvrir les réglages Android de l’assistant : ' + (e?.message || e), 'system error');
    } finally {
      setTimeout(refreshAssistantStatus, 900);
    }
  }

  function installAssistantCard() {
    const settings = document.querySelector('#settingsPanel .settings-content');
    if (!settings || document.getElementById('tikowikoAssistantCard')) return;

    const card = document.createElement('div');
    card.className = 'setting-card';
    card.id = 'tikowikoAssistantCard';
    card.innerHTML = `
      <div class="setting-title">Assistant Android Tikowiko</div>
      <div class="setting-status" id="tikowikoAssistantStatus">Vérification…</div>
      <p class="setting-help">
        Sélectionne Tikowiko comme assistant numérique Android. C’est la base nécessaire pour pouvoir le réveiller depuis l’extérieur de l’application.
      </p>
      <div class="example">Objectif : dire « Tikowiko » puis demander « ouvre YouTube », « appelle Maman » ou « ouvre mes courses ».</div>
      <div class="privacy-note">
        La détection du mot de réveil sera locale. Cette version prépare l’assistant Android ; le moteur local du mot « Tikowiko » est ajouté séparément.
      </div>
      <div class="action-row">
        <button class="action-btn" id="tikowikoAssistantButton">Choisir Tikowiko comme assistant</button>
      </div>`;

    settings.insertBefore(card, settings.firstChild);
    document.getElementById('tikowikoAssistantButton').onclick = openAssistantSettings;

    // L'ancien claquement reste dans le code comme solution de secours, mais on le retire
    // du réglage principal pour ne plus mélanger les deux approches.
    const clapToggle = document.getElementById('clapToggle');
    const clapCard = clapToggle?.closest('.setting-card');
    if (clapCard) clapCard.style.display = 'none';

    document.querySelectorAll('#aboutPanel .setting-card').forEach(item => {
      const title = item.querySelector('.setting-title')?.textContent?.trim().toLowerCase();
      if (title === 'double claquement') item.style.display = 'none';
    });

    refreshAssistantStatus();
  }

  window.refreshTikowikoAssistantStatus = refreshAssistantStatus;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(refreshAssistantStatus, 300);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAssistantCard);
  } else {
    installAssistantCard();
  }
})();
