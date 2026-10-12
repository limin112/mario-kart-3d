#!/usr/bin/env node
/**
 * 绿/橙贴地圆斑专项探针（particle-patches，保留复用）：
 * 背景：particles.js _updatePool 曾用 mesh.count = activeCount 截断渲染，但活跃粒子
 * 矩阵写在自己的原始槽位（offset = i*16），未紧凑到前部 → count 覆盖到未激活实例的
 * 残留矩阵（three.js InstancedMesh 初始化为单位矩阵 → 在 mesh 原点画 1×1 贴地面片
 * = 赛道上的绿/橙圆斑）。
 * 检查（每个池）：
 *   a) mesh.count <= 活跃实例数（count 不许盖住未激活槽位）；
 *   b) 前 mesh.count 个槽位矩阵均非单位矩阵（单位矩阵 = 未激活残留，
 *      平移全 0 且 scale=1，会在世界原点画贴地圆斑）；
 *   c) 幽灵槽位检测（比 b) 更强，自然场景下主要靠它复现）：每个被渲染槽位的平移
 *      分量必须命中某个当前活跃实例的位置；命中不了 = 过期实例的残留旧矩阵被画在
 *      赛道上（冻结的贴地圆斑）。修复前（矩阵写原始槽位）空洞时会命中不了；
 *      修复后（紧凑写入 [0,w)）恒命中。
 * 采样：进比赛态 ~13s（idle）→ 按 ArrowUp 3s 触发轮胎烟雾复查 →
 *       再模拟真实拾取/打滑（emitPickup/emitSlip 连续爆发，寿命随机→空洞最易出现）复查。
 * 采样：进比赛态 ~13s（idle）→ 按住 ArrowUp 3s 触发轮胎烟雾，期间密集轮询 →
 *       再模拟真实拾取/打滑（emitPickup/emitSlip 连续爆发，寿命随机→过期乱序产生空洞）。
 *       幽灵槽位是瞬态的（发射器很快复用空洞），故每阶段密集轮询取最差快照。
 * 用法：node particle-patch-probe.mjs <url>
 * 输出 JSON（含 ok 字段）：修复前 idle 阶段应复现（count=maxCount 全单位矩阵）；修复后 ok:true。
 */
import { chromium } from 'playwright-core';

const PROBE_FN = () => {
  const EPS = 1e-6;
  const poolsOut = {};
  const ps = window.__mk && window.__mk.particleSystem;
  if (!ps) return { error: 'window.__mk.particleSystem not found' };
  for (const [name, pool] of Object.entries(ps.pools)) {
    const mesh = pool.mesh;
    const m = mesh.instanceMatrix.array;
    const activeList = pool.instances.filter((it) => it.active);
    const activeCount = activeList.length;
    let identitySlots = [];
    let ghostSlots = 0;
    for (let s = 0; s < mesh.count; s++) {
      const o = s * 16;
      const isIdentity =
        Math.abs(m[o + 0] - 1) < EPS && Math.abs(m[o + 1]) < EPS && Math.abs(m[o + 2]) < EPS && Math.abs(m[o + 3]) < EPS &&
        Math.abs(m[o + 4]) < EPS && Math.abs(m[o + 5] - 1) < EPS && Math.abs(m[o + 6]) < EPS && Math.abs(m[o + 7]) < EPS &&
        Math.abs(m[o + 8]) < EPS && Math.abs(m[o + 9]) < EPS && Math.abs(m[o + 10] - 1) < EPS && Math.abs(m[o + 11]) < EPS &&
        Math.abs(m[o + 12]) < EPS && Math.abs(m[o + 13]) < EPS && Math.abs(m[o + 14]) < EPS && Math.abs(m[o + 15] - 1) < EPS;
      if (isIdentity) identitySlots.push(s);
      // 幽灵检测：该槽位平移应命中某个活跃实例的位置（矩阵平移 = inst.position）
      const px = m[o + 12], py = m[o + 13], pz = m[o + 14];
      const hit = activeList.some((it) =>
        Math.abs(it.position.x - px) < 1e-3 && Math.abs(it.position.y - py) < 1e-3 && Math.abs(it.position.z - pz) < 1e-3);
      if (!hit) ghostSlots++;
    }
    poolsOut[name] = {
      maxCount: pool.instances.length,
      count: mesh.count,
      activeCount,
      countLeActive: mesh.count <= activeCount,
      identityInCount: identitySlots.length,
      identitySlotsSample: identitySlots.slice(0, 5),
      ghostSlots,
      pass: mesh.count <= activeCount && identitySlots.length === 0 && ghostSlots === 0,
    };
  }
  return poolsOut;
};

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8901/';
  const report = { url, ok: false, idle: null, drive: null, consoleErrors: [], pageErrors: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));

  const allPass = (pools) =>
    pools && !pools.error && Object.values(pools).every((p) => p.pass);

  // 多轮快照取每个池的最差样本（ghost+identity 最多的一次）
  const worstOf = (snaps) => {
    const worst = {};
    for (const snap of snaps) {
      if (!snap || snap.error) continue;
      for (const [k, v] of Object.entries(snap)) {
        const cur = worst[k];
        if (!cur || v.ghostSlots + v.identityInCount > cur.ghostSlots + cur.identityInCount) worst[k] = v;
      }
    }
    return worst;
  };
  const pollWorst = async (ms, stepMs = 150) => {
    const snaps = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      snaps.push(await page.evaluate(PROBE_FN));
      await page.waitForTimeout(stepMs);
    }
    return worstOf(snaps);
  };

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(13000); // 进比赛态（倒计时结束）
    report.idle = await page.evaluate(PROBE_FN);

    // 轮胎烟雾：按住 ArrowUp 3s，期间密集轮询
    await page.keyboard.down('ArrowUp');
    report.drive = await pollWorst(3000);
    await page.keyboard.up('ArrowUp');
    report.drive = worstOf([report.drive, await page.evaluate(PROBE_FN)]);

    // 模拟真实拾取/打滑：双色池/打滑池连续爆发 + 随机寿命 → 过期乱序产生空洞，
    // 爆发后密集轮询（寿命 0.4~0.8s，空洞在下次 spawn 复用前可见）；
    // 修复前此处大概率抓到幽灵槽位（旧矩阵被画在赛道上 = 贴地圆斑）
    const burstSnaps = [];
    for (let round = 0; round < 8; round++) {
      await page.evaluate((r) => {
        const ps = window.__mk.particleSystem;
        const p = window.__mk.playerKart.position.clone();
        ps.emitPickup(p, r % 2 ? 'banana' : 'mushroom');
        ps.emitSlip(p);
      }, round);
      burstSnaps.push(await pollWorst(450, 120));
    }
    report.burst = worstOf(burstSnaps);

    report.ok = allPass(report.idle) && allPass(report.drive) && allPass(report.burst) &&
      report.consoleErrors.length === 0 && report.pageErrors.length === 0;
  } catch (e) {
    report.fatal = String(e).slice(0, 300);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => {
  console.log(JSON.stringify({ ok: false, fatal: String(e).slice(0, 300) }));
  process.exit(1);
});
