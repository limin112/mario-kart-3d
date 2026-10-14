import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
async function poll(tag) {
  console.log(`--- ${tag} ---`);
  await page.goto('http://127.0.0.1:8901/?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__mk && window.__mk.parade, null, { timeout: 60000 });
  for (let i = 0; i < 24; i++) {
    const s = await page.evaluate(() => {
      const mk = window.__mk;
      const d = Math.hypot(mk.camera.position.x - mk.parade.a.x, mk.camera.position.z - mk.parade.a.z);
      return {
        d: +d.toFixed(2), pm: mk.state.paradeMode, pd: mk.state.paradeDone,
        run: mk.state.running,
        splash: !!document.getElementById('splashOverlay'),
        started: !!window.__splashStarted,
      };
    }).catch((e) => ({ err: e.message.split('\n')[0] }));
    console.log(i * 1.0 + 's', JSON.stringify(s));
    await page.waitForTimeout(1000);
  }
}
await poll('load1');
console.log('errors so far:', errors.length, errors.slice(0, 2));
await poll('load2');
console.log('errors total:', errors.length);
for (const e of errors.slice(0, 5)) console.log(e);
await browser.close();
