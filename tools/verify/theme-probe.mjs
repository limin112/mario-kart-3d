#!/usr/bin/env node
/**
 * P14 主题探针：验证 ?theme=classic|desert|snow 三主题真实生效。
 * 方法：headless 加载各主题 → 截图 → 把 PNG 喂回空白页 canvas 解码，
 * 对天空（顶部 1/4）与地面（底部 1/4）做平均色，断言主题间颜色显著不同；
 * 同时断言零 console/page error。（沿用 curb-probe 的浏览器内解码法，本机无 pngjs）
 * 用法：node theme-probe.mjs   （需 8901 已服务 game/）
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'http://127.0.0.1:8901/';
const THEMES = ['classic', 'desert', 'snow'];
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = { ok: false, themes: {}, errors: [] };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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
  for (const th of THEMES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto(`${BASE}?theme=${th}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(9000); // 过 splash/展示，让比赛场景渲染
    const buf = await page.screenshot({ timeout: 60000 }).catch(async () => {
      // 软渲染偶发超时：CDP 直抓兜底
      const cdp = await page.context().newCDPSession(page);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    });
    fs.writeFileSync(`${OUT}/theme-p14-${th}.png`, buf);
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
    const sky = await avgRows(analysisPage, dataUrl, 0.0, 0.25);
    // 地面采样：中段两侧边缘（赛道外草地/沙地/雪原），避开画面中央占据的沥青路面
    const gl_ = await avgRows(analysisPage, dataUrl, 0.60, 0.75, 0.0, 0.12);
    const gr_ = await avgRows(analysisPage, dataUrl, 0.60, 0.75, 0.88, 1.0);
    const ground = [(gl_[0] + gr_[0]) / 2, (gl_[1] + gr_[1]) / 2, (gl_[2] + gr_[2]) / 2].map((v) => +v.toFixed(1));
    report.themes[th] = { sky, ground, errors: errs };
    await page.close();
  }
  await analysisPage.close();
  const s = THEMES.map((t) => report.themes[t].sky);
  const g = THEMES.map((t) => report.themes[t].ground);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (dist(s[i], s[j]) < 25) report.errors.push(`sky ${THEMES[i]} vs ${THEMES[j]} too similar: ${dist(s[i], s[j]).toFixed(1)}`);
    if (dist(g[i], g[j]) < 15) report.errors.push(`ground ${THEMES[i]} vs ${THEMES[j]} too similar: ${dist(g[i], g[j]).toFixed(1)}`);
  }
  for (const t of THEMES) {
    if (report.themes[t].errors.length) report.errors.push(`${t}: ${report.themes[t].errors.join(' | ')}`);
  }
  report.ok = report.errors.length === 0;
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
