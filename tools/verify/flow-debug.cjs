// 调试：默认页加载后，观察 splash/倒计时/场景亮度/rAF 帧率随时间变化
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules/playwright-core'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__frames = 0;
    const c = () => { window.__frames++; requestAnimationFrame(c); };
    requestAnimationFrame(c);
  });
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => {
      const cd = document.getElementById('countdown');
      const canvas = document.getElementById('canvas');
      let bright = -1;
      try {
        const g = canvas.getContext('webgl2') || canvas.getContext('webgl');
        // 不能直接读 webgl 缓冲，用 readPixels 太贵；改用截图替代——这里跳过
      } catch (e) {}
      return {
        cdDisplay: cd ? cd.style.display : 'NO-EL',
        cdText: cd ? cd.textContent.slice(0, 10) : '',
        frames: window.__frames,
        splashLeft: !!document.querySelector('.splash-overlay, #splash, .splash'),
        bodyKids: document.body.children.length,
      };
    });
    console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(s));
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
