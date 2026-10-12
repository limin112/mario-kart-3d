// P19d 专项探针：发夹弯入口前减速箭头验收
// 断言：① classic 零放置（零回归）；② dune/glacier 每发夹段 3 枚（入口前 6/12/18m）；
// ③ 每枚箭头在路面内（横向偏移 < roadWidth）、y=路面+0.07、纹理上方向≈前进切线；
// ④ 箭头位于对应发夹段入口 t0 前方 6/12/18m（弧长误差 <0.5m）；
// ⑤ 全路径零 console/page error。存发夹入口俯视存证图。
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8901/';
const results = [];
let fail = 0;
const ok = (cond, msg) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) fail = 1; };

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

for (const track of ['classic', 'dune', 'glacier']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '?track=' + track, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mk && window.__mk.track, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const { track, scene, camera, renderer } = window.__mk;
    const marks = (track.slowMarks || []).map((m) => {
      // 纹理上方向 = 局部 -Z 的世界方向
      const up = new m.position.constructor(0, 0, -1).applyQuaternion(m.quaternion);
      return { x: m.position.x, y: m.position.y, z: m.position.z, ux: up.x, uz: up.z };
    });
    const secs = (track._hairpinRawSections || []).map((s) => ({ t0: s.t0, side: s.side }));
    const L = track.trackLength;
    const rw = track.cfg.roadWidth;
    // 逐枚断言：路面内 + 贴地高度 + 朝向 + 归属发夹段入口前 6/12/18m
    const checks = marks.map((mk) => {
      // 反查最近样条点（粗 800 步 + 局部细化，防坡面上量化误差）
      let best = 0, bd = Infinity;
      for (let i = 0; i < 800; i++) {
        const t = i / 800;
        const p = track.spline.getPointAt(t);
        const d = (p.x - mk.x) ** 2 + (p.z - mk.z) ** 2;
        if (d < bd) { bd = d; best = t; }
      }
      for (let i = -40; i <= 40; i++) {
        const t = ((best + i / 40000) % 1 + 1) % 1;
        const p = track.spline.getPointAt(t);
        const d = (p.x - mk.x) ** 2 + (p.z - mk.z) ** 2;
        if (d < bd) { bd = d; best = t; }
      }
      const pt = track.spline.getPointAt(best);
      const tg = track.spline.getTangentAt(best).normalize();
      const lateral = Math.hypot(pt.x - mk.x, pt.z - mk.z);
      const align = mk.ux * tg.x + mk.uz * tg.z; // 应 ≈ +1（指向行进方向）
      // 归属：到某段入口 t0 的后方弧长
      let dEntry = null;
      for (const s of secs) {
        const back = ((s.t0 - best) % 1 + 1) % 1 * L;
        if (back < 40 || L - back < 2) dEntry = dEntry === null ? back : Math.min(dEntry, back);
      }
      return { t: best, lateral, y: mk.y, surfY: pt.y, align, dEntry };
    });
    return { marks: marks.length, secs: secs.length, L, rw, checks };
  });

  const n = track;
  if (n === 'classic') {
    ok(info.marks === 0 && info.secs === 0, `classic 零发夹段零箭头（marks=${info.marks}）`);
  } else {
    ok(info.secs >= 1 && info.marks === info.secs * 3, `${n} 箭头数=发夹段×3（${info.marks}=${info.secs}×3）`);
    for (const c of info.checks) {
      ok(c.lateral < info.rw, `${n} 箭头在路面内 lateral=${c.lateral.toFixed(2)}<${info.rw}`);
      ok(Math.abs(c.y - (c.surfY + 0.07)) < 0.01, `${n} 箭头贴地 y=${c.y.toFixed(2)}=surf+0.07`);
      ok(c.align > 0.95, `${n} 箭头指向行进方向 cos=${c.align.toFixed(3)}`);
      const near = [6, 12, 18].some((d) => Math.abs(c.dEntry - d) < 0.5);
      ok(near, `${n} 箭头距入口 ${c.dEntry === null ? 'N/A' : c.dEntry.toFixed(1)}m ∈ {6,12,18}±0.5`);
    }
    // 俯视存证：第一个发夹段入口前 30m 区域
    if (info.secs > 0) {
      const shot = await page.evaluate(() => {
        const { track, scene, camera, renderer } = window.__mk;
        const s = track._hairpinRawSections[0];
        const t = ((s.t0 - 12 / track.trackLength) % 1 + 1) % 1;
        const pt = track.spline.getPointAt(t);
        const saved = camera.position.clone();
        camera.position.set(pt.x, 45, pt.z);
        camera.lookAt(pt.x, 0, pt.z);
        camera.fov = 50; camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        camera.position.copy(saved);
        return renderer.domElement.toDataURL('image/png');
      });
      const fs = await import('node:fs');
      const p = `shots/slowmark-p19d-${track}.png`;
      fs.writeFileSync(p, Buffer.from(shot.split(',')[1], 'base64'));
      results.push(`SHOT ${p}`);
    }
  }
  ok(errors.length === 0, `${n} 零 console/page error${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await page.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(fail ? 'RESULT: FAIL' : 'RESULT: ALL PASS');
process.exit(fail);
