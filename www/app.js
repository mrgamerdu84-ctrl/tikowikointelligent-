// Tikowikointelligent — logique principale
// Utilise deux plugins natifs Capacitor :
//  - SpeechRecognition (@capacitor-community/speech-recognition) : reconnaissance vocale native Android
//  - AppLauncher (plugin maison, voir android-plugin/) : liste + lance les applis installées

const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;
const AppLauncher = window.Capacitor?.Plugins?.AppLauncher;

let installedApps = []; // [{label, packageName}]
let listening = false;

const logEl = document.getElementById('log');
const micBtn = document.getElementById('mic');
const statusEl = document.getElementById('status');

function addBubble(text, type) {
  const b = document.createElement('div');
  b.className = 'bubble ' + type;
  b.textContent = text;
  logEl.appendChild(b);
  logEl.scrollTop = logEl.scrollHeight;
}

// --- Chargement de la liste des applis (à chaque ouverture, donc toujours à jour) ---
async function refreshApps() {
  if (!AppLauncher) return;
  try {
    const result = await AppLauncher.getInstalledApps();
    installedApps = result.apps || [];
  } catch (e) {
    addBubble('Impossible de lire la liste des applis : ' + e.message, 'system error');
  }
}

function openAppsPanel() {
  document.getElementById('appsPanel').classList.add('open');
  const list = document.getElementById('appsList');
  list.innerHTML = '';
  refreshApps().then(() => {
    installedApps
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach(app => {
        const row = document.createElement('div');
        row.className = 'app-row';
        row.innerHTML = `<div>${app.label}<div class="pkg">${app.packageName}</div></div>`;
        list.appendChild(row);
      });
  });
}
function closeAppsPanel() {
  document.getElementById('appsPanel').classList.remove('open');
}

// --- Correspondance texte parlé -> application ---
// Comparaison simple et tolérante : normalise, cherche la meilleure inclusion / proximité
function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Alias appris (phrase mal comprise -> vraie appli), en mémoire pour cette session
const learnedAliases = {};

function topMatches(spoken, count = 3) {
  const target = normalize(spoken);
  return installedApps
    .map(app => {
      const label = normalize(app.label);
      const score = (label.includes(target) || target.includes(label))
        ? Math.abs(label.length - target.length)
        : levenshtein(label, target);
      return { app, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(x => x.app);
}

function findBestApp(spokenName) {
  const target = normalize(spokenName);
  if (!target) return null;
  if (learnedAliases[target]) return learnedAliases[target];
  let best = null;
  let bestScore = Infinity;
  for (const app of installedApps) {
    const label = normalize(app.label);
    if (!label) continue;
    let score;
    if (label.includes(target) || target.includes(label)) {
      score = Math.abs(label.length - target.length); // quasi-match direct
    } else {
      score = levenshtein(label, target);
    }
    if (score < bestScore) {
      bestScore = score;
      best = app;
    }
  }
  // seuil de tolérance : évite de lancer n'importe quoi sur un mot trop différent
  const threshold = Math.max(2, Math.floor(target.length * 0.4));
  return bestScore <= threshold ? best : null;
}

function offerSuggestions(spokenRaw) {
  const target = normalize(spokenRaw);
  const suggestions = topMatches(spokenRaw, 3);
  const wrap = document.createElement('div');
  wrap.className = 'bubble system';
  const label = document.createElement('div');
  label.textContent = `Je n'ai pas reconnu "${spokenRaw}". Tu voulais dire :`;
  wrap.appendChild(label);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
  suggestions.forEach(app => {
    const btn = document.createElement('button');
    btn.textContent = app.label;
    btn.style.cssText = 'background:var(--accent);color:#0b1211;border:none;border-radius:8px;padding:6px 10px;font-size:13px;';
    btn.onclick = () => {
      learnedAliases[target] = app; // mémorise pour cette session
      addBubble(`Compris — "${spokenRaw}" = ${app.label} à partir de maintenant.`, 'system');
      addBubble(`J'ouvre ${app.label}…`, 'system');
      AppLauncher.launch({ packageName: app.packageName }).catch(e => {
        addBubble('Échec du lancement : ' + e.message, 'system error');
      });
    };
    btnRow.appendChild(btn);
  });
  wrap.appendChild(btnRow);
  logEl.appendChild(wrap);
  logEl.scrollTop = logEl.scrollHeight;
}

// --- Traitement d'une phrase reconnue ---
const TRIGGER_WORDS = ['ouvre', 'ouvrir', 'lance', 'lancer', 'demarre', 'démarre', 'demarrer', 'démarrer'];

function handleTranscript(text) {
  addBubble(text, 'user');
  const norm = normalize(text);

  const trigger = TRIGGER_WORDS.find(w => norm.startsWith(w + ' ') || norm === w);
  if (!trigger) {
    addBubble('Dis "ouvre" ou "lance" suivi du nom de l\'appli.', 'system');
    return;
  }

  const spokenAppName = norm.slice(trigger.length).trim();
  const app = findBestApp(spokenAppName);

  if (!app) {
    offerSuggestions(spokenAppName);
    return;
  }

  addBubble(`J'ouvre ${app.label}…`, 'system');
  AppLauncher.launch({ packageName: app.packageName }).catch(e => {
    addBubble('Échec du lancement : ' + e.message, 'system error');
  });
}

// --- Écoute vocale ---
async function toggleListening() {
  if (!SpeechRecognition) {
    addBubble('Reconnaissance vocale indisponible (lance l\'app compilée sur un vrai téléphone).', 'system error');
    return;
  }

  if (listening) {
    await SpeechRecognition.stop();
    setListeningUI(false);
    return;
  }

  const perm = await SpeechRecognition.checkPermissions();
  if (perm.speechRecognition !== 'granted') {
    const req = await SpeechRecognition.requestPermission();
    if (req.speechRecognition !== 'granted') {
      addBubble('Permission micro refusée.', 'system error');
      return;
    }
  }

  setListeningUI(true);
  await refreshApps();

  SpeechRecognition.addListener('partialResults', (data) => {
    // On garde seulement le résultat final traité côté "stop" naturel du plugin
  });

  try {
    const result = await SpeechRecognition.start({
      language: 'fr-FR',
      maxResults: 1,
      prompt: 'Dis une commande…',
      partialResults: false,
      popup: false,
    });
    const phrase = result?.matches?.[0];
    if (phrase) handleTranscript(phrase);
  } catch (e) {
    addBubble('Erreur d\'écoute : ' + e.message, 'system error');
  } finally {
    setListeningUI(false);
  }
}

function setListeningUI(on) {
  listening = on;
  micBtn.classList.toggle('listening', on);
  statusEl.textContent = on ? 'Écoute en cours…' : 'Prêt à écouter';
}

// Chargement initial de la liste (pour que le premier "ouvre X" fonctionne direct)
refreshApps();
addBubble('Salut, je suis Tikowikointelligent. Dis-moi "ouvre" + le nom d\'une appli.', 'system');
