/**
 * P14b 选单界面：纯 DOM，零 import、零副作用。
 * 提供赛道×主题组合选择，默认按布局建议主题，可覆盖。
 * 选完拼 URL 参数跳转；保留 ?track=/?theme= 作调试入口。
 */

import { TRACK_LAYOUTS } from './trackdefs.js';
import { TRACK_THEMES, getTheme } from './themes.js';

const SELECTION_KEY = 'mk3d_last_selection';

/** 从 URL 读取当前选择（调试入口优先，其次 localStorage，最后默认） */
function getInitialSelection() {
  const params = new URLSearchParams(location.search);
  const urlTrack = params.get('track');
  const urlTheme = params.get('theme');

  // 调试入口：URL 里显式带了 track 或 theme 参数就不再弹选单，直接进比赛
  if (urlTrack || urlTheme) {
    const track = urlTrack && TRACK_LAYOUTS[urlTrack] ? urlTrack : 'classic';
    const theme = urlTheme && TRACK_THEMES[urlTheme] ? urlTheme : TRACK_LAYOUTS[track].theme;
    return { track, theme, fromUrl: true };
  }

  // 尝试读取上次保存
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTION_KEY) || 'null');
    if (saved && TRACK_LAYOUTS[saved.track] && TRACK_THEMES[saved.theme]) {
      return { ...saved, fromUrl: false };
    }
  } catch { /* ignore */ }

  // 默认：经典草原环线 + 经典草原主题
  return { track: 'classic', theme: 'classic', fromUrl: false };
}

/** 保存选择到 localStorage */
function saveSelection(track, theme) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify({ track, theme }));
  } catch { /* ignore */ }
}

/** 构建跳转 URL */
function buildUrl(track, theme) {
  const params = new URLSearchParams();
  params.set('track', track);
  if (theme !== TRACK_LAYOUTS[track]?.theme) {
    params.set('theme', theme); // 只在覆盖建议主题时带上 theme
  }
  return `?${params.toString()}`;
}

/** 创建选项卡片 DOM（trackKey 是 TRACK_LAYOUTS 的键，layout.name 仅作显示） */
function createCard(trackKey, layout, themeKey, isSelected, onSelect) {
  const theme = getTheme(themeKey);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `track-card ${isSelected ? 'selected' : ''}`;
  card.setAttribute('data-track', trackKey);
  card.setAttribute('data-theme', themeKey);
  card.innerHTML = `
    <div class="card-preview" style="background: linear-gradient(135deg, ${theme.sceneBg ? '#' + theme.sceneBg.toString(16).padStart(6, '0') : '#87ceeb'}, ${theme.ground ? '#' + theme.ground.toString(16).padStart(6, '0') : '#3a5f0b'});"></div>
    <div class="card-info">
      <div class="card-track-name">${layout.name}</div>
      <div class="card-theme-name">${theme.name}</div>
      ${themeKey !== layout.theme ? '<span class="card-custom-badge">自定义主题</span>' : ''}
    </div>
    <div class="card-check" aria-hidden="true">✓</div>
  `;
  card.addEventListener('click', () => onSelect(trackKey, themeKey));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(trackKey, themeKey);
    }
  });
  return card;
}

/**
 * 显示选单（非阻塞覆盖层：游戏已在底层按默认参数运行）。
 * 确认：写入 URL 参数；若与正在运行的默认（classic/classic）不同才 reload。
 * 取消：仅关闭选单，底层默认比赛继续。
 * onConfirm(track, theme) 可选回调（供外部集成用）。
 */
export function showTrackSelect(onConfirm) {
  const initial = getInitialSelection();
  let currentTrack = initial.track;
  let currentTheme = initial.theme;

  // 如果是从 URL 直接进入（调试入口），不显示选单
  if (initial.fromUrl) {
    if (onConfirm) onConfirm(currentTrack, currentTheme);
    return null;
  }

  const overlay = document.createElement('div');
  overlay.id = 'track-select-overlay';
  overlay.className = 'track-select-overlay';
  overlay.innerHTML = `
    <div class="track-select-modal" role="dialog" aria-modal="true" aria-labelledby="select-title">
      <header>
        <h1 id="select-title">选择赛道与主题</h1>
        <p class="subtitle">按 Enter / 点击 确认 · ESC 取消（使用默认）</p>
      </header>
      <div class="track-grid" id="track-grid"></div>
      <footer>
        <button type="button" id="btn-start" class="btn-primary">开始比赛</button>
        <button type="button" id="btn-cancel" class="btn-secondary">取消</button>
      </footer>
    </div>
  `;

  const grid = overlay.querySelector('#track-grid');
  const btnStart = overlay.querySelector('#btn-start');
  const btnCancel = overlay.querySelector('#btn-cancel');

  // 渲染所有赛道卡片（每个赛道显示建议主题 + 可选的其他主题）
  function renderGrid() {
    grid.innerHTML = '';
    for (const [trackKey, layout] of Object.entries(TRACK_LAYOUTS)) {
      // 建议主题卡片（放第一个）
      const suggestedTheme = layout.theme;
      const suggestedCard = createCard(trackKey, layout, suggestedTheme, trackKey === currentTrack && suggestedTheme === currentTheme, (t, th) => {
        currentTrack = t;
        currentTheme = th;
        updateSelection();
      });
      grid.appendChild(suggestedCard);

      // 其他主题作为备选（仅当与建议主题不同时）
      for (const themeKey of Object.keys(TRACK_THEMES)) {
        if (themeKey === suggestedTheme) continue;
        const altCard = createCard(trackKey, layout, themeKey, trackKey === currentTrack && themeKey === currentTheme, (t, th) => {
          currentTrack = t;
          currentTheme = th;
          updateSelection();
        });
        altCard.classList.add('alt-theme');
        grid.appendChild(altCard);
      }
    }
  }

  function updateSelection() {
    // 更新卡片选中态
    grid.querySelectorAll('.track-card').forEach(card => {
      const selected = card.dataset.track === currentTrack && card.dataset.theme === currentTheme;
      card.classList.toggle('selected', selected);
    });
    btnStart.disabled = false;
  }

  function hideOverlay() {
    document.removeEventListener('keydown', handleKey);
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 350);
  }

  function confirm() {
    if (overlay._done) return;
    overlay._done = true;
    saveSelection(currentTrack, currentTheme);
    // replaceState 避免历史记录污染；R 重开（location.reload）会带上所选参数
    history.replaceState(null, '', buildUrl(currentTrack, currentTheme));
    if (onConfirm) onConfirm(currentTrack, currentTheme);
    // 底层游戏正以 classic/classic 运行：选了默认就不必 reload
    if (currentTrack === 'classic' && currentTheme === 'classic') {
      hideOverlay();
    } else {
      location.reload();
    }
  }

  function cancel() {
    if (overlay._done) return;
    overlay._done = true;
    // 使用默认（经典草原）继续：不保存、不 reload，仅关闭选单
    if (onConfirm) onConfirm('classic', 'classic');
    hideOverlay();
  }

  btnStart.addEventListener('click', confirm);
  btnCancel.addEventListener('click', cancel);

  // 键盘快捷键
  const handleKey = (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cancel();
  };
  document.addEventListener('keydown', handleKey);

  renderGrid();
  document.body.appendChild(overlay);

  // 强制重绘触发动画
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  return { confirm, cancel, hide: hideOverlay };
}

/** 样式注入（模块加载时自动注入） */
const style = document.createElement('style');
style.textContent = `
.track-select-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}
.track-select-overlay.visible {
  opacity: 1;
  visibility: visible;
}
.track-select-modal {
  background: linear-gradient(145deg, rgba(15,15,25,0.98), rgba(30,15,15,0.95));
  border: 2px solid #ffcc00;
  border-radius: 20px;
  padding: 32px 40px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
  color: #fff;
  font-family: system-ui, sans-serif;
  box-shadow: 
    0 20px 60px rgba(0,0,0,0.7),
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 0 40px rgba(255,200,0,0.15);
  transform: scale(0.95);
  transition: transform 0.3s ease;
}
.track-select-overlay.visible .track-select-modal {
  transform: scale(1);
}
.track-select-modal header {
  text-align: center;
  margin-bottom: 24px;
}
.track-select-modal h1 {
  font-family: 'Courier New', monospace;
  font-size: 28px;
  font-weight: 900;
  color: #ffcc00;
  text-shadow: 0 0 20px rgba(255,200,0,0.5);
  letter-spacing: 2px;
  margin-bottom: 8px;
}
.track-select-modal .subtitle {
  color: #aaa;
  font-size: 14px;
}
.track-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px 4px;
}
.track-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  overflow: hidden;
}
.track-card:hover {
  border-color: #ffcc00;
  box-shadow: 0 8px 24px rgba(255,200,0,0.15);
  transform: translateY(-2px);
}
.track-card:focus-visible {
  outline: none;
  border-color: #00aaff;
  box-shadow: 0 0 0 3px rgba(0,170,255,0.4);
}
.track-card.selected {
  border-color: #ffcc00;
  background: linear-gradient(145deg, rgba(255,200,0,0.15), rgba(255,200,0,0.05));
  box-shadow: 0 0 24px rgba(255,200,0,0.2);
}
.track-card.alt-theme {
  opacity: 0.85;
}
.track-card.alt-theme:hover {
  opacity: 1;
}
.card-preview {
  width: 100%;
  height: 60px;
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.3);
}
.card-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card-track-name {
  font-family: 'Courier New', monospace;
  font-weight: 700;
  font-size: 15px;
  color: #fff;
}
.card-theme-name {
  font-size: 13px;
  color: #ccc;
}
.card-custom-badge {
  margin-top: 4px;
  font-size: 11px;
  color: #00aaff;
  background: rgba(0,170,255,0.15);
  border: 1px solid rgba(0,170,255,0.3);
  border-radius: 4px;
  padding: 2px 8px;
  display: inline-block;
  width: fit-content;
}
.card-check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  background: #ffcc00;
  color: #1a1a00;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 14px;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.15s ease;
}
.track-card.selected .card-check {
  opacity: 1;
  transform: scale(1);
}
.track-select-modal footer {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.track-select-modal button {
  font-family: 'Courier New', monospace;
  font-weight: 700;
  font-size: 15px;
  padding: 12px 32px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 140px;
}
.track-select-modal button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,170,255,0.4);
}
.btn-primary {
  background: linear-gradient(135deg, #ff6600, #ffcc00);
  color: #1a1a00;
  box-shadow: 0 4px 16px rgba(255,150,0,0.3);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(255,150,0,0.4);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  background: rgba(255,255,255,0.1);
  color: #ccc;
  border: 1px solid rgba(255,255,255,0.2);
}
.btn-secondary:hover {
  background: rgba(255,255,255,0.2);
  color: #fff;
}

/* 响应式 */
@media (max-width: 768px) {
  .track-select-modal {
    padding: 24px 20px;
    margin: 16px;
  }
  .track-grid {
    grid-template-columns: 1fr;
  }
  .track-select-modal h1 {
    font-size: 22px;
  }
}
`;
document.head.appendChild(style);

// 自动启动：本模块作为 index.html 第一个 module 脚本执行；
// 游戏（main.js）随后照常启动，选单以覆盖层形式叠在上面，互不阻塞。
showTrackSelect();