import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
page.on('pageerror', e => errs.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:8901/?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.parade, null, { timeout: 60000 });
for (let i = 0; i < 25; i++) {
  const s = await page.evaluate(() => {
    const mk = window.__mk;
    const c = mk.camera.position;
    return {
      keys: mk.state ? Object.keys(mk.state).filter(k=>k.includes('parade')).join(',') : 'NO STATE',
      pm: mk.state?.paradeMode, pd: mk.state?.paradeDone,
      run: mk.state?.running, started: mk.state?.started,
      cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
      a: [mk.parade.a.x.toFixed(1), mk.parade.a.y.toFixed(1), mk.parade.a.z.toFixed(1)],
      splash: mk.intro.isSplashFinished(),
      gt: mk.state?.gameTime ?? null,
    };
  });
  console.log(i, JSON.stringify(s));
  await page.waitForTimeout(1000);
}
console.log('errs:', errs.slice(0,5));
await browser.close();
