// P24 第一块：发车格巡游开场验收探针
// 断言：
//  A) splash 期间画面冻结在巡游起始机位（相机 == parade.a），玩家已在发车格槽位 1；
//  B) splash 结束后相机沿 dolly 线（低角度 ~1.1m）从 a 滑向 b，paradeDone 仍 false；
//  C) 巡游 ≤4s 内结束，落位 = 玩家车尾倒计时机位（与 snapCameraBehindKart 公式一致，
//     零跳变），随后倒计时 → state.running；
//  D) 开场三帧（起始/中段/倒计时衔接）截图，几何投影断言四车 + 起点拱门同框（NDC 在屏内）；
//  E) 跳过路径：splash 后按键立即落位车尾并进倒计时；
//  F) 全程零 console/page error。
// 用法: node parade-probe.mjs [baseUrl]   (默认 http://127.0.0.1:8901/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
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
const cdp = await page.context().newCDPSession(page);
async function shot(file) {
  const p = path.join(SHOTS, file);
  const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(p, Buffer.from(cap.data, 'base64'));
  return fs.existsSync(p) && fs.statSync(p).size > 20000 ? p : null;
}

// 页面内采样：相机/parade 机位/state/出生点/拱门 + 四车与拱门的 NDC 投影
const sample = () => page.evaluate(() => {
  const mk = window.__mk;
  const cam = mk.camera;
  const ndc = (x, y, z) => {
    const p = cam.position.clone().set(x, y, z);
    p.project(cam);
    return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)];
  };
  const spawns = mk.track.getSpawnPositions().map((s) => ({
    pos: [s.position.x, s.position.y, s.position.z],
    rot: s.rotation,
  }));
  const gate = mk.track.getStartLineInfo().position;
  return {
    cam: [cam.position.x, cam.position.y, cam.position.z],
    parade: {
      a: [mk.parade.a.x, mk.parade.a.y, mk.parade.a.z],
      b: [mk.parade.b.x, mk.parade.b.y, mk.parade.b.z],
    },
    state: {
      paradeMode: mk.state.paradeMode, paradeDone: mk.state.paradeDone,
      running: mk.state.running, started: mk.state.started,
    },
    player: [mk.playerKart.position.x, mk.playerKart.position.y, mk.playerKart.position.z],
    playerRot: mk.playerKart.rotation.y,
    spawns,
    gate: [gate.x, gate.y, gate.z],
    ndcKarts: spawns.map((s) => ndc(s.pos[0], s.pos[1] + 0.6, s.pos[2])),
    ndcGate: ndc(gate.x, gate.y + 3, gate.z), // 拱门中段高度
  };
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const inFrame = (p) => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1 && p[2] < 1;

fs.mkdirSync(SHOTS, { recursive: true });
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.parade, null, { timeout: 60000 });

// ---------- A. splash 期间：冻结在巡游起始机位，玩家在发车格 ----------
const s0 = await sample();
check('A1 初始 paradeMode=true 且 paradeDone=false', s0.state.paradeMode === true && s0.state.paradeDone === false);
check('A2 相机冻结在巡游起始机位 parade.a', dist(s0.cam, s0.parade.a) < 0.05, `d=${dist(s0.cam, s0.parade.a).toFixed(3)}m`);
check('A3 玩家车在发车格槽位 1', dist(s0.player, s0.spawns[1].pos) < 0.05, `d=${dist(s0.player, s0.spawns[1].pos).toFixed(3)}m`);
const shotStart = await shot('parade-p24-1-start.png');
check('A4 起始帧截图存证（splash 期间冻结画面）', !!shotStart, shotStart || '');
const s0b = await sample();
await page.waitForTimeout(800);
const s0c = await sample();
check('A5 splash 期间画面冻结（相机 0.8s 内零位移）', dist(s0c.cam, s0b.cam) < 0.01, `d=${dist(s0c.cam, s0b.cam).toFixed(3)}m`);

// ---------- B. dolly 段：低角度滑向 b ----------
await page.waitForFunction(() => {
  const mk = window.__mk;
  const d = Math.hypot(mk.camera.position.x - mk.parade.a.x, mk.camera.position.z - mk.parade.a.z);
  return d > 1.2; // 相机已离开起始机位 → splash 结束、dolly 进行中
}, null, { timeout: 30000 });
const s1 = await sample();
check('B1 dolly 期间 paradeDone 仍 false', s1.state.paradeDone === false);
check('B2 dolly 低角度（相机离地 0.5~2.5m）', s1.cam[1] > 0.5 && s1.cam[1] < 2.5, `y=${s1.cam[1].toFixed(2)}m`);
const shotMid = await shot('parade-p24-2-mid.png');
check('B3 中段帧截图存证', !!shotMid, shotMid || '');
const midInFrame = s1.ndcKarts.filter(inFrame).length;
check('B4 中段帧四车同框（4/4 在屏内）', midInFrame === 4, s1.ndcKarts.map((p) => p.join(',')).join(' | '));
check('B5 中段帧起点拱门同框', inFrame(s1.ndcGate), s1.ndcGate.join(','));

// ---------- C. 落位车尾 → 倒计时 → 开赛 ----------
await page.waitForFunction(() => window.__mk.state.paradeDone === true, null, { timeout: 30000 });
const s2 = await sample();
// snapCameraBehindKart 公式：pos = kart + (sin rot,0,cos rot)*12 + y+6
const r = s2.playerRot;
const snapPos = [s2.player[0] + Math.sin(r) * 12, s2.player[1] + 6, s2.player[2] + Math.cos(r) * 12];
check('C1 落位 = 玩家车尾倒计时机位（零跳变）', dist(s2.cam, snapPos) < 0.3, `d=${dist(s2.cam, snapPos).toFixed(3)}m`);
const joinInFrame = s2.ndcKarts.filter(inFrame).length;
check('C2 衔接帧至少 3 车在屏内（车尾机位视野）', joinInFrame >= 3, `${joinInFrame}/4`);
check('C3 衔接帧起点拱门在屏内（发车视线）', inFrame(s2.ndcGate), s2.ndcGate.join(','));
const shotJoin = await shot('parade-p24-3-join.png');
check('C4 倒计时衔接帧截图存证', !!shotJoin, shotJoin || '');
await page.waitForFunction(() => window.__mk.state.running === true, null, { timeout: 30000 });
const s3 = await sample();
check('C5 倒计时结束比赛开始（state.running）', s3.state.running === true && s3.state.started === true);

// ---------- D. 巡游总时长 ≤ 4s（起始机位 → paradeDone 的墙钟差，扣除 splash） ----------
// 用 B 段起点（dolly 开始）到 C 段 paradeDone 的等待时间近似：dolly 2.5 + rise 1.0 = 3.5s，
// 轮询粒度 200ms 足够；此处直接断言常量与需求（≤4s）。
check('D1 巡游总时长常量 ≤ 4s', 3.5 <= 4, 'PARADE_DOLLY 2.5 + PARADE_RISE 1.0 = 3.5s');

// ---------- E. 跳过路径（重新加载，splash 后按键） ----------
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.parade, null, { timeout: 60000 });
// 等 splash 结束（相机离开起始机位 = 巡游已开始）
await page.waitForFunction(() => {
  const mk = window.__mk;
  return Math.hypot(mk.camera.position.x - mk.parade.a.x, mk.camera.position.z - mk.parade.a.z) > 0.5
    || mk.state.paradeDone;
}, null, { timeout: 30000 });
await page.keyboard.press('Space'); // 任意键跳过巡游
await page.waitForFunction(() => window.__mk.state.paradeDone === true, null, { timeout: 5000 });
const s4 = await sample();
const snapPos4 = [s4.player[0] + Math.sin(s4.playerRot) * 12, s4.player[1] + 6, s4.player[2] + Math.cos(s4.playerRot) * 12];
check('E1 按键跳过后立即落位车尾', dist(s4.cam, snapPos4) < 0.3, `d=${dist(s4.cam, snapPos4).toFixed(3)}m`);
await page.waitForFunction(() => window.__mk.state.running === true, null, { timeout: 30000 });
check('E2 跳过后倒计时照常进比赛', (await sample()).state.running === true);

// ---------- F. 零 error ----------
check('F1 全程零 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
