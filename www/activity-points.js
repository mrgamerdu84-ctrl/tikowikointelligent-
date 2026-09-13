const ActivityPoints = window.Capacitor?.Plugins?.ActivityPoints;

const TIKO_ACTIVITY_KEY = 'tikowiko_activity_points_v1';
const TIKO_REWARDS = [
  { steps: 2000, points: 20, reward: 'Badge Marcheur' },
  { steps: 5000, points: 50, reward: 'Thème Néon Bleu' },
  { steps: 10000, points: 100, reward: 'Style de boutons Énergie' }
];

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
  if (ActivityPoints?.getToday) {
    try {
      const r = await ActivityPoints.getToday();
      steps = Number(r?.steps || 0);
      sensorAvailable = !!r?.sensorAvailable;
      permissionRequired = !!r?.activityPermissionRequired;
      permissionGranted = !!r?.activityPermissionGranted;
    } catch (_) {}
  }
  return { steps, sensorAvailable, permissionRequired, permissionGranted };
}

async function refreshActivityPanel() {
  const panel = document.getElementById('activityPanel');
  if (!panel) return;
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
      permissionBox.innerHTML = 'Le compteur de pas matériel n’est pas disponible sur ce téléphone.';
    } else if (snap.permissionRequired && !snap.permissionGranted) {
      permissionBox.innerHTML = '<button class="action-btn" onclick="requestActivityAccess()">Autoriser l’activité physique</button>';
    } else {
      permissionBox.textContent = 'Pas comptés localement par le capteur Android. Aucun GPS permanent.';
    }
  }

  const rewardsEl = document.getElementById('activityRewards');
  if (rewardsEl) {
    rewardsEl.innerHTML = TIKO_REWARDS.map(r => {
      const reached = snap.steps >= r.steps;
      const claimed = !!state.claimed[r.steps];
      return `<div class="reward-row ${reached ? 'reached' : ''}"><div><b>${r.steps.toLocaleString('fr-FR')} pas</b><span>${r.reward} · +${r.points} pts</span></div>${reached && !claimed ? `<button class="action-btn" onclick="claimActivityReward(${r.steps})">Récupérer</button>` : `<span class="reward-state">${claimed ? 'Récupérée' : 'Verrouillée'}</span>`}</div>`;
    }).join('');
  }

  const banner = document.getElementById('activityUnlockBanner');
  if (banner) {
    banner.style.display = pending.length ? 'block' : 'none';
    banner.textContent = pending.length ? 'Récompense débloquée !' : '';
  }
}

async function requestActivityAccess() {
  if (ActivityPoints?.requestActivityPermission) {
    await ActivityPoints.requestActivityPermission();
    setTimeout(refreshActivityPanel, 700);
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
