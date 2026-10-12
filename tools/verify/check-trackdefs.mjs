// P19a 赛道布局数据断言（纯 node，无浏览器）：
// 对 game/trackdefs.js 每个布局检查：坐标范围、相邻点间距 15~60m、简单多边形不自交、
// elevation 长度匹配；并专项断言 glacier 顶部 S 弯（P6/P7）：间距 ≥25m 且转角反向。
// 用法：node tools/verify/check-trackdefs.mjs  （全 PASS 退出码 0，否则 1）
import { TRACK_LAYOUTS } from '../../game/trackdefs.js';

const ccw = (a, b, c) =>
  (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]) ? 1
  : (c[1] - a[1]) * (b[0] - a[0]) < (b[1] - a[1]) * (c[0] - a[0]) ? -1 : 0;
const segInt = (p, p2, q, q2) =>
  ccw(p, q, q2) * ccw(p2, q, q2) < 0 && ccw(q, p, p2) * ccw(q, p2, p2) < 0;

function selfIntersections(pts) {
  const n = pts.length, bad = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((i === 0 && j === n - 1) || j === i + 1) continue;
      if (segInt(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) bad.push([i, j]);
    }
  }
  return bad;
}

function signedAngles(pts) {
  const n = pts.length;
  return pts.map((_, i) => {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1 = [p1[0] - p0[0], p1[1] - p0[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    return Math.atan2((v1[0] * v2[1] - v1[1] * v2[0]) / (l1 * l2),
                      (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)) * 180 / Math.PI;
  });
}

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fail++; };

for (const [key, layout] of Object.entries(TRACK_LAYOUTS)) {
  const pts = layout.controlPoints;
  const ds = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  ok(pts.length >= 8, `${key}: 控制点数 ${pts.length} >= 8`);
  ok(layout.elevation && layout.elevation.length === pts.length, `${key}: elevation 长度匹配`);
  ok(Math.max(...pts.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) <= 90, `${key}: 坐标范围 |x|,|z| <= 90`);
  ok(Math.min(...ds) >= 15 && Math.max(...ds) <= 60,
    `${key}: 相邻间距 ${Math.min(...ds).toFixed(1)}-${Math.max(...ds).toFixed(1)}m 在 15~60m`);
  const si = selfIntersections(pts);
  ok(si.length === 0, `${key}: 多边形不自交${si.length ? ' ' + JSON.stringify(si) : ''}`);
}

// P19a 专项：glacier 顶部 S 弯（P6/P7）
const g = TRACK_LAYOUTS.glacier.controlPoints;
const ga = signedAngles(g);
const d67 = Math.hypot(g[7][0] - g[6][0], g[7][1] - g[6][1]);
ok(d67 >= 25, `glacier: S 弯两转向点 P6/P7 间距 ${d67.toFixed(1)}m >= 25m`);
ok(ga[6] > 45 && ga[7] < -60,
  `glacier: S 弯反向转角 P6 ${ga[6].toFixed(1)}° / P7 ${ga[7].toFixed(1)}°（反向、幅度足够）`);

console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
