// Tikowiko : activation par sifflement + jauge de pas plus réactive.
(function () {
  const Whistle = window.Capacitor?.Plugins?.Whistle;
  let lastSteps = -1;
  let pollBusy = false;

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  async function ensureMic() {
    if (typeof window.ensureMicrophonePermission === 'function') {
      return await window.ensureMicrophonePermission();
    }
    return true;
  }

  async function refreshWhistleStatus() {
    const toggle = document.getElementById('whistleToggle');
    const status = document.getElementById('whistleStatus');
    if (!toggle) return;
    toggle.disabled = !Whistle || typeof Whistle.getStatus !== 'function';
    if (toggle.disabled) {
      if (status) status.textContent = 'Disponible dans l’application Android compilée.';
      return;
    }
    try {
      const r = await Whistle.getStatus();
      toggle.checked = !!r?.enabled;
      if (status) status.textContent = r?.enabled ? (r?.stage || 'Écoute du sifflement active') : 'Désactivé';
    } catch (_) {
      if (status) status.textContent = 'État du sifflement indisponible.';
    }
  }

  window.toggleWhistleActivation = async function toggleWhistleActivation(enabled) {
    const toggle = document.getElementById('whistleToggle');
    if (!Whistle) return;
    if (toggle) toggle.disabled = true;
    try {
      if (enabled) {
        const granted = await ensureMic();
        if (!granted) throw new Error('Permission micro refusée');
        await Whistle.start();
        bubble('Activation par sifflement activée. Siffle environ une demi-seconde pour ouvrir Tikowiko.', 'system');
      } else {
        await Whistle.stop();
        bubble('Activation par sifflement désactivée.', 'system');
      }
    } catch (e) {
      if (toggle) toggle.checked = !enabled;
      bubble('Impossible de modifier le sifflement : ' + (e?.message || e), 'system error');
    } finally {
      if (toggle) toggle.disabled = false;
      refreshWhistleStatus();
    }
  };

  function ensureSettingsUi() {
    const clapToggle = document.getElementById('clapToggle');
    if (clapToggle) clapToggle.closest('.settings-card')?.remove();
    ['personalClapToggle','trainClapProfileBtn','resetClapProfileBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.closest('.settings-card')?.remove();
    });

    const whistleToggle = document.getElementById('whistleToggle');
    if (whistleToggle) {
      whistleToggle.disabled = false;
      whistleToggle.setAttribute('onchange', 'toggleWhistleActivation(this.checked)');
      const card = whistleToggle.closest('.settings-card');
      const help = card?.querySelector('.setting-help');
      if (help) { help.id = 'whistleStatus'; help.textContent = 'Désactivé'; }
    }
    refreshWhistleStatus();
  }

  function installGaugePulseStyle() {
    if (document.getElementById('tikowikoGaugePulseStyle')) return;
    const style = document.createElement('style');
    style.id = 'tikowikoGaugePulseStyle';
    style.textContent = `
      .step-ring.tiko-live-step{animation:tikoLiveStep .34s ease-out}
      .step-ring.tiko-walking-glow{filter:drop-shadow(0 0 8px rgba(255,157,47,.85))}
      @keyframes tikoLiveStep{0%{filter:drop-shadow(0 0 0 #31e8ff);transform:scale(1)}45%{filter:drop-shadow(0 0 15px #31e8ff);transform:scale(1.03)}100%{filter:drop-shadow(0 0 0 #31e8ff);transform:scale(1)}}
    `;
    document.head.appendChild(style);
  }

  function pulseGauge() {
    const ring = document.getElementById('stepRing');
    if (!ring) return;
    ring.classList.remove('tiko-live-step');
    void ring.offsetWidth;
    ring.classList.add('tiko-live-step');
  }

  async function pollActivity() {
    if (pollBusy || typeof window.getActivitySnapshot !== 'function') return;
    pollBusy = true;
    try {
      const snap = await window.getActivitySnapshot();
      const steps = Number(snap?.steps || 0);
      const state = String(snap?.motionState || 'idle');
      const ring = document.getElementById('stepRing');

      if (lastSteps >= 0 && steps > lastSteps) pulseGauge();
      lastSteps = steps;
      if (ring) ring.classList.toggle('tiko-walking-glow', state === 'walking');
    } catch (_) {
    } finally {
      pollBusy = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    installGaugePulseStyle();
    setTimeout(ensureSettingsUi, 350);
    setTimeout(ensureSettingsUi, 1500);
    setInterval(pollActivity, 700);
  });
})();
