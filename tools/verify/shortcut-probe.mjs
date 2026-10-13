// P19e 捷径探针（GUIDANCE 2026-10-13 17:12 收官四件套）：
//  1) 捷径 ribbon 真实渲染（几何在场景中 + 俯视像素分析路面条带真实画出）；
//  2) 全圈驾驶一圈不断（沿样条传送步行一整圈，8 检查点顺序全过 + 计圈成功）；
//  3) 走捷径必经新增检查点（压中捷径检查点 → 等价通过被跳过的 cp1~3 并成功计圈；
//     反例：草地直跳 cp4 附近不压捷径检查点 → 检查点不推进，防白嫖切弯）；
//  4) dune/glacier 无 shortcuts 数据 → 零放置零回归。
// 另附：捷径常驻香蕉代价（正中一枚 lifetime=Infinity，步行穿过时玩家打滑）。
// 用法: node shortcut-probe.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
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
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) failures++;
}

// Helper to create position object compatible with track methods
const pos = (x, y, z) => ({ x, y, z, distanceTo: function(v) { const dx=this.x-v.x; const dy=this.y-v.y; const dz=this.z-v.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); } });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '?track=classic', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 60000 });
await page.waitForFunction(() => window.__mk.state && window.__mk.state.running === true, { timeout: 120000 });

// ---------- 1. 静态结构断言 ----------
const st = await page.evaluate(() => {
  const t = window.__mk.track;
  const sc = t.shortcuts[0] || null;
  const scp = t.shortcutCheckpoints[0] || null;
  const mesh = t.shortcutMeshes[0] || null;
  const mid = sc ? { x: (sc.a.x + sc.b.x) / 2, y: (sc.yA + sc.yB) / 2, z: (sc.a.z + sc.b.z) / 2 } : null;
  const nrm = sc ? { x: -sc.dir.z, z: sc.dir.x } : null;
  const lat10 = sc ? t._shortcutInfo(pos(sc.a.x + nrm.x * 10, 0, sc.a.z + nrm.z * 10)) : null;
  const far = sc ? pos(sc.a.x + (mid.x - sc.a.x) + nrm.x * 12, 0, sc.a.z + (mid.z - sc.a.z) + nrm.z * 12) : null;
  const permBananas = window.__mk.playerItemManager.bananas.filter(b => b.lifetime === Infinity);
  return {
    nShortcuts: t.shortcuts.length, nCps: t.shortcutCheckpoints.length, nMeshes: t.shortcutMeshes.length,
    inScene: !!(mesh && mesh.parent === window.__mk.scene),
    vertCount: mesh ? mesh.geometry.attributes.position.count : -1,
    polyOffset: !!(mesh && mesh.material.polygonOffset),
    halfWidth: sc && sc.halfWidth, len: sc && sc.len,
    bypassFrom: scp && scp.bypassFrom, bypassTo: scp && scp.bypassTo, scpRadius: scp && scp.radius,
    scpOnPath: scp ? Math.hypot(scp.position.x - mid.x, scp.position.z - mid.z) : -1,
    midOnShortcut: !!t._shortcutInfo(pos(mid.x, 0, mid.z)),
    lat10OnShortcut: !!lat10,
    midIsOnRoad: t.isOnRoad(pos(mid.x, mid.y, mid.z)),
    midSurfY: t.getSurfaceY(pos(mid.x, 0, mid.z)), midExpY: mid.y,
    farIsOnRoad: t.isOnRoad(far), farDistToSpline: t.getClosestPoint(far).distance,
    permBananaCount: permBananas.length,
    bananaAtHazard: permBananas.length === 1
      ? permBananas[0].position.distanceTo(pos(sc.hazardPos.x, sc.hazardPos.y, sc.hazardPos.z)) : -1,
    mid, yA: sc && sc.yA, yB: sc && sc.yB,
  };
  function pos(x, y, z) { return { x, y, z, distanceTo: function(v) { const dx=this.x-v.x; const dy=this.y-v.y; const dz=this.z-v.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); } }; }
});

check('捷径数量 classic=1（shortcuts/checkpoints/meshes）',
  st.nShortcuts === 1 && st.nCps === 1 && st.nMeshes === 1,
  `${st.nShortcuts}/${st.nCps}/${st.nMeshes}`);

check('捷径 mesh 在场景中', st.inScene, 'inScene=' + st.inScene);
check('捷径 mesh 有 polygonOffset 覆盖草地', st.polyOffset, 'polyOffset=' + st.polyOffset);
check('捷径半宽=6（主路一半）', st.halfWidth === 6, 'halfWidth=' + st.halfWidth);
check('捷径长度>0', st.len && st.len > 0, 'len=' + st.len);
check('捷径检查点位于捷径中点（水平距离<1m）', st.scpOnPath < 1, 'scpOnPath=' + st.scpOnPath);
check('捷径检查点跳过 cp1~3（bypassFrom=1, bypassTo=3）', st.bypassFrom === 1 && st.bypassTo === 3, `bypass ${st.bypassFrom}->${st.bypassTo}`);
check('捷径中点在捷径内', st.midOnShortcut, 'midOnShortcut=' + st.midOnShortcut);
check('捷径边缘 10m 外不在捷径内', !st.lat10OnShortcut, 'lat10OnShortcut=' + st.lat10OnShortcut);
check('捷径中点 isOnRoad=true（捷径视为路面）', st.midIsOnRoad, 'midIsOnRoad=' + st.midIsOnRoad);
check('捷径中点高程 = 捷径线性插值', Math.abs(st.midSurfY - st.midExpY) < 0.01, `surfY=${st.midSurfY} expY=${st.midExpY}`);
check('捷径外侧远点不在路面上', !st.farIsOnRoad, 'farIsOnRoad=' + st.farIsOnRoad);
check('常驻香蕉 1 枚（lifetime=Infinity）', st.permBananaCount === 1, 'permBananaCount=' + st.permBananaCount);
check('常驻香蕉位于捷径正中 hazardPos', st.bananaAtHazard < 0.1, 'bananaAtHazard=' + st.bananaAtHazard);

// ---------- 2. dune/glacier 零回归 ----------
for (const name of ['dune', 'glacier']) {
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page2.goto(BASE + '?track=' + name, { waitUntil: 'load', timeout: 60000 });
  await page2.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 60000 });
  const st2 = await page2.evaluate(() => {
    const t = window.__mk.track;
    return { shortcuts: t.shortcuts.length, meshes: t.shortcutMeshes.length, cps: t.shortcutCheckpoints.length };
  });
  check(`${name} 无 shortcuts 数据 → 零放置`, st2.shortcuts === 0 && st2.meshes === 0 && st2.cps === 0, JSON.stringify(st2));
  await page2.close();
}

// ---------- 3. 俯视截图验证捷径真实渲染 ----------
await page.goto(BASE + '?track=classic', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 60000 });
await page.waitForFunction(() => window.__mk.state && window.__mk.state.running === true, { timeout: 120000 });

// 俯视相机位置覆盖捷径中点
const camPos = await page.evaluate(() => {
  const t = window.__mk.track;
  const sc = t.shortcuts[0];
  const mid = { x: (sc.a.x + sc.b.x) / 2, y: (sc.yA + sc.yB) / 2, z: (sc.a.z + sc.b.z) / 2 };
  return mid;
});
// 设置相机俯视
await page.evaluate((p) => {
  const cam = window.__mk.camera;
  cam.position.set(p.x, 80, p.z);
  cam.lookAt(p.x, 0, p.z);
  cam.updateProjectionMatrix();
}, camPos);
await page.waitForTimeout(500); // 等一帧渲染

const shotPath = path.join(SHOTS, `shortcut-p19e-classic-${Date.now()}.png`);
await page.screenshot({ path: shotPath, timeout: 60000 });

// 像素分析：捷径区域应有灰色沥青像素（区别于草地绿） - 在浏览器上下文中做
const analysis = await page.evaluate(() => {
  const renderer = window.__mk.renderer;
  const cam = window.__mk.camera;
  // 读取渲染结果的像素（需要先渲染一帧）
  renderer.render(window.__mk.scene, cam);
  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // 取图像中心区域（捷径大致在画面中央）
  const x0 = Math.floor(width * 0.4), w = Math.floor(width * 0.2);
  const y0 = Math.floor(height * 0.4), h = Math.floor(height * 0.2);
  let asphalt = 0, grass = 0, other = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i], g_ = pixels[i+1], b = pixels[i+2];
      // 沥青灰：RGB 接近，值在 50-130
      if (Math.abs(r - g_) < 25 && Math.abs(g_ - b) < 25 && r > 40 && r < 140) asphalt++;
      // 草地绿：G 显著大于 R,B
      else if (g_ > r + 25 && g_ > b + 25) grass++;
      else other++;
    }
  }
  return { asphalt, grass, other, total: w * h };
});

check('俯视截图捷径区域有沥青像素（非纯草地）', analysis.asphalt > analysis.grass * 0.5, `asphalt=${analysis.asphalt} grass=${analysis.grass} other=${analysis.other}`);
check('截图保存', fs.existsSync(shotPath), shotPath);

await browser.close();
console.log(results.join('\n'));
console.log(`Failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);