// 诊断：同一浏览器连续两次加载，isSplashFinished 各自耗时
import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:8901/';
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (let i = 0; i < 2; i++) {
  const t0 = Date.now();
  await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const tGoto = Date.now();
  await page.waitForFunction(() => window.__mk && window.__mk.intro && window.__mk.intro.isSplashFinished(),
    null, { timeout: 180000, polling: 200 }).catch((e) => console.log('WAIT FAIL', e.message.split('\n')[0]));
  console.log(`load#${i}: goto=${((tGoto - t0) / 1000).toFixed(1)}s splashDone=${((Date.now() - tGoto) / 1000).toFixed(1)}s`);
  // 顺便看 rAF 帧间隔
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const s = performance.now();
    const tick = () => { n++; if (performance.now() - s > 2000) res((n / 2).toFixed(2)); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  console.log(`load#${i}: fps~${fps}`);
}
await browser.close();
