// 临时探针：P16 第二步——触摸跳过 splash 后流程一致（展示→倒计时，无卡顿跳步）
import { chromium } from 'playwright-core';
import { devices } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:8901/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const report = { ok: false, steps: [], errs };
try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  // 等 splash 出现
  let seen = false;
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => !!document.getElementById('splashOverlay'))) { seen = true; break; }
    await page.waitForTimeout(150);
  }
  report.steps.push({ step: 'splashSeen', seen });
  await page.waitForTimeout(700); // 过 500ms 防误触窗口
  await page.touchscreen.tap(422, 200); // 屏幕中央点一下
  // splash 应在 ~300ms（软渲染余量 3s）内消失
  let goneAt = 0; const tp = Date.now();
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => !document.getElementById('splashOverlay'))) { goneAt = Date.now() - tp; break; }
    await page.waitForTimeout(150);
  }
  report.steps.push({ step: 'goneAfterTapMs', goneAt });
  // 之后应出现倒计时文本（3/2/1/GO），证明流程走到了倒计时（展示阶段软渲染下约需数秒）
  let cd = null;
  for (let i = 0; i < 120; i++) {
    cd = await page.evaluate(() => {
      const c = document.getElementById('countdown');
      return c && c.style.display !== 'none' ? c.textContent : null;
    });
    if (cd) break;
    await page.waitForTimeout(250);
  }
  report.steps.push({ step: 'countdownText', cd });
  report.ok = !!(seen && goneAt > 0 && goneAt < 3000 && cd && errs.length === 0);
} catch (e) {
  report.errs.push('probe exception: ' + String(e).slice(0, 200));
} finally {
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
}
