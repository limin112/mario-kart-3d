import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8901/';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(BASE + '?track=classic', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 60000 });

// Check banana and isOnRoad/getSurfaceY
const st = await page.evaluate(() => {
  const t = window.__mk.track;
  const sc = t.shortcuts[0];
  const mid = { x: (sc.a.x + sc.b.x) / 2, y: (sc.yA + sc.yB) / 2, z: (sc.a.z + sc.b.z) / 2 };
  const nrm = { x: -sc.dir.z, z: sc.dir.x };
  const far = { x: mid.x + nrm.x * 12, y: mid.y, z: mid.z + nrm.z * 12 };
  const permBananas = window.__mk.playerItemManager.bananas.filter(b => b.lifetime === Infinity);
  return {
    midIsOnRoad: t.isOnRoad({x: mid.x, y: mid.y, z: mid.z, distanceTo: (v) => Math.hypot(mid.x-v.x, mid.y-v.y, mid.z-v.z)}),
    midSurfY: t.getSurfaceY({x: mid.x, y: 0, z: mid.z, distanceTo: (v) => Math.hypot(mid.x-v.x, 0-v.y, mid.z-v.z)}),
    midExpY: mid.y,
    farIsOnRoad: t.isOnRoad({x: far.x, y: far.y, z: far.z, distanceTo: (v) => Math.hypot(far.x-v.x, far.y-v.y, far.z-v.z)}),
    farDistToSpline: t.getClosestPoint({x: far.x, y: far.y, z: far.z, distanceTo: (v) => Math.hypot(far.x-v.x, far.y-v.y, far.z-v.z)}).distance,
    permBananaCount: permBananas.length,
    bananaAtHazard: permBananas.length === 1 ? permBananas[0].position.distanceTo({x: sc.hazardPos.x, y: sc.hazardPos.y, z: sc.hazardPos.z, distanceTo: (v) => Math.hypot(sc.hazardPos.x-v.x, sc.hazardPos.y-v.y, sc.hazardPos.z-v.z)}) : -1,
    shortcutMeshInScene: !!t.shortcutMeshes[0]?.parent,
    shortcutMeshPolyOffset: !!t.shortcutMeshes[0]?.material?.polygonOffset,
    shortcutMeshVertCount: t.shortcutMeshes[0]?.geometry?.attributes?.position?.count,
  };
});

console.log('Shortcut test2 result:', JSON.stringify(st, null, 2));
await browser.close();
