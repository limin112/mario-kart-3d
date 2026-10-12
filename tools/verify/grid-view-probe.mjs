// 临时探针：P16 第二步验收——倒计时期间应为"发车视角"（相机在车尾、看着沥青发车格）
// 做法：cd 文本为 3/2/1 期间用 CDP 抓真实合成帧（避开 WebGL readback 空帧问题），
// 把 PNG 回灌页面解码后分析下半屏：沥青占比高+草地占比低 → 相机在路面上。
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';

const ANALYZE = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const w = 160, h = 100;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, Math.floor(h * 0.45), w, h - Math.floor(h * 0.45)).data;
    let asphalt = 0, grass = 0, red = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      n++;
      if (g > r + 12 && g > b + 12 && g > 70) grass++;
      else if (Math.abs(r - g) < 26 && Math.abs(g - b) < 26 && r < 110) asphalt++;
      if (r > 150 && g < 90 && b < 90) red++;
    }
    resolve({ asphaltPct: +(asphalt / n * 100).toFixed(1), grassPct: +(grass / n * 100).toFixed(1), redPct: +(red / n * 100).toFixed(1) });
  };
  img.onerror = () => resolve(null);
  img.src = dataUrl;
});

const url = process.argv[2] || 'http://127.0.0.1:8901/';
const outPng = process.argv[3] || '/tmp/p16b-grid.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const report = { ok: false, samples: [], errs };
try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  const cdp = await page.context().newCDPSession(page);
  const cdNow = () => page.evaluate(() => {
    const c = document.getElementById('countdown');
    return c && c.style.display !== 'none' ? c.textContent : null;
  });
  // 等倒计时 3/2/1 出现
  let cdText = null;
  for (let i = 0; i < 200; i++) {
    cdText = await cdNow();
    if (cdText && cdText !== 'GO!') break;
    await page.waitForTimeout(150);
  }
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = shot.data;
  writeFileSync(outPng, Buffer.from(b64, 'base64'));
  const px = await page.evaluate(ANALYZE, 'data:image/png;base64,' + b64);
  report.samples.push({ when: 'countdown', cdText, ...(px || {}) });
  // GO 结束后 2s 再抓一帧（比赛视角不回归）
  for (let i = 0; i < 200; i++) {
    if ((await cdNow()) === null) break;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const px2 = await page.evaluate(ANALYZE, 'data:image/png;base64,' + shot2.data);
  report.samples.push({ when: 'afterGo', ...(px2 || {}) });
  const grid = report.samples[0];
  report.ok = !!(grid.cdText && grid.asphaltPct > 25 && grid.grassPct < 25 && errs.length === 0);
} catch (e) {
  report.errs.push('probe exception: ' + String(e).slice(0, 200));
} finally {
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
}
