// P24 第一块：发车格巡游开场验收探针（确定性版）
// 背景：headless 软渲染帧间隔秒级，开场实时时间线（splash ~2.3s + 巡游 3.5s）
// 在探针第一次采样前就已跑完，实时采样必然误报（10-14 11:35 诊断证实）。
// 本版用 main.js 的白盒调试钩子 __mk.intro（resetIntro/setParadeTime/updateParade/
// setSplashFinished/finishParade）把开场时间线摆到指定时刻再断言机位，
// 断言覆盖面不变：
//  A) 冻结机制：splashFinished=false 时循环只渲染不动相机，相机=巡游起始机位
//     parade.a，玩家在发车格槽位 1；
//  B) dolly 段 t=1.25s：低角度（~1.1m）在 a→b 中段，paradeDone 仍 false，
//     四车 + 起点拱门同框；
//  C) 落位 t=PARADE_TOTAL-0.01s：机位=玩家车尾倒计时机位（与 snapCameraBehindKart
//     公式一致，零跳变）；finishParade 后衔接帧 ≥3 车 + 拱门在屏内；
//     倒计时 → state.running；
//  D) 巡游总时长 ≤ 4s；
//  E) 跳过路径：巡游中按任意键立即落位车尾并进倒计时；
//  F) 全程零 console/page error。
// 注意：本探针不可与 verify.js 并发跑（双 WebGL 页软渲染饿死 rAF，GUIDANCE 11:35）。
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

// 页内驱动：复位开场并把巡游时间轴摆到第 t 秒（单条 evaluate 内原子完成）。
// 先上暂停闩：headless 软渲染帧间隔秒级，不冻结的话下一次 rAF 会在采样前
// 用真实 dt 把巡游直接推到结束（本轮实测 B1/B2/B3/E0 因此误报）。
const drive = (t) => page.evaluate((tt) => {
  const i = window.__mk.intro;
  i.setParadePaused(true);
  i.resetIntro();
  i.setParadeTime(tt);
  i.updateParade(); // 强制推进（无视暂停闩），机位精确落在 t
  return { t: tt, total: i.PARADE_TOTAL };
}, t);

fs.mkdirSync(SHOTS, { recursive: true });
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
// 等钩子就位且 splash 真实播完（此后无迟到的 startParade 回调干扰复位）
await page.waitForFunction(
  () => window.__mk && window.__mk.parade && window.__mk.intro && window.__mk.intro.isSplashFinished(),
  null, { timeout: 60000, polling: 200 });

// ---------- A. 冻结机制：splash 期间相机钉在巡游起始机位，玩家在发车格 ----------
await page.evaluate(() => {
  const i = window.__mk.intro;
  i.resetIntro();
  i.setSplashFinished(false); // 模拟 splash 播放中：循环只渲染、不动相机
});
const s0 = await sample();
check('A1 复位后 paradeMode=true 且 paradeDone=false', s0.state.paradeMode === true && s0.state.paradeDone === false);
check('A2 相机冻结在巡游起始机位 parade.a', dist(s0.cam, s0.parade.a) < 0.05, `d=${dist(s0.cam, s0.parade.a).toFixed(3)}m`);
check('A3 玩家车在发车格槽位 1', dist(s0.player, s0.spawns[1].pos) < 0.05, `d=${dist(s0.player, s0.spawns[1].pos).toFixed(3)}m`);
const shotStart = await shot('parade-p24-1-start.png');
check('A4 起始帧截图存证（巡游起始机位画面）', !!shotStart, shotStart || '');
const s0b = await sample();
await page.waitForTimeout(800);
const s0c = await sample();
check('A5 splash 期间画面冻结（相机 0.8s 内零位移）', dist(s0c.cam, s0b.cam) < 0.01, `d=${dist(s0c.cam, s0b.cam).toFixed(3)}m`);

// ---------- B. dolly 段 t=1.25s：低角度滑向 b，四车+拱门同框 ----------
await drive(1.25);
const s1 = await sample();
check('B1 dolly 期间 paradeDone 仍 false', s1.state.paradeDone === false);
check('B2 dolly 低角度（相机离地 0.5~2.5m）', s1.cam[1] > 0.5 && s1.cam[1] < 2.5, `y=${s1.cam[1].toFixed(2)}m`);
const half = s1.parade.a.map((v, i2) => (v + s1.parade.b[i2]) / 2);
check('B3 dolly 中点在 a→b 连线上（离中线 <1m）',
  Math.hypot(s1.cam[0] - half[0], s1.cam[2] - half[2]) < 1,
  `d=${Math.hypot(s1.cam[0] - half[0], s1.cam[2] - half[2]).toFixed(2)}m`);
const shotMid = await shot('parade-p24-2-mid.png');
check('B4 中段帧截图存证', !!shotMid, shotMid || '');
const midInFrame = s1.ndcKarts.filter(inFrame).length;
check('B5 中段帧四车同框（4/4 在屏内）', midInFrame === 4, s1.ndcKarts.map((p) => p.join(',')).join(' | '));
check('B6 中段帧起点拱门同框', inFrame(s1.ndcGate), s1.ndcGate.join(','));

// ---------- C. 落位车尾（零跳变）→ 倒计时 → 开赛 ----------
const total = await page.evaluate(() => window.__mk.intro.PARADE_TOTAL);
await drive(total - 0.01);
const s2 = await sample();
// snapCameraBehindKart 公式：pos = kart + (sin rot,0,cos rot)*12 + y+6
const r = s2.playerRot;
const snapPos = [s2.player[0] + Math.sin(r) * 12, s2.player[1] + 6, s2.player[2] + Math.cos(r) * 12];
check('C1 巡游末端机位 = 玩家车尾倒计时机位（零跳变）', dist(s2.cam, snapPos) < 0.3, `d=${dist(s2.cam, snapPos).toFixed(3)}m`);
await page.evaluate(() => window.__mk.intro.finishParade());
const s2b = await sample();
const joinInFrame = s2b.ndcKarts.filter(inFrame).length;
check('C2 衔接帧至少 3 车在屏内（车尾机位视野）', joinInFrame >= 3, `${joinInFrame}/4`);
check('C3 衔接帧起点拱门在屏内（发车视线）', inFrame(s2b.ndcGate), s2b.ndcGate.join(','));
const shotJoin = await shot('parade-p24-3-join.png');
check('C4 倒计时衔接帧截图存证', !!shotJoin, shotJoin || '');
await page.waitForFunction(() => window.__mk.state.running === true, null, { timeout: 30000, polling: 200 });
const s3 = await sample();
check('C5 倒计时结束比赛开始（state.running）', s3.state.running === true && s3.state.started === true);

// ---------- D. 巡游总时长 ≤ 4s ----------
check('D1 巡游总时长 ≤ 4s', total <= 4, `PARADE_TOTAL=${total}s`);

// ---------- E. 跳过路径（重新加载，巡游中按任意键） ----------
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(
  () => window.__mk && window.__mk.parade && window.__mk.intro && window.__mk.intro.isSplashFinished(),
  null, { timeout: 60000, polling: 200 });
await drive(1.0); // 复位后摆到 dolly 中段
const sPre = await sample();
check('E0 按键前巡游进行中（paradeDone=false）', sPre.state.paradeDone === false);
await page.keyboard.press('Space'); // 任意键跳过巡游
await page.waitForFunction(() => window.__mk.state.paradeDone === true, null, { timeout: 15000, polling: 200 });
const s4 = await sample();
const snapPos4 = [s4.player[0] + Math.sin(s4.playerRot) * 12, s4.player[1] + 6, s4.player[2] + Math.cos(s4.playerRot) * 12];
check('E1 按键跳过后立即落位车尾', dist(s4.cam, snapPos4) < 0.3, `d=${dist(s4.cam, snapPos4).toFixed(3)}m`);
await page.waitForFunction(() => window.__mk.state.running === true, null, { timeout: 30000, polling: 200 });
check('E2 跳过后倒计时照常进比赛', (await sample()).state.running === true);

// ---------- F. 零 error ----------
check('F1 全程零 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
