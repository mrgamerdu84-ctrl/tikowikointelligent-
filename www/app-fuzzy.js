// Tikowikointelligent — reconnaissance souple des noms d'applications.
// Accepte les noms incomplets, quelques mots de remplissage et de petites erreurs de reconnaissance vocale.
(function () {
  function clean(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripFillers(value) {
    let n = clean(value);
    n = n
      .replace(/^(?:moi|moi l application|moi l appli|l application|l appli|application|appli)\s+/, '')
      .replace(/^(?:le|la|les|mon|ma|mes)\s+/, '')
      .replace(/\s+(?:s il te plait|stp|merci)$/g, '')
      .trim();
    return n;
  }

  function compact(value) {
    return clean(value).replace(/\s+/g, '');
  }

  function lev(a, b) {
    if (typeof window.levenshtein === 'function') return window.levenshtein(a, b);
    const m = a.length, n = b.length;
    const row = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const old = row[j];
        row[j] = a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, row[j], row[j - 1]);
        prev = old;
      }
    }
    return row[n];
  }

  function scoreApp(app, spoken) {
    const target = stripFillers(spoken);
    const label = clean(app?.label || '');
    if (!target || !label) return 9999;

    if (label === target) return 0;

    const tc = compact(target);
    const lc = compact(label);
    if (lc === tc) return 0.1;

    // Dire seulement une partie distinctive du nom doit fonctionner.
    if (label.startsWith(target)) return 0.6 + Math.max(0, label.length - target.length) / 100;
    if (label.includes(target)) return 0.9 + Math.max(0, label.length - target.length) / 100;
    if (lc.startsWith(tc)) return 1.0 + Math.max(0, lc.length - tc.length) / 100;
    if (lc.includes(tc)) return 1.2 + Math.max(0, lc.length - tc.length) / 100;

    const targetWords = target.split(' ').filter(Boolean);
    const labelWords = label.split(' ').filter(Boolean);
    const common = targetWords.filter(t => labelWords.some(l => l === t || l.startsWith(t) || t.startsWith(l)));
    if (common.length) {
      const coverage = common.length / Math.max(1, targetWords.length);
      if (coverage >= 0.66) return 1.8 - coverage;
    }

    const fullDistance = lev(tc, lc);
    const fullRatio = fullDistance / Math.max(tc.length, lc.length, 1);

    // Compare aussi avec chaque mot du vrai nom de l'application.
    let bestWordRatio = 1;
    for (const word of labelWords) {
      const d = lev(tc, compact(word));
      const ratio = d / Math.max(tc.length, compact(word).length, 1);
      if (ratio < bestWordRatio) bestWordRatio = ratio;
    }

    return 3 + Math.min(fullRatio, bestWordRatio) * 10;
  }

  window.findBestApp = function findBestAppFlexible(spokenName) {
    const target = stripFillers(spokenName);
    if (!target || !Array.isArray(window.installedApps) || !window.installedApps.length) return null;

    if (window.learnedAliases && window.learnedAliases[target]) return window.learnedAliases[target];

    const ranked = window.installedApps
      .map(app => ({ app, score: scoreApp(app, target) }))
      .sort((a, b) => a.score - b.score);

    const best = ranked[0];
    if (!best) return null;

    // Les correspondances partielles sont acceptées franchement ; pour une faute de nom,
    // on reste un peu plus prudent afin d'éviter d'ouvrir complètement la mauvaise appli.
    if (best.score <= 2.2) return best.app;

    const tc = compact(target);
    const maxEdit = tc.length <= 4 ? 1 : Math.max(2, Math.floor(tc.length * 0.42));
    const bestLabel = compact(best.app.label);
    const distance = Math.min(
      lev(tc, bestLabel),
      ...clean(best.app.label).split(' ').filter(Boolean).map(w => lev(tc, compact(w)))
    );

    if (distance <= maxEdit) return best.app;
    return null;
  };

  window.topMatches = function topMatchesFlexible(spoken, count = 3) {
    if (!Array.isArray(window.installedApps)) return [];
    return window.installedApps
      .map(app => ({ app, score: scoreApp(app, spoken) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map(x => x.app);
  };
})();