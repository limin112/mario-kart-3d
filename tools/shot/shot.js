#!/usr/bin/env node
/**
 * shot.js — Pi 自用的视觉验证截图模块（GUIDANCE 2026-10-12 18:59 需求）
 *
 * 一行命令出 4 张关键截图 + 1 张 2x2 拼盘：
 *   01-select   选单界面（默认无参数页，select.js 覆盖层）
 *   02-start    发车视角（倒计时 GO 结束瞬间）
 *   03-drive5s  驾驶 5 秒后（按住油门 5 秒）
 *   04-overhead 俯视赛道全景（借 window.__mk 钩子把相机拉到天顶）
 *   00-grid     2x2 拼盘对比图
 *
 * 用法：
 *   node tools/shot/shot.js [--out DIR] [--url URL]
 * 默认 url = http://127.0.0.1:8901/（先 cd game && python3 -m http.server 8901 &）
 * 默认 out = <repo>/shots/auto/<YYYYmmdd-HHMMSS>/，自动只保留最近 10 组。
 *
 * 输出 JSON：{ ok, consoleErrors, pageErrors, shots }；ok = 零 error 且 5 张图齐全。
 * 开发流程：改视觉代码 → shot.js → 看截图 → verify.js。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../verify/node_modules/playwright-core'));

const REPO = path.join(__dirname, '../..');

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = { url: 'http://127.0.0.1:8901/', out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === '--url' && argv[i + 1]) args.url = argv[++i];
  }
  return args;
}

function tsNow() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pruneOld(outRoot, keep = 10) {
  try {
    const dirs = fs.readdirSync(outRoot).filter((n) => fs.statSync(path.join(outRoot, n)).isDirectory()).sort();
    while (dirs.length > keep) {
      const old = dirs.shift();
      fs.rmSync(path.join(outRoot, old), { recursive: true, force: true });
    }
  } catch (e) { /* 目录不存在等情况静默 */ }
}

(async () => {
  const args = parseArgs();
  const ts = tsNow();
  const outDir = args.out
    ? path.resolve(args.out)
    : path.join(REPO, 'shots', 'auto', ts);
  fs.mkdirSync(outDir, { recursive: true });

  const report = { ok: false, url: args.url, out: outDir, consoleErrors: [], pageErrors: [], shots: {}, steps: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));

  const shot = async (name) => {
    const file = path.join(outDir, `${name}-${ts}.png`);
    await page.screenshot({ path: file, timeout: 90000, animations: 'disabled' });
    report.shots[name] = file;
    report.steps.push(`shot ${name} ok`);
    return file;
  };
  const waitFor = async (fn, timeoutMs, what) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await page.evaluate(fn).catch(() => false)) { report.steps.push(`${what} after ${((Date.now() - t0) / 1000).toFixed(1)}s`); return true; }
      await page.waitForTimeout(500);
    }
    throw new Error(`timeout waiting for ${what}`);
  };

  try {
    // ---- 01 选单界面（默认无参数页）----
    await page.goto(args.url, { waitUntil: 'load', timeout: 30000 });
    await waitFor(() => {
      const el = document.getElementById('select-title');
      return !!el && !!el.offsetParent;
    }, 60000, 'select overlay');
    await shot('01-select');

    // ---- 取消选单，进入默认比赛（ESC = hideOverlay，不 reload）----
    await page.keyboard.press('Escape');
    await waitFor(() => {
      const el = document.getElementById('select-title');
      return !el || !el.offsetParent;
    }, 20000, 'select dismissed');

    // ---- 等倒计时出现（splash→展示→倒计时），再等它消失（GO 结束 = 发车）----
    await waitFor(() => {
      const el = document.getElementById('countdown');
      return !!el && el.style.display === 'block';
    }, 180000, 'countdown visible');
    await waitFor(() => {
      const el = document.getElementById('countdown');
      return !!el && el.style.display === 'none';
    }, 180000, 'countdown finished (GO)');

    // ---- 02 发车视角 ----
    await shot('02-start');

    // ---- 03 驾驶 5 秒后 ----
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(5000);
    await page.keyboard.up('ArrowUp');
    await shot('03-drive5s');

    // ---- 04 俯视赛道全景（后注册 rAF 压过游戏跟随相机，截图后停掉即恢复）----
    await page.evaluate(() => {
      const { scene, camera, renderer, track } = window.__mk;
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (let i = 0; i < 96; i++) {
        const p = track.spline.getPointAt(i / 96);
        minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
        minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
      }
      const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
      const span = Math.max(maxx - minx, maxz - minz) + 50; // 留边
      const h = (span / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.1;
      window.__ovStop = false;
      const loop = () => {
        if (window.__ovStop) return; // 游戏下一帧会自行把相机拿回去
        camera.up.set(0, 0, -1);
        camera.position.set(cx, h, cz);
        camera.lookAt(cx, 0, cz);
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
      };
      loop();
    });
    await page.waitForTimeout(3000); // 软渲染慢，多给几帧
    await shot('04-overhead');
    await page.evaluate(() => { window.__ovStop = true; });

    // ---- 00 2x2 拼盘（页内 canvas 合成，零外部依赖）----
    const names = ['01-select', '02-start', '03-drive5s', '04-overhead'];
    const b64s = names.map((n) => fs.readFileSync(report.shots[n]).toString('base64'));
    const gridB64 = await page.evaluate(async (imgs) => {
      const load = (b) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b; });
      const its = await Promise.all(imgs.map(load));
      const W = 640, H = 400;
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
      its.forEach((it, i) => ctx.drawImage(it, (i % 2) * W, Math.floor(i / 2) * H, W, H));
      return c.toDataURL('image/png').split(',')[1];
    }, b64s);
    const gridFile = path.join(outDir, `00-grid-${ts}.png`);
    fs.writeFileSync(gridFile, Buffer.from(gridB64, 'base64'));
    report.shots['00-grid'] = gridFile;
    report.steps.push('shot 00-grid ok');
  } catch (e) {
    report.fatal = String(e && e.message ? e.message : e).slice(0, 300);
  } finally {
    await browser.close();
  }

  const allShots = ['01-select', '02-start', '03-drive5s', '04-overhead', '00-grid'].every((n) => report.shots[n]);
  report.ok = allShots && report.consoleErrors.length === 0 && report.pageErrors.length === 0;

  // 只保留最近 10 组
  pruneOld(path.join(REPO, 'shots', 'auto'));

  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => {
  console.log(JSON.stringify({ ok: false, fatal: String(e).slice(0, 300) }));
  process.exit(1);
});
