// 定性：headless 下 splash 为何被立即跳过（谁派发了 keydown/click/touchstart）
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__evts = [];
  const t0 = performance.now();
  for (const t of ['keydown', 'keyup', 'click', 'touchstart', 'pointerdown']) {
    window.addEventListener(t, (e) => {
      window.__evts.push(`${(performance.now() - t0).toFixed(0)}ms ${t} ${e.code || ''} ${e.isTrusted ? 'trusted' : 'synthetic'} target=${e.target && e.target.id ? e.target.id : e.target && e.target.tagName}`);
    }, true);
  }
});
await page.goto('http://127.0.0.1:8901/?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.parade, null, { timeout: 60000 });
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => ({
    t: Math.round(performance.now()),
    evts: window.__evts.slice(0, 8),
    splash: !!document.getElementById('splashOverlay'),
    pd: window.__mk.state.paradeDone,
    sf: window.__mk.intro.isSplashFinished(),
  })).catch((e) => ({ err: e.message.split('\n')[0] }));
  console.log(JSON.stringify(s));
  await page.waitForTimeout(700);
}
await browser.close();
