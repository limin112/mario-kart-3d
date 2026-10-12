#!/usr/bin/env node
/**
 * P14b 选单探针：验证 game/select.js 选单流程。
 * 路径 A（默认无参数）：选单出现、9 张卡（3 赛道×3 主题）→ 点 dune 建议卡 →
 *   开始比赛 → URL 带 ?track=dune 且 reload 后选单不再出现、游戏启动；
 * 路径 B（ESC 取消）：选单关闭、不 reload（URL 无参数、游戏继续、HUD 存在）；
 * 路径 C（调试入口 ?track=glacier）：选单完全不出现，游戏直接启动。
 * 全部路径要求零 console/page error。
 * 用法：node select-probe.mjs   （需 8901 已服务 game/）
 */
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8901/';
const browser = await chromium.launch();
const report = { ok: false, paths: {}, errors: [] };

function attach(page, tag, errs) {
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`.slice(0, 200)); });
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${String(e)}`.slice(0, 200)));
}

async function newPage(tag, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  attach(page, tag, errs);
  return { ctx, page };
}

// ---------- 路径 A：默认加载 → 选 dune → 开始比赛 ----------
{
  const { ctx, page } = await newPage('A', report.errors);
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#track-select-overlay.visible', { timeout: 10000 });
    const cards = await page.$$eval('#track-grid .track-card', (els) =>
      els.map((e) => `${e.dataset.track}/${e.dataset.theme}`));
    report.paths.A_cards = cards.length;
    report.paths.A_has_dune_desert = cards.includes('dune/desert');
    // 点 dune 建议主题卡，再点开始比赛（会触发 reload）
    await page.click('button[data-track="dune"][data-theme="desert"]');
    const sel = await page.$eval('button[data-track="dune"][data-theme="desert"]',
      (e) => e.classList.contains('selected'));
    report.paths.A_card_selected = sel;
    await page.click('#btn-start');
    // replaceState 先于 reload，URL 变化比导航更快、更可靠
    await page.waitForFunction(() => location.search.includes('track=dune'), null, { timeout: 15000 });
    await page.waitForFunction(() => !!window.track, null, { timeout: 60000 });
    await page.waitForTimeout(1500); // 给选单模块（若有）一个出现的时间窗
    report.paths.A_url_after = await page.evaluate(() => location.search);
    report.paths.A_overlay_after = await page.evaluate(() =>
      !!document.getElementById('track-select-overlay'));
    report.paths.A_game_alive = await page.evaluate(() => !!window.track);
    await page.screenshot({ path: 'shots/select-pA-dune.png', timeout: 60000 }).catch(() => {});
  } catch (e) { report.errors.push('A: ' + String(e).slice(0, 200)); }
  await ctx.close();
}

// ---------- 路径 B：ESC 取消 ----------
{
  const { ctx, page } = await newPage('B', report.errors);
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#track-select-overlay.visible', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    report.paths.B_overlay_gone = await page.evaluate(() => {
      const o = document.getElementById('track-select-overlay');
      return !o || getComputedStyle(o).visibility === 'hidden';
    });
    report.paths.B_url = await page.evaluate(() => location.search);
    report.paths.B_hud = await page.evaluate(() => !!document.getElementById('speed'));
  } catch (e) { report.errors.push('B: ' + String(e).slice(0, 200)); }
  await ctx.close();
}

// ---------- 路径 C：调试入口 ?track=glacier ----------
{
  const { ctx, page } = await newPage('C', report.errors);
  try {
    await page.goto(BASE + '?track=glacier', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(4000);
    report.paths.C_overlay = await page.evaluate(() =>
      !!document.getElementById('track-select-overlay'));
    report.paths.C_game_alive = await page.evaluate(() => !!window.track);
    await page.screenshot({ path: 'shots/select-pC-glacier.png', timeout: 60000 }).catch(() => {});
  } catch (e) { report.errors.push('C: ' + String(e).slice(0, 200)); }
  await ctx.close();
}

const A = report.paths;
report.ok =
  A.A_cards === 9 && A.A_has_dune_desert && A.A_card_selected &&
  A.A_url_after === '?track=dune' && A.A_overlay_after === false && A.A_game_alive &&
  A.B_overlay_gone && A.B_url === '' && A.B_hud &&
  A.C_overlay === false && A.C_game_alive &&
  report.errors.length === 0;
console.log(JSON.stringify(report, null, 1));
await browser.close();
process.exit(report.ok ? 0 : 1);
