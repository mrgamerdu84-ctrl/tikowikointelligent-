// Tikowikointelligent — actions personnelles locales
// - Liste de courses stockée uniquement dans localStorage du téléphone
// - Appels sécurisés : Contacts / composeur Android, jamais d'appel automatique silencieux
// - Appels planifiés : création d'un rappel dans l'agenda Android
(function () {
  const AppLauncherActions = window.Capacitor?.Plugins?.AppLauncher;
  const SHOPPING_KEY = 'tikowiko_shopping_list_v1';
  const previousHandleTranscript = window.handleTranscript;

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  function norm(value) {
    if (typeof window.normalize === 'function') return window.normalize(String(value || ''));
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------------- Liste de courses ----------------
  function loadShopping() {
    try {
      const raw = JSON.parse(localStorage.getItem(SHOPPING_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(x => x && typeof x.text === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function saveShopping(items) {
    localStorage.setItem(SHOPPING_KEY, JSON.stringify(items));
    renderShopping();
  }

  function cleanItem(value) {
    return String(value || '')
      .replace(/^\s*(?:du|de la|de l['’]|des|le|la|les|un|une)\s+/i, '')
      .replace(/[.;]+$/g, '')
      .trim();
  }

  function splitItems(value) {
    return String(value || '')
      .split(/\s*(?:,|\bet\b|\bpuis\b)\s*/i)
      .map(cleanItem)
      .filter(Boolean);
  }

  function addShoppingItems(values) {
    const items = loadShopping();
    const existing = new Set(items.map(x => norm(x.text)));
    const added = [];

    for (const text of values) {
      const key = norm(text);
      if (!key || existing.has(key)) continue;
      items.push({ id: Date.now() + Math.floor(Math.random() * 100000), text, checked: false });
      existing.add(key);
      added.push(text);
    }

    saveShopping(items);
    return added;
  }

  function removeShoppingItem(name) {
    const target = norm(name);
    const items = loadShopping();
    if (!target) return null;

    let bestIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const value = norm(items[i].text);
      if (value === target || value.includes(target) || target.includes(value)) {
        bestIndex = i;
        break;
      }
    }

    if (bestIndex < 0) return null;
    const removed = items.splice(bestIndex, 1)[0];
    saveShopping(items);
    return removed.text;
  }

  function setShoppingChecked(id, checked) {
    const items = loadShopping();
    const item = items.find(x => String(x.id) === String(id));
    if (!item) return;
    item.checked = !!checked;
    saveShopping(items);
  }

  function deleteShoppingById(id) {
    saveShopping(loadShopping().filter(x => String(x.id) !== String(id)));
  }

  function clearShopping() {
    saveShopping([]);
  }

  function renderShopping() {
    const list = document.getElementById('shoppingList');
    const count = document.getElementById('shoppingCount');
    if (!list) return;

    const items = loadShopping();
    if (count) count.textContent = `${items.filter(x => !x.checked).length} à acheter`;
    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'shopping-empty';
      empty.textContent = 'Ta liste est vide. Dis par exemple : « ajoute lait, œufs et pain à ma liste de courses ».';
      list.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'shopping-item' + (item.checked ? ' done' : '');

      const label = document.createElement('label');
      label.className = 'shopping-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!item.checked;
      checkbox.onchange = () => setShoppingChecked(item.id, checkbox.checked);
      const text = document.createElement('span');
      text.textContent = item.text;
      label.appendChild(checkbox);
      label.appendChild(text);

      const remove = document.createElement('button');
      remove.className = 'shopping-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Supprimer ${item.text}`);
      remove.onclick = () => deleteShoppingById(item.id);

      row.appendChild(label);
      row.appendChild(remove);
      list.appendChild(row);
    });
  }

  window.openShoppingPanel = function openShoppingPanel() {
    const panel = document.getElementById('shoppingPanel');
    if (panel) {
      renderShopping();
      panel.classList.add('open');
    }
  };

  window.closeShoppingPanel = function closeShoppingPanel() {
    document.getElementById('shoppingPanel')?.classList.remove('open');
  };

  window.addShoppingFromInput = function addShoppingFromInput() {
    const input = document.getElementById('shoppingInput');
    if (!input) return;
    const values = splitItems(input.value);
    if (!values.length) return;
    addShoppingItems(values);
    input.value = '';
  };

  window.clearShoppingList = function clearShoppingList() {
    clearShopping();
    bubble('Liste de courses vidée.', 'system');
  };

  function injectShoppingUI() {
    if (document.getElementById('shoppingPanel')) return;

    const style = document.createElement('style');
    style.textContent = `
      .shopping-content{padding:8px 20px 30px;overflow-y:auto;flex:1}
      .shopping-summary{font-size:12px;color:var(--accent);margin:0 4px 12px}
      .shopping-add{display:flex;gap:8px;margin-bottom:14px}
      .shopping-add input{flex:1;min-width:0;background:#242733;color:var(--text);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:11px 12px;font-size:14px}
      .shopping-add button,.shopping-clear{border:0;border-radius:11px;padding:10px 12px;background:var(--accent);color:#0b1211;font-weight:600}
      .shopping-clear{width:100%;margin-top:14px;background:#2a2d39;color:var(--text)}
      .shopping-item{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg-panel);border-radius:13px;padding:12px 11px;margin-bottom:8px;border:1px solid rgba(255,255,255,.05)}
      .shopping-item.done span{text-decoration:line-through;opacity:.55}
      .shopping-check{display:flex;align-items:center;gap:11px;flex:1;font-size:14px}
      .shopping-check input{width:20px;height:20px;accent-color:var(--accent)}
      .shopping-remove{border:0;background:transparent;color:var(--text-dim);font-size:24px;line-height:1;padding:2px 6px}
      .shopping-empty{background:var(--bg-panel);border-radius:14px;padding:16px;color:var(--text-dim);font-size:13px;line-height:1.5}
    `;
    document.head.appendChild(style);

    const actions = document.querySelector('.header-actions');
    if (actions && !document.getElementById('shoppingHeaderBtn')) {
      const btn = document.createElement('button');
      btn.id = 'shoppingHeaderBtn';
      btn.textContent = 'Courses';
      btn.onclick = window.openShoppingPanel;
      actions.insertBefore(btn, actions.firstChild);
    }

    const panel = document.createElement('div');
    panel.id = 'shoppingPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="top">
        <div><h2>Liste de courses</h2><div class="shopping-summary" id="shoppingCount">0 à acheter</div></div>
        <button onclick="closeShoppingPanel()">Fermer</button>
      </div>
      <div class="shopping-content">
        <div class="shopping-add">
          <input id="shoppingInput" type="text" placeholder="Ajouter lait, pain…" autocomplete="off">
          <button onclick="addShoppingFromInput()">Ajouter</button>
        </div>
        <div id="shoppingList"></div>
        <button class="shopping-clear" onclick="clearShoppingList()">Vider la liste</button>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById('shoppingInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') window.addShoppingFromInput();
    });
    renderShopping();
  }

  function looksLikeShoppingCommand(text) {
    const n = norm(text);
    if (/\b(liste de courses|courses)\b/.test(n)) return true;
    return /^(ajoute|ajouter|mets|mettre|note|noter)\b/.test(n) && /\b(ma liste|liste)\b/.test(n);
  }

  function handleShoppingCommand(text) {
    const n = norm(text);

    if (/^(vide|vider|efface|effacer|supprime tout)\b/.test(n)) {
      clearShopping();
      bubble('J’ai vidé ta liste de courses.', 'system');
      return;
    }

    if (/^(montre|affiche|ouvre|lis|lire|quelle|qu est ce)\b/.test(n) || n === 'liste de courses') {
      const items = loadShopping().filter(x => !x.checked);
      if (!items.length) bubble('Ta liste de courses est vide.', 'system');
      else bubble(`Il te reste : ${items.map(x => x.text).join(', ')}.`, 'system');
      window.openShoppingPanel();
      return;
    }

    if (/^(enleve|enlever|retire|retirer|supprime|supprimer)\b/.test(n)) {
      let value = text
        .replace(/^\s*(?:enlève|enleve|enlever|retire|retirer|supprime|supprimer)\s+/i, '')
        .replace(/\s+(?:de|dans|sur)\s+(?:ma\s+)?liste(?:\s+de\s+courses)?\s*$/i, '')
        .trim();
      const removed = removeShoppingItem(value);
      bubble(removed ? `${removed} retiré de la liste.` : `Je n’ai pas trouvé « ${value} » dans la liste.`, 'system');
      return;
    }

    let value = text
      .replace(/^\s*(?:ajoute|ajouter|mets|mettre|note|noter)\s+/i, '')
      .replace(/\s+(?:à|a|dans|sur)\s+(?:ma\s+)?liste(?:\s+de\s+courses)?\s*$/i, '')
      .trim();
    const values = splitItems(value);
    const added = addShoppingItems(values);
    if (!values.length) {
      bubble('Dis par exemple : « ajoute lait, œufs et pain à ma liste de courses ».', 'system');
    } else if (!added.length) {
      bubble('Ces articles sont déjà dans ta liste.', 'system');
    } else {
      bubble(`Ajouté à la liste : ${added.join(', ')}.`, 'system');
    }
  }

  // ---------------- Appels sécurisés ----------------
  function looksLikeCallCommand(text) {
    const n = norm(text);
    if (/\b(rappelle moi|rappel)\b/.test(n)) return false;
    return /\b(appelle|appeler|telephone)\b/.test(n);
  }

  function hasDateHint(n) {
    return /\b(aujourd hui|demain|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}[\/-]\d{1,2}|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.test(n);
  }

  function cleanCallTarget(value) {
    return String(value || '')
      .replace(/^\s*(?:appelle|appeler|téléphone à|telephone a|téléphone|telephone)\s+/i, '')
      .replace(/^\s*(?:ma|mon|mes|maman|papa)\s*$/i, m => m.trim())
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function handleCallCommand(text) {
    const n = norm(text);

    if (hasDateHint(n)) {
      if (typeof window.parseAppointment !== 'function') {
        bubble('La planification des appels n’est pas disponible dans cette version.', 'system error');
        return;
      }

      const parsed = window.parseAppointment(text);
      if (!parsed?.ok) {
        bubble(`Pour programmer l’appel, précise aussi l’heure. Exemple : « jeudi à 18 h appelle Maman »`, 'system');
        return;
      }

      let target = cleanCallTarget(parsed.title);
      target = target.replace(/^appelle?r?\s+/i, '').trim();
      if (!target) target = 'ce contact';

      const end = new Date(parsed.start.getTime() + 15 * 60 * 1000);
      const formatted = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      }).format(parsed.start);

      bubble(`Je prépare un rappel pour appeler ${target} ${formatted}.`, 'system');
      try {
        await AppLauncherActions?.createCalendarEvent?.({
          title: `Appeler ${target}`,
          startMillis: parsed.start.getTime(),
          endMillis: end.getTime()
        });
      } catch (e) {
        bubble('Impossible de préparer le rappel d’appel : ' + (e?.message || e), 'system error');
      }
      return;
    }

    let target = cleanCallTarget(text);
    if (!target) {
      bubble('Dis par exemple : « appelle Maman » ou « appelle 06… ».', 'system');
      return;
    }

    if (!AppLauncherActions || typeof AppLauncherActions.openContactOrDialer !== 'function') {
      bubble('Les appels sécurisés sont disponibles dans l’application Android compilée.', 'system error');
      return;
    }

    try {
      const result = await AppLauncherActions.openContactOrDialer({ target });
      if (result?.mode === 'dialer') {
        bubble(`J’ai préparé le numéro ${target}. Vérifie puis appuie sur Appeler dans le téléphone.`, 'system');
      } else {
        bubble(`J’ouvre les contacts sur « ${target} ». Choisis la bonne fiche puis confirme l’appel.`, 'system');
      }
    } catch (e) {
      bubble('Impossible d’ouvrir le téléphone : ' + (e?.message || e), 'system error');
    }
  }

  // On enveloppe le gestionnaire existant pour conserver les rendez-vous, rappels et lancement d'apps.
  if (typeof previousHandleTranscript === 'function') {
    window.handleTranscript = function handleTranscriptWithPersonalActions(text) {
      const n = norm(text);
      if (looksLikeShoppingCommand(text)) {
        bubble(text, 'user');
        handleShoppingCommand(text);
        return;
      }
      if (looksLikeCallCommand(text)) {
        bubble(text, 'user');
        handleCallCommand(text);
        return;
      }
      return previousHandleTranscript(text);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectShoppingUI, { once: true });
  } else {
    injectShoppingUI();
  }
})();
