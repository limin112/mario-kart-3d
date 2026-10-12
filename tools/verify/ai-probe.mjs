#!/usr/bin/env node
/**
 * AI 行为专项探针（AI 加强子任务，监工 2026-10-12 17:06 第 3 项）。
 * 加载页面等 9 秒（过 splash/展示/倒计时），随后每 2 秒采样一次共 60 秒，
 * 读 window.__ai（ai.js DEBUG 暴露的 AIManager）+ window.track：
 *  1) 每台 AI 每 20 秒窗口 totalProgress（lap + 样条 t）增量 → 均速（m/s），
 *     以及全程均速；结果写 JSON（可与基线 JSON 对比）；
 *  2) 每台 AI 到样条中心线的横向偏移（getClosestPoint().distance）必须
 *     始终 < 路面半宽（不出界）；
 *  3) 无 NaN（position/rotation/speed/progress）、零 console/page error。
 * 用法：node ai-probe.mjs [--out /path/to/result.json]   （需 8901 已服务 game/）
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'http://127.0.0.1:8901/';
const WARMUP_MS = 9000;   // splash + 展示 + 倒计时
const SAMPLE_EVERY = 2000; // 采样间隔
const DURATION = 60000;    // 采样总时长
const WINDOW = 20000;      // 均速统计窗口

const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : null;

const browser = await chromium.launch();
const report = {
  ok: false,
  url: BASE,
  trackLength: null,
  roadWidth: null,
  sampleCount: 0,
  karts: [],
  errors: [],
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(WARMUP_MS);

  const ready = await page.evaluate(() => !!(window.__ai && window.track && window.__ai.aiKarts.length));
  if (!ready) {
    report.errors.push('window.__ai / window.track 不可用（ai.js DEBUG 暴露缺失？）');
  } else {
    report.trackLength = await page.evaluate(() => window.track.getLength());
    report.roadWidth = await page.evaluate(() => window.track.cfg.roadWidth);

    const t0 = Date.now();
    const series = []; // [{ ms, karts: [{index, progress, lateral, speed, lap, finished, nan}] }]
    while (Date.now() - t0 <= DURATION + SAMPLE_EVERY / 2) {
      const snap = await page.evaluate(() => {
        const track = window.track;
        return window.__ai.aiKarts.map((k, i) => {
          const c = track.getClosestPoint(k.position);
          const progress = (k.lap || 0) + c.t;
          const nan = ![k.position.x, k.position.z, k.rotation, k.speed, progress].every(Number.isFinite);
          return {
            index: i,
            progress,
            lateral: c.distance,
            speed: k.speed,
            lap: k.lap,
            finished: !!k.finished,
            nan,
          };
        });
      });
      series.push({ ms: Date.now() - t0, karts: snap });
      if (Date.now() - t0 > DURATION) break;
      await page.waitForTimeout(SAMPLE_EVERY);
    }
    report.sampleCount = series.length;

    const nKarts = series[0].karts.length;
    const rw = report.roadWidth;
    let allOk = true;
    for (let i = 0; i < nKarts; i++) {
      // 拼接连续进度（防 finished 后进度冻结在窗口中途仍按冻结前算，用逐点累加处理 lap 回绕）
      const pts = series.map((s) => ({ ms: s.ms, k: s.karts[i] }));
      const nanCount = pts.filter((p) => p.k.nan).length;
      let maxLateral = 0;
      let lateralViol = 0;
      for (const p of pts) {
        if (p.k.lateral > maxLateral) maxLateral = p.k.lateral;
        if (p.k.lateral >= rw) lateralViol++;
      }
      // 20s 窗口均速：窗口内首末采样 progress 增量（progress 含 lap，天然单调，无需回绕处理）
      const windows = [];
      for (let w = 0; w < 3; w++) {
        const a = pts.find((p) => p.ms >= w * WINDOW);
        const b = pts.find((p) => p.ms >= (w + 1) * WINDOW) || pts[pts.length - 1];
        if (a && b && b.ms > a.ms) {
          const dProg = b.k.progress - a.k.progress;
          windows.push(+(dProg * report.trackLength / ((b.ms - a.ms) / 1000)).toFixed(2));
        }
      }
      const first = pts[0].k.progress, last = pts[pts.length - 1].k.progress;
      const avgSpeed = +((last - first) * report.trackLength / ((pts[pts.length - 1].ms - pts[0].ms) / 1000)).toFixed(2);
      const laps = pts[pts.length - 1].k.lap;
      const finished = pts[pts.length - 1].k.finished;
      if (nanCount > 0 || lateralViol > 0 || !(avgSpeed > 0)) allOk = false;
      report.karts.push({
        index: i, avgSpeed, windows20s: windows, laps, finished,
        maxLateral: +maxLateral.toFixed(2), lateralViolations: lateralViol, nanSamples: nanCount,
      });
    }
    report.avgSpeedAll = +(report.karts.reduce((a, k) => a + k.avgSpeed, 0) / nKarts).toFixed(2);
    report.ok = allOk && report.errors.length === 0 && nKarts > 0;
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
