// P12 起点拱门专项探针：
// 1) 遍历 startLine.group 所有网格的世界包围盒，换算到赛道坐标（纵向/横向/高度）
// 2) 检查行车走廊（|横向|<=10m、|纵向|<=15m、0<=y<=3m 卡丁车包络）内是否有拱门构件
// 3) 7 秒时截图（发车瞬间视角）供监工复核
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://127.0.0.1:8901/');
await page.waitForTimeout(7000);
await page.screenshot({ path: 'shots/gate-p12-7s.png' });

const res = await page.evaluate(() => {
  const THREEV = window.track.constructor; // just to confirm track exists
  const info = window.track.startLine;
  const pt = info.position.clone();
  const t = info.normal.clone().normalize(); // forward tangent
  const left = pt.clone().set(-t.z, 0, t.x); // left normal (Vector3)
  const group = info.group;
  const boxes = [];
  const corridorHits = [];
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.updateWorldMatrix(true, false);
    const pos = obj.geometry.attributes.position;
    const v = obj.localToWorld(new (pt.constructor)(0, 0, 0));
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      obj.localToWorld(v);
      minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x);
      miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
      minz = Math.min(minz, v.z); maxz = Math.max(maxz, v.z);
    }
    // sample corners -> track coords
    let minLat = Infinity, maxLat = -Infinity, minLong = Infinity, maxLong = -Infinity, minY = miny, maxY = maxy;
    for (const cx of [minx, maxx]) for (const cy of [miny, maxy]) for (const cz of [minz, maxz]) {
      const d = { x: cx - pt.x, y: cy - pt.y, z: cz - pt.z };
      const lon = d.x * t.x + d.z * t.z;
      const lat = d.x * left.x + d.z * left.z;
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLong = Math.min(minLong, lon); maxLong = Math.max(maxLong, lon);
    }
    const rec = {
      name: obj.name || obj.type + '(arch/col/flag/light)',
      lat: [+minLat.toFixed(1), +maxLat.toFixed(1)],
      long: [+minLong.toFixed(1), +maxLong.toFixed(1)],
      y: [+minY.toFixed(1), +maxY.toFixed(1)],
    };
    boxes.push(rec);
    // corridor: |lat|<=10, |long|<=15, y overlap [0.15,3]（忽略贴地标线）
    if (maxLat > -10 && minLat < 10 && maxLong > -15 && minLong < 15 && maxY > 0.15 && minY < 3) {
      corridorHits.push(rec);
    }
  });
  return { boxes, corridorHits };
});

console.log(JSON.stringify({ errors, corridorHits: res.corridorHits, boxCount: res.boxes.length }, null, 1));
await browser.close();
process.exit(res.corridorHits.length === 0 && errors.length === 0 ? 0 : 1);
