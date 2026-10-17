/**
 * P22 小地图：HUD 右下角 160×160 赛道轮廓。
 * - 北向上固定（世界 -z 朝上），无旋转；
 * - 玩家 = 白色箭头（带朝向），AI = 各自配色圆点；
 * - 赛道轮廓 = 主样条中心线描边 + 捷径虚线（有则画）；
 * - 纯 DOM canvas，零 import、init 前零副作用；不拦截任何指针事件。
 */

const MM_SIZE = 160;   // 画布边长（px），ROADMAP 规格 160×160
const MM_PAD = 16;     // 轮廓四周留白
const SAMPLES = 140;   // 中心线采样数

let canvas = null;
let ctx = null;
let pts = [];          // 主赛道中心线 [{x,z}]
let scLines = [];      // 捷径 [{ax,az,bx,bz}]
let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
let scale = 1, offX = 0, offZ = 0;

/** 世界坐标 → 小地图坐标（北向上：x→右，z→下） */
function toMap(x, z) {
  return [offX + (x - minX) * scale, offZ + (z - minZ) * scale];
}

/**
 * 初始化：创建 canvas 并预采样赛道轮廓。
 * @param {object} track Track 实例（需有 spline，可选 shortcuts）
 */
export function initMinimap(track) {
  canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  canvas.width = MM_SIZE;
  canvas.height = MM_SIZE;
  canvas.style.cssText = [
    'position:fixed', 'right:12px', 'bottom:12px',
    'width:' + MM_SIZE + 'px', 'height:' + MM_SIZE + 'px',
    'z-index:10', 'pointer-events:none',
    'background:rgba(0,0,0,0.45)',
    'border:1px solid rgba(255,255,255,0.25)', 'border-radius:12px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
  ].join(';');
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  // 采样主样条中心线
  pts = [];
  for (let i = 0; i < SAMPLES; i++) {
    const p = track.spline.getPointAt(i / SAMPLES);
    pts.push({ x: p.x, z: p.z });
  }
  // 捷径（classic 有，dune/glacier 为空 → 零回归）
  scLines = (track.shortcuts || []).map((s) => ({
    ax: s.a.x, az: s.a.z, bx: s.b.x, bz: s.b.z,
  }));

  // 包围盒（含捷径端点）
  minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
  const grow = (x, z) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  };
  for (const p of pts) grow(p.x, p.z);
  for (const s of scLines) { grow(s.ax, s.az); grow(s.bx, s.bz); }

  // 等比缩放铺满（减留白），居中
  const spanX = Math.max(maxX - minX, 1);
  const spanZ = Math.max(maxZ - minZ, 1);
  scale = Math.min((MM_SIZE - MM_PAD * 2) / spanX, (MM_SIZE - MM_PAD * 2) / spanZ);
  // 注意：toMap 已含 (x - minX)*scale，这里只加居中留白，不能再减 minX*scale（否则整图偏移出画布）
  offX = (MM_SIZE - spanX * scale) / 2;
  offZ = (MM_SIZE - spanZ * scale) / 2;
}

/**
 * 每帧重绘：赛道轮廓 → 捷径 → AI 圆点 → 玩家白箭头。
 * @param {object} player  kartPhysics（position + rotation）
 * @param {Array}  aiKarts AIKart 数组（position + color）
 */
export function updateMinimap(player, aiKarts) {
  if (!ctx || pts.length === 0) return;
  const S = MM_SIZE;
  ctx.clearRect(0, 0, S, S);

  // 赛道轮廓：先粗描边（路肩）再细描边（路面）
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const tracePath = () => {
    ctx.beginPath();
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const [mx, my] = toMap(p.x, p.z);
      if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
    }
    ctx.closePath();
  };
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 9;
  tracePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  tracePath(); ctx.stroke();

  // 捷径：黄色虚线
  if (scLines.length) {
    ctx.strokeStyle = 'rgba(255,221,0,0.65)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    for (const s of scLines) {
      const [ax, ay] = toMap(s.ax, s.az);
      const [bx, by] = toMap(s.bx, s.bz);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // AI：各自配色圆点（带深色描边防糊）
  for (const k of aiKarts || []) {
    const [mx, my] = toMap(k.position.x, k.position.z);
    const c = k.color ?? 0xffffff;
    ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    // 先描边后填充：描边只留在外侧半个线宽，实心色芯完整（探针按纯色芯判可见）
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
  }

  // 玩家：白色箭头（带朝向）。
  // 游戏前进方向 = (-sin(rot), 0, -cos(rot))；小地图 x→右、z→下，
  // 故箭头画布朝向角 = atan2(dy, dx)，其中 (dx,dy) = (-sin, -cos)。
  {
    const [mx, my] = toMap(player.position.x, player.position.z);
    const ang = Math.atan2(-Math.cos(player.rotation), -Math.sin(player.rotation));
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.5;
    // 先描边后填充：箭翼太窄（内切圆半径 ~1.6px），若 fill 后 stroke，
    // 描边会把纯白芯啃成 4×4，朝向/像素质心断言全部失效；
    // stroke→fill 后白芯覆盖整个箭头，外缘仍留半线宽深色描边。
    ctx.beginPath();
    ctx.moveTo(8, 0);    // 箭尖（前方）
    ctx.lineTo(-4, 5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, -5);
    ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
  }
}
