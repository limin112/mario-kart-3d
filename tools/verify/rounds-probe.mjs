#!/usr/bin/env node
/**
 * P18 回合播报专项探针（保留复用）：
 *  a) 集成路径：addInitScript 挂 MutationObserver，从页面脚本执行前开始记录
 *     [data-round-banner] 出现时刻与文字 → 等到 ROUND 1 横幅（倒计时结束触发）。
 *  b) 单元路径：页面内 dynamic import('/rounds.js')：
 *     showRoundBanner('ROUND 2') 出现 → 再调 FINAL LAP 不叠加（count 恒 1）→
 *     hideRoundBanner() 清零；字号/斜体/渐变样式生效。
 *  c) 证据截图：FINAL LAP 横幅（长 duration）可见时截图存 shots/。
 * 零 console/page error。用法：node rounds-probe.mjs <url> [截图路径]
 */
import { chromium } from 'playwright-core';

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8901/';
  const shotPath = process.argv[3] || '/tmp/rounds-probe-banner.png';
  const report = { url, ok: false, steps: [], consoleErrors: [], pageErrors: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));

  // 页面脚本执行前挂观察器，记录横幅出现事件
  await page.addInitScript(() => {
    window.__banners = [];
    const rec = (node) => {
      if (node && node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-round-banner')) {
        window.__banners.push({ t: Math.round(performance.now()), text: node.textContent });
      }
    };
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(rec);
    });
    const start = () => mo.observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });

    // ---- a) 集成路径：等 ROUND 1 横幅（headless 软渲染慢，放宽到 90s）----
    let sawRound1 = null;
    for (let i = 0; i < 450; i++) {
      const list = await page.evaluate(() => window.__banners || []);
      if (list.length > 0) { sawRound1 = list[0]; break; }
      await page.waitForTimeout(200);
    }
    report.steps.push({ step: 'integration-round1', banner: sawRound1 });

    // ---- b) 单元路径：动态 import rounds.js 直接调 API ----
    const unit = await page.evaluate(async () => {
      const m = await import('/rounds.js');
      const count = () => document.querySelectorAll('[data-round-banner]').length;
      const r = { api: typeof m.showRoundBanner === 'function' && typeof m.hideRoundBanner === 'function' };
      m.hideRoundBanner(); // 清掉集成路径可能残留的
      m.showRoundBanner('ROUND 2');
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      r.afterFirst = count();
      const el = document.querySelector('[data-round-banner]');
      if (el) {
        const cs = getComputedStyle(el);
        r.fontSizePx = parseFloat(cs.fontSize);
        r.italic = cs.fontStyle === 'italic';
        r.fixed = cs.position === 'fixed';
      }
      m.showRoundBanner('FINAL LAP', { final: true, duration: 60000 });
      r.afterSecond = count(); // 必须仍为 1，不叠加
      m.hideRoundBanner();
      r.afterHide = count();
      // 再显示一次留给截图
      m.showRoundBanner('FINAL LAP', { final: true, duration: 60000 });
      await new Promise((res) => setTimeout(res, 500)); // 让弹入/脉动生效
      return r;
    });
    report.steps.push({ step: 'unit', ...unit });

    // ---- c) 证据截图（横幅可见）----
    await page.screenshot({ path: shotPath, timeout: 60000 }).catch((e) => {
      report.steps.push({ step: 'screenshot-fail', err: String(e).slice(0, 120) });
    });
    await page.evaluate(async () => { (await import('/rounds.js')).hideRoundBanner(); });
    const leftover = await page.evaluate(() => document.querySelectorAll('[data-round-banner]').length);
    report.steps.push({ step: 'after-hide-leftover', leftover });

    const aOk = !!sawRound1 && /ROUND 1/i.test(sawRound1.text || '');
    const bOk = unit.api && unit.afterFirst === 1 && unit.afterSecond === 1 &&
      unit.afterHide === 0 && unit.fontSizePx > 40 && unit.italic && unit.fixed;
    const noErr = report.consoleErrors.length === 0 && report.pageErrors.length === 0;
    report.ok = !!(aOk && bOk && leftover === 0 && noErr);
  } catch (e) {
    report.pageErrors.push('probe exception: ' + String(e).slice(0, 200));
  } finally {
    await browser.close();
    console.log(JSON.stringify(report, null, 1));
  }
})();
