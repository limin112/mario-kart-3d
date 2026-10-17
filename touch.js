// touch.js — 移动端触屏控制（P9）
// 屏幕左右两侧虚拟按键：左侧 左转/右转，右侧 油门/刹车/道具。
// touchstart/touchend 映射为合成 KeyboardEvent，复用 main.js 现有键盘逻辑，
// 桌面端（无触摸）完全不注入 UI，键盘操作不变。

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (isTouchDevice) {
  initTouchControls();
}

function initTouchControls() {
  // ---- 样式 ----
  const style = document.createElement('style');
  style.textContent = `
    #touch-controls {
      position: fixed;
      inset: 0;
      z-index: 50;
      pointer-events: none; /* 只有按钮本身可点 */
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      /* 刘海屏/圆角安全区（配合 viewport-fit=cover） */
      --tc-si-l: env(safe-area-inset-left, 0px);
      --tc-si-r: env(safe-area-inset-right, 0px);
      --tc-si-b: env(safe-area-inset-bottom, 0px);
    }
    /* 按钮基准尺寸：随屏幕大小缩放（横屏小手机也不会挤成一团） */
    @media (orientation: landscape) {
      #touch-controls { --tc-s: clamp(56px, 11vmin, 80px); --tc-gap: 12px; }
    }
    /* 横屏矮屏手机（如 iPhone 横屏，可视高度 < 430px）：按钮收小、贴底，避免顶到 HUD */
    @media (orientation: landscape) and (max-height: 430px) {
      #touch-controls { --tc-s: clamp(46px, 12vmin, 62px); --tc-gap: 8px; }
      #tc-left, #tc-right, #tc-gas, #tc-brake { bottom: calc(var(--tc-si-b, 0px) + 8px); }
      #tc-item { bottom: calc(var(--tc-si-b, 0px) + 8px + var(--tc-s, 76px) * 1.2 + 8px); }
    }
    @media (orientation: portrait) {
      #touch-controls { --tc-s: clamp(56px, 16vmin, 72px); --tc-gap: 8px; }
    }
    .tc-btn {
      position: absolute;
      pointer-events: auto;
      touch-action: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.35);
      background: rgba(0,0,0,0.28);
      color: rgba(255,255,255,0.9);
      font-weight: 700;
      font-family: system-ui, sans-serif;
      opacity: 0.45;
      transition: opacity 0.12s, transform 0.12s, background 0.12s;
      /* 长按不弹系统菜单/选择，点击不高亮 */
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      width: var(--tc-s, 76px);
      height: var(--tc-s, 76px);
      font-size: calc(var(--tc-s, 76px) * 0.28);
    }
    .tc-btn.tc-active {
      opacity: 0.85;
      transform: scale(1.08);
      background: rgba(255,255,255,0.22);
    }
    .tc-btn.tc-wide { width: calc(var(--tc-s, 76px) * 1.2); height: calc(var(--tc-s, 76px) * 1.2); font-size: calc(var(--tc-s, 76px) * 0.22); }
    .tc-btn.tc-small { width: calc(var(--tc-s, 76px) * 0.78); height: calc(var(--tc-s, 76px) * 0.78); font-size: calc(var(--tc-s, 76px) * 0.2); }
    /* 左侧：转向（贴紧安全区） */
    #tc-left  { left:  calc(var(--tc-si-l, 0px) + 14px); bottom: calc(var(--tc-si-b, 0px) + 18px); }
    #tc-right { left:  calc(var(--tc-si-l, 0px) + 14px + var(--tc-s, 76px) + var(--tc-gap, 12px)); bottom: calc(var(--tc-si-b, 0px) + 18px); }
    /* 右侧：油门（大）/刹车/道具 */
    #tc-gas    { right: calc(var(--tc-si-r, 0px) + 14px); bottom: calc(var(--tc-si-b, 0px) + 18px); }
    #tc-brake  { right: calc(var(--tc-si-r, 0px) + 14px + var(--tc-s, 76px) * 1.2 + 6px); bottom: calc(var(--tc-si-b, 0px) + 18px); }
    #tc-item   { right: calc(var(--tc-si-r, 0px) + 26px); bottom: calc(var(--tc-si-b, 0px) + 18px + var(--tc-s, 76px) * 1.2 + 10px); }
    /* 重开（小按钮，右上角，避开刘海） */
    #tc-reset  { right: calc(var(--tc-si-r, 0px) + 12px); top: 12px; }
    /* 静音（小按钮，重开左边；尺寸随 --tc-s 缩放） */
    #tc-mute   { right: calc(var(--tc-si-r, 0px) + 12px + var(--tc-s, 76px) * 0.78 + 8px); top: 12px; }
    /* 横屏矮屏：右上角小按钮（重开/静音）下移，避开 #muteHint 徒章（top:20px、高约 33px）。
       注意：必须放在基础规则之后，同特异性下后者覆盖前者。 */
    @media (orientation: landscape) and (max-height: 430px) {
      #tc-reset, #tc-mute { top: 60px; }
    }
    /* 竖屏/高屏：右上角小按钮保持 top:12px，改为 #muteHint 徒章让位下移，
       避免与 tc-reset/tc-mute 视觉叠压（按钮最大 0.78*72≈56px 高，底边≈68px）。
       横屏矮屏不适用（那里按钮已经下移，徒章留在原位）。 */
    body.touch-ctrl #muteHint { top: 78px; }
    @media (orientation: landscape) and (max-height: 430px) {
      body.touch-ctrl #muteHint { top: 20px; }
    }
  `;
  document.head.appendChild(style);

  // 标记触屏模式，供 CSS 让 #muteHint 给右上角按钮让位
  document.body.classList.add('touch-ctrl');

  // 触摸设备上整页禁掉浏览器手势：双击缩放、双指捏合（iOS）、下拉刷新。
  // 仅触摸设备注入，桌面端完全不受影响。
  document.documentElement.style.touchAction = 'none';
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());

  // ---- 按钮定义：按下发 keydown，松开发 keyup ----
  const BUTTONS = [
    { id: 'tc-left',  code: 'ArrowLeft',  label: '◀', cls: '' },
    { id: 'tc-right', code: 'ArrowRight', label: '▶', cls: '' },
    { id: 'tc-gas',   code: 'ArrowUp',    label: '加速', cls: 'tc-wide' },
    { id: 'tc-brake', code: 'ArrowDown',  label: '刹车', cls: '' },
    { id: 'tc-item',  code: 'Space',      label: '道具', cls: 'tc-small' },
  ];

  const container = document.createElement('div');
  container.id = 'touch-controls';
  document.body.appendChild(container);

  const send = (type, code) => {
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  };

  for (const b of BUTTONS) {
    const el = document.createElement('div');
    el.className = 'tc-btn ' + b.cls;
    el.id = b.id;
    el.textContent = b.label;
    container.appendChild(el);

    // 同一按钮可能被多根手指同时按住：计数，最后一根离开才发 keyup
    let held = 0;
    const press = (e) => {
      e.preventDefault();
      if (held === 0) send('keydown', b.code);
      held += 1;
      el.classList.add('tc-active');
    };
    const release = (e) => {
      e.preventDefault();
      held = Math.max(0, held - 1);
      if (held === 0) {
        el.classList.remove('tc-active');
        send('keyup', b.code);
      }
    };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    // 桌面调试用（触摸设备上不会触发鼠标事件，互不影响）
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', (e) => {
      if (el.classList.contains('tc-active')) release(e);
    });
  }

  // 重开按钮（移动端结算界面无法按 R）
  const reset = document.createElement('div');
  reset.className = 'tc-btn tc-small';
  reset.id = 'tc-reset';
  reset.textContent = '↺';
  container.appendChild(reset);
  reset.addEventListener('touchstart', (e) => { e.preventDefault(); location.reload(); }, { passive: false });
  reset.addEventListener('click', () => location.reload());

  // 静音按钮（移动端没有 M 键）：派发合成 keydown/keyup:KeyM，
  // 完全复用 main.js 的键盘静音逻辑（含 #muteHint 徽章同步），
  // 这里只本地记录状态用于切换图标 🔊/🔇。
  const mute = document.createElement('div');
  mute.className = 'tc-btn tc-small';
  mute.id = 'tc-mute';
  mute.textContent = '🔊';
  container.appendChild(mute);
  // 图标真值以 #muteHint 徒章的 .muted class 为准（main.js 每次切换都会同步它），
  // 这样真实键盘 M、按钮、其它来源切换后图标都不会失步。
  const syncMuteIcon = () => {
    const hint = document.getElementById('muteHint');
    mute.textContent = hint && hint.classList.contains('muted') ? '🔇' : '🔊';
  };
  const toggleMuteUI = (e) => {
    e.preventDefault();
    send('keydown', 'KeyM');
    send('keyup', 'KeyM');
  };
  mute.addEventListener('touchstart', toggleMuteUI, { passive: false });
  mute.addEventListener('click', toggleMuteUI);
  // 任何来源的 KeyM（含本按钮的合成事件）都延迟一拍从 DOM 读真值同步图标，
  // 不依赖监听器注册顺序。
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') setTimeout(syncMuteIcon, 0);
  });

  // 阻止容器上的页面滚动/下拉刷新
  container.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
