// 临时诊断：drive 到巡游末端 → finishParade → 观察 countdownState / state.running 演化
import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:8901/';
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGE-ERR:', e.message));
await page.goto(BASE + '?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.intro && window.__mk.intro.isSplashFinished(), null, { timeout: 60000, polling: 200 });
await page.evaluate(() => {
  const i = window.__mk.intro;
  i.setParadePaused(true); i.resetIntro(); i.setParadeTime(i.PARADE_TOTAL - 0.01); i.updateParade();
});
await page.evaluate(() => window.__mk.intro.finishParade());
for (let k = 0; k < 10; k++) {
  const s = await page.evaluate(() => ({
    t: performance.now() / 1000,
    running: window.__mk.state.running,
    started: window.__mk.state.started,
    paradeMode: window.__mk.state.paradeMode,
    paradeDone: window.__mk.state.paradeDone,
    cdActive: window.__mk.intro.getCountdown().active,
    cdStep: window.__mk.intro.getCountdown().step,
    cdSST: window.__mk.intro.getCountdown().stepStartTime.toFixed(2),
    cdResolve: window.__mk.intro.getCountdown().hasResolve,
    cdDisplay: window.__mk.intro.getCountdown().display,
    cdText: (document.getElementById('countdown') || {}).textContent,
    gameTime: window.__mk.intro.getGameTime().toFixed(2),
    cdDone: window.__mk.intro.isCountdownDone(),
    cdStarted: window.__mk.intro.isCountdownStarted(),
  }));
  console.log(k, JSON.stringify(s));
  await page.waitForTimeout(1000);
}
console.log('hooks:', await page.evaluate(() => Object.keys(window.__mk).join(',')));
await browser.close();
