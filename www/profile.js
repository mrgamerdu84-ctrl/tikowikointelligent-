(() => {
  const PROFILE_KEY = 'tikowiko_profile_v1';
  const HISTORY_KEY = 'tikowiko_walk_history_v1';
  const ACTIVE_WALK_KEY = 'tikowiko_active_walk_v1';
  const STRIDE_METERS = 0.72;

  const COLORS = {
    cyan:   { label: 'Cyan',   accent: '#38e8ff' },
    bleu:   { label: 'Bleu',   accent: '#3f8cff' },
    violet: { label: 'Violet', accent: '#a46cff' },
    rose:   { label: 'Rose',   accent: '#ff66bf' },
    vert:   { label: 'Vert',   accent: '#50ef9b' },
    orange: { label: 'Orange', accent: '#ff9d42' }
  };

  let lastSnapshot = null;
  let profilePollBusy = false;

  function safeJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }
  function loadProfile() {
    const saved = safeJson(PROFILE_KEY, {});
    return { name: String(saved.name || 'Mon profil').slice(0, 28), color: COLORS[saved.color] ? saved.color : 'cyan' };
  }
  function saveProfile(profile) { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
  function loadHistory() { const list = safeJson(HISTORY_KEY, []); return Array.isArray(list) ? list.slice(0, 40) : []; }
  function saveHistory(list) { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40))); }
  function kmFromSteps(steps) { return Math.max(0, Number(steps) || 0) * STRIDE_METERS / 1000; }
  function fmtKm(km) { return `${Math.max(0, Number(km) || 0).toFixed(2).replace('.', ',')} km`; }
  function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '—'; }
  function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : ''; }

  function ensureProfileUi() {
    if (document.getElementById('profilePanel')) return;
    const style = document.createElement('style');
    style.id = 'tikowikoProfileStyle';
    style.textContent = `
      #profilePanel .content{padding-bottom:40px}
      .profile-hero{display:flex;align-items:center;gap:16px;padding:16px;border-radius:18px;background:linear-gradient(145deg,#0b2d5d,#081c3b);border:1px solid rgba(56,232,255,.35);margin-bottom:12px}
      .profile-avatar-wrap{width:104px;height:104px;flex:0 0 104px;border-radius:50%;display:grid;place-items:center;background:#06152d;border:3px solid var(--profile-accent,#38e8ff);box-shadow:0 0 22px rgba(56,232,255,.28);overflow:hidden}
      .profile-avatar{width:88px;height:88px;object-fit:cover;border-radius:22px;filter:none!important}
      .profile-name{width:100%;padding:10px 11px;border-radius:10px;border:1px solid #2d5a8c;background:#061a38;color:white;font-weight:800}
      .profile-sub{margin-top:7px;color:#9cb2d0;font-size:11px;line-height:1.4}
      .profile-colors{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}
      .profile-color{height:38px;border-radius:11px;border:2px solid transparent;box-shadow:0 0 8px rgba(255,255,255,.08)}
      .profile-color.selected{border-color:white;transform:scale(1.05)}
      .profile-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:12px}
      .profile-stat{padding:13px;border-radius:14px;background:#0b2348;border:1px solid rgba(36,187,255,.35)}
      .profile-stat small{display:block;color:#9cb2d0;font-size:10px;margin-bottom:5px}.profile-stat strong{font-size:21px}
      .walk-item{padding:11px 0;border-bottom:1px solid rgba(130,170,220,.16)}.walk-item:last-child{border-bottom:0}
      .walk-top{display:flex;justify-content:space-between;gap:10px;font-size:12px}.walk-sub{margin-top:4px;color:#9cb2d0;font-size:11px}
      .profile-empty{color:#9cb2d0;font-size:12px;padding:10px 0}.profile-pill{display:inline-block;margin-top:7px;padding:5px 8px;border-radius:20px;background:#0a3658;color:#6cecff;font-size:10px}.profile-private{font-size:11px;color:#9cb2d0;line-height:1.45}
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'profilePanel'; panel.className = 'panel';
    panel.innerHTML = `
      <div class="top"><h2>Mon profil Tikowiko</h2><button onclick="closeProfilePanel()">Fermer</button></div>
      <div class="content">
        <div class="profile-hero" id="profileHero">
          <div class="profile-avatar-wrap"><img id="profileRobot" class="profile-avatar" src="lv_0_20260916003429.jpg" alt="Robot Tikowiko"></div>
          <div style="flex:1;min-width:0"><input id="profileName" class="profile-name" maxlength="28" value="Mon profil" aria-label="Nom du profil"><div class="profile-sub">Choisis le nom du profil. La couleur choisie change uniquement l’accent du profil, pas l’image du robot.</div><div class="profile-pill">Données conservées sur ce téléphone</div></div>
        </div>
        <div class="settings-card"><div style="font-weight:800">Couleur du profil</div><div class="profile-colors" id="profileColors"></div></div>
        <div class="profile-grid"><div class="profile-stat"><small>Pas validés aujourd’hui</small><strong id="profileSteps">0</strong></div><div class="profile-stat"><small>Distance estimée</small><strong id="profileKm">0,00 km</strong></div><div class="profile-stat"><small>Points Tikowiko</small><strong id="profilePoints">0</strong></div><div class="profile-stat"><small>Marches enregistrées</small><strong id="profileWalkCount">0</strong></div></div>
        <div class="settings-card"><div style="font-weight:800;margin-bottom:7px">Marche en cours / dernière marche</div><div id="profileLastWalk" class="setting-help">Aucune marche enregistrée pour le moment.</div></div>
        <div class="settings-card"><div style="font-weight:800">Historique des marches</div><div class="setting-help" style="margin-top:4px">Tikowiko enregistre l’heure de départ, l’heure de retour, les pas validés et une distance approximative.</div><div id="profileHistory"></div></div>
        <div class="settings-card profile-private"><strong style="color:#fff">Vie privée</strong><br>Le profil et l’historique restent enregistrés localement sur l’appareil. La localisation précise n’est pas enregistrée dans cette version.<div style="margin-top:8px">© TikowikoFamily · Confidentiel</div></div>
      </div>`;
    document.body.appendChild(panel);

    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    if (navItems.length >= 5) { const profileNav = navItems[navItems.length - 1]; profileNav.setAttribute('onclick','openProfilePanel()'); profileNav.innerHTML = '<span class="nav-icon">🤖</span>Profil'; }

    const profile = loadProfile();
    document.getElementById('profileName').value = profile.name;
    document.getElementById('profileName').addEventListener('change', (e) => { const p=loadProfile(); p.name=String(e.target.value||'Mon profil').trim().slice(0,28)||'Mon profil'; e.target.value=p.name; saveProfile(p); });
    const colors = document.getElementById('profileColors');
    colors.innerHTML = Object.entries(COLORS).map(([id,c])=>`<button class="profile-color" data-color="${id}" title="${c.label}" aria-label="Couleur ${c.label}" style="background:${c.accent}"></button>`).join('');
    colors.addEventListener('click',(e)=>{const btn=e.target.closest('[data-color]');if(!btn)return;const p=loadProfile();p.color=btn.dataset.color;saveProfile(p);applyProfileColor();});
    applyProfileColor();
  }

  function applyProfileColor(){const p=loadProfile();const c=COLORS[p.color]||COLORS.cyan;const hero=document.getElementById('profileHero');if(hero)hero.style.setProperty('--profile-accent',c.accent);document.querySelectorAll('.profile-color').forEach(el=>el.classList.toggle('selected',el.dataset.color===p.color));}
  function activeWalk(){return safeJson(ACTIVE_WALK_KEY,null);} function setActiveWalk(w){if(!w)localStorage.removeItem(ACTIVE_WALK_KEY);else localStorage.setItem(ACTIVE_WALK_KEY,JSON.stringify(w));}
  function startWalk(snapshot){if(activeWalk())return;const now=Date.now();setActiveWalk({start:now,startSteps:Math.max(0,Number(snapshot.steps)||0),lastSteps:Math.max(0,Number(snapshot.steps)||0),updatedAt:now});if(typeof window.speakTikowiko==='function')window.speakTikowiko('Bonne marche ! Je compte uniquement tes pas de marche validés.');}
  function updateActiveWalk(snapshot){const walk=activeWalk();if(!walk)return;walk.lastSteps=Math.max(walk.lastSteps||0,Number(snapshot.steps)||0);walk.updatedAt=Date.now();setActiveWalk(walk);}
  function finishWalk(snapshot,forcedEnd){const walk=activeWalk();if(!walk)return;const end=forcedEnd||Date.now();const endSteps=Math.max(walk.lastSteps||0,Number(snapshot?.steps)||0);const steps=Math.max(0,endSteps-Number(walk.startSteps||0));setActiveWalk(null);if(steps<=0)return;const item={start:walk.start,end,steps,km:kmFromSteps(steps)};const history=loadHistory();history.unshift(item);saveHistory(history);if(steps>=10&&typeof window.speakTikowiko==='function')window.speakTikowiko(`Bravo ! Marche terminée : ${steps.toLocaleString('fr-FR')} pas validés, environ ${fmtKm(item.km)}.`);}

  async function tickProfile(){if(profilePollBusy||typeof window.getActivitySnapshot!=='function')return;profilePollBusy=true;try{const snapshot=await window.getActivitySnapshot();lastSnapshot=snapshot;const current=activeWalk();if(snapshot.motionState==='walking'){if(!current)startWalk(snapshot);else updateActiveWalk(snapshot);}else if(snapshot.motionState==='checking'){if(current)updateActiveWalk(snapshot);}else if(current){const staleEnd=current.updatedAt&&Date.now()-current.updatedAt>10*60*1000?current.updatedAt:Date.now();finishWalk(snapshot,staleEnd);}renderProfile(snapshot);}catch(e){console.warn('Profil Tikowiko indisponible',e);}finally{profilePollBusy=false;}}

  function renderProfile(snapshot){if(!document.getElementById('profilePanel'))return;const state=typeof window.loadActivityState==='function'?window.loadActivityState():{points:0};const history=loadHistory();const current=activeWalk();const steps=Math.max(0,Number(snapshot?.steps)||0);const stepsEl=document.getElementById('profileSteps'),kmEl=document.getElementById('profileKm'),pointsEl=document.getElementById('profilePoints'),countEl=document.getElementById('profileWalkCount');if(stepsEl)stepsEl.textContent=steps.toLocaleString('fr-FR');if(kmEl)kmEl.textContent=fmtKm(kmFromSteps(steps));if(pointsEl)pointsEl.textContent=Number(state.points||0).toLocaleString('fr-FR');if(countEl)countEl.textContent=history.length.toLocaleString('fr-FR');const last=document.getElementById('profileLastWalk');if(last){if(current){const currentSteps=Math.max(0,steps-Number(current.startSteps||0));last.innerHTML=`🟠 Marche validée en cours depuis <strong>${fmtTime(current.start)}</strong><br>${currentSteps.toLocaleString('fr-FR')} pas · ${fmtKm(kmFromSteps(currentSteps))} estimés`;}else if(history[0]){const w=history[0];last.innerHTML=`Dernière marche : <strong>${fmtTime(w.start)}</strong> → <strong>${fmtTime(w.end)}</strong><br>${w.steps.toLocaleString('fr-FR')} pas · ${fmtKm(w.km)} estimés`;}else last.textContent='Aucune marche enregistrée pour le moment.';}const historyEl=document.getElementById('profileHistory');if(historyEl){historyEl.innerHTML=!history.length?'<div class="profile-empty">Les marches validées apparaîtront ici.</div>':history.slice(0,12).map(w=>`<div class="walk-item"><div class="walk-top"><strong>${fmtDate(w.start)} · ${fmtTime(w.start)} → ${fmtTime(w.end)}</strong><span>${fmtKm(w.km)}</span></div><div class="walk-sub">${Number(w.steps||0).toLocaleString('fr-FR')} pas validés</div></div>`).join('');}}

  window.openProfilePanel=function(){ensureProfileUi();document.getElementById('profilePanel')?.classList.add('open');renderProfile(lastSnapshot||{steps:0});};
  window.closeProfilePanel=function(){document.getElementById('profilePanel')?.classList.remove('open');};
  document.addEventListener('DOMContentLoaded',()=>{ensureProfileUi();setTimeout(tickProfile,1200);setInterval(tickProfile,2000);});
})();