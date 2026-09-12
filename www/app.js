// Tikowikointelligent — logique principale
// Reconnaissance vocale native Android + plugin maison AppLauncher.

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

// --- Permissions micro ---
async function ensureMicrophonePermission() {
  if (!SpeechRecognition) return false;

  try {
    const perm = await SpeechRecognition.checkPermissions();
    if (perm?.speechRecognition === 'granted' || perm?.microphone === 'granted') return true;

    let req;
    if (typeof SpeechRecognition.requestPermissions === 'function') {
      req = await SpeechRecognition.requestPermissions();
    } else if (typeof SpeechRecognition.requestPermission === 'function') {
      req = await SpeechRecognition.requestPermission();
    } else {
      return false;
    }

    return req?.speechRecognition === 'granted' || req?.microphone === 'granted';
  } catch (e) {
    return false;
  }
}

// --- Chargement de la liste des applis ---
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

// --- Réglages : activation par double claquement ---
function openSettingsPanel() {
  document.getElementById('settingsPanel').classList.add('open');
  refreshClapStatus();
}

function closeSettingsPanel() {
  document.getElementById('settingsPanel').classList.remove('open');
}

function sensitivityLabel(value) {
  if (value === 'low') return 'Faible';
  if (value === 'high') return 'Forte';
  return 'Normale';
}

async function refreshClapStatus() {
  const toggle = document.getElementById('clapToggle');
  const status = document.getElementById('clapStatus');
  const sensitivity = document.getElementById('clapSensitivity');
  if (!toggle || !status || !sensitivity) return;

  if (!AppLauncher || typeof AppLauncher.getClapActivationStatus !== 'function') {
    toggle.checked = false;
    toggle.disabled = true;
    sensitivity.disabled = true;
    status.textContent = 'Disponible uniquement sur Android';
    return;
  }

  try {
    const result = await AppLauncher.getClapActivationStatus();
    const enabled = !!result?.enabled;
    const level = ['low', 'normal', 'high'].includes(result?.sensitivity)
      ? result.sensitivity
      : 'normal';

    toggle.checked = enabled;
    toggle.disabled = false;
    sensitivity.disabled = false;
    sensitivity.value = level;
    status.textContent = enabled
      ? `Activée — sensibilité ${sensitivityLabel(level).toLowerCase()}`
      : `Désactivée — sensibilité ${sensitivityLabel(level).toLowerCase()}`;
  } catch (e) {
    toggle.checked = false;
    sensitivity.value = 'normal';
    status.textContent = 'État indisponible';
  }
}

async function toggleClapActivation(enabled) {
  const toggle = document.getElementById('clapToggle');
  const status = document.getElementById('clapStatus');
  const sensitivity = document.getElementById('clapSensitivity');
  if (!toggle || !status || !sensitivity || !AppLauncher) return;

  toggle.disabled = true;
  status.textContent = enabled ? 'Activation…' : 'Désactivation…';

  try {
    if (enabled) {
      const granted = await ensureMicrophonePermission();
      if (!granted) throw new Error('Permission micro refusée');
      await AppLauncher.startClapActivation();
      status.textContent = `Activée — sensibilité ${sensitivityLabel(sensitivity.value).toLowerCase()}`;
      addBubble('Activation par double claquement activée.', 'system');
    } else {
      await AppLauncher.stopClapActivation();
      status.textContent = `Désactivée — sensibilité ${sensitivityLabel(sensitivity.value).toLowerCase()}`;
      addBubble('Activation par double claquement désactivée.', 'system');
    }
  } catch (e) {
    toggle.checked = !enabled;
    status.textContent = toggle.checked ? 'Activée' : 'Désactivée';
    addBubble('Impossible de modifier le double claquement : ' + (e?.message || e), 'system error');
  } finally {
    toggle.disabled = false;
  }
}

async function setClapSensitivity(value) {
  const sensitivity = document.getElementById('clapSensitivity');
  const status = document.getElementById('clapStatus');
  const toggle = document.getElementById('clapToggle');
  if (!sensitivity || !status || !toggle || !AppLauncher) return;

  const allowed = ['low', 'normal', 'high'];
  const level = allowed.includes(value) ? value : 'normal';
  sensitivity.disabled = true;

  try {
    await AppLauncher.setClapSensitivity({ sensitivity: level });
    status.textContent = toggle.checked
      ? `Activée — sensibilité ${sensitivityLabel(level).toLowerCase()}`
      : `Désactivée — sensibilité ${sensitivityLabel(level).toLowerCase()}`;
    addBubble(`Sensibilité du double claquement : ${sensitivityLabel(level)}.`, 'system');
  } catch (e) {
    addBubble('Impossible de changer la sensibilité : ' + (e?.message || e), 'system error');
    await refreshClapStatus();
  } finally {
    sensitivity.disabled = false;
  }
}

// --- Outils texte ---
function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
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

// --- Rendez-vous / agenda Android ---
const MONTHS = {
  janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11
};

const WEEKDAYS = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3,
  jeudi: 4, vendredi: 5, samedi: 6
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseAppointment(text) {
  const norm = normalize(text);
  const now = new Date();
  let date = null;

  if (/\bapres demain\b/.test(norm)) {
    date = addDays(now, 2);
  } else if (/\bdemain\b/.test(norm)) {
    date = addDays(now, 1);
  } else if (/\baujourd hui\b/.test(norm)) {
    date = new Date(now);
  }

  if (!date) {
    const numeric = norm.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]) - 1;
      let year = numeric[3] ? Number(numeric[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      const candidate = new Date(year, month, day);
      if (!numeric[3] && candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      date = candidate;
    }
  }

  if (!date) {
    const monthNames = Object.keys(MONTHS).join('|');
    const written = norm.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?\\b`));
    if (written) {
      const day = Number(written[1]);
      const month = MONTHS[written[2]];
      const hasYear = !!written[3];
      const year = hasYear ? Number(written[3]) : now.getFullYear();
      const candidate = new Date(year, month, day);
      if (!hasYear && candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      date = candidate;
    }
  }

  if (!date) {
    const weekdayNames = Object.keys(WEEKDAYS).join('|');
    const weekdayMatch = norm.match(new RegExp(`\\b(${weekdayNames})(\\s+prochain)?\\b`));
    if (weekdayMatch) {
      const target = WEEKDAYS[weekdayMatch[1]];
      let delta = (target - now.getDay() + 7) % 7;
      if (weekdayMatch[2] && delta === 0) delta = 7;
      date = addDays(now, delta);
    }
  }

  const timeMatch = norm.match(/\b(\d{1,2})\s*(?:h|heure|heures|:)(?:\s*(\d{1,2}))?\b/);
  if (!date || !timeMatch) {
    return {
      ok: false,
      missing: !date && !timeMatch ? 'date et heure' : (!date ? 'date' : 'heure')
    };
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  if (hour > 23 || minute > 59) return { ok: false, missing: 'heure valide' };

  date.setHours(hour, minute, 0, 0);

  let title = text;
  title = title
    .replace(/^(ajoute|ajouter|mets|mettre|note|noter|crée|cree|créer|creer|programme|programmer|planifie|planifier)\s+/i, '')
    .replace(/\bj['’]?ai\s+/ig, '')
    .replace(/\b(un\s+)?rendez[- ]?vous\b/ig, '')
    .replace(/\brdv\b/ig, '')
    .replace(/\b(dans|sur)\s+(mon\s+)?(agenda|calendrier)\b/ig, '')
    .replace(/\b(aujourd['’]?hui|demain|après[- ]demain|apres[- ]demain)\b/ig, '')
    .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(\s+prochain)?\b/ig, '')
    .replace(/\b(le\s+)?\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/ig, '')
    .replace(/\b(le\s+)?\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+\d{4})?\b/ig, '')
    .replace(/\b(?:à|a)?\s*\d{1,2}\s*(?:h|heure|heures|:)(?:\s*\d{1,2})?\b/ig, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '')
    .trim();

  if (!title) title = 'Rendez-vous';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const end = new Date(date.getTime() + 60 * 60 * 1000);
  return { ok: true, title, start: date, end };
}

function looksLikeAppointmentCommand(norm) {
  if (/^(ouvre|ouvrir|lance|lancer|demarre|demarrer)\b/.test(norm)) return false;
  if (/\b(rendez vous|rdv)\b/.test(norm)) return true;
  return /^(ajoute|ajouter|mets|mettre|note|noter|cree|creer|programme|programmer|planifie|planifier)\b/.test(norm)
    && (/\b(agenda|calendrier|demain|aujourd hui|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(norm)
      || /\b\d{1,2}[\/-]\d{1,2}\b/.test(norm));
}

async function handleAppointmentCommand(text) {
  if (!AppLauncher || typeof AppLauncher.createCalendarEvent !== 'function') {
    addBubble('La fonction agenda est disponible dans l’application Android compilée.', 'system error');
    return;
  }

  const appointment = parseAppointment(text);
  if (!appointment.ok) {
    addBubble(`Je n’ai pas compris la ${appointment.missing}. Exemple : « rendez-vous dentiste le 18 septembre à 14 h 30 »`, 'system');
    return;
  }

  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  }).format(appointment.start);

  addBubble(`Je prépare « ${appointment.title} » pour ${formatted}. Vérifie puis confirme dans ton agenda.`, 'system');

  try {
    await AppLauncher.createCalendarEvent({
      title: appointment.title,
      startMillis: appointment.start.getTime(),
      endMillis: appointment.end.getTime()
    });
  } catch (e) {
    addBubble('Impossible d’ouvrir l’agenda : ' + (e?.message || e), 'system error');
  }
}

// --- Correspondance texte parlé -> application ---
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
      score = Math.abs(label.length - target.length);
    } else {
      score = levenshtein(label, target);
    }

    if (score < bestScore) {
      bestScore = score;
      best = app;
    }
  }

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
      learnedAliases[target] = app;
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

  if (looksLikeAppointmentCommand(norm)) {
    handleAppointmentCommand(text);
    return;
  }

  const trigger = TRIGGER_WORDS.find(w => norm.startsWith(normalize(w) + ' ') || norm === normalize(w));
  if (!trigger) {
    addBubble('Tu peux dire « ouvre YouTube » ou « rendez-vous dentiste demain à 14 h ».', 'system');
    return;
  }

  const spokenAppName = norm.slice(normalize(trigger).length).trim();
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
    addBubble('Reconnaissance vocale indisponible (lance l’application compilée sur un vrai téléphone).', 'system error');
    return;
  }

  if (listening) {
    await SpeechRecognition.stop();
    setListeningUI(false);
    return;
  }

  const granted = await ensureMicrophonePermission();
  if (!granted) {
    addBubble('Permission micro refusée.', 'system error');
    return;
  }

  setListeningUI(true);
  await refreshApps();

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
    addBubble('Erreur d’écoute : ' + e.message, 'system error');
  } finally {
    setListeningUI(false);
  }
}

function setListeningUI(on) {
  listening = on;
  micBtn.classList.toggle('listening', on);
  statusEl.textContent = on ? 'Écoute en cours…' : 'Prêt à écouter';
}

refreshApps();
refreshClapStatus();
addBubble('Salut, je suis Tikowikointelligent. Je peux ouvrir tes applis et préparer tes rendez-vous dans l’agenda.', 'system');
