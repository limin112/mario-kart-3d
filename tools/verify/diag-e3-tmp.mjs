// 诊断：parade-probe E 路径超时定位。两阶段：
// T1 = 独立 E（新浏览器、goto、drive、press Space）
// T2 = 带 CDP session + 3 张 Page.captureScreenshot 后再 E（模拟探针前置动作）
import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:8901/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const cdp = await page.context().newCDPSession(page); // T2 前置：与探针一致
const shot = async () => { const c = await cdp.send('Page.captureScreenshot', { format: 'png' }); return c.data.length; };
const drive = (t) => page.evaluate((tt) => {
  const i = window.__mk.intro;
  i.setParadePaused(true); i.resetIntro(); i.setParadeTime(tt); i.updateParade();
}, t);
const st = () => page.evaluate(() => ({ pd: window.__mk.state.paradeDone, pm: window.__mk.state.paradeMode, sf: window.__mk.intro.isSplashFinished(), kd: window.__kd, act: document.activeElement && document.activeElement.tagName }));

async function ePath(label) {
  await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__mk && window.__mk.parade && window.__mk.intro && window.__mk.intro.isSplashFinished(), null, { timeout: 60000, polling: 200 });
  await drive(1.0);
  await page.evaluate(() => { window.__kd = 0; window.addEventListener('keydown', () => window.__kd++, true); });
  console.log(label, 'pre:', JSON.stringify(await st()));
  await page.keyboard.press('Space');
  for (let k = 0; k < 8; k++) {
    await page.waitForTimeout(1000);
    const s = await st();
    console.log(label, `t+${k + 1}s`, JSON.stringify(s));
    if (s.pd) { console.log(label, 'OK skip worked'); return true; }
  }
  console.log(label, 'STUCK (pd never true)');
  return false;
}

// T1：先拍 3 张 CDP 截图（模拟探针 A/B/C 的 shot()），再走 E
for (let i = 0; i < 3; i++) await shot();
console.log('cdp shots ok');
const ok = await ePath('T2(cdp-shots)');
await browser.close();
process.exit(ok ? 0 : 1);
