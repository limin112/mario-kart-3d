// P19 观众/看台位置专项探针：
// 1) 每个观众 mesh 的世界坐标 → 到赛道样条的最近水平距离，
//    路面半宽内=在赛道上(bug)，路面半宽+2m 内=太近(bug)
// 2) 看台组内所有 mesh 同样检查（底座/座位板等实体不能压到路面）
// 3) 看台底座与观众群是否分离（双重偏移 bug：base 用世界坐标当局部坐标）
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(process.argv[2] || 'http://127.0.0.1:8901/');
await page.waitForTimeout(9000);

const res = await page.evaluate(() => {
  const t = window.track;
  const roadHalf = t.cfg.roadWidth;
  // 样条密集采样（水平投影）
  const N = 800;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const p = t.spline.getPointAt(i / N);
    pts.push([p.x, p.z]);
  }
  const distToTrack = (v) => {
    let best = Infinity;
    for (const [x, z] of pts) {
      const d = (v.x - x) ** 2 + (v.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const out = { roadHalf, total: 0, onRoad: 0, tooClose: 0, worst: [], structOnRoad: 0, structTotal: 0, baseVsSeats: null };

  // 1) 观众
  t.spectators.forEach((s) => {
    const p = new s.position.constructor(); // clone type
    s.getWorldPosition(p);
    const d = distToTrack(p);
    out.total++;
    if (d < roadHalf) { out.onRoad++; if (out.worst.length < 5) out.worst.push({ d: +d.toFixed(1), x: +p.x.toFixed(0), z: +p.z.toFixed(0) }); }
    else if (d < roadHalf + 2) out.tooClose++;
  });

  // 2) 看台结构件（每个看台组内所有 mesh）
  t.grandstands.forEach((g, gi) => {
    g.traverse((o) => {
      if (!o.isMesh || o.userData.wavePhase !== undefined) return; // 跳过观众
      const p = new o.position.constructor();
      o.getWorldPosition(p);
      const d = distToTrack(p);
      out.structTotal++;
      if (d < roadHalf + 1) {
        out.structOnRoad++;
        if (out.worst.length < 8) out.worst.push({ part: 'stand' + gi, d: +d.toFixed(1), x: +p.x.toFixed(0), z: +p.z.toFixed(0) });
      }
    });
  });

  // 3) 底座 vs 观众群中心距离（双重偏移检查）
  const g0 = t.grandstands[0];
  if (g0) {
    let base = null;
    g0.traverse((o) => { if (o.isMesh && !base && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.height === 0.5) base = o; });
    const specs = [];
    g0.traverse((o) => { if (o.isMesh && o.userData.wavePhase !== undefined) specs.push(o); });
    if (base && specs.length) {
      const bp = new base.position.constructor(); base.getWorldPosition(bp);
      let cx = 0, cz = 0;
      const sp = new base.position.constructor();
      specs.forEach((s) => { s.getWorldPosition(sp); cx += sp.x; cz += sp.z; });
      cx /= specs.length; cz /= specs.length;
      out.baseVsSeats = +Math.hypot(bp.x - cx, bp.z - cz).toFixed(1);
    }
  }
  return out;
});

const ok = res.onRoad === 0 && res.tooClose === 0 && res.structOnRoad === 0 && errors.length === 0;
console.log(JSON.stringify({ ok, ...res, errors }, null, 1));
await browser.close();
process.exit(ok ? 0 : 1);
