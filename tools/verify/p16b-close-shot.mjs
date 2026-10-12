#!/usr/bin/env node
/**
 * P16b 收尾发车视角截图（GUIDANCE 17:29 验收第 4 条）：
 * 加载 → 等 splash 消失 → 再等 12s（进比赛/倒计时后发车视角）→ CDP 直抓存 shots/。
 * 软渲染下 page.screenshot 偶发超时，用 CDP captureScreenshot（GUIDANCE 17:25②）。
 * 用法：node p16b-close-shot.mjs <url> <outPng>
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const url = process.argv[2] || 'http://127.0.0.1:8901/';
const out = process.argv[3] || '/tmp/p16b-close.png';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('hud') && !document.getElementById('splashOverlay'),
  null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(12000);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log(JSON.stringify({ out, errors }, null, 1));
await browser.close();
