#!/usr/bin/env node
/**
 * 真机验证：用 Playwright headless Chromium 加载游戏页面，
 * 收集 console error / pageerror，截图，可选做驾驶输入测试。
 * 用法：
 *   node verify.js <url> <shot1.png> [--drive <shot2.png>]
 * 输出 JSON 到 stdout；consoleErrors 非空即失败。
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');

(async () => {
  const [url, shot1, driveFlag, shot2] = process.argv.slice(2);
  const report = { url, consoleErrors: [], pageErrors: [], shots: [], hud: {} };
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // 环境兜底（GUIDANCE 2026-10-10 17:25②）：本机 8G + 纯软渲染下 page.screenshot
  // 偶发 60s 超时（验证工具/环境问题，非游戏 bug）→ 退回 CDP Page.captureScreenshot 直抓。
  // 只改截图通道，不动任何 error 采集与 ok 判定。
  const shoot = async (path) => {
    try {
      await page.screenshot({ path, timeout: 60000, animations: 'disabled' });
    } catch (e) {
      const cdp = await page.context().newCDPSession(page);
      const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path, Buffer.from(cap.data, 'base64'));
      report.screenshotFallback = (report.screenshotFallback || 0) + 1;
    }
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => report.pageErrors.push(String(err).slice(0, 300)));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    report.pageErrors.push('goto failed: ' + String(e).slice(0, 200));
  }
  await page.waitForTimeout(10000); // 等 Three.js 渲染
  const hud = await page.evaluate(() => ({
    speed: document.getElementById('speed')?.textContent ?? null,
    lap: document.getElementById('lap')?.textContent ?? null,
    time: document.getElementById('time')?.textContent ?? null,
  })).catch(() => ({}));
  report.hud.before = hud;
  await shoot(shot1);
  report.shots.push(shot1);
  if (driveFlag === '--drive' && shot2) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(5000);
    await page.keyboard.up('ArrowUp');
    const hud2 = await page.evaluate(() => ({
      speed: document.getElementById('speed')?.textContent ?? null,
    })).catch(() => ({}));
    report.hud.after = hud2;
    await shoot(shot2);
    report.shots.push(shot2);
  }
  await browser.close();
  report.ok = report.consoleErrors.length === 0 && report.pageErrors.length === 0;
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => {
  console.log(JSON.stringify({ ok: false, fatal: String(e).slice(0, 300) }));
  process.exit(1);
});
