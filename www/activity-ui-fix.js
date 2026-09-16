// Correctifs visuels Tikowiko : lumières ancrées sur l'image du robot.
(function () {
  const ANCHORS = {
    heart: {x: 50.3, y: 58.1, w: 23, h: 21},
    leftEye: {x: 45.1, y: 36.8, w: 7, h: 7},
    rightEye: {x: 56.0, y: 36.8, w: 7, h: 7}
  };

  function installFixes() {
    if (document.getElementById('tikoMotionUiFix')) return;
    const style = document.createElement('style');
    style.id = 'tikoMotionUiFix';
    style.textContent = `
      #robotMotionFx{position:absolute!important;z-index:5!important;pointer-events:none!important;overflow:visible!important}
      #robotMotionHeart{
        position:absolute!important;width:23px!important;height:21px!important;display:grid!important;place-items:center!important;
        transform:translate(-50%,-50%) scale(1)!important;font-size:19px!important;line-height:1!important;
        background:transparent!important;border:0!important;border-radius:50%!important;color:#35dfff!important;opacity:.78!important;
        box-shadow:none!important;filter:drop-shadow(0 0 4px currentColor) drop-shadow(0 0 8px currentColor)!important;
      }
      #robotMotionFx .eye{
        position:absolute!important;width:7px!important;height:7px!important;border-radius:50%!important;
        background:#35dfff!important;color:#35dfff!important;box-shadow:0 0 4px currentColor,0 0 8px currentColor!important;
        transform:translate(-50%,-50%)!important;
      }
      #robotMotionLabel{top:8px!important;bottom:auto!important;left:50%!important;transform:translateX(-50%)!important;font-size:9px!important;padding:3px 8px!important;background:rgba(0,10,28,.76)!important}

      .step-ring.motion-idle #robotMotionHeart{opacity:.25!important;animation:none!important}
      .step-ring.motion-idle #robotMotionFx .eye{opacity:.18!important;animation:none!important}
      .step-ring.motion-checking #robotMotionHeart{color:#ffd05a!important;opacity:.92!important;animation:tikoHeartCheck .7s ease-in-out infinite alternate!important}
      .step-ring.motion-checking #robotMotionFx .eye{background:#ffd05a!important;color:#ffd05a!important;opacity:.9!important;animation:tikoEyeGlow .7s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionHeart{color:#ff9d2f!important;opacity:1!important;animation:tikoHeartWalk .55s ease-in-out infinite alternate!important}
      .step-ring.motion-walking #robotMotionFx .eye{background:#ff9d2f!important;color:#ff9d2f!important;opacity:1!important;animation:tikoEyeGlow .55s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionHeart{color:#42ff8c!important;opacity:1!important;animation:tikoHeartNear .42s ease-in-out infinite alternate!important}
      .step-ring.motion-near #robotMotionFx .eye{background:#42ff8c!important;color:#42ff8c!important;opacity:1!important;animation:tikoEyeGlow .42s ease-in-out infinite alternate!important}
      .step-ring.motion-blocked #robotMotionHeart,.step-ring.motion-blocked #robotMotionFx .eye{opacity:.18!important;animation:none!important;color:#35dfff!important;background:#35dfff!important}

      @keyframes tikoHeartWalk{from{transform:translate(-50%,-50%) scale(.94)}to{transform:translate(-50%,-50%) scale(1.10)}}
      @keyframes tikoHeartNear{from{transform:translate(-50%,-50%) scale(.92)}to{transform:translate(-50%,-50%) scale(1.14)}}
      @keyframes tikoHeartCheck{from{transform:translate(-50%,-50%) scale(.97);opacity:.55}to{transform:translate(-50%,-50%) scale(1.05);opacity:.96}}
      @keyframes tikoEyeGlow{from{box-shadow:0 0 3px currentColor,0 0 5px currentColor}to{box-shadow:0 0 7px currentColor,0 0 11px currentColor}}
    `;
    document.head.appendChild(style);
  }

  function ensureFx() {
    const ring = document.getElementById('stepRing');
    const img = ring?.querySelector('.robot-dashboard');
    if (!ring || !img) return null;

    let fx = document.getElementById('robotMotionFx');
    if (!fx) {
      fx = document.createElement('div');
      fx.id = 'robotMotionFx';
      fx.innerHTML = '<div id="robotMotionHeart">♥</div><i class="eye left"></i><i class="eye right"></i>';
      ring.appendChild(fx);
    }
    return {ring, img, fx};
  }

  function placeFx() {
    const refs = ensureFx();
    if (!refs) return;
    const {ring, img, fx} = refs;
    const ringRect = ring.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const left = imgRect.left - ringRect.left;
    const top = imgRect.top - ringRect.top;
    fx.style.left = left + 'px';
    fx.style.top = top + 'px';
    fx.style.width = imgRect.width + 'px';
    fx.style.height = imgRect.height + 'px';

    const heart = document.getElementById('robotMotionHeart');
    const leftEye = fx.querySelector('.eye.left');
    const rightEye = fx.querySelector('.eye.right');
    if (heart) { heart.style.left = ANCHORS.heart.x + '%'; heart.style.top = ANCHORS.heart.y + '%'; }
    if (leftEye) { leftEye.style.left = ANCHORS.leftEye.x + '%'; leftEye.style.top = ANCHORS.leftEye.y + '%'; }
    if (rightEye) { rightEye.style.left = ANCHORS.rightEye.x + '%'; rightEye.style.top = ANCHORS.rightEye.y + '%'; }
  }

  function installMotionUiPolicy() {
    const original = window.updateRobotMotionState;
    if (typeof original !== 'function' || original.__tikowikoStepOnlyPolicy) return;
    const patched = function (state, reason, steps) {
      if (state === 'blocked') state = 'idle';
      placeFx();
      return original(state, '', steps);
    };
    patched.__tikowikoStepOnlyPolicy = true;
    window.updateRobotMotionState = patched;
  }

  function boot() {
    installFixes();
    placeFx();
    installMotionUiPolicy();
    setTimeout(() => { placeFx(); installMotionUiPolicy(); }, 400);
    setTimeout(placeFx, 1200);
    window.addEventListener('resize', placeFx);
    window.addEventListener('orientationchange', () => setTimeout(placeFx, 150));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
