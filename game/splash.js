// ============ P16: 开屏 splash（马里奥赛车式 logo 大字动画）============
// 契约（与 main.js 的调用严格一致）：
//   import { startSplash } from './splash.js';
//   startSplash(onDone);   // onDone: () => void，所有路径上必须且只被调用一次
//
// - 调用即向 document.body 注入 <style id="splash-style"> 与全屏遮罩
//   <div id="splashOverlay">（position:fixed; inset:0; z-index:9000; flex 居中；
//   深色径向渐变 alpha≈0.92，隐约透出后面的 3D 舞台）。
// - 大字 logo「SUPER PI KART」红→橙渐变、白描边、微倾斜 + 副标题「★ 3D GRAND PRIX ★」。
// - 时间线（基于 performance.now() 时间戳，掉帧不卡死）：
//     0     遮罩淡入 200ms
//     150   logo 砸入 scale 3.2→1 easeOutBack 450ms
//     550   副标题下方滑入淡入 400ms
//     700   logo 高光扫过 600ms
//     1400  底部「按任意键 / 点击开始」提示闪烁
//     2300  自动退场：内容 scale→1.15 + 整体淡出 300ms → 清理 DOM/监听 → onDone()
// - 跳过：t≥500ms 后 window keydown/click/touchstart 任一 → 250ms 退场 → 清理 → onDone()
// - 纯 DOM+CSS，零 import、零外部资源、零音频、零 console 输出；不 preventDefault。
// - 重复调用 startSplash 第二次直接忽略；退场后事件监听全部移除。

export function startSplash(onDone) {
  if (window.__splashStarted) return; // 重复调用直接忽略
  window.__splashStarted = true;

  let doneCalled = false;
  const finishOnce = () => {
    if (doneCalled) return;
    doneCalled = true;
    if (typeof onDone === 'function') onDone();
  };

  // ---- 样式注入 ----
  const style = document.createElement('style');
  style.id = 'splash-style';
  style.textContent = `
    #splashOverlay {
      position: fixed; inset: 0; z-index: 9000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: radial-gradient(ellipse at 50% 42%, rgba(30,20,60,0.88) 0%, rgba(8,6,18,0.96) 75%);
      opacity: 0; transition: opacity 200ms linear;
      font-family: 'Arial Black', 'Arial', 'Noto Sans', sans-serif;
      overflow: hidden; user-select: none; -webkit-user-select: none;
    }
    #splashContent {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      transition: transform 300ms ease-out, opacity 300ms ease-out;
    }
    #splashLogo {
      font-size: clamp(42px, 9vw, 110px); font-weight: 900; letter-spacing: 0.04em;
      transform: rotate(-4deg) scale(3.2); opacity: 0;
      background: linear-gradient(180deg, #ff3b30 0%, #ff9500 55%, #ffcc00 100%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; color: #ff3b30;
      -webkit-text-stroke: 3px #ffffff; paint-order: stroke fill;
      filter: drop-shadow(0 6px 18px rgba(255, 90, 0, 0.45));
      position: relative; white-space: nowrap;
    }
    #splashShine {
      position: absolute; top: 0; bottom: 0; width: 45%; left: -60%;
      background: linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 100%);
      transform: skewX(-18deg); opacity: 0; pointer-events: none;
    }
    #splashSub {
      margin-top: 14px; font-size: clamp(14px, 2.6vw, 26px); font-weight: 700;
      letter-spacing: 0.42em; color: #ffe9a8;
      text-shadow: 0 0 12px rgba(255, 180, 40, 0.7);
      opacity: 0; transform: translateY(26px);
    }
    #splashHint {
      position: absolute; bottom: 9vh; left: 0; right: 0; text-align: center;
      font-size: clamp(13px, 2.2vw, 20px); font-weight: 700; letter-spacing: 0.14em;
      color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.6);
      opacity: 0;
    }
    .splash-hide { opacity: 0 !important; }
  `;
  document.head.appendChild(style);

  // ---- DOM 注入 ----
  const overlay = document.createElement('div');
  overlay.id = 'splashOverlay';
  overlay.innerHTML = `
    <div id="splashContent">
      <div id="splashLogo">SUPER PI KART<div id="splashShine"></div></div>
      <div id="splashSub">★ 3D GRAND PRIX ★</div>
    </div>
    <div id="splashHint">按任意键 / 点击开始</div>
  `;
  document.body.appendChild(overlay);

  const content = overlay.querySelector('#splashContent');
  const logo = overlay.querySelector('#splashLogo');
  const shine = overlay.querySelector('#splashShine');
  const sub = overlay.querySelector('#splashSub');
  const hint = overlay.querySelector('#splashHint');

  // ---- 缓动 ----
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  // ---- 时间线（基于时间戳，掉帧不卡死）----
  const t0 = performance.now();
  let exiting = false;      // 已进入退场
  let exitStartTime = 0;
  let exitDuration = 300;   // 自动退场 300ms，跳过退场 250ms
  let rafId = 0;
  let hintBlinkOn = true;

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onSkip);
    window.removeEventListener('click', onSkip);
    window.removeEventListener('touchstart', onSkip);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (style.parentNode) style.parentNode.removeChild(style);
  };

  const beginExit = (fast) => {
    if (exiting) return;
    exiting = true;
    exitStartTime = performance.now();
    exitDuration = fast ? 250 : 300;
    content.style.transition = `transform ${exitDuration}ms ease-in, opacity ${exitDuration}ms ease-in`;
    content.style.transform = 'scale(1.15)';
    overlay.style.transition = `opacity ${exitDuration}ms linear`;
    overlay.style.opacity = '0';
  };

  // 跳过：t≥500ms 后的手势（不 preventDefault，不影响游戏键盘状态）
  const onSkip = () => {
    if (exiting) return;
    if (performance.now() - t0 < 500) return;
    beginExit(true);
  };
  window.addEventListener('keydown', onSkip);
  window.addEventListener('click', onSkip);
  window.addEventListener('touchstart', onSkip);

  const tick = () => {
    const t = performance.now() - t0; // 毫秒

    if (!exiting) {
      // 0-200 遮罩淡入
      overlay.style.opacity = String(clamp01(t / 200));
      // 150-600 logo 砸入（easeOutBack 回弹）
      const lp = clamp01((t - 150) / 450);
      if (lp > 0) {
        const s = 3.2 + (1 - 3.2) * easeOutBack(lp);
        logo.style.transform = `rotate(-4deg) scale(${s.toFixed(4)})`;
        logo.style.opacity = String(clamp01(lp * 3));
      }
      // 550-950 副标题滑入淡入
      const sp = easeOutCubic(clamp01((t - 550) / 400));
      sub.style.opacity = String(sp);
      sub.style.transform = `translateY(${(26 * (1 - sp)).toFixed(2)}px)`;
      // 700-1300 高光扫过
      const hp = clamp01((t - 700) / 600);
      if (hp > 0 && hp < 1) {
        shine.style.opacity = '1';
        shine.style.left = `${-60 + hp * 200}%`;
      } else {
        shine.style.opacity = '0';
      }
      // 1400 起提示闪烁
      if (t >= 1400) {
        const blink = Math.floor((t - 1400) / 400) % 2 === 0;
        if (blink !== hintBlinkOn) { hintBlinkOn = blink; hint.style.opacity = blink ? '1' : '0.15'; }
        else hint.style.opacity = hintBlinkOn ? '1' : '0.15';
      }
      // 2300 自动退场
      if (t >= 2300) beginExit(false);
    } else {
      // 退场中：等淡出完成 → 清理 → onDone（只一次）
      if (performance.now() - exitStartTime >= exitDuration + 30) {
        cleanup();
        finishOnce();
        return;
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}
