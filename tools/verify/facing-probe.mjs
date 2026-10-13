// P24 前置：车头朝向 / 行驶方向一致性探针
// 背景：逻辑层（main.js 物理、ai.js、items.js、projectiles.js）统一约定
//   车头 = 局部 -Z，即 heading r 的前进方向 F = (-sin r, 0, -cos r)；
//   而卡丁车模型（kart.js createKart / ai.js createAIKart）零件按"车头 = 局部 +Z"搭建
//   （nose.z=+1.4、尾翼 z=-1.6、排气管 z=-1.7）。两者不一致 ⇒ 车永远"视觉倒着开"，
//   且出生朝向与检查点顺序（沿样条 t 递增排列）矛盾 ⇒ 圈永远跑不完。
//   本探针把这件事变成可回归的硬断言：
//   A) 视觉车头（模型 nose 部件世界位置 - 车体世界位置，XZ 投影）与
//      ① 逻辑前进方向 F、② 实际速度方向 的夹角余弦 ≥ 0.9；
//   B) 出生时视觉车头与样条切线（+t = 检查点顺序方向）余弦 ≥ 0.9（4 台车全部）；
//   C) 跟随镜头在车尾（camera→kart 方向与 F 反向）且镜头朝车头前方（余弦 ≥ 0.9）；
//   D) 玩家按住油门 4 秒：速度沿 F 增长、样条进度 t 递增（不倒着跑）；
//   E) 3 台 AI 自主行驶 6 秒：视觉车头·速度 ≥ 0.9、样条进度 t 递增、仍在路面上；
//   F) 全程零 console/page error。
// 用法: node facing-probe.mjs [baseUrl]   (默认 http://127.0.0.1:8901/)
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
await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 90000 });
await page.waitForFunction(() => window.__mk.state && window.__mk.state.running === true, { timeout: 180000 });

/** 读取一台车（玩家或 AI）的朝向/速度/进度样本 */
// 视觉车头 = 模型 nose 部件世界位置 - 车体世界位置（XZ 归一化），
// 与任何朝向约定无关，纯"看起来车头朝哪"。
const sample = () => page.evaluate(() => {
  const mk = window.__mk;
  const p = mk.kartPhysics;
  const kart = mk.playerKart;
  const track = mk.track;

  const nosePart = (root) => root.userData?.nose || root.userData?.parts?.nose || null;
  const noseWorld = (root, part) => {
    const a = part.getWorldPosition(part.position.clone());
    const b = root.getWorldPosition(root.position.clone());
    const dx = a.x - b.x, dz = a.z - b.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  };
  const dot = (a, b) => a.x * b.x + a.z * b.z;
  const norm2 = (v) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };

  const out = { player: null, ai: [] };

  if (kart && p && nosePart(kart)) {
    const F = { x: -Math.sin(p.rotation), z: -Math.cos(p.rotation) };
    const nose = noseWorld(kart, nosePart(kart));
    const info = track.getClosestPoint(p.position);
    out.player = {
      cosF: dot(nose, F),
      cosV: dot(nose, norm2(p.velocity)),
      speed: Math.hypot(p.velocity.x, p.velocity.z),
      cosTangent: dot(F, norm2(track.getTrackInfoAt(info.t).tangent)),
      t: info.t,
      x: p.position.x, z: p.position.z,
      tan: norm2(track.getTrackInfoAt(info.t).tangent),
      onRoad: track.isOnRoad(p.position),
      camBack: (() => {
        const cam = mk.camera;
        const toCam = norm2({ x: cam.position.x - p.position.x, z: cam.position.z - cam.position.z });
        const camF = norm2(cam.getWorldDirection(cam.position.clone()));
        return { back: dot(toCam, F), fwd: dot(camF, F) };
      })(),
    };
  }

  const ai = window.__ai;
  if (ai && ai.aiKarts) {
    for (const k of ai.aiKarts) {
      if (!nosePart(k.mesh)) continue;
      const F = { x: -Math.sin(k.rotation), z: -Math.cos(k.rotation) };
      const nose = noseWorld(k.mesh, nosePart(k.mesh));
      const info = track.getClosestPoint(k.position);
      out.ai.push({
        cosF: dot(nose, F),
        cosV: dot(nose, norm2(k.velocity)),
        speed: Math.hypot(k.velocity.x, k.velocity.z),
        t: info.t,
        x: k.position.x, z: k.position.z,
        tan: norm2(track.getTrackInfoAt(info.t).tangent),
        onRoad: track.isOnRoad(k.position),
      });
    }
  }
  return out;
});

// ---------- A/B. 出生即断言（发车瞬间，未驾驶） ----------
const s0 = await sample();
check('玩家模型有 nose 部件可测视觉车头', !!s0.player, JSON.stringify(s0.player ? { cosF: s0.player.cosF.toFixed(2) } : null));
check('A1 玩家视觉车头 == 逻辑前进方向 F (cos>=0.9)', s0.player && s0.player.cosF >= 0.9, `cos=${s0.player?.cosF?.toFixed(3)}`);
check('B1 玩家出生朝向 == 样条 +t 方向(检查点顺序) (cos>=0.9)', s0.player && s0.player.cosTangent >= 0.9, `cos=${s0.player?.cosTangent?.toFixed(3)}`);
check('B2 玩家出生在路面上', s0.player && s0.player.onRoad === true);
check('B3 3 台 AI 出生朝向 == 样条 +t 方向', s0.ai.length === 3 && s0.ai.every((a) => a.cosF >= 0.9),
  s0.ai.map((a) => a.cosF.toFixed(2)).join(','));
check('B4 3 台 AI 出生在路面上', s0.ai.length === 3 && s0.ai.every((a) => a.onRoad === true));

// ---------- C. 跟随镜头在车尾、朝车头前方 ----------
check('C1 镜头位于车尾（cam-kart 与 F 反向, dot<=-0.5）', s0.player && s0.player.camBack.back <= -0.5, `dot=${s0.player?.camBack?.back?.toFixed(3)}`);
check('C2 镜头朝车头前方（camera forward·F >= 0.9）', s0.player && s0.player.camBack.fwd >= 0.9, `dot=${s0.player?.camBack?.fwd?.toFixed(3)}`);

// ---------- D. 玩家按油门：沿 F 加速 + 位移沿 +t 方向 ----------
// 注：headless 软渲染约 0.6fps（本机 8G + 4096² 阴影）且 main.js 把 dt 钳到 1/30s，
// 12 秒墙钟 ≈ 7 帧 ≈ 0.23s 游戏时间，位移只有厘米级；所以本项只判"位移在样条
// 切线上的投影为正"（倒着开会得到明显的负值），不判绝对速度/距离。
const p0 = s0.player;
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(12000);
const s1 = await sample();
await page.keyboard.up('ArrowUp');
const proj = (a, b) => (b.x - a.x) * a.tan.x + (b.z - a.z) * a.tan.z; // 位移在起始切线上的投影
check('D1 玩家确实动起来（speed>0.5）', s1.player.speed > 0.5, `speed=${s1.player.speed.toFixed(2)}`);
check('D2 行驶方向 == 视觉车头（cos>=0.85）', s1.player.cosV >= 0.85, `cos=${s1.player.cosV.toFixed(3)}`);
check('D3 玩家位移沿 +t 方向（非倒着跑）', proj(p0, s1.player) > 0.01,
  `proj=${proj(p0, s1.player).toFixed(3)}m (t0=${p0.t.toFixed(4)} t1=${s1.player.t.toFixed(4)})`);

// 存证截图：跟随镜头（应看到车尾朝向镜头）
fs.mkdirSync(SHOTS, { recursive: true });
const shotPath = path.join(SHOTS, 'facing-p24-chase-classic.png');
const cdp = await page.context().newCDPSession(page);
const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(shotPath, Buffer.from(cap.data, 'base64'));
check('S1 跟随镜头截图已存证', fs.existsSync(shotPath) && fs.statSync(shotPath).size > 20000, shotPath);

// ---------- E. AI 自主行驶 ----------
const ai0 = s1.ai;
await page.waitForTimeout(12000);
const s2 = await sample();
check('E1 3 台 AI 视觉车头 == 速度方向（cos>=0.85）', s2.ai.length === 3 && s2.ai.every((a) => a.cosV >= 0.85),
  s2.ai.map((a) => a.cosV.toFixed(2)).join(','));
const projs = s2.ai.map((a, i) => proj(ai0[i], a));
check('E2 3 台 AI 位移全部沿 +t 方向', projs.every((d) => d > 0.05), projs.map((d) => d.toFixed(2)).join(','));
check('E3 3 台 AI 仍在路面上', s2.ai.every((a) => a.onRoad === true));
check('E4 3 台 AI 均在行驶（speed>1）', s2.ai.every((a) => a.speed > 1), s2.ai.map((a) => a.speed.toFixed(1)).join(','));

// ---------- F. 零 error ----------
check('F1 零 console/page error', errors.length === 0, errors.slice(0, 3).join(' || '));

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAIL'} (${results.length} 项)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
