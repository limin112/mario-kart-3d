#!/usr/bin/env node
/**
 * P16 splash 专项探针（保留复用）：
 *  a) 自动路径：加载后 ~1s #splashOverlay 存在且 logo 可见 → ~4.5s 内自动移除，
 *     之后展示舞台解冻（splashFinished 生效：overlay 移除且页面无 error）。
 *  b) 跳过路径：重载，800ms 时按 Enter → ~2s 内 overlay 被移除。
 * 零 console/page error。用法：node splash-probe.mjs <url>
 */
import { chromium } from 'playwright-core';

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8901/';
  const report = { url, ok: false, steps: [], consoleErrors: [], pageErrors: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));

  const overlayState = () => page.evaluate(() => {
    const o = document.getElementById('splashOverlay');
    if (!o) return { present: false };
    const logo = o.querySelector('#splashLogo');
    const cs = logo ? getComputedStyle(logo) : null;
    return { present: true, opacity: cs ? cs.opacity : null, transform: cs ? cs.transform : null };
  });

  try {
    // ---- a) 自动路径 ----
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);
    const early = await overlayState();
    report.steps.push({ step: 'auto@1.2s', ...early });
    await page.screenshot({ path: '/tmp/splash-probe-logo.png' }).catch(() => {});
    // 等自动退场（headless 软渲染慢，放宽到 8s）
    let removedAt = -1;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(200);
      const s = await overlayState();
      if (!s.present) { removedAt = 1200 + (i + 1) * 200; break; }
    }
    report.steps.push({ step: 'auto-removed-ms', removedAt });
    // 退场后展示舞台应解冻并推进（等 3s 无 error 即可，splashFinished 是模块内变量不可读，用零 error + 后续倒计时 DOM 佐证）
    await page.waitForTimeout(3000);
    const post = await page.evaluate(() => ({
      overlay: !!document.getElementById('splashOverlay'),
      style: !!document.getElementById('splash-style'),
      bodyText: document.body.innerText.slice(0, 120),
    }));
    report.steps.push({ step: 'post', ...post });

    // ---- b) 跳过路径 ----
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    let skipRemoved = -1;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(200);
      const s = await overlayState();
      if (!s.present) { skipRemoved = (i + 1) * 200; break; }
    }
    report.steps.push({ step: 'skip-removed-ms', skipRemoved });
    await page.screenshot({ path: '/tmp/splash-probe-after.png' }).catch(() => {});

    const aOk = early.present && parseFloat(early.opacity) > 0.5 && removedAt > 0;
    const bOk = skipRemoved >= 0 && skipRemoved < 5000;
    const clean = post && !post.overlay && !post.style;
    const noErr = report.consoleErrors.length === 0 && report.pageErrors.length === 0;
    report.ok = !!(aOk && bOk && clean && noErr);
  } catch (e) {
    report.pageErrors.push('probe exception: ' + String(e).slice(0, 200));
  } finally {
    await browser.close();
    console.log(JSON.stringify(report, null, 1));
  }
})();
