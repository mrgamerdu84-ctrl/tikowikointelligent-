// Tikowikointelligent — configuration de l'assistant Android + diagnostic du double claquement.
(function () {
  const AppLauncherAssistant = window.Capacitor?.Plugins?.AppLauncher;
  let clapPoll = null;

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

  async function refreshClapDiagnostic() {
    const status = document.getElementById('clapDiagnosticStatus');
    if (!status || !AppLauncherAssistant || typeof AppLauncherAssistant.getClapActivationStatus !== 'function') return;
    try {
      const result = await AppLauncherAssistant.getClapActivationStatus();
      const stage = result?.stage || (result?.enabled ? 'Écoute active' : 'Désactivé');
      const noise = Number(result?.noise || 0);
      status.textContent = result?.enabled
        ? `${stage}${noise ? ` · bruit ambiant ${Math.round(noise)}` : ''}`
        : 'Désactivé';
    } catch (_) {
      status.textContent = 'Diagnostic indisponible';
    }
  }

  function startClapPolling() {
    if (clapPoll) clearInterval(clapPoll);
    clapPoll = setInterval(refreshClapDiagnostic, 700);
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
        Sélectionne Tikowiko comme assistant numérique Android. Cette fonction complète le double claquement, elle ne le remplace pas.
      </p>
      <div class="action-row">
        <button class="action-btn" id="tikowikoAssistantButton">Choisir Tikowiko comme assistant</button>
      </div>`;

    settings.insertBefore(card, settings.firstChild);
    document.getElementById('tikowikoAssistantButton').onclick = openAssistantSettings;

    const clapToggle = document.getElementById('clapToggle');
    const clapCard = clapToggle?.closest('.setting-card');
    if (clapCard) {
      clapCard.style.display = '';
      if (!document.getElementById('clapDiagnosticStatus')) {
        const diag = document.createElement('div');
        diag.className = 'privacy-note';
        diag.innerHTML = '<strong>Diagnostic en direct :</strong> <span id="clapDiagnosticStatus">En attente…</span><br>Quand tu testes, regarde si Tikowiko affiche « 1er claquement détecté », puis « Double claquement détecté ».';
        clapCard.appendChild(diag);
      }
    }

    document.querySelectorAll('#aboutPanel .setting-card').forEach(item => {
      const title = item.querySelector('.setting-title')?.textContent?.trim().toLowerCase();
      if (title === 'double claquement') item.style.display = '';
    });

    refreshAssistantStatus();
    refreshClapDiagnostic();
    startClapPolling();
  }

  window.refreshTikowikoAssistantStatus = refreshAssistantStatus;
  window.refreshTikowikoClapDiagnostic = refreshClapDiagnostic;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(refreshAssistantStatus, 300);
      setTimeout(refreshClapDiagnostic, 300);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAssistantCard);
  } else {
    installAssistantCard();
  }
})();
