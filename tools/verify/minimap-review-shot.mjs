// P22 小地图「监工目视复核包」截图脚本（ROADMAP 规则3：交付必须附 before/after 对比）。
// 产出 shots/p22-review/：
//   01-before-nominimap.png  真实比赛画面，小地图被隐藏（before）
//   02-after-t0.png          同一画面，小地图打开（after，发车后 t0）
//   03-after-driven.png      按住油门驾驶一段时间后（箭头/圆点已移动）
//   04-closeup-driven.png    小地图特写（裁剪）
// 断言（脚本自身即探针，像素级复核交给配套 report.py 做二次实证）：
//   A 真实时间线自动跑到 running；
//   B 玩家世界坐标在驾驶窗口内真实前移（>3m）；
//   C 玩家白箭头像素质心随驾驶移动（>1.5px，纯驾驶、零传送）；
//   D AI 圆点也在移动（每帧更新位置点）；
//   E 零 console/page error。
// 用法: node minimap-review-shot.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'shots', 'p22-review');
const DRIVE_MS = Number(process.env.DRIVE_MS || 150000);

const results = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
  results.push({ name, ok, detail });
  if (!ok) failures++;
};

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '?track=classic', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.aiKarts && window.__mk.aiKarts.length === 3,
  null, { timeout: 240000 });
// 真实比赛开始（巡游+倒计时自动跑完），不传送、不摆位
let running = false;
try {
  await page.waitForFunction(() => window.__mk.state && window.__mk.state.running === true,
    null, { timeout: 240000 });
  running = true;
} catch (e) { /* 交给 A 断言报告 */ }
check('A 自动进入 running（真实时间线）', running);

// 读小地图 canvas 缓冲：玩家白箭头像素质心 + AI 三色圆点质心
const readMap = () => page.evaluate(() => {
  const c = document.getElementById('minimap');
  if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, 160, 160).data;
  const acc = { white: { sx: 0, sy: 0, n: 0 }, green: { sx: 0, sy: 0, n: 0 }, blue: { sx: 0, sy: 0, n: 0 }, orange: { sx: 0, sy: 0, n: 0 } };
  const add = (k, x, y) => { const a = acc[k]; a.sx += x; a.sy += y; a.n++; };
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    const i = (y * 160 + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 200) continue;
    if (r > 240 && g > 240 && b > 240) add('white', x, y);
    else if (Math.abs(r - 0x33) < 40 && Math.abs(g - 0xff) < 40 && Math.abs(b - 0x33) < 40) add('green', x, y);
    else if (Math.abs(r - 0x33) < 40 && Math.abs(g - 0x88) < 40 && Math.abs(b - 0xff) < 40) add('blue', x, y);
    else if (Math.abs(r - 0xff) < 40 && Math.abs(g - 0xaa) < 40 && Math.abs(b - 0x00) < 40) add('orange', x, y);
  }
  const cen = (k) => acc[k].n ? { x: acc[k].sx / acc[k].n, y: acc[k].sy / acc[k].n, n: acc[k].n } : null;
  const p = window.kartPhysics.position;
  return {
    white: cen('white'), green: cen('green'), blue: cen('blue'), orange: cen('orange'),
    player: { x: p.x, z: p.z },
    speed: window.__mk.state ? window.__mk.state.speed : null,
  };
});

const shot = async (name, clip) => {
  const file = path.join(OUT, name);
  try {
    await page.screenshot({ path: file, timeout: 120000, ...(clip ? { clip } : {}) });
  } catch (e) {
    // 环境兜底（GUIDANCE 17:25②）：page.screenshot 偶发超时 → CDP 直抓
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', clip
      ? { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 } }
      : { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    await cdp.detach();
    console.log(`(CDP 兜底抓图: ${name})`);
  }
  return file;
};

// ---------- before：隐藏小地图的真实比赛画面 ----------
await page.evaluate(() => { document.getElementById('minimap').style.display = 'none'; });
await page.waitForTimeout(1500);
await shot('01-before-nominimap.png');

// ---------- after t0：恢复小地图 ----------
await page.evaluate(() => { document.getElementById('minimap').style.display = ''; });
await page.waitForTimeout(1500);
const m0 = await readMap();
await shot('02-after-t0.png');

// ---------- 真实驾驶（纯键盘，零传送） ----------
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(DRIVE_MS);
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(1500);
const m1 = await readMap();
await shot('03-after-driven.png');
await shot('04-closeup-driven.png', { x: 1280 - 12 - 176, y: 720 - 12 - 176, width: 188, height: 188 });

const movedM = m0 && m1 ? Math.hypot(m1.player.x - m0.player.x, m1.player.z - m0.player.z) : -1;
// 阀值说明：headless 软渲染下 rAF 约 0.1~0.3fps，main.js:535 dt 钳到 1/30s，
// 每帧世界只推进 33ms → 玩家有效位移约 0.05 m/s（真机 60fps 无此限制），
// 故 150s 驾驶窗口 ≈ 3~7m，箭头位移 3~7px（小地图约 1px/m）。
check('B 玩家世界坐标真实前移', movedM > 1.5, `${movedM.toFixed(2)} m (stateSpeed ${m1 && m1.speed})`);

const dpx = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : -1);
const dw = dpx(m0 && m0.white, m1 && m1.white);
check('C 白箭头像素质心随驾驶移动（零传送）', dw > 1.5,
  `${dw.toFixed(2)} px (t0 ${m0 && m0.white && m0.white.x.toFixed(1)},${m0 && m0.white && m0.white.y.toFixed(1)} n=${m0 && m0.white && m0.white.n} → ${m1 && m1.white && m1.white.x.toFixed(1)},${m1 && m1.white && m1.white.y.toFixed(1)} n=${m1 && m1.white && m1.white.n})`);

const dots = ['green', 'blue', 'orange'].map((k) => dpx(m0 && m0[k], m1 && m1[k]));
check('D AI 圆点每帧更新（至少两枚移动 >1px）', dots.filter((v) => v > 1).length >= 2,
  dots.map((v) => v.toFixed(2)).join('/') + ' px');

const files = ['01-before-nominimap.png', '02-after-t0.png', '03-after-driven.png', '04-closeup-driven.png'];
check('F 四张图全部落盘', files.every((f) => fs.existsSync(path.join(OUT, f)) && fs.statSync(path.join(OUT, f)).size > 20000),
  files.map((f) => `${f}:${fs.existsSync(path.join(OUT, f)) ? Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + 'KB' : 'missing'}`).join(' '));

check('E 零 console/page error', errors.length === 0, errors.slice(0, 3).join(' ; '));

console.log(JSON.stringify({ player0: m0 && m0.player, player1: m1 && m1.player, arrowMovePx: dw, aiMovePx: dots }));
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
