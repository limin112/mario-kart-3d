import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
page.on('pageerror', e => errs.push('pageerror: '+e.message));
page.on('requestfailed', r => errs.push('reqfail: '+r.url()+' '+(r.failure()&&r.failure().errorText)));
const t0 = Date.now();
await page.goto('http://127.0.0.1:8901/?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i=0;i<20;i++){
  const s = await page.evaluate(() => ({ mk: !!window.__mk, parade: !!(window.__mk&&window.__mk.parade), pd: window.__mk&&window.__mk.state&&window.__mk.state.paradeDone, rs: document.readyState })).catch(e=>({err:e.message.split('\n')[0]}));
  console.log(((Date.now()-t0)/1000).toFixed(1)+'s', JSON.stringify(s));
  if (s.parade) break;
  await page.waitForTimeout(2000);
}
console.log('errors:', errs.slice(0,5));
await browser.close();
