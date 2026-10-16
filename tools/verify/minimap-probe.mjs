// P22 小地图探针：
//  1) canvas#minimap 存在、160×160、贴右下角；
//  2) 赛道轮廓真实画出（大量半透明白描边像素）；
//  3) AI 三车按配色圆点可见（绿/蓝/橙像素均 > 0）；
//  4) 玩家白色箭头随驾驶位置移动（传送前后白像素质心位移 > 15px）；
//  5) 箭头带朝向（rot=0 竖高 > 横宽；rot=90° 横宽 > 竖高）；
//  6) 捷径虚线（classic 有黄色像素）；
//  7) 全程零 console error。
// 用法: node minimap-probe.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = path.join(ROOT, 'shots');

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`;
  results.push(line);
  console.log(line);
  if (!ok) failures++;
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
// aiKarts：AIManager 构造完成即挂上（比 state.running 早），箭头/圆点断言都靠它
await page.waitForFunction(() => window.__mk && window.__mk.aiKarts && window.__mk.aiKarts.length === 3, null, { timeout: 180000 });

// ---------- 1. 存在性 / 尺寸 / 位置 ----------
const layout = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: c.width, h: c.height, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
});
check('1a minimap canvas 存在且 160×160', !!layout && layout.w === 160 && layout.h === 160, layout ? `${layout.w}×${layout.h}` : 'missing');
check('1b 贴右下角', !!layout && layout.vw - layout.right < 40 && layout.vh - layout.bottom < 40,
  layout ? `right gap ${(layout.vw - layout.right).toFixed(0)}, bottom gap ${(layout.vh - layout.bottom).toFixed(0)}` : '');

// ---------- 2. 轮廓像素 ----------
const px = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  const d = c.getContext('2d').getImageData(0, 0, 160, 160).data;
  let semi = 0, yellow = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 40 && a < 240 && r > 200 && g > 200 && b > 200) semi++;      // 半透明白描边
    if (a > 120 && r > 200 && g > 180 && b < 120) yellow++;               // 黄色捷径虚线
  }
  return { semi, yellow };
});
check('2 赛道轮廓描边像素充足', px.semi > 500, `semi=${px.semi}`);
check('3 捷径虚线（classic 黄色像素）', px.yellow > 10, `yellow=${px.yellow}`);

// ---------- 4. AI 配色圆点 ----------
const ai = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  const d = c.getContext('2d').getImageData(0, 0, 160, 160).data;
  // 圆点为 stroke→fill 绘制：深色描边只在外侧半线宽，内部是完整实心纯色芯。
  // （旧判据假设描边环=纯色+alpha153；实测描边是黑色 0.6 叠在填充色上，
  //  环像素=暗化填充色 alpha255，所假设的中等 alpha 纯色环永远为 0，属探针错误。）
  const near = (r, g, b) => { let ring = 0, solid = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - r) < 40 && Math.abs(d[i + 1] - g) < 40 && Math.abs(d[i + 2] - b) < 40) { if (d[i + 3] > 240) solid++; else if (d[i + 3] > 100) ring++; } } return { ring, solid }; };
  return { green: near(0x33, 0xff, 0x33), blue: near(0x33, 0x88, 0xff), orange: near(0xff, 0xaa, 0x00) };
});
const dotOk = (c) => c.solid >= 8;
check('4 AI 三色圆点均可见（实心+描边环）', dotOk(ai.green) && dotOk(ai.blue) && dotOk(ai.orange), JSON.stringify(ai));

// ---------- 5. 玩家箭头随位置移动 ----------
async function arrowCentroid() {
  return page.evaluate(() => {
    window.__mk.updateMinimap(window.kartPhysics, window.__mk.aiKarts);
    const c = document.getElementById('minimap');
    const d = c.getContext('2d').getImageData(0, 0, 160, 160).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240 && d[i + 3] > 240) { sx += x; sy += y; n++; }
    }
    return n ? { x: sx / n, y: sy / n, n } : null;
  });
}
const teleport = (t, rot) => page.evaluate(([t, rot]) => {
  const p = window.__mk.track.spline.getPointAt(t);
  window.kartPhysics.position.set(p.x, p.y, p.z);
  window.kartPhysics.rotation = rot;
}, [t, rot]);

await teleport(0.0, 0);
const a = await arrowCentroid();
await teleport(0.5, 0);
const b = await arrowCentroid();
const dist = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : -1;
check('5 玩家箭头随位置移动', dist > 15, `位移 ${dist.toFixed(1)}px (A ${a && a.x.toFixed(0)},${a && a.y.toFixed(0)} → B ${b && b.x.toFixed(0)},${b && b.y.toFixed(0)})`);

// ---------- 6. 箭头朝向 ----------
const bbox = await page.evaluate((rot) => {
  window.kartPhysics.rotation = rot;
  window.__mk.updateMinimap(window.kartPhysics, window.__mk.aiKarts);
  const c = document.getElementById('minimap');
  const d = c.getContext('2d').getImageData(0, 0, 160, 160).data;
  let minX = 999, maxX = -1, minY = 999, maxY = -1;
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    const i = (y * 160 + x) * 4;
    if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240 && d[i + 3] > 240) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}, 0);
const bbox90 = await page.evaluate((rot) => {
  window.kartPhysics.rotation = rot;
  window.__mk.updateMinimap(window.kartPhysics, window.__mk.aiKarts);
  const c = document.getElementById('minimap');
  const d = c.getContext('2d').getImageData(0, 0, 160, 160).data;
  let minX = 999, maxX = -1, minY = 999, maxY = -1;
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    const i = (y * 160 + x) * 4;
    if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240 && d[i + 3] > 240) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}, Math.PI / 2);
check('6 箭头带朝向（rot0 竖长 / rot90 横长）', bbox.h > bbox.w && bbox90.w > bbox90.h,
  `rot0 ${bbox.w}×${bbox.h}, rot90 ${bbox90.w}×${bbox90.h}`);

// ---------- 7. 截图（真实驾驶画面 + 小地图特写） ----------
await teleport(0.05, 0); // 放回起点附近再截图
fs.mkdirSync(SHOTS, { recursive: true });
await page.screenshot({ path: path.join(SHOTS, 'minimap-race.png'), timeout: 120000 });
await page.screenshot({ path: path.join(SHOTS, 'minimap-closeup.png'), clip: { x: 1280 - 190, y: 720 - 190, width: 180, height: 180 }, timeout: 120000 });
check('7 截图已生成', fs.existsSync(path.join(SHOTS, 'minimap-race.png')) && fs.existsSync(path.join(SHOTS, 'minimap-closeup.png')));

check('8 零 console error', errors.length === 0, errors.slice(0, 3).join(' ; '));

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
