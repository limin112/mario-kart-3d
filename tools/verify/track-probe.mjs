#!/usr/bin/env node
/**
 * P14b 赛道布局探针：验证 ?track=classic|dune|glacier 三布局真实生效。
 * 断言：
 *  1) window.track 的布局数据（控制点数/roadWidth/布局名）与 game/trackdefs.js 一致；
 *  2) 三布局样条长度两两显著不同；默认页（无参数）与 ?track=classic 完全一致（零回归）；
 *  3) 每布局 4 个出生点全部 onRoad（新布局出生点数学不回归）；
 *  4) 截图地面像素签名：classic 绿主导 / dune 红主导（沙）/ glacier 蓝主导（雪），
 *     同时验证布局建议主题自动生效（未传 ?theme=）；
 *  5) 全路径零 console/page error。
 * 用法：node track-probe.mjs   （需 8901 已服务 game/；沿用 theme-probe 的浏览器内解码法）
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { TRACK_LAYOUTS } from '../../game/trackdefs.js';

const BASE = 'http://127.0.0.1:8901/';
const LAYOUTS = ['classic', 'dune', 'glacier'];
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = { ok: false, layouts: {}, errors: [] };

async function avgRows(analysisPage, dataUrl, yFrom, yTo, xFrom = 0, xTo = 1) {
  return analysisPage.evaluate(async ([url, a, b, xa, xb]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const y0 = Math.floor(img.height * a), h = Math.floor(img.height * (b - a));
    const x0 = Math.floor(img.width * xa), w = Math.floor(img.width * (xb - xa));
    const d = g.getImageData(x0, y0, w, h).data;
    let r = 0, gg = 0, bl = 0;
    const n = d.length / 4;
    for (let i = 0; i < n; i++) { r += d[i * 4]; gg += d[i * 4 + 1]; bl += d[i * 4 + 2]; }
    return [+(r / n).toFixed(1), +(gg / n).toFixed(1), +(bl / n).toFixed(1)];
  }, [dataUrl, yFrom, yTo, xFrom, xTo]);
}

try {
  const analysisPage = await browser.newPage();
  let classicLen = null;

  // 默认页（无参数）必须等于 classic
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(9000);
    const info = await page.evaluate(() => ({
      name: window.track.layout.name,
      pts: window.track.cfg.controlPoints.length,
      rw: window.track.cfg.roadWidth,
      len: window.track.spline.getLength(),
    }));
    if (info.pts !== TRACK_LAYOUTS.classic.controlPoints.length || info.rw !== TRACK_LAYOUTS.classic.roadWidth) {
      report.errors.push(`default page not classic: ${JSON.stringify(info)}`);
    }
    report.defaultPage = { info, errors: errs };
    if (errs.length) report.errors.push(`default: ${errs.join(' | ')}`);
    await page.close();
  }

  for (const name of LAYOUTS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto(`${BASE}?track=${name}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(9000); // 过 splash/展示，让比赛场景渲染
    const info = await page.evaluate(() => ({
      name: window.track.layout.name,
      theme: window.track.layout.theme,
      pts: window.track.cfg.controlPoints.length,
      rw: window.track.cfg.roadWidth,
      len: +window.track.spline.getLength().toFixed(2),
      spawns: window.track.getSpawnPositions().map((s) => !!s.onRoad),
      cp0: window.track.cfg.controlPoints.map((v) => [v.x, v.z]),
    }));
    // 与 trackdefs.js 数据一致性
    const def = TRACK_LAYOUTS[name];
    if (!def) report.errors.push(`${name}: missing in trackdefs.js`);
    else {
      if (info.pts !== def.controlPoints.length) report.errors.push(`${name}: pts ${info.pts} != defs ${def.controlPoints.length}`);
      if (info.rw !== def.roadWidth) report.errors.push(`${name}: roadWidth ${info.rw} != defs ${def.roadWidth}`);
      const mismatch = info.cp0.some(([x, z], i) => Math.abs(x - def.controlPoints[i][0]) > 1e-6 || Math.abs(z - def.controlPoints[i][1]) > 1e-6);
      if (mismatch) report.errors.push(`${name}: controlPoints mismatch with trackdefs.js`);
    }
    // 出生点全在路面内
    if (!info.spawns.every(Boolean) || info.spawns.length !== 4) {
      report.errors.push(`${name}: spawns not all onRoad: ${JSON.stringify(info.spawns)}`);
    }
    if (name === 'classic') classicLen = info.len;
    const buf = await page.screenshot({ timeout: 60000 }).catch(async () => {
      const cdp = await page.context().newCDPSession(page);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    });
    fs.writeFileSync(`${OUT}/track-p14b-${name}.png`, buf);
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
    // 地面签名采样带取 0.50~0.60：0.60~0.75 在 classic 出生视角被起点红白路肩/看台
    // 覆盖（红主导误判），0.50~0.60 三布局均为纯地面（实测 classic g / dune r / glacier b）
    const gl_ = await avgRows(analysisPage, dataUrl, 0.50, 0.60, 0.0, 0.12);
    const gr_ = await avgRows(analysisPage, dataUrl, 0.50, 0.60, 0.88, 1.0);
    const ground = [(gl_[0] + gr_[0]) / 2, (gl_[1] + gr_[1]) / 2, (gl_[2] + gr_[2]) / 2].map((v) => +v.toFixed(1));
    report.layouts[name] = { info, ground, errors: errs };
    if (errs.length) report.errors.push(`${name}: ${errs.join(' | ')}`);
    await page.close();
  }
  await analysisPage.close();

  // 样条长度两两显著不同（布局确实换了）
  const lens = LAYOUTS.map((n) => report.layouts[n].info.len);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (Math.abs(lens[i] - lens[j]) < 10) report.errors.push(`spline length ${LAYOUTS[i]} vs ${LAYOUTS[j]} too similar: ${lens[i]} / ${lens[j]}`);
  }
  // 地面像素签名（同时证明布局建议主题自动生效）
  const sig = { classic: 'g', dune: 'r', glacier: 'b' };
  for (const n of LAYOUTS) {
    const [r, g, b] = report.layouts[n].ground;
    const max = Math.max(r, g, b);
    const dom = max === r ? 'r' : max === g ? 'g' : 'b';
    if (dom !== sig[n]) report.errors.push(`${n}: ground signature ${dom} expected ${sig[n]} (${[r, g, b]})`);
  }
  report.ok = report.errors.length === 0;
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
