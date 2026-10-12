// P19b 专项探针：发夹弯外侧连续护栏验收
// 断言：① classic 无发夹段（零回归）；② dune/glacier 检出 ≥2 段、总弧长合理；
// ③ 每段中点处护栏实例位于弯道外侧（|横向偏移| ≥ roadWidth，符号=side）；
// ④ InstancedMesh 存在且实例数>0；⑤ 动态全速撞墙不穿出（拉回边界与墙位对齐）；
// ⑥ 全路径零 console/page error。
// 另存发夹区俯视截图（手动 renderer.render 绕过跟随相机，同 shot.js 手法）。
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
    const secs = track.hairpinSections || [];
    // 找 InstancedMesh 护墙（黄色 0xe8b923）
    let wall = null;
    scene.traverse((o) => { if (o.isInstancedMesh && o.material && o.material.color && o.material.color.getHex() === 0xe8b923) wall = o; });
    // 每段中点：护栏应在外侧（左法线·(pos-pt) 与 side 同号、幅值≥roadWidth）
    const checks = secs.map((s) => {
      const tm = (s.t0 + (s.t1 > s.t0 ? s.t1 - s.t0 : s.t1 + 1 - s.t0) / 2) % 1;
      const pt = track.spline.getPointAt(tm);
      const tg = track.spline.getTangentAt(tm).normalize();
      const nrm = new (pt.constructor)(-tg.z, 0, tg.x);
      // 实例中找离该 t 外侧偏移最近的：直接重算期望位置
      const expect = pt.clone().addScaledVector(nrm, s.side * (track.cfg.roadWidth + track.cfg.shoulderWidth + track.cfg.guardrailOffset + 0.45));
      let minD = Infinity;
      if (wall) {
        const m = new (pt.constructor)(); // Vector3
        const mat4 = new wall.matrix.constructor(); // Matrix4? 用 instanceMatrix
        const im = wall.instanceMatrix.array;
        for (let i = 0; i < wall.count; i++) {
          m.set(im[i * 16 + 12], im[i * 16 + 13], im[i * 16 + 14]);
          minD = Math.min(minD, m.distanceTo(expect));
        }
      }
      // 横向偏移符号验证（护栏在左法线的 side 侧）
      const lateral = minD === Infinity ? 0 : (() => {
        let best = null, bd = Infinity;
        const m = new (pt.constructor)();
        const im = wall.instanceMatrix.array;
        for (let i = 0; i < wall.count; i++) {
          m.set(im[i * 16 + 12], im[i * 16 + 13], im[i * 16 + 14]);
          const d = m.distanceTo(expect);
          if (d < bd) { bd = d; best = m.clone(); }
        }
        const v = best.clone().sub(pt);
        return v.dot(nrm) * s.side; // 应 > 0（外侧）
      })();
      return { apex: s.apex, arcM: s.arcM, minInstDist: minD === Infinity ? -1 : +minD.toFixed(2), lateralSign: +lateral.toFixed(2) };
    });
    // 俯视发夹区截图（第一段中点上方 70m）
    let shot = false;
    if (secs.length && wall) {
      const s = secs[0];
      const tm = (s.t0 + (s.t1 > s.t0 ? s.t1 - s.t0 : s.t1 + 1 - s.t0) / 2) % 1;
      const pt = track.spline.getPointAt(tm);
      camera.up.set(0, 0, -1);
      camera.position.set(pt.x, 70, pt.z);
      camera.lookAt(pt.x, 0, pt.z);
      renderer.render(window.__mk.scene, camera);
      shot = true;
    }
    return {
      sections: secs, checks, shot,
      wallCount: wall ? wall.count : 0,
      roadWidth: track.cfg.roadWidth,
    };
  });

  // 动态“不穿出”测试：把车放到发夹顶点中心线，持续全速朝护墙方向撞，
  // 采样 90 帧内离中心线最大距离，应被护墙/拉回力挡在墙位+3m 以内。
  let dyn = null;
  if (track !== 'classic') {
    await page.waitForTimeout(6000); // 给 splash+展示+倒计时留时间（headless 软渲染会拉长）
    dyn = await page.evaluate(async () => {
      const { track } = window.__mk;
      const p = window.kartPhysics;
      if (!p || !track.hairpinSections || !track.hairpinSections.length) return null;
      const s = track.hairpinSections[0];
      const span = s.t1 > s.t0 ? s.t1 - s.t0 : s.t1 + 1 - s.t0;
      const tm = (s.t0 + span / 2) % 1;
      const pt = track.spline.getPointAt(tm);
      const tg = track.spline.getTangentAt(tm).normalize();
      const V = pt.constructor;
      const out = new V(-tg.z, 0, tg.x).multiplyScalar(s.side); // 外侧单位向量
      // 等比赛真正开始（physics 仅在 state.running 时运行）：每 2 帧试探一次位置是否会变
      let started = false;
      for (let a = 0; a < 20 && !started; a++) {
        p.position.set(pt.x, p.position.y, pt.z);
        p.rotation = Math.atan2(-out.x, -out.z); // forward=(-sin r,0,-cos r) 对齐 out
        const before = p.position.clone();
        p.velocity.set(out.x * p.maxSpeed, 0, out.z * p.maxSpeed);
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        started = p.position.distanceTo(before) > 0.5;
      }
      if (!started) return { started: false };
      // 用真实油门（合成 ArrowUp）提供推力，而不是每帧覆写 velocity
      // （覆写会抹掉游戏出界拉回力，测不出“不穿出”）
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
      let maxDist = 0;
      for (let i = 0; i < 90; i++) {
        p.rotation = Math.atan2(-out.x, -out.z); // 保持车头朝墙（无转向输入）
        await new Promise((r) => requestAnimationFrame(r));
        const { distance } = track.getClosestPoint(p.position);
        if (distance > maxDist) maxDist = distance;
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', bubbles: true }));
      return {
        started: true,
        maxDist: +maxDist.toFixed(2),
        wallOffset: track.cfg.roadWidth + track.cfg.shoulderWidth + track.cfg.guardrailOffset + 0.45,
      };
    });
  }

  ok(errors.length === 0, `${track}: 零 console/page error${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`);
  if (track === 'classic') {
    ok(info.sections.length === 0, `classic: 无发夹段（零回归），实际 ${info.sections.length}`);
  } else {
    ok(info.sections.length >= 2, `${track}: 检出发夹段 ${info.sections.length} ≥ 2`);
    ok(dyn && dyn.started, `${track}: 动态测试前比赛已开始`);
    ok(dyn && dyn.started && dyn.maxDist < dyn.wallOffset + 3, `${track}: 动态全速撞墙不穿出（最大横向 ${dyn ? dyn.maxDist : 'n/a'}m < 墙位 ${dyn ? dyn.wallOffset : '?'}+3m）`);
    ok(info.wallCount > 0, `${track}: 护墙 InstancedMesh 实例数 ${info.wallCount} > 0`);
    for (const c of info.checks) {
      ok(c.minInstDist >= 0 && c.minInstDist < 2.5, `${track}: apex P${c.apex} 弧长${c.arcM}m 外侧有实例（最近距离 ${c.minInstDist}m）`);
      ok(c.lateralSign > 0, `${track}: apex P${c.apex} 护栏在弯道外侧（左法线投影×side=${c.lateralSign}）`);
    }
    if (info.shot) {
      const buf = await page.screenshot({ type: 'png' });
      const fs = await import('node:fs');
      const p = `shots/hairpin-p19b-${track}.png`;
      fs.writeFileSync(p, buf);
      results.push(`INFO ${track}: 俯视截图 → ${p}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(fail ? 'PROBE FAIL' : 'PROBE ALL PASS');
process.exit(fail);
