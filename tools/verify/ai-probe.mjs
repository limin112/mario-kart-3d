#!/usr/bin/env node
/**
 * AI 行为专项探针（AI 加强子任务，监工 2026-10-12 17:06 第 3 项）。
 *
 * 做法：加载页面等 9 秒（过 splash/展示/倒计时）后，为让 headless 软渲染下
 * 物理仍能推进，运行时 stub 掉 renderer.render / track.update / 粒子更新
 * （仅探针页面内 monkey-patch，不改游戏文件、不影响 AI 物理），
 * 并在页内挂 rAF 采样器每帧记录每台 AI 的 totalProgress（lap+样条 t）、
 * 到中心线横向偏移、瞬时速度、NaN；Node 侧每 2 秒轮询一次共 60 秒。
 *
 * 均速按【游戏时间】计算（window.__ai.__gt，ai.js DEBUG 累加器，只在比赛
 * 进行中累加）：speed = ΔtotalProgress × 赛道长度 / Δ游戏时间。
 * headless 帧率低且 dt 封顶 1/30，实时/游戏时间比 ≠1，故不用墙钟测速。
 *
 * 断言：
 *  1) 每台 AI 游戏时间均速 > 0，且给出每 20 秒（墙钟）窗口的进度增量与均速；
 *  2) 每台 AI 每帧横向偏移 < 路面半宽 roadWidth（不出界）；
 *  3) 无 NaN、零 console/page error。
 * 用法：node ai-probe.mjs [--out /path/result.json]   （需 8901 已服务 game/）
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'http://127.0.0.1:8901/';
const WARMUP_MS = 9000;
const POLL_EVERY = 2000;
const DURATION = 60000;
const WINDOW = 20000; // 墙钟 20s 窗口

const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : null;

const browser = await chromium.launch();
const report = {
  ok: false,
  url: BASE,
  trackLength: null,
  roadWidth: null,
  gameTimeSampled: null,
  realTimeSampled: null,
  frameSamples: 0,
  karts: [],
  errors: [],
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  // 尽早提速：停渲染与装饰动画，只留物理/AI 逻辑（仅页面内 monkey-patch，
  // 不改游戏文件、不影响 AI 物理），让 intro/展示/倒计时在 headless 软渲染下
  // 也能在几秒内走完
  await page.waitForFunction(() => !!(window.__mk && window.track), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    const mk = window.__mk;
    if (mk?.renderer) mk.renderer.render = () => {};
    if (window.track) window.track.update = () => {};
    if (mk?.particleSystem) mk.particleSystem.update = () => {};
  });
  await page.waitForTimeout(WARMUP_MS);

  const ready = await page.evaluate(() => {
    if (!(window.__ai && window.track && window.__ai.aiKarts?.length)) return false;

    // 页内每帧采样器
    const S = { rows: [], t0: performance.now() };
    window.__probe = S;
    const tick = () => {
      const track = window.track;
      const ai = window.__ai;
      if (ai && (ai.__gt || 0) > 0) {
        for (let i = 0; i < ai.aiKarts.length; i++) {
          const k = ai.aiKarts[i];
          const c = track.getClosestPoint(k.position);
          const progress = (k.lap || 0) + c.t;
          S.rows.push({
            ms: Math.round(performance.now() - S.t0),
            gt: +ai.__gt.toFixed(3),
            i,
            progress: +progress.toFixed(5),
            lateral: +c.distance.toFixed(3),
            speed: +k.speed.toFixed(3),
            lap: k.lap || 0,
            fin: !!k.finished,
            nan: ![k.position.x, k.position.z, k.rotation, k.speed, progress].every(Number.isFinite),
          });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  });
  if (!ready) {
    report.errors.push('window.__ai / window.track 不可用（ai.js DEBUG 暴露缺失？）');
  } else {
    report.trackLength = await page.evaluate(() => window.track.getLength());
    report.roadWidth = await page.evaluate(() => window.track.cfg.roadWidth);

    // Node 侧每 2 秒轮询共 60 秒（保持页面活跃 + 记录墙钟窗口边界）
    const t0 = Date.now();
    const polls = [];
    while (Date.now() - t0 <= DURATION) {
      await page.waitForTimeout(POLL_EVERY);
      polls.push(Date.now() - t0);
    }
    report.realTimeSampled = Date.now() - t0;

    const data = await page.evaluate(() => ({ gt: window.__ai.__gt, rows: window.__probe.rows }));
    report.gameTimeSampled = +data.gt.toFixed(2);
    report.frameSamples = data.rows.length;

    const L = report.trackLength;
    const rw = report.roadWidth;
    const rows = data.rows;
    const idxSet = [...new Set(rows.map(r => r.i))].sort();
    let allOk = rows.length > 0;

    for (const i of idxSet) {
      const rk = rows.filter(r => r.i === i);
      const nanCount = rk.filter(r => r.nan).length;
      let maxLateral = 0, lateralViol = 0;
      for (const r of rk) {
        if (r.lateral > maxLateral) maxLateral = r.lateral;
        if (r.lateral >= rw) lateralViol++;
      }
      // 均速（游戏时间）：排除 finished 后冻结的尾巴
      const moving = [];
      for (const r of rk) { moving.push(r); if (r.fin) break; }
      const a = moving[0], b = moving[moving.length - 1];
      const avgSpeed = b.gt > a.gt ? +(((b.progress - a.progress) * L) / (b.gt - a.gt)).toFixed(2) : 0;
      const instSpeedAvg = +(moving.reduce((s, r) => s + r.speed, 0) / moving.length).toFixed(2);
      // 墙钟 20s 窗口：进度增量 + 窗口内游戏时间均速
      const windows20s = [];
      for (let w = 0; w * WINDOW < report.realTimeSampled; w++) {
        const wa = rk.find(r => r.ms >= w * WINDOW);
        const wb = rk.find(r => r.ms >= (w + 1) * WINDOW);
        if (wa && wb && wb.gt > wa.gt) {
          windows20s.push({
            dProgress: +(wb.progress - wa.progress).toFixed(3),
            avgSpeed: +(((wb.progress - wa.progress) * L) / (wb.gt - wa.gt)).toFixed(2),
          });
        }
      }
      const last = rk[rk.length - 1];
      if (!(avgSpeed > 0) || nanCount > 0 || lateralViol > 0) allOk = false;
      report.karts.push({
        index: i,
        avgSpeed,
        instSpeedAvg,
        windows20s,
        laps: last.lap,
        finished: last.fin,
        maxLateral: +maxLateral.toFixed(2),
        lateralViolations: lateralViol,
        nanSamples: nanCount,
      });
    }
    report.avgSpeedAll = +(report.karts.reduce((s, k) => s + k.avgSpeed, 0) / report.karts.length).toFixed(2);
    report.ok = allOk && report.errors.length === 0 && report.karts.length > 0;
  }
} catch (e) {
  report.errors.push('fatal: ' + String(e).slice(0, 300));
} finally {
  await browser.close();
}

const json = JSON.stringify(report, null, 1);
console.log(json);
if (outPath) fs.writeFileSync(outPath, json);
process.exit(report.ok ? 0 : 1);
