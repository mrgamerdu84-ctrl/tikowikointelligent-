// Tikowikointelligent — reconnaissance souple des noms d'applications.
// Intercepte uniquement les commandes « ouvre/lance… » et conserve tout le reste de l'assistant.
(function () {
  const AppLauncherFuzzy = window.Capacitor?.Plugins?.AppLauncher;
  const previousHandleTranscript = window.handleTranscript;
  const ALIAS_KEY = 'tikowiko_app_aliases_v1';

  function clean(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(value) {
    return clean(value).replace(/\s+/g, '');
  }

  function stripFillers(value) {
    let n = clean(value);
    // « ouvre-moi YouTube », « ouvre l'appli YouTube », « lance le Spotify »…
    n = n
      .replace(/^(?:moi|moi l application|moi l appli|l application|l appli|application|appli)\s+/, '')
      .replace(/^(?:le|la|les|mon|ma|mes)\s+/, '')
      .replace(/\s+(?:s il te plait|stp|merci)$/g, '')
      .trim();
    return n;
  }

  function lev(a, b) {
    const m = a.length, n = b.length;
    const row = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const old = row[j];
        row[j] = a[i - 1] === b[j - 1]
          ? previous
          : 1 + Math.min(previous, row[j], row[j - 1]);
        previous = old;
      }
    }
    return row[n];
  }

  function loadAliases() {
    try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function saveAlias(alias, packageName) {
    const aliases = loadAliases();
    aliases[clean(alias)] = packageName;
    localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases));
  }

  function scoreApp(app, spoken) {
    const target = stripFillers(spoken);
    const label = clean(app?.label || '');
    if (!target || !label) return 9999;

    const tc = compact(target);
    const lc = compact(label);
    if (label === target || tc === lc) return 0;

    // Le nom peut être incomplet : « YouTube » pour « YouTube Music ».
    if (label.startsWith(target)) return 0.30 + (label.length - target.length) / 200;
    if (label.includes(target)) return 0.55 + (label.length - target.length) / 200;
    if (lc.startsWith(tc)) return 0.65 + (lc.length - tc.length) / 200;
    if (lc.includes(tc)) return 0.85 + (lc.length - tc.length) / 200;

    const targetWords = target.split(' ').filter(Boolean);
    const labelWords = label.split(' ').filter(Boolean);
    let wordScore = 999;

    for (const tw of targetWords) {
      for (const lw of labelWords) {
        const d = lev(compact(tw), compact(lw));
        const ratio = d / Math.max(tw.length, lw.length, 1);
        wordScore = Math.min(wordScore, ratio);
      }
    }

    const fullDistance = lev(tc, lc);
    const fullRatio = fullDistance / Math.max(tc.length, lc.length, 1);
    return 2 + Math.min(fullRatio, wordScore) * 6;
  }

  function rankApps(apps, spoken) {
    const aliases = loadAliases();
    const aliasPackage = aliases[clean(stripFillers(spoken))];
    if (aliasPackage) {
      const remembered = apps.find(a => a.packageName === aliasPackage);
      if (remembered) return [{ app: remembered, score: -1 }];
    }

    return apps
      .map(app => ({ app, score: scoreApp(app, spoken) }))
      .sort((a, b) => a.score - b.score);
  }

  function confidentEnough(best, target) {
    if (!best) return false;
    if (best.score <= 1.2) return true;

    const tc = compact(target);
    const labelWords = clean(best.app.label).split(' ').filter(Boolean);
    const distances = [lev(tc, compact(best.app.label))];
    for (const word of labelWords) distances.push(lev(tc, compact(word)));
    const distance = Math.min(...distances);
    const allowed = tc.length <= 4 ? 1 : Math.max(2, Math.floor(tc.length * 0.42));
    return distance <= allowed;
  }

  function showSuggestions(target, ranked) {
    if (typeof window.addBubble !== 'function') return;
    const choices = ranked.slice(0, 3).map(x => x.app);
    const wrap = document.createElement('div');
    wrap.className = 'bubble system';

    const text = document.createElement('div');
    text.textContent = `Je n’ai pas reconnu exactement « ${target} ». Tu voulais dire :`;
    wrap.appendChild(text);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:9px;';
    choices.forEach(app => {
      const button = document.createElement('button');
      button.textContent = app.label;
      button.style.cssText = 'border:0;border-radius:9px;padding:7px 10px;background:var(--accent);color:#0b1211;font-size:13px;font-weight:600;';
      button.onclick = async () => {
        saveAlias(target, app.packageName);
        window.addBubble(`D’accord : « ${target} » correspondra maintenant à ${app.label}.`, 'system');
        try { await AppLauncherFuzzy.launch({ packageName: app.packageName }); }
        catch (e) { window.addBubble('Impossible d’ouvrir l’application : ' + (e?.message || e), 'system error'); }
      };
      row.appendChild(button);
    });
    wrap.appendChild(row);
    document.getElementById('log')?.appendChild(wrap);
  }

  function extractAppTarget(text) {
    const n = clean(text);
    const match = n.match(/^(ouvre|ouvrir|lance|lancer|demarre|demarrer)\b\s*(.*)$/);
    if (!match) return null;
    return stripFillers(match[2]);
  }

  window.handleTranscript = function handleTranscriptFuzzy(text) {
    const target = extractAppTarget(text);
    if (target === null) {
      if (typeof previousHandleTranscript === 'function') return previousHandleTranscript(text);
      return;
    }

    // Les modules Courses / Appels / Rappels chargés ensuite peuvent intercepter avant nous.
    if (typeof window.addBubble === 'function') window.addBubble(text, 'user');
    if (!target) {
      window.addBubble?.('Dis par exemple : « ouvre YouTube » ou simplement le début du nom de l’application.', 'system');
      return;
    }

    (async () => {
      try {
        const result = await AppLauncherFuzzy?.getInstalledApps?.();
        const apps = Array.isArray(result?.apps) ? result.apps : [];
        if (!apps.length) {
          window.addBubble?.('Je n’arrive pas à lire les applications installées.', 'system error');
          return;
        }

        const ranked = rankApps(apps, target);
        const best = ranked[0];
        if (!confidentEnough(best, target)) {
          showSuggestions(target, ranked);
          return;
        }

        window.addBubble?.(`J’ouvre ${best.app.label}…`, 'system');
        await AppLauncherFuzzy.launch({ packageName: best.app.packageName });
      } catch (e) {
        window.addBubble?.('Impossible d’ouvrir l’application : ' + (e?.message || e), 'system error');
      }
    })();
  };
})();