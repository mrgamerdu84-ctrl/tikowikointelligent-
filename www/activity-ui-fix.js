// Correctifs visuels Tikowiko pour l'indicateur de marche.
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
      .step-ring.motion-idle #robotMotionHeart{background:transparent!important;color:#35dfff!important;opacity:.65!important;animation:none!important}
      .step-ring.motion-idle #robotMotionFx .eye{background:#35dfff!important;color:#35dfff!important;opacity:.45!important;animation:none!important}
      .step-ring.motion-checking #robotMotionHeart{background:transparent!important;color:#35dfff!important;opacity:.85!important;animation:tikoHeartCheck 1.1s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionFx .eye{background:#35dfff!important;color:#35dfff!important;opacity:.75!important;animation:tikoEyeGlow 1.1s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionLabel{color:#35dfff!important}
      .step-ring.motion-walking #robotMotionHeart{background:transparent!important;color:#ff9d2f!important;opacity:1!important;animation:tikoHeartWalk .8s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionFx .eye{background:#ff9d2f!important;color:#ff9d2f!important;opacity:1!important;animation:tikoEyeGlow .8s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionLabel{color:#ffae48!important}
      .step-ring.motion-near #robotMotionHeart{background:transparent!important;color:#42ff8c!important;opacity:1!important;animation:tikoHeartNear .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionFx .eye{background:#42ff8c!important;color:#42ff8c!important;opacity:1!important;animation:tikoEyeGlow .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionLabel{color:#42ff8c!important}
      .step-ring.motion-blocked #robotMotionHeart{background:transparent!important;color:#ff3d4f!important;opacity:1!important;animation:tikoHeartBlocked .28s linear infinite alternate!important}
      .step-ring.motion-blocked #robotMotionFx .eye{background:#ff3d4f!important;color:#ff3d4f!important;opacity:1!important;animation:tikoEyeBlocked .28s linear infinite alternate!important}
      .step-ring.motion-blocked #robotMotionLabel{color:#ff5b68!important}
      @keyframes tikoHeartWalk{from{transform:translate(-50%,-50%) scale(.92)}to{transform:translate(-50%,-50%) scale(1.16)}}
      @keyframes tikoHeartNear{from{transform:translate(-50%,-50%) scale(.9)}to{transform:translate(-50%,-50%) scale(1.22)}}
      @keyframes tikoHeartCheck{from{transform:translate(-50%,-50%) scale(.96);opacity:.58}to{transform:translate(-50%,-50%) scale(1.08);opacity:.95}}
      @keyframes tikoHeartBlocked{from{transform:translate(-50%,-50%) scale(.94);opacity:.35}to{transform:translate(-50%,-50%) scale(1.12);opacity:1}}
      @keyframes tikoEyeGlow{from{box-shadow:0 0 3px currentColor}to{box-shadow:0 0 11px currentColor}}
      @keyframes tikoEyeBlocked{from{opacity:.25}to{opacity:1}}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFixes);
  else installFixes();
})();
