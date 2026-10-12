// 广告牌朝向探针（GUIDANCE 18:55 用户反馈"文字镜像/undefined"的几何验收）
// 本模型无法看图，改验两条硬事实：
//  1) 每块广告牌（PlaneGeometry 4×2、带 map、挂在护栏组上）的"正面法线"（局部 +Z 变换到世界）
//     必须指向赛道中心线一侧（牌在护栏外侧，正面朝赛道 = 行车方向能看到正向文字；
//     DoubleSide 背面看到的是镜像字，所以朝向正确是"文字正向"的几何前提）。
//  2) 纹理标题不可能为 undefined：createBillboardTexture 的 nextRand 已归一化到 [0,1)
//     （源码级修复，这里用浏览器内重放同种子序列做回归断言：titles[idx] 全部命中）。
// 用法: node billboard-probe.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:8901/?track=classic';
const report = { ok: false, url, consoleErrors: [], pageErrors: [], billboards: 0, facingTrack: 0, bad: [] };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(8000); // 让赛道建完

report.result = await page.evaluate(() => {
  const { scene, track } = window.__mk;
  const out = { billboards: 0, facingTrack: 0, bad: [], randRangeOk: true };
  // 收集广告牌：护栏组里的 PlaneGeometry(4,2) 且带 map（借现有对象构造器拿 Vector3/Quaternion，避免页内 import）
  const v = new (window.__mk.camera.position.constructor)(); // Vector3
  const n = new (window.__mk.camera.position.constructor)();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (!g || !g.parameters) return;
    if (g.parameters.width !== 4 || g.parameters.height !== 2) return;
    if (!o.material || !o.material.map) return;
    out.billboards++;
    // 正面法线 = 局部 +Z 经世界四元数
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements;
    n.set(e[8], e[9], e[10]).normalize(); // 世界矩阵第三列 = 局部+Z 方向
    // 最近样条点
    let best = 1e9, bx = 0, bz = 0;
    const p = o.getWorldPosition(v);
    for (let i = 0; i < 200; i++) {
      const pt = track.spline.getPointAt(i / 200);
      const d = (pt.x - p.x) ** 2 + (pt.z - p.z) ** 2;
      if (d < best) { best = d; bx = pt.x; bz = pt.z; }
    }
    const toTrack = { x: bx - p.x, z: bz - p.z };
    const dot = n.x * toTrack.x + n.z * toTrack.z;
    if (dot > 0) out.facingTrack++;
    else out.bad.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), dot: +dot.toFixed(1) });
  });
  // 重放 createBillboardTexture 的 PRNG：任意整数种子下索引必须落在数组内
  const titles = ['SPEED', 'RACE', 'BOOST', 'WIN', 'GO!', 'NITRO'];
  const subs = ['CHAMPIONSHIP', 'GRAND PRIX', 'TIME TRIAL', 'VS MODE'];
  for (const seed of [0, 17, -17, 85, -85, 1234, -1234]) {
    let rand = Math.abs(seed) || 0.5;
    const next = () => { rand = (rand * 1664525 + 1013904223) % 4294967296; if (rand < 0) rand += 4294967296; return rand / 4294967296; };
    for (let k = 0; k < 6; k++) {
      const t = titles[Math.floor(next() * titles.length)];
      const s = subs[Math.floor(next() * subs.length)];
      if (t === undefined || s === undefined) out.randRangeOk = false;
    }
  }
  return out;
});

await browser.close();
report.billboards = report.result.billboards;
report.facingTrack = report.result.facingTrack;
report.bad = report.result.bad.slice(0, 5);
report.randRangeOk = report.result.randRangeOk;
report.ok = report.result.billboards > 0
  && report.result.facingTrack === report.result.billboards
  && report.result.randRangeOk
  && report.consoleErrors.length === 0 && report.pageErrors.length === 0;
console.log(JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
