// P23 新角色探针（公主/恐龙/酷霸王 + 玩家马里奥）
//  验收 GUIDANCE 2026-10-17 06:30 条：
//   A) kart.js 导出 CHARACTERS 四键齐全（name/body/signature）；
//   B) createKart(角色键) 生成对应特征部件（peach: crown+dress；dino: saddle；
//      bowser: shell+mane；mario: 无特征件），userData.character 正确；
//   C) 四角色车身色两两不同，mario=0xff3333；
//   D) 特征部件几何非退化（boundingSphere.radius > 0.05）；
//   E) 旧 API 零回归：createKart(hex) 仍可用，character==='mario'；
//   F) 同屏视觉证据：四角色车摆进真实场景，CDP 截图 >20KB，
//      PIL 像素分析确认粉/绿车身色与金色皇冠色真实渲染；
//   G) 全程零 console/page error。
// 用法: node characters-probe.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
// 注意：本机 8G 软渲染，勿与 verify.js 并发（11:35 教训）；轮询间隔 ≥1s。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOT_DIR = path.join(ROOT, 'shots', 'p23-review');
const SHOT = path.join(SHOT_DIR, '01-four-characters.png');

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

await page.goto(BASE + '?track=classic', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.scene && window.__mk.track, null, {
  timeout: 240000, polling: 1000,
});

// ---------- A. CHARACTERS 导出 ----------
const a = await page.evaluate(async () => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const C = mod.CHARACTERS;
  if (!C) return { missing: true };
  const keys = ['mario', 'peach', 'dino', 'bowser'];
  const okKeys = keys.every((k) => C[k] && typeof C[k].name === 'string' && typeof C[k].body === 'number' && 'signature' in C[k]);
  return { okKeys, names: keys.map((k) => C[k] && C[k].name).join('/'), sigs: keys.map((k) => C[k] && C[k].signature).join(',') };
});
check('A CHARACTERS 四键齐全（name/body/signature）', !a.missing && a.okKeys, `names=${a.names} sigs=${a.sigs}`);

// ---------- B. 特征部件 ----------
const b = await page.evaluate(async () => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const isMesh = (o) => !!o && o.isMesh === true;
  const out = {};
  const cases = {
    peach: (p) => isMesh(p.crown) && isMesh(p.dress),
    dino: (p) => isMesh(p.saddle),
    bowser: (p) => isMesh(p.shell) && isMesh(p.mane),
    mario: (p) => !p.crown && !p.saddle && !p.shell,
  };
  for (const [k, test] of Object.entries(cases)) {
    const g = mod.createKart(k, false);
    const p = g.userData.parts || {};
    out[k] = {
      char: g.userData.character,
      partsOk: test(p),
      named: ['crown', 'dress', 'saddle', 'shell', 'mane'].every((n) => !p[n] || (p[n].name === n)),
      head: (() => {
        const h = p.helmet;
        if (!h) return 'none';
        if (k === 'dino') return h.userData.partName === 'dinoHead' ? 'dinoHead' : 'wrong';
        if (k === 'bowser') return h.userData.partName === 'bowserHead' ? 'bowserHead' : 'wrong';
        return 'n/a';
      })(),
    };
  }
  return out;
});
check('B1 公主 crown+dress 且 character=peach', b.peach.char === 'peach' && b.peach.partsOk, JSON.stringify(b.peach));
check('B2 恐龙 saddle + dinoHead 且 character=dino', b.dino.char === 'dino' && b.dino.partsOk && b.dino.head === 'dinoHead', JSON.stringify(b.dino));
check('B3 酷霸王 shell+mane + bowserHead 且 character=bowser', b.bowser.char === 'bowser' && b.bowser.partsOk && b.bowser.head === 'bowserHead', JSON.stringify(b.bowser));
check('B4 马里奥无特征件 且 character=mario', b.mario.char === 'mario' && b.mario.partsOk, JSON.stringify(b.mario));
check('B5 特征部件 mesh.name 非空且与键一致', Object.values(b).every((v) => v.named), '');

// ---------- C. 车身色两两不同 ----------
const c = await page.evaluate(async () => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const hex = {};
  for (const k of ['mario', 'peach', 'dino', 'bowser']) {
    hex[k] = mod.createKart(k, false).userData.parts.chassis.material.color.getHex();
  }
  const vals = Object.values(hex);
  return { hex, distinct: new Set(vals).size === vals.length };
});
check('C 四角色车身色两两不同且 mario=0xff3333', c.distinct && c.hex.mario === 0xff3333,
  Object.entries(c.hex).map(([k, v]) => `${k}=0x${v.toString(16)}`).join(' '));

// ---------- D. 特征部件几何非退化 ----------
const d = await page.evaluate(async () => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const radii = {};
  const want = { peach: ['crown', 'dress'], dino: ['saddle'], bowser: ['shell', 'mane'] };
  for (const [k, names] of Object.entries(want)) {
    const p = mod.createKart(k, false).userData.parts;
    for (const n of names) {
      p[n].geometry.computeBoundingSphere();
      radii[`${k}.${n}`] = p[n].geometry.boundingSphere.radius;
    }
  }
  return { radii, ok: Object.values(radii).every((r) => r > 0.05) };
});
check('D 特征部件几何非退化（radius>0.05）', d.ok, JSON.stringify(d.radii));

// ---------- E. 旧 API 零回归 ----------
const e = await page.evaluate(async () => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const g = mod.createKart(0x33ff33);
  const p = g.userData.parts || {};
  return {
    char: g.userData.character,
    chassisColor: p.chassis && p.chassis.material.color.getHex(),
    hasCore: !!p.chassis && !!p.nose && !!p.wing,
    hasWheels: Array.isArray(g.userData.wheels) && g.userData.wheels.length === 4,
  };
});
check('E 旧 hex API 零回归（character=mario、车身用原色、核心部件齐全）',
  e.char === 'mario' && e.chassisColor === 0x33ff33 && e.hasCore && e.hasWheels, JSON.stringify(e));

// ---------- F. 同屏视觉证据 ----------
// 等 splash 退场、比赛真开始（chase 相机朝前），再把四角色车横排在前方路面。
await page.waitForFunction(() => window.__mk && window.__mk.state && window.__mk.state.running === true, null, {
  timeout: 240000, polling: 1000,
});
const placed = await page.evaluate(async () => {
  const mod = await import(new URL('/kart.js', location.href).href);
  const track = window.__mk.track;
  const scene = window.__mk.scene;
  const groups = [];
  const keys = ['mario', 'peach', 'dino', 'bowser'];
  const p = track.spline.getPointAt(0.03);
  const tan = track.spline.getTangentAt(0.03);
  const llen = Math.hypot(tan.x, tan.z) || 1;
  const lat = { x: -tan.z / llen, z: tan.x / llen }; // 路面横向单位向量（纯数学，免 import THREE）
  keys.forEach((k, i) => {
    const g = mod.createKart(k, false);
    const off = (i - 1.5) * 6;
    g.position.set(p.x + lat.x * off, track.getSurfaceY(p) + 0.05, p.z + lat.z * off);
    g.rotation.y = Math.atan2(tan.x, tan.z); // 车头朝来车方向，正对 chase 相机
    scene.add(g);
    groups.push(g);
  });
  window.__p23probe = groups;
  return groups.length;
});
check('F1 四角色车已摆入场景', placed === 4, `placed=${placed}`);

// 等 2 帧 rAF 让新物体进入渲染
await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const tick = () => { if (++n >= 2) res(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));

fs.mkdirSync(SHOT_DIR, { recursive: true });
const cdp = await page.context().newCDPSession(page);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(SHOT, Buffer.from(data, 'base64'));
const sizeKB = fs.existsSync(SHOT) ? fs.statSync(SHOT).size / 1024 : 0;
check('F2 同屏截图生成且 >20KB', sizeKB > 20, `${sizeKB.toFixed(1)}KB -> ${path.relative(ROOT, SHOT)}`);

// 清理摆位车
await page.evaluate(() => { (window.__p23probe || []).forEach((g) => window.__mk.scene.remove(g)); window.__p23probe = null; });

// ---------- G. 零 error ----------
check('G 零 console/page error', errors.length === 0, errors.slice(0, 3).join(' ; '));

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
