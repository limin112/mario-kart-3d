// P19 布局断言脚本：校验 game/trackdefs.js 三个布局的几何质量。
// 断言：边界/间距/闭环长度/简单多边形不自交/发夹弯/S 组合弯/起步直道/elevation 数据。
// 用法：node scripts/check-trackdefs.mjs
import { TRACK_LAYOUTS } from '../game/trackdefs.js';

const names = Object.keys(TRACK_LAYOUTS);
let fail = 0;
const err = (m) => { console.log('  FAIL: ' + m); fail++; };

function segInt(a, b, c, d) {
  const s = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return s(a, b, c) !== s(a, b, d) && s(c, d, a) !== s(c, d, b);
}
function turnAngle(p, q, r) {
  const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]);
  const a2 = Math.atan2(r[1] - q[1], r[0] - q[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return (d * 180) / Math.PI; // 带符号：+左(-z侧)/-右，绝对值=转角
}

for (const name of names) {
  const L = TRACK_LAYOUTS[name];
  const pts = L.controlPoints;
  const n = pts.length;
  console.log(`\n=== ${name} (${L.name}) ${n} pts, rw=${L.roadWidth} ===`);

  // 边界 & 间距
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i];
    if (Math.abs(x) > 90 || Math.abs(z) > 90) err(`${name} P${i} out of bounds: ${x},${z}`);
    const a = pts[i], b = pts[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    perim += d;
    if (d < 15 || d > 60) err(`${name} P${i}->P${(i + 1) % n} spacing ${d.toFixed(1)}m out of 15-60`);
  }
  if (perim < 330 || perim > 680) err(`${name} perimeter ${perim.toFixed(0)}m out of 330-680`);

  // 简单多边形（非相邻边不相交）
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segInt(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) err(`${name} self-intersect edge ${i} x edge ${j}`);
    }
  }

  // 转角表 + 特征检测
  const angles = pts.map((_, i) => turnAngle(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]));
  console.log('  turn angles: ' + angles.map((a) => a.toFixed(0)).join(', '));
  const maxTurn = Math.max(...angles.map(Math.abs));
  if (maxTurn < 95) err(`${name} no hairpin (max turn ${maxTurn.toFixed(0)}° < 95°)`);
  // S 组合弯：相邻两顶点转角反号且都 ≥30°
  let sPairs = 0;
  for (let i = 0; i < n; i++) {
    const a = angles[i], b = angles[(i + 1) % n];
    if (a * b < 0 && Math.abs(a) >= 30 && Math.abs(b) >= 30) sPairs++;
  }
  if (sPairs < 1) err(`${name} no S-chicane (need adjacent opposite turns >=30°)`);
  // 直道多样性：最长/最短段比
  const segs = pts.map((p, i) => Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]));
  const ratio = Math.max(...segs) / Math.min(...segs);
  if (ratio < 1.8) err(`${name} straight/shortest ratio ${ratio.toFixed(2)} < 1.8 (no straight variety)`);
  // 起步直道：P0->P1 与 P1->P2 夹角 ≤30°，且 P0 前一段（末段）也较直（出生点在起点线后）
  const startTurn = Math.abs(turnAngle(pts[n - 1], pts[0], pts[1]));
  if (startTurn > 35) err(`${name} start corner ${startTurn.toFixed(0)}° > 35° (spawn area must be straight)`);
  const prevTurn = Math.abs(turnAngle(pts[n - 2], pts[n - 1], pts[0]));
  if (prevTurn > 45) err(`${name} pre-start corner ${prevTurn.toFixed(0)}° > 45°`);

  // elevation 数据（P19 第二步将接入 track.js y）
  const el = L.elevation;
  if (!Array.isArray(el) || el.length !== n) err(`${name} elevation must be array of ${n}`);
  else {
    if (el.some((y) => y < -4 || y > 4)) err(`${name} elevation out of ±4m`);
    const range = Math.max(...el) - Math.min(...el);
    if (range < 1.5) err(`${name} elevation range ${range} < 1.5m (no hills)`);
    if (Math.abs(el[n - 1] - el[0]) > 1.6) err(`${name} elevation loop jump ${el[n - 1]}->${el[0]}`);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(el[(i + 1) % n] - el[i]);
      const seg = segs[i];
      if (d / seg > 0.12) err(`${name} grade P${i} too steep: ${(d / seg * 100).toFixed(0)}%`);
    }
  }

  // ASCII 地图（x→列，z→行）
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const W = 64, H = 24;
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x, z, ch) => {
    const c = Math.round(((x - x0) / (x1 - x0)) * (W - 1));
    const r = Math.round(((z - z0) / (z1 - z0)) * (H - 1));
    grid[r][c] = ch;
  };
  // 沿边插值画线
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let s = 0; s <= 20; s++) put(a[0] + ((b[0] - a[0]) * s) / 20, a[1] + ((b[1] - a[1]) * s) / 20, '-');
  }
  pts.forEach(([x, z], i) => put(x, z, i === 0 ? 'S' : String(i % 10)));
  console.log(grid.map((r) => '  |' + r.join('') + '|').join('\n'));
  console.log(`  perimeter≈${perim.toFixed(0)}m, maxTurn=${maxTurn.toFixed(0)}°, S-pairs=${sPairs}, segRatio=${ratio.toFixed(2)}, elevRange=${(Math.max(...el) - Math.min(...el)).toFixed(1)}m`);
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
