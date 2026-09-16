// Correctifs visuels Tikowiko pour l'indicateur de marche et le profil.
(function () {
  function installFixes() {
    if (document.getElementById('tikoMotionUiFix')) return;
    const style = document.createElement('style');
    style.id = 'tikoMotionUiFix';
    style.textContent = `
      #robotMotionFx{position:absolute!important;inset:0!important;z-index:5!important;pointer-events:none!important;overflow:visible!important}
      /* Lumière du coeur : recentrée sur le coeur réel du panda. */
      #robotMotionHeart{
        position:absolute!important;left:50.5%!important;top:56.5%!important;
        width:28px!important;height:26px!important;display:grid!important;place-items:center!important;
        transform:translate(-50%,-50%) scale(1)!important;
        font-size:23px!important;line-height:1!important;background:transparent!important;
        border:0!important;border-radius:50%!important;color:#35dfff!important;opacity:.78!important;
        box-shadow:none!important;filter:drop-shadow(0 0 5px currentColor) drop-shadow(0 0 9px currentColor)!important;
      }
      /* Yeux : recentrés plus près des yeux visibles du robot. */
      #robotMotionFx .eye{
        position:absolute!important;width:8px!important;height:7px!important;border-radius:50%!important;
        background:#35dfff!important;color:#35dfff!important;box-shadow:0 0 5px currentColor,0 0 9px currentColor!important;
        transform:translate(-50%,-50%)!important;
      }
      #robotMotionFx .eye.left,#robotMotionFx .eye:first-of-type{left:45.2%!important;top:35.8%!important}
      #robotMotionFx .eye.right,#robotMotionFx .eye:last-of-type{left:55.8%!important;top:35.8%!important}
      #robotMotionLabel{
        top:8px!important;bottom:auto!important;left:50%!important;transform:translateX(-50%)!important;
        font-size:9px!important;padding:3px 8px!important;background:rgba(0,10,28,.76)!important;
      }

      /* Repos : pas d'animation. */
      .step-ring.motion-idle #robotMotionHeart{background:transparent!important;color:#35dfff!important;opacity:.42!important;animation:none!important}
      .step-ring.motion-idle #robotMotionFx .eye{background:#35dfff!important;color:#35dfff!important;opacity:.28!important;animation:none!important}
      .step-ring.motion-idle #robotMotionLabel{color:#35dfff!important}

      /* Vérification après de vrais événements de pas. */
      .step-ring.motion-checking #robotMotionHeart{background:transparent!important;color:#ffd05a!important;opacity:.92!important;animation:tikoHeartCheck 1.1s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionFx .eye{background:#ffd05a!important;color:#ffd05a!important;opacity:.9!important;animation:tikoEyeGlow 1.1s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionLabel{color:#ffd05a!important}

      /* Marche validée. */
      .step-ring.motion-walking #robotMotionHeart{background:transparent!important;color:#ff9d2f!important;opacity:1!important;animation:tikoHeartWalk .8s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionFx .eye{background:#ff9d2f!important;color:#ff9d2f!important;opacity:1!important;animation:tikoEyeGlow .8s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionLabel{color:#ffae48!important}

      .step-ring.motion-near #robotMotionHeart{background:transparent!important;color:#42ff8c!important;opacity:1!important;animation:tikoHeartNear .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionFx .eye{background:#42ff8c!important;color:#42ff8c!important;opacity:1!important;animation:tikoEyeGlow .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionLabel{color:#42ff8c!important}

      /* Compatibilité seulement : l'activité native ne passe plus en blocked sur un simple mouvement du téléphone. */
      .step-ring.motion-blocked #robotMotionHeart{background:transparent!important;color:#35dfff!important;opacity:.42!important;animation:none!important}
      .step-ring.motion-blocked #robotMotionFx .eye{background:#35dfff!important;color:#35dfff!important;opacity:.28!important;animation:none!important}
      .step-ring.motion-blocked #robotMotionLabel{color:#35dfff!important}

      .profile-avatar{filter:none!important}
      .profile-avatar-wrap::after{display:none!important;content:none!important}
      .profile-color{position:relative!important;overflow:hidden!important;color:white!important;font-size:9px!important;font-weight:900!important;text-shadow:0 1px 3px rgba(0,0,0,.9)!important}
      .profile-color::after{content:attr(title);position:absolute;left:3px;right:3px;bottom:3px;text-align:center}

      @keyframes tikoHeartWalk{from{transform:translate(-50%,-50%) scale(.94)}to{transform:translate(-50%,-50%) scale(1.12)}}
      @keyframes tikoHeartNear{from{transform:translate(-50%,-50%) scale(.92)}to{transform:translate(-50%,-50%) scale(1.16)}}
      @keyframes tikoHeartCheck{from{transform:translate(-50%,-50%) scale(.97);opacity:.62}to{transform:translate(-50%,-50%) scale(1.06);opacity:.96}}
      @keyframes tikoEyeGlow{from{box-shadow:0 0 3px currentColor,0 0 5px currentColor}to{box-shadow:0 0 7px currentColor,0 0 11px currentColor}}
    `;
    document.head.appendChild(style);
  }

  function installMotionUiPolicy() {
    const original = window.updateRobotMotionState;
    if (typeof original !== 'function' || original.__tikowikoStepOnlyPolicy) return;

    const patched = function (state, reason, steps) {
      // Un ancien état blocked ne doit jamais transformer un simple mouvement du téléphone en accusation de triche.
      if (state === 'blocked') state = 'idle';
      return original(state, '', steps);
    };
    patched.__tikowikoStepOnlyPolicy = true;
    window.updateRobotMotionState = patched;
  }

  function boot() {
    installFixes();
    installMotionUiPolicy();
    setTimeout(installMotionUiPolicy, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
