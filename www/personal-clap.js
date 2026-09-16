// Tikowiko : réveil vocal tolérant + jauge de pas en direct.
(function () {
  const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;
  let lastSteps = -1;
  let pollBusy = false;
  let wakeListening = false;
  let wakeWanted = false;
  let restartTimer = null;

  const WAKE_VARIANTS = [
    'tikowiko', 'tiko wiko', 'tico wico', 'tiko rico', 'tico rico',
    'tiko', 'tico', 'tikowico', 'tico wiko', 'tiko ouiko', 'tico ouico'
  ];

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  async function ensureMic() {
    if (typeof window.ensureMicrophonePermission === 'function') return await window.ensureMicrophonePermission();
    return true;
  }

  function normalize(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function compact(text) { return normalize(text).replace(/\s+/g, ''); }
  function editDistance(a, b) {
    a = compact(a); b = compact(b);
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return dp[b.length];
  }
  function soundsLikeTikowiko(text) {
    const n = normalize(text), c = compact(text);
    if (!c) return false;
    if (WAKE_VARIANTS.some(v => n.includes(normalize(v)) || c.includes(compact(v)))) return true;
    return ['tikowiko','ticowico','tikorico'].some(t => editDistance(c, t) <= 2);
  }

  async function openTikowikoFromWake() {
    if (!document.hidden) {
      bubble('Oui, je t’écoute.', 'assistant');
      if (typeof window.speakTikowiko === 'function') window.speakTikowiko('Oui, je t’écoute.');
      return;
    }
    const AppLauncher = window.Capacitor?.Plugins?.AppLauncher;
    try { if (AppLauncher?.openSelf) await AppLauncher.openSelf(); } catch (_) {}
  }

  async function runWakeRecognition() {
    if (!wakeWanted || wakeListening || !SpeechRecognition) return;
    wakeListening = true;
    try {
      const available = await SpeechRecognition.available();
      if (available && available.available === false) throw new Error('Reconnaissance vocale Android indisponible');
      const result = await SpeechRecognition.start({language:'fr-FR',maxResults:5,prompt:'',partialResults:true,popup:false});
      const matches = Array.isArray(result?.matches) ? result.matches : [];
      if (matches.some(soundsLikeTikowiko)) await openTikowikoFromWake();
    } catch (_) {
    } finally {
      wakeListening = false;
      if (wakeWanted) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(runWakeRecognition, 900);
      }
    }
  }

  async function refreshWakeStatus() {
    const toggle = document.getElementById('whistleToggle');
    const status = document.getElementById('whistleStatus');
    if (!toggle) return;
    toggle.disabled = !SpeechRecognition || typeof SpeechRecognition.start !== 'function';
    const enabled = localStorage.getItem('tikowiko_wake_word_v2') === '1';
    toggle.checked = enabled;
    wakeWanted = enabled;
    if (status) status.textContent = enabled ? 'Mot de réveil “Tikowiko” actif' : 'Désactivé';
    if (enabled) runWakeRecognition();
  }

  window.toggleWhistleActivation = async function toggleWakeWord(enabled) {
    const toggle = document.getElementById('whistleToggle');
    if (toggle) toggle.disabled = true;
    try {
      if (enabled) {
        const granted = await ensureMic();
        if (!granted) throw new Error('Permission micro refusée');
        localStorage.setItem('tikowiko_wake_word_v2', '1');
        wakeWanted = true;
        runWakeRecognition();
        bubble('Réveil vocal activé. Tu peux dire “Tikowiko” ; les variantes proches sont aussi reconnues.', 'system');
      } else {
        localStorage.setItem('tikowiko_wake_word_v2', '0');
        wakeWanted = false;
        clearTimeout(restartTimer);
        try { await SpeechRecognition?.stop?.(); } catch (_) {}
        bubble('Réveil vocal désactivé.', 'system');
      }
    } catch (e) {
      if (toggle) toggle.checked = !enabled;
      bubble('Impossible de modifier le réveil vocal : ' + (e?.message || e), 'system error');
    } finally {
      if (toggle) toggle.disabled = false;
      refreshWakeStatus();
    }
  };

  function ensureSettingsUi() {
    const clapToggle = document.getElementById('clapToggle');
    if (clapToggle) clapToggle.closest('.settings-card')?.remove();
    ['personalClapToggle','trainClapProfileBtn','resetClapProfileBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.closest('.settings-card')?.remove();
    });
    const toggle = document.getElementById('whistleToggle');
    if (toggle) {
      toggle.setAttribute('onchange', 'toggleWhistleActivation(this.checked)');
      const card = toggle.closest('.settings-card');
      const title = card?.querySelector('.setting-title, h3, strong');
      if (title) title.textContent = 'Réveil vocal “Tikowiko”';
      const help = card?.querySelector('.setting-help');
      if (help) { help.id = 'whistleStatus'; help.textContent = 'Désactivé'; }
    }
    refreshWakeStatus();
  }

  function installGaugePulseStyle() {
    if (document.getElementById('tikowikoGaugePulseStyle')) return;
    const style = document.createElement('style');
    style.id = 'tikowikoGaugePulseStyle';
    style.textContent = `
      .step-ring.tiko-live-step{animation:tikoLiveStep .26s ease-out}
      .step-ring.tiko-walking-glow{filter:drop-shadow(0 0 10px rgba(255,157,47,.95))}
      .steps-value.tiko-count-bump{animation:tikoCountBump .24s ease-out}
      @keyframes tikoLiveStep{0%{transform:scale(1);filter:drop-shadow(0 0 0 #31e8ff)}45%{transform:scale(1.035);filter:drop-shadow(0 0 18px #31e8ff)}100%{transform:scale(1);filter:drop-shadow(0 0 0 #31e8ff)}}
      @keyframes tikoCountBump{0%{transform:scale(1)}45%{transform:scale(1.18)}100%{transform:scale(1)}}
    `;
    document.head.appendChild(style);
  }

  function pulseGauge() {
    const ring = document.getElementById('stepRing');
    const value = document.getElementById('stepsValue');
    if (ring) {
      ring.classList.remove('tiko-live-step');
      void ring.offsetWidth;
      ring.classList.add('tiko-live-step');
    }
    if (value) {
      value.classList.remove('tiko-count-bump');
      void value.offsetWidth;
      value.classList.add('tiko-count-bump');
    }
  }

  function updateGaugeDirect(steps) {
    const ring = document.getElementById('stepRing');
    const value = document.getElementById('stepsValue');
    const card = document.getElementById('stepsCard');
    const remaining = document.getElementById('remainingSteps');
    const pct = Math.max(0, Math.min(100, (steps / 10000) * 100));
    if (ring) ring.style.setProperty('--percent', pct.toFixed(2) + '%');
    if (value) value.textContent = String(steps);
    if (card) card.textContent = String(steps);
    if (remaining) remaining.textContent = String(Math.max(0, 2000 - steps));
  }

  async function pollActivity() {
    if (pollBusy || typeof window.getActivitySnapshot !== 'function') return;
    pollBusy = true;
    try {
      const snap = await window.getActivitySnapshot();
      const steps = Number(snap?.steps || 0);
      const state = String(snap?.motionState || 'idle');
      const ring = document.getElementById('stepRing');

      updateGaugeDirect(steps);
      if (lastSteps >= 0 && steps > lastSteps) {
        const diff = Math.min(steps - lastSteps, 4);
        for (let i = 0; i < diff; i++) setTimeout(pulseGauge, i * 90);
      }
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
    setInterval(pollActivity, 180);
  });
})();
