// Tikowikointelligent — menu mobile principal
(function () {
  function closeAllPanels() {
    document.querySelectorAll('.panel.open').forEach(panel => panel.classList.remove('open'));
  }

  function openMenu() {
    closeAllPanels();
    document.getElementById('mainMenuPanel')?.classList.add('open');
  }

  function closeMenu() {
    document.getElementById('mainMenuPanel')?.classList.remove('open');
  }

  function goAssistant() {
    closeAllPanels();
  }

  function goCourses() {
    closeAllPanels();
    if (typeof window.openShoppingPanel === 'function') window.openShoppingPanel();
  }

  function goApps() {
    closeAllPanels();
    if (typeof window.openAppsPanel === 'function') window.openAppsPanel();
  }

  function goSettings() {
    closeAllPanels();
    if (typeof window.openSettingsPanel === 'function') {
      window.openSettingsPanel();
      setTimeout(() => {
        if (typeof window.refreshPersonalClapStatus === 'function') window.refreshPersonalClapStatus();
      }, 0);
    }
  }

  function goHelp() {
    closeAllPanels();
    document.getElementById('aboutPanel')?.classList.add('open');
  }

  window.openTikowikoMenu = openMenu;
  window.closeTikowikoMenu = closeMenu;

  function installMenu() {
    if (document.getElementById('mainMenuPanel')) return;

    const style = document.createElement('style');
    style.textContent = `
      .header-actions{flex:0 0 auto}
      .main-menu-button{
        border:1px solid rgba(111,214,201,.3)!important;
        background:rgba(111,214,201,.10)!important;
        color:var(--accent)!important;
        border-radius:12px!important;
        padding:9px 12px!important;
        font-size:13px!important;
        font-weight:700!important;
      }
      .menu-content{flex:1;overflow-y:auto;padding:10px 20px 32px}
      .menu-intro{margin:0 4px 16px;color:var(--text-dim);font-size:13px;line-height:1.5}
      .menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .menu-tile{
        min-height:118px;border:1px solid rgba(255,255,255,.07);border-radius:18px;
        background:var(--bg-panel);color:var(--text);padding:16px;text-align:left;
        display:flex;flex-direction:column;justify-content:space-between;gap:12px;
      }
      .menu-tile:active{transform:scale(.98);background:#222531}
      .menu-tile.wide{grid-column:1 / -1;min-height:96px}
      .menu-icon{
        width:42px;height:42px;border-radius:13px;background:rgba(111,214,201,.10);
        display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:21px
      }
      .menu-label{font-size:15px;font-weight:700;line-height:1.2}
      .menu-sub{font-size:11.5px;color:var(--text-dim);line-height:1.35;margin-top:4px}
      .menu-footer{margin-top:18px;text-align:center;color:var(--text-dim);font-size:11px}
      @media (max-width:360px){.menu-grid{grid-template-columns:1fr}.menu-tile.wide{grid-column:auto}}
    `;
    document.head.appendChild(style);

    const actions = document.querySelector('.header-actions');
    if (actions) {
      actions.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'main-menu-button';
      btn.textContent = '☰ Menu';
      btn.setAttribute('aria-label', 'Ouvrir le menu principal');
      btn.onclick = openMenu;
      actions.appendChild(btn);
    }

    const panel = document.createElement('div');
    panel.id = 'mainMenuPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="top">
        <div>
          <h2>Menu</h2>
          <div class="status">Tikowikointelligent</div>
        </div>
        <button onclick="closeTikowikoMenu()">Fermer</button>
      </div>
      <div class="menu-content">
        <p class="menu-intro">Choisis simplement ce que tu veux faire.</p>
        <div class="menu-grid">
          <button class="menu-tile wide" id="menuAssistant">
            <span class="menu-icon">🎙️</span>
            <span><span class="menu-label">Assistant vocal</span><span class="menu-sub">Parler à Tikowiko et lancer tes commandes</span></span>
          </button>
          <button class="menu-tile" id="menuCourses">
            <span class="menu-icon">🛒</span>
            <span><span class="menu-label">Courses</span><span class="menu-sub">Voir et modifier ta liste</span></span>
          </button>
          <button class="menu-tile" id="menuApps">
            <span class="menu-icon">▦</span>
            <span><span class="menu-label">Applications</span><span class="menu-sub">Voir les applis détectées</span></span>
          </button>
          <button class="menu-tile" id="menuSettings">
            <span class="menu-icon">⚙</span>
            <span><span class="menu-label">Réglages</span><span class="menu-sub">Claquement, sensibilité et profil</span></span>
          </button>
          <button class="menu-tile" id="menuHelp">
            <span class="menu-icon">?</span>
            <span><span class="menu-label">Aide / Fonctions</span><span class="menu-sub">Tout ce que l'application sait faire</span></span>
          </button>
        </div>
        <div class="menu-footer">© 2026 tikowikoFamily</div>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById('menuAssistant').onclick = goAssistant;
    document.getElementById('menuCourses').onclick = goCourses;
    document.getElementById('menuApps').onclick = goApps;
    document.getElementById('menuSettings').onclick = goSettings;
    document.getElementById('menuHelp').onclick = goHelp;
  }

  function loadSupportScripts() {
    if (!document.querySelector('script[data-tikowiko-speech-fix]')) {
      const speech = document.createElement('script');
      speech.src = 'speech-fix.js';
      speech.async = false;
      speech.dataset.tikowikoSpeechFix = '1';
      document.body.appendChild(speech);
    }

    if (!document.querySelector('script[data-tikowiko-direct-call]')) {
      const directCall = document.createElement('script');
      directCall.src = 'direct-call.js';
      directCall.async = false;
      directCall.dataset.tikowikoDirectCall = '1';
      document.body.appendChild(directCall);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installMenu();
      loadSupportScripts();
    });
  } else {
    installMenu();
    loadSupportScripts();
  }
})();
