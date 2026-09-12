// Rappels vocaux Tikowikointelligent
// Cette couche réutilise l'analyse de date/heure déjà présente dans app.js
// puis ouvre l'agenda Android prérempli. Aucun serveur Tikowiko n'est utilisé.
(function () {
  const AppLauncher = window.Capacitor?.Plugins?.AppLauncher;
  const originalHandleTranscript = window.handleTranscript;

  function isReminderCommand(text) {
    const norm = typeof window.normalize === 'function'
      ? window.normalize(text)
      : String(text || '').toLowerCase();

    return /^(rappelle moi|rappeler moi|rappel|cree un rappel|creer un rappel|ajoute un rappel)\b/.test(norm);
  }

  function cleanReminderTitle(title) {
    let value = String(title || '')
      .replace(/^rappelle[- ]?moi(?:\s+de)?\s*/i, '')
      .replace(/^rappeler[- ]?moi(?:\s+de)?\s*/i, '')
      .replace(/^rappel(?:\s+de)?\s*/i, '')
      .replace(/^cr[ée]e?r?\s+un\s+rappel(?:\s+de)?\s*/i, '')
      .replace(/^ajoute?r?\s+un\s+rappel(?:\s+de)?\s*/i, '')
      .trim();

    if (!value) value = 'Rappel';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  async function handleReminder(text) {
    if (typeof window.parseAppointment !== 'function') {
      window.addBubble?.('La fonction de rappel n’est pas disponible dans cette version.', 'system error');
      return;
    }

    const parsed = window.parseAppointment(text);
    if (!parsed?.ok) {
      window.addBubble?.(
        `Je n’ai pas compris la ${parsed?.missing || 'date ou heure'}. Exemple : « rappelle-moi de sortir la poubelle demain à 19 h »`,
        'system'
      );
      return;
    }

    if (!AppLauncher || typeof AppLauncher.createCalendarEvent !== 'function') {
      window.addBubble?.('Les rappels sont disponibles dans l’application Android compilée.', 'system error');
      return;
    }

    const title = cleanReminderTitle(parsed.title);
    const end = new Date(parsed.start.getTime() + 15 * 60 * 1000);
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    }).format(parsed.start);

    window.addBubble?.(`Je prépare le rappel « ${title} » pour ${formatted}. Vérifie puis enregistre-le dans ton agenda.`, 'system');

    try {
      await AppLauncher.createCalendarEvent({
        title: `Rappel : ${title}`,
        startMillis: parsed.start.getTime(),
        endMillis: end.getTime()
      });
    } catch (e) {
      window.addBubble?.('Impossible de préparer le rappel : ' + (e?.message || e), 'system error');
    }
  }

  if (typeof originalHandleTranscript === 'function') {
    window.handleTranscript = function (text) {
      if (isReminderCommand(text)) {
        window.addBubble?.(text, 'user');
        handleReminder(text);
        return;
      }
      return originalHandleTranscript(text);
    };
  }
})();
