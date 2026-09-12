// Tikowikointelligent — retrouver mon téléphone
// La commande vocale fonctionne lorsque Tikowikointelligent écoute déjà.
// En arrière-plan, on garde le double claquement plutôt qu'une écoute vocale permanente.
(function () {
  const AppLauncherFindPhone = window.Capacitor?.Plugins?.AppLauncher;
  const previousHandleTranscript = window.handleTranscript;

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  function norm(value) {
    if (typeof window.normalize === 'function') return window.normalize(String(value || ''));
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function looksLikeFindPhoneCommand(text) {
    const n = norm(text);
    return /^(tikowiko )?(ou est|ou es) (mon )?(telephone|portable)$/.test(n)
      || /^(trouve|retrouve|cherche|fais sonner) (mon )?(telephone|portable)$/.test(n)
      || /^(je ne trouve pas|je trouve pas) (mon )?(telephone|portable)$/.test(n)
      || /^tikowiko ou es tu$/.test(n);
  }

  async function startFindPhone() {
    if (!AppLauncherFindPhone || typeof AppLauncherFindPhone.findMyPhone !== 'function') {
      bubble('La fonction « retrouver mon téléphone » est disponible dans l’application Android compilée.', 'system error');
      return;
    }

    try {
      const result = await AppLauncherFindPhone.findMyPhone({ seconds: 12 });
      const seconds = Number(result?.seconds || 12);
      bubble(`Je fais sonner et vibrer le téléphone pendant environ ${seconds} secondes.`, 'system');
    } catch (e) {
      bubble('Impossible de faire sonner le téléphone : ' + (e?.message || e), 'system error');
    }
  }

  window.triggerFindMyPhone = startFindPhone;

  window.stopFindMyPhoneAlert = async function stopFindMyPhoneAlert() {
    if (!AppLauncherFindPhone || typeof AppLauncherFindPhone.stopFindMyPhone !== 'function') return;
    try {
      await AppLauncherFindPhone.stopFindMyPhone();
      bubble('Sonnerie de recherche arrêtée.', 'system');
    } catch (e) {
      bubble('Impossible d’arrêter la sonnerie : ' + (e?.message || e), 'system error');
    }
  };

  function injectFindPhoneSettings() {
    if (document.getElementById('findPhoneSettingsCard')) return;
    const content = document.querySelector('#settingsPanel .settings-content');
    if (!content) return;

    const card = document.createElement('div');
    card.className = 'setting-card';
    card.id = 'findPhoneSettingsCard';
    card.innerHTML = `
      <div class="setting-title">Retrouver mon téléphone</div>
      <p class="setting-help">
        Quand Tikowikointelligent est en train d’écouter, dis « où est mon téléphone ? » : le téléphone sonne fort, vibre et peut allumer brièvement l’écran. Le volume d’alarme est restauré ensuite.
      </p>
      <div class="example">Exemple : « Tikowiko, où es-tu ? »</div>
      <div class="action-row">
        <button class="action-btn" onclick="triggerFindMyPhone()">Tester la sonnerie</button>
        <button class="action-btn secondary" onclick="stopFindMyPhoneAlert()">Arrêter</button>
      </div>
      <div class="privacy-note">
        Pour préserver la batterie et la confidentialité, cette version n’écoute pas en permanence les phrases vocales en arrière-plan. Le double claquement reste disponible pour réveiller l’application. Le mode Ne pas déranger reste contrôlé par Android.
      </div>`;
    content.appendChild(card);
  }

  if (typeof previousHandleTranscript === 'function') {
    window.handleTranscript = function handleTranscriptWithFindPhone(text) {
      if (looksLikeFindPhoneCommand(text)) {
        bubble(text, 'user');
        startFindPhone();
        return;
      }
      return previousHandleTranscript(text);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injectFindPhoneSettings, 0);
  });

  // index.html est généralement déjà chargé lorsque ce script s'exécute.
  setTimeout(injectFindPhoneSettings, 0);
})();
