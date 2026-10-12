// P19c 上下坡缓坡探针：三布局高程生效、出生点 onRoad 且 y 跟路面、平面路径零回归
// 用法: node elevation-probe.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
import { chromium } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = path.join(ROOT, 'shots');

// P19c 之前（纯平面）实测样条长度，用于断言 x/z 路径未变（坡度只增加 <1% 弧长）
const FLAT_LEN = { classic: 359.7, dune: 472.8, glacier: 514.2 };
// trackdefs.js elevation 数组（负值钳 0 后的期望最大值）
const ELEV = {
  classic: [0, 0, 0.8, 1.6, 1.0, 0.2, 0, 0.4, 0.9],
  dune: [0, 0.3, 0.9, 1.6, 0.8, 2.2, 1.4, 0.4, 0, 0.1, 0.4],
  glacier: [0, 1.1, 2.2, 1.2, 0.2, 0, 0.6, 1.8, 3.0, 2.1, 1.0, 0.4],
};

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const layout of ['classic', 'dune', 'glacier']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(BASE + '?track=' + layout, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const t = window.__mk.track;
    const N = 200;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i <= N; i++) {
      const y = t.spline.getPointAt(i / N).y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // 路面 mesh 顶点 y 范围
    const pos = t.roadMesh.geometry.attributes.position;
    let rMinY = Infinity, rMaxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < rMinY) rMinY = y;
      if (y > rMaxY) rMaxY = y;
    }
    const spawns = t.getSpawnPositions();
    return {
      length: t.getLength(),
      minY, maxY, rMinY, rMaxY,
      spawns: spawns.map(s => ({ x: s.position.x, y: s.position.y, z: s.position.z, onRoad: s.onRoad, u: s.u })),
      // 出生点自身 u 处的样条 y（getSpawnPosition 就是拿这个 +0.5 的）
      splineYAtSpawnU: spawns.map(s => t.spline.getPointAt(s.u).y),
    };
  });

  const BIAS = 0.15; // track.js 过冲保护偏置
  const expMax = Math.max(...ELEV[layout]) + BIAS;
  check(`[${layout}] 零 console/page error`, errors.length === 0, errors.slice(0, 3).join(' ; '));
  check(`[${layout}] 样条高程生效 (maxY≈${expMax})`, Math.abs(info.maxY - expMax) < 0.35, `minY=${info.minY.toFixed(2)} maxY=${info.maxY.toFixed(2)}`);
  check(`[${layout}] 路面不低于地面平面（过冲保护）`, info.minY >= 0, `minY=${info.minY.toFixed(3)}`);
  check(`[${layout}] 路面 mesh y 跟高程`, info.rMinY >= 0 && Math.abs(info.rMaxY - (expMax + 0.01)) < 0.35, `road y=[${info.rMinY.toFixed(2)},${info.rMaxY.toFixed(2)}]`);
  const lenDrift = Math.abs(info.length - FLAT_LEN[layout]) / FLAT_LEN[layout];
  check(`[${layout}] 平面路径零回归（弧长漂移<2%）`, lenDrift < 0.02, `len=${info.length.toFixed(1)} flat=${FLAT_LEN[layout]} drift=${(lenDrift * 100).toFixed(2)}%`);
  check(`[${layout}] 4 出生点全部 onRoad`, info.spawns.every(s => s.onRoad), JSON.stringify(info.spawns.map(s => s.onRoad)));
  check(`[${layout}] 出生点 y 跟路面（=样条y@u+0.5）`, info.spawns.every((s, i) => Math.abs(s.y - (info.splineYAtSpawnU[i] + 0.5)) < 0.01), JSON.stringify(info.spawns.map(s => +s.y.toFixed(2))));

  if (layout !== 'classic') {
    // headless 软渲染下 page.screenshot 偶发 30s 超时（环境问题），CDP 直抓兑底，失败不致命
    const shotPath = path.join(SHOTS, `elevation-p19c-${layout}.png`);
    try {
      const cdp = await page.context().newCDPSession(page);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await import('fs').then(fs => fs.writeFileSync(shotPath, Buffer.from(data, 'base64')));
    } catch (e) {
      console.log(`WARN 截图失败(${layout}): ${e.message}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(JSON.stringify({ ok: failures === 0, failures }));
process.exit(failures === 0 ? 0 : 1);
