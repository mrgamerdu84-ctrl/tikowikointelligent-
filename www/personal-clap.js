// Tikowiko : sifflement + GPS local optionnel + jauge réactive.
(function () {
  const Whistle = window.Capacitor?.Plugins?.Whistle;
  const Geolocation = window.Capacitor?.Plugins?.Geolocation;
  const GPS_ENABLED_KEY = 'tikowiko_gps_walk_enabled_v1';
  const GPS_LAST_KEY = 'tikowiko_gps_last_walk_v1';
  let lastMotionState = 'idle';
  let lastSteps = -1;
  let walkStartZone = null;
  let pollBusy = false;

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  function gpsEnabled() {
    return localStorage.getItem(GPS_ENABLED_KEY) === '1';
  }

  function setGpsEnabled(enabled) {
    localStorage.setItem(GPS_ENABLED_KEY, enabled ? '1' : '0');
  }

  function roundZone(value) {
    return Math.round(Number(value) * 1000) / 1000;
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
        bubble('Activation par sifflement activée. Un sifflement soutenu d’environ une demi-seconde ouvre Tikowiko.', 'system');
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

  async function requestGpsPermission() {
    if (!Geolocation) return false;
    try {
      if (typeof Geolocation.checkPermissions === 'function') {
        const current = await Geolocation.checkPermissions();
        if (current?.location === 'granted' || current?.coarseLocation === 'granted') return true;
      }
      if (typeof Geolocation.requestPermissions === 'function') {
        const r = await Geolocation.requestPermissions({ permissions: ['location'] });
        return r?.location === 'granted' || r?.coarseLocation === 'granted';
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function captureZone() {
    if (!gpsEnabled() || !Geolocation?.getCurrentPosition) return null;
    try {
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
      const c = p?.coords;
      if (!c) return null;
      return {
        lat: roundZone(c.latitude),
        lon: roundZone(c.longitude),
        at: Date.now(),
        accuracy: Math.round(Number(c.accuracy || 0))
      };
    } catch (_) {
      return null;
    }
  }

  function formatZone(z) {
    if (!z) return 'Non enregistrée';
    const time = new Date(z.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${z.lat.toFixed(3)}, ${z.lon.toFixed(3)} · ${time}`;
  }

  async function setGpsMode(enabled) {
    if (enabled) {
      const ok = await requestGpsPermission();
      if (!ok) {
        setGpsEnabled(false);
        const t = document.getElementById('tikowikoGpsToggle');
        if (t) t.checked = false;
        bubble('Autorisation GPS refusée. Tikowiko n’enregistrera aucune position.', 'system error');
        return;
      }
    }
    setGpsEnabled(enabled);
    renderGpsCard();
    bubble(enabled
      ? 'GPS de marche activé : seules les zones approximatives de départ et de retour sont conservées sur ce téléphone.'
      : 'GPS de marche désactivé. Aucune nouvelle position ne sera enregistrée.', 'system');
  }

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

    const content = document.querySelector('#settingsPanel .content');
    if (content && !document.getElementById('tikowikoGpsSettingsCard')) {
      const card = document.createElement('div');
      card.id = 'tikowikoGpsSettingsCard';
      card.className = 'settings-card';
      card.innerHTML = `<div class="row"><div><strong>GPS des marches</strong><div class="setting-help">Optionnel. Enregistre seulement une zone approximative au départ et au retour d’une marche validée. Aucun trajet complet n’est enregistré.</div></div><label class="switch"><input id="tikowikoGpsToggle" type="checkbox"><span class="slider"></span></label></div>`;
      content.appendChild(card);
      const gpsToggle = card.querySelector('#tikowikoGpsToggle');
      gpsToggle.checked = gpsEnabled();
      gpsToggle.addEventListener('change', () => setGpsMode(gpsToggle.checked));
    }
    refreshWhistleStatus();
  }

  function ensureProfileGpsCard() {
    const profile = document.querySelector('#profilePanel .content');
    if (!profile || document.getElementById('profileGpsCard')) return;
    const card = document.createElement('div');
    card.id = 'profileGpsCard';
    card.className = 'settings-card';
    card.innerHTML = '<div style="font-weight:800">Dernière marche — zones GPS</div><div class="setting-help" style="margin-top:5px">Le GPS est facultatif et reste local. Tikowiko conserve seulement des coordonnées arrondies d’environ 100 m.</div><div id="profileGpsLast" style="margin-top:10px;font-size:12px;line-height:1.55"></div>';
    profile.appendChild(card);
    renderGpsCard();
  }

  function renderGpsCard() {
    const out = document.getElementById('profileGpsLast');
    const toggle = document.getElementById('tikowikoGpsToggle');
    if (toggle) toggle.checked = gpsEnabled();
    if (!out) return;
    let last = null;
    try { last = JSON.parse(localStorage.getItem(GPS_LAST_KEY) || 'null'); } catch (_) {}
    if (!gpsEnabled()) {
      out.innerHTML = 'GPS désactivé — aucune nouvelle position n’est enregistrée.';
    } else if (!last) {
      out.innerHTML = 'GPS activé — les zones de départ et de retour apparaîtront après une marche validée.';
    } else {
      out.innerHTML = `Départ : <strong>${formatZone(last.start)}</strong><br>Retour : <strong>${formatZone(last.end)}</strong>`;
    }
  }

  function installGaugePulseStyle() {
    if (document.getElementById('tikowikoGaugePulseStyle')) return;
    const style = document.createElement('style');
    style.id = 'tikowikoGaugePulseStyle';
    style.textContent = `
      .step-ring.tiko-live-step{animation:tikoLiveStep .34s ease-out}
      @keyframes tikoLiveStep{0%{filter:drop-shadow(0 0 0 #31e8ff);transform:scale(1)}45%{filter:drop-shadow(0 0 13px #31e8ff);transform:scale(1.025)}100%{filter:drop-shadow(0 0 0 #31e8ff);transform:scale(1)}}
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

      if (lastSteps >= 0 && steps > lastSteps) pulseGauge();
      lastSteps = steps;

      if (gpsEnabled()) {
        if (state === 'walking' && lastMotionState !== 'walking') {
          walkStartZone = await captureZone();
        }
        if (lastMotionState === 'walking' && state !== 'walking') {
          const end = await captureZone();
          if (walkStartZone || end) {
            localStorage.setItem(GPS_LAST_KEY, JSON.stringify({ start: walkStartZone, end, savedAt: Date.now() }));
            walkStartZone = null;
            renderGpsCard();
          }
        }
      }
      lastMotionState = state;
    } catch (_) {
    } finally {
      pollBusy = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    installGaugePulseStyle();
    setTimeout(() => { ensureSettingsUi(); ensureProfileGpsCard(); }, 400);
    setTimeout(() => { ensureSettingsUi(); ensureProfileGpsCard(); }, 1800);
    setInterval(() => { ensureProfileGpsCard(); pollActivity(); }, 800);
  });
})();
