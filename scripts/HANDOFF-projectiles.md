# HANDOFF — game/projectiles.js（P15 弹体模块）

日期：2026-10-12（北京时间）
执行者：projectiles subagent

## 做了什么
- 新建 `game/projectiles.js`，含 `Shell` 类（红/绿龟壳弹体）与 `triggerLightningFlash()`（全屏白色闪电闪光）。
- 未触碰任何其他文件。

## API 契约对照（零偏离）
- `export class Shell`，`constructor(scene, opts)`：opts = { type, position, rotation, speed, lifetime }，position 被 clone 后 y 钉在 0.35（贴地飞行）。
- 实例属性：`type`（'red'|'green'）、`position`（每帧更新的外部可读 Vector3）、`radius = 1.6`、`active`（lifetime 耗尽置 false 且 mesh.visible=false，不自动 dispose）、`mesh`（THREE.Group，构造时已 add 进 scene）。
- `update(dt, target = null)`：
  - red 有 target 时按 heading 角差（atan2(sin,cos) 归一化到 -PI..PI）限速 3.5 rad/s 平滑转向；无 target 直线飞；green 恒直线飞。
  - 速度恒 opts.speed；前进方向 = (-sin(rotation), 0, -cos(rotation))，与 kart 约定一致。
  - lifetime -= dt，<=0 时 active=false、mesh.visible=false。
  - 每帧 mesh.position 同步 position；外层 group rotation.y=heading，内层 roll 组绕局部 X 轴滚动（龟壳滚地观感）。
  - 命中判定不做，留给调用方。
- `dispose()`：scene.remove + traverse dispose geometry/material，`_disposed` 标志保证可重复调用。
- `export function triggerLightningFlash(duration = 0.8)`：div fixed、inset:0、pointer-events:none、z-index:9999，白→透明 CSS transition 淡出，duration*1000+50ms 后移除；每次调用独立创建/移除互不干扰；document 不可用时静默返回（判空安全）。

## 造型
- 红壳：红 0xdd2222 压扁球壳 + 深红腹面圆柱 + 顶部凸点；绿壳同构换 0x33cc44。
- 每壳 3 个 mesh（3 draw call ≤ 4），flatShading 低多边形风。

## 红线自检
- `node --check /tmp/proj.mjs` → 通过（SYNTAX_OK）。
- `grep -c "console\." game/projectiles.js` → 0（零 console 输出）。
- 除 `three` 外零 import；DOM 操作仅在 triggerLightningFlash 内创建/移除 div。

## 集成提示（给主 agent）
- items.js 侧：发射时 `new Shell(scene, {...})`，每帧 `shell.update(dt, targetKartOrNull)`，用 `shell.position.distanceTo(...) < shell.radius` 判命中，命中/出界后 `shell.dispose()`。
- 闪电触发直接 `triggerLightningFlash()` 即可。
