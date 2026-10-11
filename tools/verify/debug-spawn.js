const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Track]') || text.includes('[Main]') || text.includes('[AI')) {
      console.log('BROWSER LOG:', text);
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000); // Wait for showcase + countdown + spawn
  
  // Also get kart position from game state
  const state = await page.evaluate(() => {
    return {
      playerKartPos: window.kartPhysics ? { x: window.kartPhysics.position.x, z: window.kartPhysics.position.z } : 'not found',
      trackStart: window.track ? { x: window.track.spline.getPointAt(0).x, z: window.track.spline.getPointAt(0).z } : 'not found',
    };
  }).catch(e => ({ error: String(e) }));
  console.log('GAME STATE:', JSON.stringify(state, null, 2));
  
  await browser.close();
})();