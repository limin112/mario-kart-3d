import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:8901/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
const st = () => page.evaluate(() => ({ pm: window.__mk.state.paradeMode, pd: window.__mk.state.paradeDone, paused: window.__mk.intro.parade.paused, sf: window.__mk.intro.isSplashFinished(), running: window.__mk.state.running, kd: window.__kd }));
const drive = (t) => page.evaluate((tt) => { const i = window.__mk.intro; i.setParadePaused(true); i.resetIntro(); i.setParadeTime(tt); i.updateParade(); }, t);
const addKd = () => page.evaluate(() => { window.__kd = 0; window.addEventListener('keydown', () => window.__kd++, true); });

// --- 模拟 A/B/C：先跑一屏到比赛开始 ---
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk?.intro?.isSplashFinished(), null, { timeout: 60000, polling: 200 });
await page.evaluate(() => { const i = window.__mk.intro; i.resetIntro(); i.setSplashFinished(false); });
await page.waitForTimeout(800);
await drive(1.25);
const total = await page.evaluate(() => window.__mk.intro.PARADE_TOTAL);
await drive(total - 0.01);
await page.evaluate(() => window.__mk.intro.finishParade());
await page.waitForFunction(() => window.__mk.state.running === true, null, { timeout: 30000, polling: 200 });
console.log('C done, race running');

// --- E：reload 后 drive(1.0) + Space ---
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk?.intro?.isSplashFinished(), null, { timeout: 60000, polling: 200 });
await drive(1.0);
await addKd();
console.log('E after drive:', JSON.stringify(await st()));
await page.keyboard.press('Space');
for (let k = 0; k < 12; k++) {
  await page.waitForTimeout(500);
  console.log(`t+${(k+1)*0.5}s`, JSON.stringify(await st()));
}
await browser.close();
