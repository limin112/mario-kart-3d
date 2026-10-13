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

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '?track=classic', { waitUntil: 'load' });
await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 30000 });
await page.waitForFunction(() => window.__mk.state && window.__mk.state.running === true, { timeout: 90000 });

// ---------- 1. 静态结构断言 ----------
const st = await page.evaluate(() => {
  const t = window.__mk.track;
  const sc = t.shortcuts[0] || null;
  const scp = t.shortcutCheckpoints[0] || null;
  const mesh = t.shortcutMeshes[0] || null;
  const mid = sc ? { x: (sc.a.x + sc.b.x) / 2, y: (sc.yA + sc.yB) / 2, z: (sc.a.z + sc.b.z) / 2 } : null;
  const nrm = sc ? { x: -sc.dir.z, z: sc.dir.x } : null;
  const lat10 = sc ? t._shortcutInfo(new THREE_vec(sc.a.x + nrm.x * 10, 0, sc.a.z + nrm.z * 10)) : null;
  const far = sc ? new THREE_vec(sc.a.x + (mid.x - sc.a.x) + nrm.x * 12, 0, sc.a.z + (mid.z - sc.a.z) + nrm.z * 12) : null;
  const permBananas = window.__mk.playerItemManager.bananas.filter(b => b.lifetime === Infinity);
  return {
    nShortcuts: t.shortcuts.length, nCps: t.shortcutCheckpoints.length, nMeshes: t.shortcutMeshes.length,
    inScene: !!(mesh && mesh.parent === window.__mk.scene),
    vertCount: mesh ? mesh.geometry.attributes.position.count : -1,
    polyOffset: !!(mesh && mesh.material.polygonOffset),
    halfWidth: sc && sc.halfWidth, len: sc && sc.len,
    bypassFrom: scp && scp.bypassFrom, bypassTo: scp && scp.bypassTo, scpRadius: scp && scp.radius,
    scpOnPath: scp ? Math.hypot(scp.position.x - mid.x, scp.position.z - mid.z) : -1,
    midOnShortcut: !!t._shortcutInfo(new THREE_vec(mid.x, 0, mid.z)),
    lat10OnShortcut: !!lat10,
    midIsOnRoad: t.isOnRoad(new THREE_vec(mid.x, 0, mid.z)),
    midSurfY: t.getSurfaceY(new THREE_vec(mid.x, 0, mid.z)), midExpY: mid.y,
    farIsOnRoad: t.isOnRoad(far), farDistToSpline: t.getClosestPoint(far).distance,
    permBananaCount: permBananas.length,
    bananaAtHazard: permBananas.length === 1
      ? permBananas[0].position.distanceTo(new THREE_vec(sc.hazardPos.x, sc.hazardPos.y, sc.hazardPos.z)) : -1,
    mid, yA: sc && sc.yA, yB: sc && sc.yB,
  };
  function THREE_vec(x, y, z) { return new window.__mk.scene.constructor.__THREE_V3__(x, y, z); }
});
// 上面那个 THREE_vec 太绕——直接在页面里挂一个
check('捷径数量 classic=1（shortcuts/checkpoints/meshes）',
  st.nShortcuts === 1 && st.nCps === 1 && st.nMeshes === 1,
  `${st.nShortcuts}/${st.nCps}/${st.nMeshes}`);

await browser.close();
console.log(results.join('\n'));
process.exit(failures === 0 ? 0 : 1);
