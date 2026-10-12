#!/usr/bin/env node
/**
 * 白色半透明方块定位探针（babysit 2026-10-12 11:20 视觉回退）：
 * 现象：比赛视角画面中央一块白色半透明矩形，相机移动它在屏幕上位置/大小几乎不变。
 * 做法：
 *  1) 加载页面等到比赛视角（splash 消失后再等 14s），截全图 A；
 *  2) 遍历 window.__mk.scene，列出所有 transparent 且投影落在屏幕中心区的前向对象——嫌疑名单；
 *  3) 粒子池体检：InstancedMesh.count 前 n 个实例里是否混着"单位矩阵"（未激活实例被画出的经典 bug）；
 *  4) 二分：隐藏粒子池 → 截图 B，中心区像素差 >5% 即锁定粒子池。
 * 用法：node white-rect-probe.mjs <url> [outPrefix=/tmp/wr]
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const url = process.argv[2] || 'http://127.0.0.1:8901/';
const prefix = process.argv[3] || '/tmp/wr';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
// 软渲染下 page.screenshot 偶发 30s 超时（GUIDANCE 17:25②），改用 CDP 直抓
const cdp = await ctx.newCDPSession(page);
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path, Buffer.from(data, 'base64'));
};
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('hud') && !document.getElementById('splashOverlay'),
  null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(14000);
await shot(`${prefix}-a.png`);

// 嫌疑名单：transparent 对象投影到屏幕中心区
const suspects = await page.evaluate(() => {
  const { scene, camera } = window.__mk;
  const W = innerWidth, H = innerHeight;
  const out = [];
  scene.traverse(obj => {
    let p = obj, vis = true;
    while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    if (!vis) return;
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    if (!mats.length || !mats.some(m => m.transparent)) return;
    const wp = camera.position.clone();
    obj.getWorldPosition(wp);
    const ndc = wp.clone().project(camera);
    if (ndc.z > 1 || ndc.z < -1) return;
    const sx = (ndc.x * 0.5 + 0.5) * W, sy = (-ndc.y * 0.5 + 0.5) * H;
    if (Math.abs(sx - 640) > 320 || Math.abs(sy - 300) > 280) return;
    out.push({
      type: obj.type, name: obj.name || '',
      geo: obj.geometry ? obj.geometry.type : undefined,
      geoParams: obj.geometry && obj.geometry.parameters ? JSON.stringify(obj.geometry.parameters).slice(0, 90) : undefined,
      userData: JSON.stringify(obj.userData || {}).slice(0, 80),
      parents: (() => { const a = []; let q = obj.parent; while (q && a.length < 5) { a.push(q.type + (q === scene ? '(scene)' : '')); q = q.parent; } return a.join('<'); })(),
      instanced: !!obj.isInstancedMesh,
      count: obj.isInstancedMesh ? obj.count : undefined,
      renderOrder: obj.renderOrder,
      depthTest: mats[0].depthTest,
      opacity: +Number(mats[0].opacity ?? 1).toFixed(2),
      color: mats[0].color ? '#' + mats[0].color.getHexString() : undefined,
      map: mats[0].map ? 'yes' : 'no',
      world: [+wp.x.toFixed(1), +wp.y.toFixed(1), +wp.z.toFixed(1)],
      screen: [Math.round(sx), Math.round(sy)],
      dist: +wp.distanceTo(camera.position).toFixed(1),
      scale: [obj.scale.x, obj.scale.y, obj.scale.z].map(n => +n.toFixed(2)),
    });
  });
  return out;
});

// 粒子池体检：被 draw 的实例里是否含单位矩阵（= 从未激活过的实例被 mesh.count 拉出来画在 mesh 原点）
const poolInfo = await page.evaluate(() => {
  const ps = window.__mk.particleSystem;
  const res = {};
  for (const [name, pool] of Object.entries(ps.pools)) {
    const m = pool.mesh;
    const arr = m.instanceMatrix.array;
    let identity = 0;
    for (let i = 0; i < m.count; i++) {
      const o = i * 16;
      if (Math.abs(arr[o] - 1) < 1e-6 && Math.abs(arr[o + 5] - 1) < 1e-6 &&
          Math.abs(arr[o + 10] - 1) < 1e-6 && Math.abs(arr[o + 15] - 1) < 1e-6 &&
          Math.abs(arr[o + 12]) < 1e-3 && Math.abs(arr[o + 13]) < 1e-3 && Math.abs(arr[o + 14]) < 1e-3) identity++;
    }
    res[name] = { visible: m.visible, count: m.count, max: pool.instances.length,
      active: pool.instances.filter(x => x.active).length, identityDrawn: identity };
  }
  return res;
});

const ctxInfo = await page.evaluate(() => {
  const { camera, playerKart } = window.__mk;
  const sl = window.track.startLine;
  return {
    camera: camera.position.toArray().map(n => +n.toFixed(1)),
    kart: playerKart.position.toArray().map(n => +n.toFixed(1)),
    phys: window.kartPhysics.position.toArray().map(n => +n.toFixed(1)),
    startLine: sl.position.toArray().map(n => +n.toFixed(1)),
  };
});

// 二分：隐藏粒子池再截图
await page.evaluate(() => {
  for (const pool of Object.values(window.__mk.particleSystem.pools)) pool.mesh.visible = false;
});
await page.waitForTimeout(1500);
await shot(`${prefix}-b-noparticles.png`);

// 二分 2：恢复粒子、隐藏起点拱门组（含旗帜/条纹/起跑灯）
await page.evaluate(() => {
  for (const pool of Object.values(window.__mk.particleSystem.pools)) pool.mesh.visible = true;
  window.track.startLine.group.visible = false;
});
await page.waitForTimeout(1500);
await shot(`${prefix}-c-nogate.png`);

// 中心区像素差（在浏览器里解码 PNG，本机无 pngjs）
const b64 = (f) => fs.readFileSync(f).toString('base64');
const bufA = b64(`${prefix}-a.png`);
const bufB = b64(`${prefix}-b-noparticles.png`);
const bufC = b64(`${prefix}-c-nogate.png`);
const diffCenter = (a, b) => page.evaluate(async ([a, b]) => {
  const load = (d) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = 'data:image/png;base64,' + d; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(ia, 0, 0); const da = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(ib, 0, 0); const db = ctx.getImageData(0, 0, c.width, c.height).data;
  let diff = 0, tot = 0;
  for (let y = 100; y < 460; y += 2) for (let x = 480; x < 800; x += 2) {
    const i = (y * c.width + x) * 4;
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    if (d > 30) diff++; tot++;
  }
  return +(diff / tot * 100).toFixed(1);
}, [a, b]);
const diffParticles = await diffCenter(bufA, bufB);
const diffGate = await diffCenter(bufA, bufC);

console.log(JSON.stringify({ errors, ctxInfo, poolInfo, diffParticles_pct: diffParticles, diffGate_pct: diffGate, suspects }, null, 1));
await browser.close();
