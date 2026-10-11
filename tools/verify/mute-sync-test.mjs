// 触屏静音按钮：图标同步 + 竖屏让位 专项测试
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = { errors: [] };

const hook = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') results.errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', (e) => results.errors.push(tag + ' pageerror: ' + e.message));
};

const rectsOverlap = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const geom = async (page) => page.evaluate(() => {
  const r = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
  return { muteHint: r('muteHint'), tcMute: r('tc-mute'), tcReset: r('tc-reset'),
           hintIcon: document.getElementById('muteHint')?.textContent,
           btnIcon: document.getElementById('tc-mute')?.textContent };
});

// ---- 竖屏 390x844：muteHint 应让位，不与按钮叠压 ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  hook(page, 'portrait');
  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const g = await geom(page);
  results.portrait = {
    hintTop: g.muteHint?.y, btnTop: g.tcMute?.y,
    overlapHintMute: rectsOverlap(g.muteHint, g.tcMute),
    overlapHintReset: rectsOverlap(g.muteHint, g.tcReset),
    bodyClass: await page.evaluate(() => document.body.classList.contains('touch-ctrl')),
  };
  // 真键盘 M → 按钮图标应跟随（这是本轮修的失步 bug）
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  const g1 = await geom(page);
  results.portrait.afterKeyM = { btnIcon: g1.btnIcon, hintIcon: g1.hintIcon };
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  const g2 = await geom(page);
  results.portrait.afterKeyM2 = { btnIcon: g2.btnIcon, hintIcon: g2.hintIcon };
  // 触屏点按钮 → 徽章应跟随
  await page.touchscreen.tap(g.tcMute.x + g.tcMute.width / 2, g.tcMute.y + g.tcMute.height / 2);
  await page.waitForTimeout(400);
  const g3 = await geom(page);
  results.portrait.afterTapBtn = { btnIcon: g3.btnIcon, hintIcon: g3.hintIcon };
  await ctx.close();
}

// ---- 横屏矮屏 844x390：既有布局不回归（按钮 60px、徽章 20px、不叠压） ----
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  hook(page, 'landscape');
  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const g = await geom(page);
  results.landscape = {
    hintTop: g.muteHint?.y, btnTop: g.tcMute?.y,
    overlapHintMute: rectsOverlap(g.muteHint, g.tcMute),
    overlapHintReset: rectsOverlap(g.muteHint, g.tcReset),
  };
  await ctx.close();
}

results.ok = results.errors.length === 0;
console.log(JSON.stringify(results, null, 1));
await browser.close();
