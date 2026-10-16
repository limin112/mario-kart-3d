// 调试：开场时间线采样（parade-probe A 段 FAIL 定性用）
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const t0 = Date.now();
await page.goto('http://127.0.0.1:8901/?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.parade, null, { timeout: 60000 });
console.log('mk.parade appeared at', ((Date.now() - t0) / 1000).toFixed(1) + 's');
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => {
    const mk = window.__mk;
    if (!mk || !mk.state) return { mk: !!mk };
    const c = mk.camera.position, a = mk.parade.a;
    return {
      pm: mk.state.paradeMode, pd: mk.state.paradeDone, run: mk.state.running,
      splash: mk.intro.isSplashFinished(),
      dA: +Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z).toFixed(2),
      camY: +c.y.toFixed(2),
      dPlayerSpawn: +Math.hypot(
        mk.playerKart.position.x - mk.track.getSpawnPositions()[1].position.x,
        mk.playerKart.position.y - mk.track.getSpawnPositions()[1].position.y,
        mk.playerKart.position.z - mk.track.getSpawnPositions()[1].position.z).toFixed(3),
      gt: +(performance.now() / 1000).toFixed(1),
    };
  }).catch((e) => ({ err: e.message.split('\n')[0] }));
  console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(s));
  await page.waitForTimeout(500);
}
await browser.close();
