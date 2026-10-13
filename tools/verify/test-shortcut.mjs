import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8901/';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(BASE + '?track=classic', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__mk && window.__mk.track, { timeout: 60000 });

// Just check track structure without waiting for race to start
const st = await page.evaluate(() => {
  const t = window.__mk.track;
  return {
    nShortcuts: t.shortcuts.length,
    nMeshes: t.shortcutMeshes.length,
    nCps: t.shortcutCheckpoints.length,
    shortcutData: t.shortcuts[0] ? { halfWidth: t.shortcuts[0].halfWidth, len: t.shortcuts[0].len, bypassFrom: t.shortcutCheckpoints[0]?.bypassFrom, bypassTo: t.shortcutCheckpoints[0]?.bypassTo } : null,
  };
});

console.log('Shortcut test result:', JSON.stringify(st, null, 2));
await browser.close();
