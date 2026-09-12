// Tikowikointelligent — appels directs depuis une commande vocale
(function () {
  const DirectCall = window.Capacitor?.Plugins?.DirectCall;
  const previousHandleTranscript = window.handleTranscript;

  function norm(value) {
    if (typeof window.normalize === 'function') return window.normalize(String(value || ''));
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function bubble(text, type = 'system') {
    if (typeof window.addBubble === 'function') window.addBubble(text, type);
  }

  function hasDateHint(text) {
    const n = norm(text);
    return /\b(aujourd hui|demain|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.test(n)
      || /\b\d{1,2}[\/-]\d{1,2}\b/.test(text);
  }

  function extractTarget(text) {
    return String(text || '')
      .replace(/^\s*(?:appelle|appeler|téléphone à|telephone a|téléphone|telephone)\s+/i, '')
      .replace(/[.!?]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isDirectCallCommand(text) {
    const n = norm(text);
    if (hasDateHint(text)) return false;
    return /^(appelle|appeler|telephone)\b/.test(n);
  }

  async function directCall(text) {
    const target = extractTarget(text);
    bubble(text, 'user');

    if (!target) {
      bubble('Dis par exemple : « appelle Audrey ».', 'system');
      return;
    }

    if (!DirectCall || typeof DirectCall.callContact !== 'function') {
      bubble('Les appels directs ne sont pas disponibles dans cette version de l’application.', 'system error');
      return;
    }

    try {
      bubble(`J’appelle ${target}…`, 'system');
      const result = await DirectCall.callContact({ target });
      if (result?.name && norm(result.name) !== norm(target)) {
        bubble(`Appel lancé vers ${result.name}.`, 'system');
      }
    } catch (e) {
      const message = String(e?.message || e || 'Erreur inconnue');
      if (/permissions/i.test(message)) {
        bubble('Pour appeler directement, autorise Tikowikointelligent à accéder aux Contacts et au Téléphone.', 'system error');
      } else if (/plusieurs contacts/i.test(message)) {
        bubble(message + ' Réessaie avec le nom complet.', 'system');
      } else if (/introuvable/i.test(message)) {
        bubble(`Je n’ai pas trouvé « ${target} » dans tes contacts.`, 'system error');
      } else {
        bubble('Impossible de lancer l’appel : ' + message, 'system error');
      }
    }
  }

  if (typeof previousHandleTranscript === 'function') {
    window.handleTranscript = function handleTranscriptWithDirectCall(text) {
      if (isDirectCallCommand(text)) {
        directCall(text);
        return;
      }
      return previousHandleTranscript(text);
    };
  }
})();
