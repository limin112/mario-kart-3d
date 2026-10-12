#!/usr/bin/env node
/**
 * P16 splash 专项探针（保留复用；P16 第二步改为事件驱动采样）：
 * 背景：headless 软渲染下 main.js（含 three.js）解析+建场景可阻塞主线程 ~2s，
 * load 事件晚于 splash 注入、注入时刻又不固定——任何"load 后固定毫秒"采样都会误报。
 * 做法：addInitScript 每 50ms 记录 #splashOverlay 的 出现(seen)/消失(gone) 时刻与
 * 可见期 logo opacity 峰值，路径判定全部基于事件时刻，与 load 解耦。
 *  a) 自动路径：splash 出现 → 无人干预自动消失（gone-seen ≈ 2.4~2.6s 设计值，
 *     软渲染下可拉长）；退场后无 DOM 残留、零 error。
 *  b) 跳过路径：splash 出现后 600ms 按 Enter → ~300ms 内消失（gone-seen < 1500ms）。
 * 用法：node splash-probe.mjs <url>
 */
import { chromium } from 'playwright-core';

const INIT = () => {
  window.__sp = { seen: 0, gone: 0, maxOpacity: 0 };
  const iv = setInterval(() => {
    const o = document.getElementById('splashOverlay');
    const p = window.__sp;
    if (o) {
      if (!p.seen) p.seen = performance.now();
      const logo = o.querySelector('#splashLogo');
      if (logo) {
        const op = parseFloat(getComputedStyle(logo).opacity || '0');
        if (op > p.maxOpacity) p.maxOpacity = op;
      }
    } else if (p.seen && !p.gone) {
      p.gone = performance.now();
      clearInterval(iv);
    }
  }, 50);
};

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8901/';
  const report = { url, ok: false, steps: [], consoleErrors: [], pageErrors: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));
  await page.addInitScript(INIT);

  const waitGone = async (maxMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(() => ({ seen: __sp.seen, gone: __sp.gone, maxOpacity: __sp.maxOpacity }));
      if (s.gone) return s;
      await page.waitForTimeout(150);
    }
    return await page.evaluate(() => ({ seen: __sp.seen, gone: __sp.gone, maxOpacity: __sp.maxOpacity }));
  };

  try {
    // ---- a) 自动路径 ----
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    const auto = await waitGone(20000);
    report.steps.push({ step: 'auto', ...auto, durMs: auto.gone - auto.seen });
    await page.screenshot({ path: '/tmp/splash-probe-after.png' }).catch(() => {});
    const post = await page.evaluate(() => ({
      overlay: !!document.getElementById('splashOverlay'),
      style: !!document.getElementById('splash-style'),
    }));
    report.steps.push({ step: 'post', ...post });

    // ---- b) 跳过路径（新页面，重置 __sp）----
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page2.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    page2.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));
    await page2.addInitScript(INIT);
    await page2.goto(url, { waitUntil: 'load', timeout: 30000 });
    // 等 splash 出现（注入时刻不固定，最多 15s）
    let seen = false;
    for (let i = 0; i < 100; i++) {
      if (await page2.evaluate(() => !!document.getElementById('splashOverlay'))) { seen = true; break; }
      await page2.waitForTimeout(150);
    }
    await page2.waitForTimeout(600); // 过注入+500ms 防误触窗口
    await page2.keyboard.press('Enter');
    const t1 = Date.now();
    let skip = { seen: 0, gone: 0 };
    for (let i = 0; i < 60; i++) {
      skip = await page2.evaluate(() => ({ seen: __sp.seen, gone: __sp.gone }));
      if (skip.gone) break;
      await page2.waitForTimeout(150);
    }
    report.steps.push({ step: 'skip', ...skip, durMs: skip.gone - skip.seen, pressTookMs: Date.now() - t1 });
    await page2.close();

    const aOk = auto.seen > 0 && auto.gone > 0 && auto.maxOpacity > 0.5;
    const clean = !post.overlay && !post.style;
    const bOk = seen && skip.gone > 0 && (skip.gone - skip.seen) < 1500; // 600ms 等待+250ms 淡出+余量
    const noErr = report.consoleErrors.length === 0 && report.pageErrors.length === 0;
    report.ok = !!(aOk && clean && bOk && noErr);
  } catch (e) {
    report.pageErrors.push('probe exception: ' + String(e).slice(0, 200));
  } finally {
    await browser.close();
    console.log(JSON.stringify(report, null, 1));
  }
})();
