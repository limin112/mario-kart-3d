// ============ P17补: 角色选择界面（开场前横向切换选车手）============
// 契约（与 main.js 的调用严格一致）：
//   import { showCharSelect } from './charselect.js';
//   showCharSelect({ characters: [{key,name,color,signature}], defaultKey }, onConfirm);
//   // onConfirm: (key) => void，所有路径上必须且只被调用一次
//
// - splash 结束后由 main.js 调用：全屏半透遮罩（z-index 8000，盖住赛道选单 1000、
//   低于 splash 9000）叠在冻结的发车格画面上，横向 4 张车手卡（配色圆盘+特征图标+名字）。
// - 操作：← →/A D 切换；Enter/空格/点击 GO 按钮/点已选中卡 确认；
//   触屏左右滑动切换、点卡片选择、点已选卡片确认。
// - 自动确认：timeoutMs（默认 3000ms，window.__charselectTimeoutMs 可覆盖，探针用）
//   无操作自动确认当前选中——保证 headless/零输入流程不死锁（splash 自动退场先例）。
//   任何切换操作把计时器延长到 5000ms（真人正在选，别抢操作）。
// - 事件在 window 捕获阶段 stopPropagation：赛道选单（select.js，document 冒泡）
//   的 Enter 确认不会被选人屏误触发；不 preventDefault。
// - 纯 DOM+CSS，零 import、零外部资源、零 console 输出；确认后 200ms 淡出并清理全部监听。

export function showCharSelect(options, onConfirm) {
  if (typeof document === 'undefined') return; // 非浏览器环境安全 no-op
  if (window.__charselectStarted) return;      // 重复调用忽略
  window.__charselectStarted = true;

  const chars = (options && Array.isArray(options.characters) && options.characters.length)
    ? options.characters : [];
  const AUTO_MS_DEFAULT = 3000;
  const AUTO_MS_EXTENDED = 5000;
  const timeoutMs = (typeof window.__charselectTimeoutMs === 'number')
    ? window.__charselectTimeoutMs
    : ((options && typeof options.timeoutMs === 'number') ? options.timeoutMs : AUTO_MS_DEFAULT);

  let idx = 0;
  const defKey = options && options.defaultKey;
  if (defKey) {
    const i = chars.findIndex((c) => c.key === defKey);
    if (i >= 0) idx = i;
  }

  let done = false;
  let autoTimer = 0;

  const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
  const ICONS = { mario: '🍄', peach: '👑', dino: '🦖', bowser: '🐢' };
  const SIG_CN = { crown: '皇冠粉裙', saddle: '红背鞍', shell: '尖刺龟壳' };

  // ---- 样式注入 ----
  const style = document.createElement('style');
  style.id = 'charselect-style';
  style.textContent = `
    #charSelectOverlay {
      position: fixed; inset: 0; z-index: 8000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(8, 6, 18, 0.72);
      font-family: 'Arial Black', 'Arial', 'Noto Sans', sans-serif;
      user-select: none; -webkit-user-select: none;
      opacity: 1; transition: opacity 200ms linear;
      touch-action: none;
    }
    #csTitle {
      font-size: clamp(26px, 5vw, 52px); font-weight: 900; letter-spacing: 0.08em;
      color: #ffe9a8; text-shadow: 0 0 16px rgba(255, 170, 40, 0.65), 0 3px 8px rgba(0,0,0,0.7);
      margin-bottom: 4px;
    }
    #csSub {
      font-size: clamp(11px, 1.8vw, 16px); font-weight: 700; letter-spacing: 0.35em;
      color: #9fd0ff; text-shadow: 0 2px 6px rgba(0,0,0,0.6); margin-bottom: 22px;
    }
    #csRow { display: flex; gap: clamp(10px, 2.4vw, 26px); align-items: center; }
    .cs-card {
      width: clamp(96px, 17vw, 150px); padding: 14px 8px 12px;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      background: rgba(20, 16, 40, 0.85); border: 3px solid rgba(255,255,255,0.18);
      border-radius: 16px; cursor: pointer;
      transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
    }
    .cs-card.cs-sel {
      transform: scale(1.14);
      border-color: #ffcc00;
      box-shadow: 0 0 22px rgba(255, 200, 40, 0.55), 0 6px 18px rgba(0,0,0,0.5);
    }
    .cs-icon { font-size: clamp(22px, 4vw, 34px); line-height: 1; }
    .cs-disc {
      width: clamp(34px, 6vw, 52px); height: clamp(34px, 6vw, 52px); border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.75);
      box-shadow: inset 0 -6px 10px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.5);
    }
    .cs-name { font-size: clamp(13px, 2.2vw, 19px); font-weight: 900; color: #fff; letter-spacing: 0.1em; }
    .cs-tag { font-size: clamp(9px, 1.5vw, 12px); font-weight: 700; color: #b9c6e8; letter-spacing: 0.06em; }
    #csControls { display: flex; align-items: center; gap: 18px; margin-top: 26px; }
    .cs-arrow {
      font-size: clamp(20px, 3.4vw, 30px); font-weight: 900; color: #ffe9a8;
      background: rgba(255,255,255,0.08); border: 2px solid rgba(255,233,168,0.5);
      border-radius: 12px; width: clamp(44px, 7vw, 60px); height: clamp(40px, 6vw, 52px);
      cursor: pointer; line-height: 1;
    }
    .cs-arrow:active { background: rgba(255,233,168,0.25); }
    #csHint {
      font-size: clamp(12px, 2vw, 17px); font-weight: 700; letter-spacing: 0.1em;
      color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.7); min-width: 200px; text-align: center;
    }
    .cs-hide { opacity: 0 !important; }
  `;
  document.head.appendChild(style);

  // ---- DOM 注入 ----
  const overlay = document.createElement('div');
  overlay.id = 'charSelectOverlay';
  const title = document.createElement('div');
  title.id = 'csTitle';
  title.textContent = '选择车手';
  const sub = document.createElement('div');
  sub.id = 'csSub';
  sub.textContent = '★ SELECT YOUR RIDER ★';
  const row = document.createElement('div');
  row.id = 'csRow';
  const cards = chars.map((c) => {
    const card = document.createElement('div');
    card.className = 'cs-card';
    card.dataset.key = c.key;
    const icon = document.createElement('div');
    icon.className = 'cs-icon';
    icon.textContent = ICONS[c.key] || '🏎️';
    const disc = document.createElement('div');
    disc.className = 'cs-disc';
    disc.style.background = hex(c.color);
    const name = document.createElement('div');
    name.className = 'cs-name';
    name.textContent = c.name || c.key;
    const tag = document.createElement('div');
    tag.className = 'cs-tag';
    tag.textContent = (c.signature && SIG_CN[c.signature]) || '全能选手';
    card.appendChild(icon); card.appendChild(disc); card.appendChild(name); card.appendChild(tag);
    row.appendChild(card);
    return card;
  });
  const controls = document.createElement('div');
  controls.id = 'csControls';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'cs-arrow'; prevBtn.id = 'csPrev'; prevBtn.textContent = '◀';
  const hint = document.createElement('div');
  hint.id = 'csHint';
  hint.textContent = '← → 选择 · Enter/点击 开始';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'cs-arrow'; nextBtn.id = 'csNext'; nextBtn.textContent = '▶';
  controls.appendChild(prevBtn); controls.appendChild(hint); controls.appendChild(nextBtn);
  overlay.appendChild(title); overlay.appendChild(sub); overlay.appendChild(row); overlay.appendChild(controls);
  document.body.appendChild(overlay);

  function render() {
    cards.forEach((card, i) => {
      const sel = i === idx;
      card.classList.toggle('cs-sel', sel);
      card.dataset.selected = sel ? '1' : '0';
    });
  }
  render();

  function armAuto(ms) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => confirm(chars[idx] && chars[idx].key), ms);
  }

  function move(dir) {
    if (done || !chars.length) return;
    idx = (idx + dir + chars.length) % chars.length;
    render();
    armAuto(AUTO_MS_EXTENDED); // 正在选的人别被自动确认抢跑
  }

  function confirm(key) {
    if (done) return;
    done = true;
    clearTimeout(autoTimer);
    window.removeEventListener('keydown', onKeyDown, true);
    overlay.removeEventListener('touchstart', onTouchStart, { passive: true });
    overlay.removeEventListener('touchend', onTouchEnd, { passive: true });
    overlay.classList.add('cs-hide');
    overlay.style.pointerEvents = 'none';
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (style.parentNode) style.parentNode.removeChild(style);
    }, 220);
    if (typeof onConfirm === 'function') onConfirm(key);
  }

  // ---- 键盘（window 捕获阶段，拦截 select.js 的 document 冒泡监听）----
  function onKeyDown(e) {
    if (done) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': e.stopPropagation(); move(-1); break;
      case 'ArrowRight': case 'KeyD': e.stopPropagation(); move(1); break;
      case 'Enter': case 'Space':
        e.stopPropagation();
        confirm(chars[idx] && chars[idx].key);
        break;
      default: break; // 其余按键放行（main.js 巡游分支会自行吞掉）
    }
  }
  window.addEventListener('keydown', onKeyDown, true);

  // ---- 触屏：左右滑动切换，点卡片选择/再点确认 ----
  let tX = 0, tY = 0, tMoved = false;
  function onTouchStart(e) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    tX = t.clientX; tY = t.clientY; tMoved = false;
  }
  function onTouchEnd(e) {
    if (done) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - tX;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(t.clientY - tY)) {
      e.stopPropagation && e.stopPropagation();
      move(dx > 0 ? 1 : -1);
      tMoved = true;
    }
  }
  overlay.addEventListener('touchstart', onTouchStart, { passive: true });
  overlay.addEventListener('touchend', onTouchEnd, { passive: true });

  // ---- 点击：卡片（选中→确认；未选中→先选中）、箭头按钮 ----
  cards.forEach((card, i) => {
    card.addEventListener('click', () => {
      if (done) return;
      if (i === idx) confirm(chars[idx] && chars[idx].key);
      else { idx = i; render(); armAuto(AUTO_MS_EXTENDED); }
    });
  });
  prevBtn.addEventListener('click', () => move(-1));
  nextBtn.addEventListener('click', () => move(1));

  armAuto(timeoutMs);
}
