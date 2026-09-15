// Correctifs visuels Tikowiko pour l'indicateur de marche et le profil.
(function () {
  function installFixes() {
    if (document.getElementById('tikoMotionUiFix')) return;
    const style = document.createElement('style');
    style.id = 'tikoMotionUiFix';
    style.textContent = `
      #robotMotionFx{position:absolute!important;inset:0!important;z-index:5!important;pointer-events:none!important;overflow:visible!important}
      #robotMotionHeart{
        position:absolute!important;left:50%!important;top:116px!important;
        width:26px!important;height:26px!important;display:grid!important;place-items:center!important;
        transform:translate(-50%,-50%) scale(1)!important;
        font-size:22px!important;line-height:1!important;background:transparent!important;
        border:0!important;border-radius:50%!important;color:#35dfff!important;opacity:.72!important;
        box-shadow:none!important;filter:drop-shadow(0 0 5px currentColor)!important;
      }
      #robotMotionFx .eye{
        width:8px!important;height:6px!important;border-radius:50%!important;
        background:#35dfff!important;color:#35dfff!important;box-shadow:0 0 8px currentColor!important;
      }
      #robotMotionLabel{
        top:8px!important;bottom:auto!important;left:50%!important;transform:translateX(-50%)!important;
        font-size:9px!important;padding:3px 8px!important;background:rgba(0,10,28,.76)!important;
      }

      /* Bleu = prêt / immobile */
      .step-ring.motion-idle #robotMotionHeart{background:transparent!important;color:#35dfff!important;opacity:.65!important;animation:none!important}
      .step-ring.motion-idle #robotMotionFx .eye{background:#35dfff!important;color:#35dfff!important;opacity:.45!important;animation:none!important}
      .step-ring.motion-idle #robotMotionLabel{color:#35dfff!important}

      /* Jaune = vérification de la marche */
      .step-ring.motion-checking #robotMotionHeart{background:transparent!important;color:#ffd05a!important;opacity:.88!important;animation:tikoHeartCheck 1.1s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionFx .eye{background:#ffd05a!important;color:#ffd05a!important;opacity:.8!important;animation:tikoEyeGlow 1.1s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionLabel{color:#ffd05a!important}

      /* Orange = marche validée */
      .step-ring.motion-walking #robotMotionHeart{background:transparent!important;color:#ff9d2f!important;opacity:1!important;animation:tikoHeartWalk .8s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionFx .eye{background:#ff9d2f!important;color:#ff9d2f!important;opacity:1!important;animation:tikoEyeGlow .8s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionLabel{color:#ffae48!important}

      /* Vert = palier proche ou atteint */
      .step-ring.motion-near #robotMotionHeart{background:transparent!important;color:#42ff8c!important;opacity:1!important;animation:tikoHeartNear .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionFx .eye{background:#42ff8c!important;color:#42ff8c!important;opacity:1!important;animation:tikoEyeGlow .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionLabel{color:#42ff8c!important}

      /* Rouge = mouvement refusé */
      .step-ring.motion-blocked #robotMotionHeart{background:transparent!important;color:#ff3d4f!important;opacity:1!important;animation:tikoHeartBlocked .28s linear infinite alternate!important}
      .step-ring.motion-blocked #robotMotionFx .eye{background:#ff3d4f!important;color:#ff3d4f!important;opacity:1!important;animation:tikoEyeBlocked .28s linear infinite alternate!important}
      .step-ring.motion-blocked #robotMotionLabel{color:#ff5b68!important}

      /* Le robot du profil reste exactement tel qu'il est : aucun recoloriage ni filtre. */
      .profile-avatar{filter:none!important}
      .profile-avatar-wrap::after{display:none!important;content:none!important}
      .profile-color{position:relative!important;overflow:hidden!important;color:white!important;font-size:9px!important;font-weight:900!important;text-shadow:0 1px 3px rgba(0,0,0,.9)!important}
      .profile-color::after{content:attr(title);position:absolute;left:3px;right:3px;bottom:3px;text-align:center}

      @keyframes tikoHeartWalk{from{transform:translate(-50%,-50%) scale(.92)}to{transform:translate(-50%,-50%) scale(1.16)}}
      @keyframes tikoHeartNear{from{transform:translate(-50%,-50%) scale(.9)}to{transform:translate(-50%,-50%) scale(1.22)}}
      @keyframes tikoHeartCheck{from{transform:translate(-50%,-50%) scale(.96);opacity:.58}to{transform:translate(-50%,-50%) scale(1.08);opacity:.95}}
      @keyframes tikoHeartBlocked{from{transform:translate(-50%,-50%) scale(.94);opacity:.35}to{transform:translate(-50%,-50%) scale(1.12);opacity:1}}
      @keyframes tikoEyeGlow{from{box-shadow:0 0 3px currentColor}to{box-shadow:0 0 11px currentColor}}
      @keyframes tikoEyeBlocked{from{opacity:.25}to{opacity:1}}
    `;
    document.head.appendChild(style);
  }

  function installAntiCheatSpeechPolicy() {
    const original = window.updateRobotMotionState;
    if (typeof original !== 'function' || original.__tikowikoAntiCheatPolicy) return;

    let lastStrongAlertAt = 0;

    const patched = function (state, reason, steps) {
      if (state !== 'blocked') {
        return original(state, reason, steps);
      }

      const ring = document.querySelector('.step-ring');
      const label = document.getElementById('robotMotionLabel');
      if (ring) {
        ring.classList.remove('motion-idle','motion-checking','motion-walking','motion-near','motion-blocked');
        ring.classList.add('motion-blocked');
      }

      const why = String(reason || '').toLowerCase();
      const strongCheatSignal = /secousses répétées|secousse du téléphone détectée|compteur de pas impossible|position gps simulée|localisation simulée/.test(why);

      if (label) {
        label.textContent = strongCheatSignal ? 'Triche probable détectée' : 'Mouvement non validé';
      }

      // Une marche rapide, une course ou un capteur incertain peut être refusé sans accuser la personne.
      // Tikowiko ne dit « tu triches » que lorsqu'un signal physique nettement anormal est détecté.
      if (strongCheatSignal) {
        const now = Date.now();
        if (now - lastStrongAlertAt > 10000) {
          lastStrongAlertAt = now;
          const msg = 'Tikowiko : une manipulation anormale du téléphone a été détectée. Ces mouvements ne comptent pas pour les récompenses.';
          if (typeof window.addBubble === 'function') window.addBubble(msg, 'system');
          if (typeof window.speakTikowiko === 'function') window.speakTikowiko(msg);
        }
      }
    };

    patched.__tikowikoAntiCheatPolicy = true;
    window.updateRobotMotionState = patched;
  }

  function boot() {
    installFixes();
    installAntiCheatSpeechPolicy();
    setTimeout(installAntiCheatSpeechPolicy, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
