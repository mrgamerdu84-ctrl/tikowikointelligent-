const ActivityPoints = window.Capacitor?.Plugins?.ActivityPoints;

const TIKO_ACTIVITY_KEY = 'tikowiko_activity_points_v1';
const TIKO_PERMISSION_SESSION_KEY = 'tikowiko_activity_permission_asked';
const TIKO_REWARDS = [
  { steps: 2000, points: 20, reward: 'Badge Marcheur' },
  { steps: 5000, points: 50, reward: 'Thème Néon Bleu' },
  { steps: 10000, points: 100, reward: 'Style de boutons Énergie' }
];

function ensureMilestoneProgressStyle() {
  if (document.getElementById('tikoMilestoneProgressStyle')) return;
  const style = document.createElement('style');
  style.id = 'tikoMilestoneProgressStyle';
  style.textContent = '.milestones{--milestone-progress:0%}.milestones:before{background:linear-gradient(90deg,#32f58b 0 var(--milestone-progress),#46546e var(--milestone-progress) 100%) !important}';
  document.head.appendChild(style);
}

function updateMilestoneProgress(steps) {
  ensureMilestoneProgressStyle();
  const bar = document.querySelector('.milestones');
  if (!bar) return;
  const safeSteps = Math.max(0, Number(steps) || 0);
  const pct = Math.max(0, Math.min(100, (safeSteps / 10000) * 100));
  bar.style.setProperty('--milestone-progress', `${pct}%`);
}

function tikoDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadActivityState() {
  try {
    const s = JSON.parse(localStorage.getItem(TIKO_ACTIVITY_KEY) || '{}');
    if (s.day !== tikoDayKey()) {
      return { day: tikoDayKey(), claimed: {}, points: Number(s.points || 0), rewards: s.rewards || [] };
    }
    return { day: s.day, claimed: s.claimed || {}, points: Number(s.points || 0), rewards: s.rewards || [] };
  } catch (_) {
    return { day: tikoDayKey(), claimed: {}, points: 0, rewards: [] };
  }
}

function saveActivityState(state) {
  localStorage.setItem(TIKO_ACTIVITY_KEY, JSON.stringify(state));
}

async function getActivitySnapshot() {
  let steps = 0;
  let sensorAvailable = false;
  let permissionRequired = false;
  let permissionGranted = true;
  let listenersRegistered = false;
  let stepCounterAvailable = false;
  let stepDetectorAvailable = false;

  if (ActivityPoints?.getToday) {
    try {
      const r = await ActivityPoints.getToday();
      steps = Number(r?.steps || 0);
      sensorAvailable = !!r?.sensorAvailable;
      permissionRequired = !!r?.activityPermissionRequired;
      permissionGranted = !!r?.activityPermissionGranted;
      listenersRegistered = !!r?.listenersRegistered;
      stepCounterAvailable = !!r?.stepCounterAvailable;
      stepDetectorAvailable = !!r?.stepDetectorAvailable;
    } catch (e) {
      console.warn('Tikowiko ActivityPoints indisponible', e);
    }
  }

  updateMilestoneProgress(steps);

  return {
    steps,
    sensorAvailable,
    permissionRequired,
    permissionGranted,
    listenersRegistered,
    stepCounterAvailable,
    stepDetectorAvailable
  };
}

async function ensureActivityAccess() {
  if (!ActivityPoints?.getToday) return;

  const snap = await getActivitySnapshot();
  if (!snap.sensorAvailable) return;

  if (snap.permissionRequired && !snap.permissionGranted) {
    if (sessionStorage.getItem(TIKO_PERMISSION_SESSION_KEY) === '1') return;
    sessionStorage.setItem(TIKO_PERMISSION_SESSION_KEY, '1');
    try {
      await ActivityPoints.requestActivityPermission();
    } catch (e) {
      console.warn('Autorisation activité physique non accordée', e);
    }

    setTimeout(async () => {
      await refreshActivityPanel();
      if (typeof window.refreshTikowikoHome === 'function') {
        window.refreshTikowikoHome();
      }
    }, 1200);
  }
}

async function refreshActivityPanel() {
  const panel = document.getElementById('activityPanel');
  const snap = await getActivitySnapshot();
  const state = loadActivityState();
  const max = 10000;
  const pct = Math.max(0, Math.min(100, Math.round((snap.steps / max) * 100)));
  const next = TIKO_REWARDS.find(r => snap.steps < r.steps) || null;
  const unlocked = TIKO_REWARDS.filter(r => snap.steps >= r.steps);
  const pending = unlocked.filter(r => !state.claimed[r.steps]);

  const ring = document.getElementById('activityRing');
  if (ring) ring.style.setProperty('--progress', `${pct * 3.6}deg`);
  const stepsEl = document.getElementById('activitySteps');
  if (stepsEl) stepsEl.textContent = snap.steps.toLocaleString('fr-FR');
  const pointsEl = document.getElementById('activityPoints');
  if (pointsEl) pointsEl.textContent = state.points.toLocaleString('fr-FR');
  const nextEl = document.getElementById('activityNext');
  if (nextEl) nextEl.textContent = next ? `${Math.max(0, next.steps - snap.steps).toLocaleString('fr-FR')} pas avant ${next.reward}` : 'Tous les paliers du jour sont atteints';

  const permissionBox = document.getElementById('activityPermissionBox');
  if (permissionBox) {
    if (!snap.sensorAvailable) {
      permissionBox.innerHTML = 'Aucun capteur de pas Android compatible n’a été détecté sur ce téléphone.';
    } else if (snap.permissionRequired && !snap.permissionGranted) {
      permissionBox.innerHTML = '<button class="action" onclick="requestActivityAccess()">Autoriser l’activité physique</button><div style="margin-top:8px">Tikowiko a besoin de cette autorisation pour compter tes pas.</div>';
    } else if (!snap.listenersRegistered) {
      permissionBox.textContent = 'Le capteur est présent, mais il n’est pas encore actif. Rouvre cette page dans quelques secondes.';
    } else {
      permissionBox.textContent = 'Compteur de pas actif. Les nouveaux pas sont comptés localement par Android.';
    }
  }

  const rewardsEl = document.getElementById('activityRewards');
  if (rewardsEl) {
    rewardsEl.innerHTML = TIKO_REWARDS.map(r => {
      const reached = snap.steps >= r.steps;
      const claimed = !!state.claimed[r.steps];
      return `<div class="reward-row ${reached ? 'reached' : ''}"><div><b>${r.steps.toLocaleString('fr-FR')} pas</b><span>${r.reward} · +${r.points} pts</span></div>${reached && !claimed ? `<button class="action" onclick="claimActivityReward(${r.steps})">Récupérer</button>` : `<span class="reward-state">${claimed ? 'Récupérée' : 'Verrouillée'}</span>`}</div>`;
    }).join('');
  }

  const banner = document.getElementById('activityUnlockBanner');
  if (banner) {
    banner.style.display = pending.length ? 'block' : 'none';
    banner.textContent = pending.length ? 'Récompense débloquée !' : '';
  }

  return snap;
}

async function requestActivityAccess() {
  if (!ActivityPoints?.requestActivityPermission) return;
  try {
    sessionStorage.setItem(TIKO_PERMISSION_SESSION_KEY, '1');
    await ActivityPoints.requestActivityPermission();
  } finally {
    setTimeout(async () => {
      await refreshActivityPanel();
      if (typeof window.refreshTikowikoHome === 'function') {
        window.refreshTikowikoHome();
      }
    }, 1200);
  }
}

async function claimActivityReward(stepTarget) {
  const snap = await getActivitySnapshot();
  const reward = TIKO_REWARDS.find(r => r.steps === Number(stepTarget));
  if (!reward || snap.steps < reward.steps) return;
  const state = loadActivityState();
  if (state.claimed[reward.steps]) return;
  state.claimed[reward.steps] = true;
  state.points += reward.points;
  if (!state.rewards.includes(reward.reward)) state.rewards.push(reward.reward);
  saveActivityState(state);
  addBubble?.(`Récompense récupérée : ${reward.reward}. +${reward.points} points.`, 'system');
  refreshActivityPanel();
}

async function openActivityPanel() {
  document.getElementById('activityPanel')?.classList.add('open');
  await ensureActivityAccess();
  await refreshActivityPanel();
}

function closeActivityPanel() {
  document.getElementById('activityPanel')?.classList.remove('open');
}

async function handleActivityVoiceCommand(text) {
  const n = (typeof normalize === 'function' ? normalize(text) : String(text).toLowerCase());
  const asksSteps = /combien de pas|pas.*aujourd/.test(n);
  const asksNext = /reste combien de pas|prochaine recompense/.test(n);
  const asksReward = /quelle est ma prochaine recompense/.test(n);
  const asksPoints = /combien de points/.test(n);
  if (!asksSteps && !asksNext && !asksReward && !asksPoints) return false;

  const snap = await getActivitySnapshot();
  const state = loadActivityState();
  const next = TIKO_REWARDS.find(r => snap.steps < r.steps) || null;
  if (asksSteps) addBubble(`${snap.steps.toLocaleString('fr-FR')} pas aujourd’hui.`, 'system');
  else if (asksNext) addBubble(next ? `Il te reste ${Math.max(0, next.steps - snap.steps).toLocaleString('fr-FR')} pas avant la prochaine récompense.` : 'Tu as atteint tous les paliers du jour.', 'system');
  else if (asksReward) addBubble(next ? `Ta prochaine récompense est ${next.reward}, à ${next.steps.toLocaleString('fr-FR')} pas.` : 'Toutes les récompenses du jour sont atteintes.', 'system');
  else if (asksPoints) addBubble(`Tu as ${state.points.toLocaleString('fr-FR')} points Tikowiko.`, 'system');
  return true;
}

window.openActivityPanel = openActivityPanel;
window.closeActivityPanel = closeActivityPanel;
window.refreshActivityPanel = refreshActivityPanel;
window.requestActivityAccess = requestActivityAccess;
window.claimActivityReward = claimActivityReward;
window.handleActivityVoiceCommand = handleActivityVoiceCommand;
window.getActivitySnapshot = getActivitySnapshot;
window.loadActivityState = loadActivityState;
window.ensureActivityAccess = ensureActivityAccess;
window.updateMilestoneProgress = updateMilestoneProgress;

window.addEventListener('DOMContentLoaded', () => {
  updateMilestoneProgress(0);
  setTimeout(ensureActivityAccess, 700);
});
