// P23 新角色「监工目视复核包」截图脚本（ROADMAP 规则3：交付必须附可目视的截图证据）。
// 现有 01-four-characters.png 是 chase 相机远景合影，特征部件（皇冠/背鞍/尖刺壳）
// 在远景里偏小；本脚本把每个角色的车单独摆到比赛相机正前方 ~10m、正对镜头，
// 出四张特写 + 一张四车近距合影，让 GUIDANCE 10-17 06:30 的验收标准
// （"4 车配色分明、特征部件可见"）能被人眼直接复核。
// 产出 shots/p23-review/：
//   02-closeup-mario.png   马里奥特写（红车身）
//   03-closeup-peach.png   公主特写（粉车身+金皇冠+粉裙）
//   04-closeup-dino.png    恐龙特写（绿车身+红背鞍+黄拱）
//   05-closeup-bowser.png  酷霸王特写（黑车身+墨绿尖刺壳+白骨尖锥+红鬃毛+橙盔）
//   06-lineup-close.png    四车近距合影（配色分明对比）
// 只做运行时摆位（隐藏玩家/AI 车、摆 review 车、拍完还原），零游戏代码改动。
// 用法: node characters-review-shot.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
// 注意：本机 8G 软渲染，勿与 verify.js 并发（11:35 教训）；轮询间隔 ≥1s。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'shots', 'p23-review');

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
  null, { timeout: 240000, polling: 1000 });
// 真实时间线跑到 running（chase 相机就位、朝车头前方），不传送不摆位
let running = false;
try {
  await page.waitForFunction(() => window.__mk.state && window.__mk.state.running === true,
    null, { timeout: 240000, polling: 1000 });
  running = true;
} catch (e) { /* 交给 A 断言报告 */ }
check('A 自动进入 running（真实时间线）', running);

// 隐藏玩家/AI 实车（避免挡住特写），拍完还原
await page.evaluate(() => {
  window.__p23rev = { hidden: [], karts: [] };
  const hide = (o) => { if (o && o.visible) { o.visible = false; window.__p23rev.hidden.push(o); } };
  hide(window.__mk.playerKart);
  (window.__mk.aiKarts || []).forEach((k) => hide(k.mesh));
});

// 把角色车摆到相机正前方、正对镜头：
// 距离 D 按相机俯角解算，使车身中心（y≈1.0m）落在视轴上。
const place = async (keys, distBias = 0) => page.evaluate(async ({ keys, distBias }) => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const T = await import(new URL('/vendor/three.module.js', location.href).href);
  const { camera, track, scene } = window.__mk;
  // 相机前向（camera 局部 -Z 的世界方向），从 matrixWorld 元素取，免 import THREE
  const m = camera.matrixWorld.elements;
  let fx = -m[8], fy = -m[9], fz = -m[10];
  const hl = Math.hypot(fx, fz) || 1; fx /= hl; fz /= hl;
  const tanPitch = hl ? -fy / hl : 0.4;
  let D = tanPitch > 0.05 ? (camera.position.y - 1.0) / tanPitch : 10;
  D = Math.min(14, Math.max(5, D)) + distBias;
  // 横向单位向量（水平前向绕 Y 转 90°）
  const lx = -fz, lz = fx;
  const n = keys.length;
  const spacing = n > 1 ? Math.min(5.5, (D * 0.9) / (n - 1 || 1)) : 0;
  const placed = [];
  keys.forEach((k, i) => {
    const g = mod.createKart(k, false);
    const off = (i - (n - 1) / 2) * spacing;
    const x = camera.position.x + fx * D + lx * off;
    const z = camera.position.z + fz * D + lz * off;
    g.position.set(x, track.getSurfaceY(new T.Vector3(x, 0, z)) + 0.05, z);
    g.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z); // 正对镜头
    scene.add(g);
    window.__p23rev.karts.push(g);
    placed.push({ k, x: +x.toFixed(1), z: +z.toFixed(1), D: +D.toFixed(1) });
  });
  return placed;
}, { keys, distBias });

const shot = async (name) => {
  // 等 2 帧 rAF 让新物体进渲染，再 CDP 直抓（软渲染下 page.screenshot 易超时）
  await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const tick = () => { if (++n >= 2) res(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  const file = path.join(OUT, name);
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  await cdp.detach();
  return file;
};

const clear = () => page.evaluate(() => {
  (window.__p23rev.karts || []).forEach((g) => window.__mk.scene.remove(g));
  window.__p23rev.karts = [];
});

const jobs = [
  [['mario'], 0, '02-closeup-mario.png'],
  [['peach'], 0, '03-closeup-peach.png'],
  [['dino'], 0, '04-closeup-dino.png'],
  [['bowser'], 0, '05-closeup-bowser.png'],
  [['mario', 'peach', 'dino', 'bowser'], 4, '06-lineup-close.png'],
];
for (const [keys, bias, name] of jobs) {
  const p = await place(keys, bias);
  await shot(name);
  await clear();
  check(`摆位+截图 ${name}`, fs.existsSync(path.join(OUT, name)),
    p.map((v) => `${v.k}@D=${v.D}`).join(' '));
}

// 还原实车可见性
await page.evaluate(() => {
  (window.__p23rev.hidden || []).forEach((o) => { o.visible = true; });
  (window.__p23rev.karts || []).forEach((g) => window.__mk.scene.remove(g));
  window.__p23rev = null;
});

const files = jobs.map((j) => j[2]);
check('F 五张图全部落盘且 >20KB',
  files.every((f) => fs.existsSync(path.join(OUT, f)) && fs.statSync(path.join(OUT, f)).size > 20000),
  files.map((f) => `${f}:${fs.existsSync(path.join(OUT, f)) ? Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + 'KB' : 'missing'}`).join(' '));
check('E 零 console/page error', errors.length === 0, errors.slice(0, 3).join(' ; '));

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
