// Profil personnel de claquement — Tikowikointelligent
// Aucun audio n'est conservé ici : le natif Android ne stocke que quelques ratios numériques.
(function () {
  const AppLauncherProfile = window.Capacitor?.Plugins?.AppLauncher;
  let pollTimer = null;

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(refreshPersonalClapStatus, 700);
  }

  async function ensureMic() {
    if (typeof window.ensureMicrophonePermission === 'function') {
      return await window.ensureMicrophonePermission();
    }
    return true;
  }

  window.refreshPersonalClapStatus = async function refreshPersonalClapStatus() {
    const status = document.getElementById('personalClapStatus');
    const toggle = document.getElementById('personalClapToggle');
    const trainBtn = document.getElementById('trainClapProfileBtn');
    const resetBtn = document.getElementById('resetClapProfileBtn');
    if (!status || !toggle || !trainBtn || !resetBtn) return;

    if (!AppLauncherProfile || typeof AppLauncherProfile.getClapProfileStatus !== 'function') {
      status.textContent = 'Disponible uniquement dans l’application Android';
      toggle.disabled = true;
      trainBtn.disabled = true;
      resetBtn.disabled = true;
      stopPolling();
      return;
    }

    try {
      const result = await AppLauncherProfile.getClapProfileStatus();
      const trained = !!result?.trained;
      const enabled = !!result?.enabled;
      const training = !!result?.training;
      const samples = Number(result?.samples || 0);
      const target = Number(result?.target || 6);

      toggle.checked = trained && enabled;
      toggle.disabled = !trained || training;
      trainBtn.disabled = training;
      resetBtn.disabled = training || !trained;

      if (training) {
        status.textContent = `Apprentissage en cours : ${samples}/${target} — fais un claquement, puis attends un instant`;
        if (!pollTimer) startPolling();
      } else if (trained) {
        status.textContent = enabled
          ? 'Profil appris — filtrage personnel actif'
          : 'Profil appris — filtrage personnel désactivé';
        stopPolling();
      } else {
        status.textContent = 'Pas encore appris';
        stopPolling();
      }
    } catch (e) {
      status.textContent = 'État du profil indisponible';
      stopPolling();
    }
  };

  window.startPersonalClapTraining = async function startPersonalClapTraining() {
    if (!AppLauncherProfile || typeof AppLauncherProfile.startClapProfileTraining !== 'function') {
      bubble('L’apprentissage des claquements est disponible dans l’application Android compilée.', 'system error');
      return;
    }

    const granted = await ensureMic();
    if (!granted) {
      bubble('Permission micro refusée : impossible d’apprendre tes claquements.', 'system error');
      return;
    }

    try {
      await AppLauncherProfile.startClapProfileTraining();
      bubble('Apprentissage lancé. Fais 6 claquements naturels, séparés d’environ une seconde.', 'system');
      startPolling();
      setTimeout(refreshPersonalClapStatus, 150);
    } catch (e) {
      bubble('Impossible de démarrer l’apprentissage : ' + (e?.message || e), 'system error');
    }
  };

  window.togglePersonalClapMode = async function togglePersonalClapMode(enabled) {
    const toggle = document.getElementById('personalClapToggle');
    if (!AppLauncherProfile || typeof AppLauncherProfile.setPersonalClapMode !== 'function') return;

    if (toggle) toggle.disabled = true;
    try {
      await AppLauncherProfile.setPersonalClapMode({ enabled: !!enabled });
      bubble(enabled
        ? 'Profil personnel activé pour le double claquement.'
        : 'Profil personnel désactivé : le double claquement simple reste disponible.', 'system');
    } catch (e) {
      if (toggle) toggle.checked = !enabled;
      bubble('Impossible de modifier le profil personnel : ' + (e?.message || e), 'system error');
    } finally {
      await refreshPersonalClapStatus();
    }
  };

  window.resetPersonalClapProfile = async function resetPersonalClapProfile() {
    if (!AppLauncherProfile || typeof AppLauncherProfile.resetClapProfile !== 'function') return;

    try {
      await AppLauncherProfile.resetClapProfile();
      bubble('Profil de claquement réinitialisé. Tu peux refaire l’apprentissage quand tu veux.', 'system');
      await refreshPersonalClapStatus();
    } catch (e) {
      bubble('Impossible de réinitialiser le profil : ' + (e?.message || e), 'system error');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(refreshPersonalClapStatus, 0);
  });
})();
