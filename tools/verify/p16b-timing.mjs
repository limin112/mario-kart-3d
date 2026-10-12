#!/usr/bin/env node
/**
 * P16 第二步节奏探针（保留复用）：
 * 测量 splash→展示→倒计时 各节点时间（自页面 load 起，ms）：
 *   splashGone  #splashOverlay 从 DOM 移除
 *   countdown3  #countdown 首次可见（3 出现）
 *   go          #countdown 文本出现 GO!
 *   running     玩家可驾驶（HUD 速度可非 0 之前置：用 window.__mkRunning 不可得，改用 countdown 隐藏）
 * 注意：headless 软渲染会拉长 rAF 驱动的阶段（展示/倒计时），真实 60fps 下为设计值（P16 二步收尾）：
 *   自动路径 splash 2.28s(1950+300退场) + intro 0.6 + explode 1.2 + exit 0.2 = 4.28s 进倒计时，GO 完成 ~5.88s
 *   跳过路径（t=0.5s 按键）0.78s + 2.0 = 2.78s 进倒计时，GO 完成 ~4.38s
 * 用法：node p16b-timing.mjs <url> [--skip]
 */
import { chromium } from 'playwright-core';

(async () => {
  const args = process.argv.slice(2);
  const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://127.0.0.1:8901/';
  const skip = args.includes('--skip');
  const report = { url, skip, ok: false, ms: {}, consoleErrors: [], pageErrors: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));

  await page.addInitScript(() => {
    window.__p16 = { splashSeen: 0, splashGone: 0, countdown3: 0, go: 0, countdownGone: 0 };
    const iv = setInterval(() => {
      const t = performance.now();
      const p = window.__p16;
      if (!p.splashSeen && document.getElementById('splashOverlay')) p.splashSeen = t;
      if (p.splashSeen && !p.splashGone && !document.getElementById('splashOverlay')) p.splashGone = t;
      const cd = document.getElementById('countdown');
      if (cd) {
        const vis = cd.style.display === 'block';
        if (!p.countdown3 && vis) p.countdown3 = t;
        if (!p.go && vis && cd.textContent.indexOf('GO') >= 0) p.go = t;
        if (!p.countdownGone && p.go && !vis) p.countdownGone = t;
      }
      if (p.countdownGone) clearInterval(iv);
    }, 25);
  });

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  if (skip) {
    // 事件驱动：等 splash 注入后再等 600ms（过 500ms 防误触窗口）再按
    for (let i = 0; i < 100; i++) {
      if (await page.evaluate(() => !!window.__p16.splashSeen)) break;
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
  }
  // 等到倒计时结束或超时 60s（headless 软渲染慢）
  for (let i = 0; i < 240; i++) {
    const done = await page.evaluate(() => !!window.__p16.countdownGone);
    if (done) break;
    await page.waitForTimeout(250);
  }
  report.ms = await page.evaluate(() => window.__p16);
  const m = report.ms;
  report.ok = !!(m.splashSeen && m.splashGone && m.countdown3 && m.go && m.countdownGone
    && m.splashGone < m.countdown3 && m.countdown3 < m.go && m.go < m.countdownGone
    && report.consoleErrors.length === 0 && report.pageErrors.length === 0);
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
})();
