// rounds.js — P18 回合播报横幅模块（Round 1/2 / FINAL LAP 大字）
//
// 纯 DOM + 内联样式，零 import、零外部资源、import 时零副作用
// （第一次调用 showRoundBanner 才创建元素）。
//
// API 契约（与 main.js 集成方约定，签名固定）：
//   showRoundBanner(text, { final = false, duration = 1600 })
//     屏幕中央弹入大字横幅（scale 2.2→1 弹入 → 保持 → 淡出缩小移除），
//     总时长 duration 毫秒；final:true 用红橙渐变 + 脉动动画（最后一圈警示）。
//     重复调用会先取消上一次定时器并移除旧横幅，不叠加。
//   hideRoundBanner()
//     立即移除当前横幅；没有横幅时静默 no-op。
//
// 红线：任何调用路径零异常、零 console.error；定时器回调里元素可能已被
// 移除（如 location.reload 前），全部判空。

let currentBanner = null;
let currentTimer = null;

// 注入一次性的脉动 keyframes（final 横幅用），避免重复注入
function ensureKeyframes() {
  if (document.getElementById('rounds-banner-kf')) return;
  const style = document.createElement('style');
  style.id = 'rounds-banner-kf';
  style.textContent =
    '@keyframes rounds-banner-pulse{' +
    '0%,100%{transform:translate(-50%,-50%) scale(1);filter:drop-shadow(0 0 12px rgba(255,60,20,.9))}' +
    '50%{transform:translate(-50%,-50%) scale(1.08);filter:drop-shadow(0 0 26px rgba(255,140,0,1))}' +
    '}';
  document.head.appendChild(style);
}

function clearCurrent() {
  if (currentTimer !== null) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
  if (currentBanner && currentBanner.parentNode) {
    currentBanner.parentNode.removeChild(currentBanner);
  }
  currentBanner = null;
}

export function showRoundBanner(text, opts = {}) {
  const isFinal = !!opts.final;
  const duration = Number.isFinite(opts.duration) && opts.duration > 200
    ? opts.duration : 1600;

  try {
    clearCurrent(); // 重复调用不叠加

    if (isFinal) ensureKeyframes();

    const banner = document.createElement('div');
    banner.setAttribute('data-round-banner', '');
    banner.textContent = String(text == null ? '' : text);

    const gradient = isFinal
      ? 'linear-gradient(180deg,#ffd34d 0%,#ff7a1a 45%,#e01e00 100%)'
      : 'linear-gradient(180deg,#fff6b0 0%,#ffd700 45%,#ff9900 100%)';

    banner.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:38%',
      'transform:translate(-50%,-50%) scale(2.2)',
      'z-index:9999',
      'pointer-events:none',
      'user-select:none',
      '-webkit-user-select:none',
      'font-family:"Arial Black","Orbitron",Impact,sans-serif',
      'font-size:clamp(40px,9vw,110px)',
      'font-weight:900',
      'font-style:italic',
      'letter-spacing:0.06em',
      'white-space:nowrap',
      'text-align:center',
      'background:' + gradient,
      '-webkit-background-clip:text',
      'background-clip:text',
      '-webkit-text-fill-color:transparent',
      'filter:drop-shadow(2px 3px 0 rgba(60,20,0,.85)) drop-shadow(0 0 14px rgba(255,170,0,.55))',
      'transition:transform .25s cubic-bezier(.16,1.4,.4,1),opacity .3s ease',
      'opacity:0',
    ].join(';');

    document.body.appendChild(banner);
    currentBanner = banner;

    // 下一帧弹入（scale 2.2→1 + 淡入）
    requestAnimationFrame(() => {
      if (currentBanner !== banner || !banner.parentNode) return;
      banner.style.opacity = '1';
      banner.style.transform = 'translate(-50%,-50%) scale(1)';
    });

    // final 警示：弹入动画（~250ms）结束后用墙钟定时器接管为脉动动画，
    // 不嵌在 rAF 里（软渲染环境下 rAF 可能被拖慢导致脉动来不及生效）
    if (isFinal) {
      setTimeout(() => {
        if (currentBanner === banner && banner.parentNode) {
          banner.style.animation = 'rounds-banner-pulse .7s ease-in-out infinite';
        }
      }, 280);
    }

    // duration 后淡出缩小并移除
    currentTimer = setTimeout(() => {
      currentTimer = null;
      if (currentBanner !== banner || !banner.parentNode) return;
      banner.style.animation = 'none';
      banner.style.opacity = '0';
      banner.style.transform = 'translate(-50%,-50%) scale(0.6)';
      const removeTimer = setTimeout(() => {
        if (currentBanner === banner) clearCurrent();
        else if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 320);
      // 兜底：即使 remove 定时器丢失也不留孤儿横幅
      setTimeout(() => {
        if (banner.parentNode && currentBanner !== banner) {
          clearTimeout(removeTimer);
          banner.parentNode.removeChild(banner);
        }
      }, 600);
    }, duration);
  } catch (e) {
    // 播报失败绝不影响比赛
  }
}

export function hideRoundBanner() {
  try {
    clearCurrent();
  } catch (e) { /* 静默 */ }
}
