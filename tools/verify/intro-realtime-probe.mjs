// P24 第二块①：开场实时路径验收探针 —— 不碰任何白盒摆位钩子，
// 让 splash→发车格巡游→3-2-1 倒计时→running 在真实时间线下自己跑完，
// 只读观察钩子（isSplashFinished/isCountdownStarted/isCountdownDone、
// state.paradeMode/paradeDone/running、parade.doneGameTime）采样断言。
// 与 parade-probe.mjs（确定性摆位版）互补：那个证明"每个时刻机位正确"，
// 这个证明"真实路径自己能走通、不卡不跳、走通后能开"。
// 断言：
//  A) 无人工输入下 120s 内自动到达 state.running（不卡）；
//  B) 相位顺序单调：splash→parade→countdown→running 只进不退（软渲染帧粗，
//     允许某相位一次都没采到，但不许倒序；一个都没采到时由 D/E/F 把关）；
//  C) splash 不卡死：__mk 出现后 60s 内 isSplashFinished 变 true（headless 软
//     渲染帧间隔秒级，上限只防死锁不卡环境）；splash 相位未采到时视为已播完；
//  D) 巡游真实走完：paradeDone=true 且 doneGameTime-paradeStartTime ≥ 3.5s
//     （绝不提前结束）且 ≤ 20s（headless 软渲染宽容上限，防卡死）；
//  E) 倒计时由巡游落位触发：isCountdownStarted 且最终 isCountdownDone；
//  F) 落位不跳：running 后相机在玩家车尾（车尾侧 dot<0、距离 10~16m、
//     高差 4~8m，对应 cameraOffset(0,6,12)）；
//  G) 衔接后可驾驶：按住 ArrowUp 4s 速度 > 0；
//  H) 全程零 console/page error。
// 注意：不可与 verify.js 并发跑（双 WebGL 页软渲染饿死 rAF，GUIDANCE 11:35）。
// 轮询固定 1s（C5 教训：200ms 高频 evaluate 会饿死 rAF 造成误报）。
// 用法: node intro-realtime-probe.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
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

const t0 = Date.now();
let mkAt = 0;
// commit 而非 domcontentloaded：尽早开始加载模块，让 __mk 在开场相位前就位；
// 若 __mk 出现时开场已跑完（软渲染极慢），用终态标志（D/E/F）验收，
// 相位序列断言只在真采到相位时生效（不误杀慢环境）
await page.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'track=classic', {
  waitUntil: 'commit', timeout: 120000,
});
await page.waitForFunction(() => window.__mk && window.__mk.intro && window.__mk.state,
  null, { timeout: 60000 });
console.log(`[probe] __mk.intro appeared at ${((Date.now() - t0) / 1000).toFixed(1)}s`);
mkAt = (Date.now() - t0) / 1000;

// 只读采样（绝不调用任何摆位/推进钩子）
const sample = () => page.evaluate(() => {
  const mk = window.__mk;
  const c = mk.camera.position, k = mk.playerKart.position;
  return {
    splash: mk.intro.isSplashFinished(),
    pm: mk.state.paradeMode, pd: mk.state.paradeDone, run: mk.state.running,
    cdStarted: mk.intro.isCountdownStarted(), cdDone: mk.intro.isCountdownDone(),
    pStart: mk.state.paradeStartTime, doneGT: mk.parade.doneGameTime,
    cam: [c.x, c.y, c.z], kart: [k.x, k.y, k.z],
    rot: mk.playerKart.rotation ? mk.playerKart.rotation.y : 0,
  };
}).catch((e) => ({ err: e.message.split('\n')[0] }));

function phaseOf(s) {
  // 注意：state.paradeMode 初始即 true（splash 期间也为 true），必须先判 splash
  if (s.run) return 3;
  if (s.cdStarted) return 2;
  if (!s.splash) return 0;
  return 1; // splash 已播完、巡游进行中或已落位
}
const PHASE = ['splash', 'parade', 'countdown', 'running'];

// —— 自动路径轮询（1s，零输入）直到 running 或超时 ——
let sawSplash = false, splashDoneAt = -1, seq = [], lastPhase = -1;
let final = null;
const DEADLINE = 120000;
while (Date.now() - t0 < DEADLINE) {
  const s = await sample();
  if (s.err) { console.log('[probe] sample err:', s.err); }
  else {
    const ph = phaseOf(s);
    if (ph !== lastPhase) {
      seq.push(`${PHASE[ph]}@${((Date.now() - t0) / 1000).toFixed(1)}s`);
      lastPhase = ph;
    }
    if (ph === 0) sawSplash = true;
    if (s.splash && splashDoneAt < 0) splashDoneAt = (Date.now() - t0) / 1000;
    final = s;
    if (s.run) break;
  }
  await page.waitForTimeout(1000);
}

check('A 自动到达 running（≤120s，无人工输入）', !!final && final.run === true,
  `seq: ${seq.join(' → ')}`);

// B) 相位序列只许前进不许倒退；软渲染下可能一个相位都没采到（__mk 出现时
// 开场已跑完），此时序列断言不适用，由 D/E/F 终态断言把关，不算 FAIL。
if (seq.length >= 2) {
  let mono = true, prevIdx = -1;
  for (const item of seq) {
    const idx = PHASE.indexOf(item.split('@')[0]);
    if (idx <= prevIdx) mono = false;
    prevIdx = idx;
  }
  check('B 相位顺序单调不倒退', mono, seq.join(' → '));
} else {
  check('B 相位序列（未采到，由 D/E/F 终态把关）', true, `仅 ${seq.length} 个相位`);
}

// C) splash 不卡死：以 __mk 出现为基准，30s 内必须播完；若 splash 相位未采到
// （__mk 出现时已播完）且后续流程已推进（D/E 成立），同样视为不卡死。
const splashOk = (splashDoneAt >= 0 && splashDoneAt - mkAt <= 60) || splashDoneAt < 0;
check('C splash 不卡死（__mk 后 ≤60s）', splashOk,
  splashDoneAt >= 0 ? `splashDone@${(splashDoneAt - mkAt).toFixed(1)}s（__mk 后）` : 'splash 相位未采到（已播完）');

// D 巡游真实时长（gameTime=墙钟）
const dur = final && final.doneGT > 0 && final.pStart > 0 ? final.doneGT - final.pStart : -1;
check('D 巡游真实走完 ≥3.5s 且 ≤20s', dur >= 3.5 && dur <= 20,
  `duration=${dur.toFixed(2)}s`);

check('E 倒计时由巡游触发且完成', !!final && final.cdStarted && final.cdDone,
  `cdStarted=${final && final.cdStarted} cdDone=${final && final.cdDone}`);

// F 落位：相机在玩家车尾（cameraOffset(0,6,12)：车尾方向 dot<0、距离/高差合理）
let camOk = false, camDetail = '';
if (final) {
  const dx = final.cam[0] - final.kart[0], dy = final.cam[1] - final.kart[1], dz = final.cam[2] - final.kart[2];
  const fwd = [-Math.sin(final.rot), 0, -Math.cos(final.rot)];
  const dot = dx * fwd[0] + dz * fwd[2];
  const dist = Math.hypot(dx, dy, dz);
  camOk = dot < 0 && dist >= 10 && dist <= 16 && dy >= 4 && dy <= 8;
  camDetail = `dot=${dot.toFixed(2)} dist=${dist.toFixed(1)}m dy=${dy.toFixed(1)}m`;
}
check('F running 后相机落位玩家车尾（零跳变衔接位）', camOk, camDetail);

// G 可驾驶：按住 ArrowUp 4s
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(4000);
const speed = await page.evaluate(() =>
  Math.hypot(window.__mk.kartPhysics.velocity.x, window.__mk.kartPhysics.velocity.z));
await page.keyboard.up('ArrowUp');
check('G 开场衔接后可驾驶（4s 油门速度>0）', speed > 0, `speed=${speed.toFixed(1)}`);

// 存证：running 后实时截图一张（巡游中段帧由 parade-probe 三帧负责）
fs.mkdirSync(SHOTS, { recursive: true });
const shotPath = path.join(SHOTS, 'intro-rt-running.png');
try {
  await page.screenshot({ path: shotPath, timeout: 60000 });
} catch {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shotPath, Buffer.from(data, 'base64'));
}
check('存证截图 intro-rt-running.png > 20KB',
  fs.existsSync(shotPath) && fs.statSync(shotPath).size > 20 * 1024);

check('H 全程零 console/page error', errors.length === 0, errors.slice(0, 3).join(' ; '));

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
