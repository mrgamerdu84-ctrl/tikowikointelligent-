// Tikowikointelligent — logique principale
// Reconnaissance vocale native Android + plugin maison AppLauncher.

// Le splash doit toujours se fermer, même si un plugin natif tarde ou échoue.
(function setupSplashExit(){
  let closed=false;
  function closeSplash(){
    if(closed)return; closed=true;
    const splash=document.getElementById('welcomeScreen');
    if(splash){
      splash.style.opacity='0';
      splash.style.pointerEvents='none';
      setTimeout(()=>{ splash.style.display='none'; },450);
    }
    document.body.classList.remove('splash-active');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(closeSplash,3000),{once:true});
  else setTimeout(closeSplash,3000);
  // Sécurité absolue si un événement/une animation se bloque.
  setTimeout(closeSplash,5000);
})();

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
  if(logEl){ logEl.appendChild(b); logEl.scrollTop = logEl.scrollHeight; }
}

async function ensureMicrophonePermission() {
  if (!SpeechRecognition) return false;
  try {
    const perm = await SpeechRecognition.checkPermissions();
    if (perm?.speechRecognition === 'granted' || perm?.microphone === 'granted') return true;
    let req;
    if (typeof SpeechRecognition.requestPermissions === 'function') req = await SpeechRecognition.requestPermissions();
    else if (typeof SpeechRecognition.requestPermission === 'function') req = await SpeechRecognition.requestPermission();
    else return false;
    return req?.speechRecognition === 'granted' || req?.microphone === 'granted';
  } catch (_) { return false; }
}

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
  document.getElementById('appsPanel')?.classList.add('open');
  const list = document.getElementById('appsList');
  if (!list) return;
  list.innerHTML = '';
  refreshApps().then(() => {
    installedApps.sort((a,b)=>a.label.localeCompare(b.label)).forEach(app => {
      const row = document.createElement('div');
      row.className = 'app-row';
      row.innerHTML = `<div>${app.label}<div class="pkg">${app.packageName}</div></div>`;
      list.appendChild(row);
    });
  });
}
function closeAppsPanel(){ document.getElementById('appsPanel')?.classList.remove('open'); }
function openSettingsPanel(){ document.getElementById('settingsPanel')?.classList.add('open'); refreshClapStatus(); }
function closeSettingsPanel(){ document.getElementById('settingsPanel')?.classList.remove('open'); }

async function refreshClapStatus() {
  const toggle = document.getElementById('clapToggle');
  const status = document.getElementById('clapStatus');
  if (!toggle || !status) return;
  if (!AppLauncher || typeof AppLauncher.getClapActivationStatus !== 'function') {
    toggle.checked = false; toggle.disabled = true; status.textContent = 'Disponible uniquement sur Android'; return;
  }
  try {
    const result = await AppLauncher.getClapActivationStatus();
    toggle.checked = !!result?.enabled;
    toggle.disabled = false;
    status.textContent = toggle.checked ? 'Activée' : 'Désactivée';
  } catch (_) { status.textContent = 'État indisponible'; }
}

async function toggleClapActivation(enabled) {
  const toggle = document.getElementById('clapToggle');
  const status = document.getElementById('clapStatus');
  if (!toggle || !status || !AppLauncher) return;
  toggle.disabled = true;
  try {
    if (enabled) {
      const granted = await ensureMicrophonePermission();
      if (!granted) throw new Error('Permission micro refusée');
      await AppLauncher.startClapActivation();
      status.textContent = 'Activée';
    } else {
      await AppLauncher.stopClapActivation();
      status.textContent = 'Désactivée';
    }
  } catch (e) {
    toggle.checked = !enabled;
    addBubble('Impossible de modifier le double claquement : ' + (e?.message || e), 'system error');
  } finally { toggle.disabled = false; }
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function levenshtein(a,b){const m=a.length,n=b.length;const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);for(let j=0;j<=n;j++)dp[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);return dp[m][n];}

const MONTHS={janvier:0,fevrier:1,mars:2,avril:3,mai:4,juin:5,juillet:6,aout:7,septembre:8,octobre:9,novembre:10,decembre:11};
const WEEKDAYS={dimanche:0,lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};
function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d;}
function parseAppointment(text){const norm=normalize(text),now=new Date();let date=null;if(/\bapres demain\b/.test(norm))date=addDays(now,2);else if(/\bdemain\b/.test(norm))date=addDays(now,1);else if(/\baujourd hui\b/.test(norm))date=new Date(now);if(!date){const numeric=norm.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);if(numeric){let year=numeric[3]?Number(numeric[3]):now.getFullYear();if(year<100)year+=2000;const c=new Date(year,Number(numeric[2])-1,Number(numeric[1]));if(!numeric[3]&&c<new Date(now.getFullYear(),now.getMonth(),now.getDate()))c.setFullYear(c.getFullYear()+1);date=c;}}if(!date){const names=Object.keys(MONTHS).join('|');const w=norm.match(new RegExp(`\\b(\\d{1,2})\\s+(${names})(?:\\s+(\\d{4}))?\\b`));if(w){const c=new Date(w[3]?Number(w[3]):now.getFullYear(),MONTHS[w[2]],Number(w[1]));if(!w[3]&&c<new Date(now.getFullYear(),now.getMonth(),now.getDate()))c.setFullYear(c.getFullYear()+1);date=c;}}if(!date){const names=Object.keys(WEEKDAYS).join('|');const w=norm.match(new RegExp(`\\b(${names})(\\s+prochain)?\\b`));if(w){let delta=(WEEKDAYS[w[1]]-now.getDay()+7)%7;if(w[2]&&delta===0)delta=7;date=addDays(now,delta);}}const t=norm.match(/\b(\d{1,2})\s*(?:h|heure|heures|:)(?:\s*(\d{1,2}))?\b/);if(!date||!t)return{ok:false,missing:!date&&!t?'date et heure':(!date?'date':'heure')};const hour=Number(t[1]),minute=Number(t[2]||0);if(hour>23||minute>59)return{ok:false,missing:'heure valide'};date.setHours(hour,minute,0,0);let title=text.replace(/^(ajoute|ajouter|mets|mettre|note|noter|crée|cree|créer|creer|programme|programmer|planifie|planifier)\s+/i,'').replace(/\b(un\s+)?rendez[- ]?vous\b/ig,'').replace(/\brdv\b/ig,'').replace(/\b(aujourd['’]?hui|demain|après[- ]demain|apres[- ]demain)\b/ig,'').replace(/\b(?:à|a)?\s*\d{1,2}\s*(?:h|heure|heures|:)(?:\s*\d{1,2})?\b/ig,'').replace(/\s+/g,' ').trim();if(!title)title='Rendez-vous';title=title.charAt(0).toUpperCase()+title.slice(1);return{ok:true,title,start:date,end:new Date(date.getTime()+3600000)};}
function looksLikeAppointmentCommand(norm){if(/^(ouvre|ouvrir|lance|lancer|demarre|demarrer)\b/.test(norm))return false;if(/\b(rendez vous|rdv)\b/.test(norm))return true;return /^(ajoute|ajouter|mets|mettre|note|noter|cree|creer|programme|programmer|planifie|planifier)\b/.test(norm)&&(/\b(agenda|calendrier|demain|aujourd hui|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(norm)||/\b\d{1,2}[\/-]\d{1,2}\b/.test(norm));}
async function handleAppointmentCommand(text){if(!AppLauncher||typeof AppLauncher.createCalendarEvent!=='function'){addBubble('La fonction agenda est disponible dans l’application Android compilée.','system error');return;}const a=parseAppointment(text);if(!a.ok){addBubble(`Je n’ai pas compris la ${a.missing}.`,'system');return;}try{await AppLauncher.createCalendarEvent({title:a.title,startMillis:a.start.getTime(),endMillis:a.end.getTime()});}catch(e){addBubble('Impossible d’ouvrir l’agenda : '+(e?.message||e),'system error');}}

const learnedAliases={};function topMatches(spoken,count=3){const target=normalize(spoken);return installedApps.map(app=>{const label=normalize(app.label);const score=(label.includes(target)||target.includes(label))?Math.abs(label.length-target.length):levenshtein(label,target);return{app,score};}).sort((a,b)=>a.score-b.score).slice(0,count).map(x=>x.app);}function findBestApp(spokenName){const target=normalize(spokenName);if(!target)return null;if(learnedAliases[target])return learnedAliases[target];let best=null,bestScore=Infinity;for(const app of installedApps){const label=normalize(app.label);if(!label)continue;const score=(label.includes(target)||target.includes(label))?Math.abs(label.length-target.length):levenshtein(label,target);if(score<bestScore){bestScore=score;best=app;}}const threshold=Math.max(2,Math.floor(target.length*.4));return bestScore<=threshold?best:null;}function offerSuggestions(spokenRaw){const target=normalize(spokenRaw),suggestions=topMatches(spokenRaw,3),wrap=document.createElement('div');wrap.className='bubble system';const label=document.createElement('div');label.textContent=`Je n'ai pas reconnu "${spokenRaw}". Tu voulais dire :`;wrap.appendChild(label);const btnRow=document.createElement('div');btnRow.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';suggestions.forEach(app=>{const btn=document.createElement('button');btn.textContent=app.label;btn.onclick=()=>{learnedAliases[target]=app;AppLauncher.launch({packageName:app.packageName});};btnRow.appendChild(btn);});wrap.appendChild(btnRow);if(logEl)logEl.appendChild(wrap);}
const TRIGGER_WORDS=['ouvre','ouvrir','lance','lancer','demarre','demarrer'];async function handleTranscript(text){addBubble(text,'user');const norm=normalize(text);if(typeof window.handleActivityVoiceCommand==='function'&&await window.handleActivityVoiceCommand(text))return;if(looksLikeAppointmentCommand(norm)){await handleAppointmentCommand(text);return;}const trigger=TRIGGER_WORDS.find(w=>norm.startsWith(normalize(w)+' ')||norm===normalize(w));if(!trigger){addBubble('Tu peux dire « combien de pas j’ai fait aujourd’hui ? », « combien de points j’ai ? », « ouvre YouTube » ou « rendez-vous dentiste demain à 14 h ».','system');return;}const spokenAppName=norm.slice(normalize(trigger).length).trim();const app=findBestApp(spokenAppName);if(!app){offerSuggestions(spokenAppName);return;}addBubble(`J'ouvre ${app.label}…`,'system');AppLauncher.launch({packageName:app.packageName}).catch(e=>addBubble('Échec du lancement : '+e.message,'system error'));}
async function toggleListening(){if(!SpeechRecognition){addBubble('Reconnaissance vocale indisponible (lance l’application compilée sur un vrai téléphone).','system error');return;}if(listening){await SpeechRecognition.stop();setListeningUI(false);return;}const granted=await ensureMicrophonePermission();if(!granted){addBubble('Permission micro refusée.','system error');return;}setListeningUI(true);await refreshApps();try{const result=await SpeechRecognition.start({language:'fr-FR',maxResults:1,prompt:'Dis une commande…',partialResults:false,popup:false});const phrase=result?.matches?.[0];if(phrase)await handleTranscript(phrase);}catch(e){addBubble('Erreur d’écoute : '+e.message,'system error');}finally{setListeningUI(false);}}function setListeningUI(on){listening=on;micBtn?.classList.toggle('listening',on);if(statusEl)statusEl.textContent=on?'Écoute en cours…':'Prêt à écouter';}
window.addBubble=addBubble;window.normalize=normalize;window.openAppsPanel=openAppsPanel;window.closeAppsPanel=closeAppsPanel;window.openSettingsPanel=openSettingsPanel;window.closeSettingsPanel=closeSettingsPanel;window.toggleClapActivation=toggleClapActivation;window.toggleListening=toggleListening;
refreshApps();refreshClapStatus();addBubble('Salut, je suis Tikowiko Smart Assistant. Je peux suivre tes pas, tes points, ouvrir tes applis et préparer tes rendez-vous.','system');