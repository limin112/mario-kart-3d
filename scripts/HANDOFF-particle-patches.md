# HANDOFF — particle-patches（绿/橙贴地圆斑修复）

日期：2026-10-12（北京时间）· subagent：particle-patches · 对应 GUIDANCE 13:15 条第①项

## 做了什么

定性确认监工 13:12 截图中赛道上的绿/橙贴地圆斑 = 粒子池 InstancedMesh 渲染 bug，并修复。

### 根因（验证成立，细节有一处补充）

`game/particles.js` 的 `_updatePool()`：每帧把活跃粒子的矩阵写在**它自己的原始实例槽位**
（`offset = i * 16`），却用 `mesh.count = activeCount` 截断渲染。当活跃粒子不恰好占满
前部槽位时（过期乱序产生"空洞"——各池 lifetime 均有 ±30~50% 随机抖动，必然发生），
count 窗口内混入未激活实例的残留矩阵：

- 从未写过的槽位 = 单位矩阵（本仓 vendor three r160 的 InstancedMesh 构造器逐实例
  `setMatrixAt(i, _identity)`，vendor/three.module.js:32662）→ 在 mesh 原点（赛道原点附近）
  画一个 1×1 贴地面片；
- 过期实例的槽位 = 最后一帧的**旧矩阵（幽灵）**→ 过期粒子冻结在赛道上原地复发。
  颜色池（pickupMushroom 红→橙 / pickupBanana 黄→橙）的 instanceColor 同样按原始索引写，
  残留颜色即监工看到的橙/黄色系圆斑。

补充定性（对主 agent 初判的一处精确化）：**初始单位矩阵路径在自然运行中几乎不可达**
——发射器从 0 号位向后找空位，"已写槽位数 ≥ activeCount"恒成立，且 update 先于 render，
单位矩阵进不了 count 窗口；实际被画出来的圆斑主体是**过期旧矩阵的幽灵槽位**（同一根因、
同一修法）。另注意幽灵是瞬态的（发射器很快复用空洞槽位），单次采样易漏，探针需密集轮询。

### 修复（最小改动，只动 _updatePool）

活跃实例的矩阵/颜色**紧凑写入前部槽位** `w++` 递增，`mesh.count = w`；
双色池 instanceColor 与矩阵写同一 w。外观、数量、API 零变化。

spawn 路径检查结论：emitTireSmoke/emitBoost/emitPickup/emitSlip 只置 active 标志与粒子
数据，从不直接写矩阵/颜色槽位，**无"实例索引 == 矩阵槽位"隐含假设，无需适配**。
main.js/items.js 只调 emit*/update，零改动。

## 改动文件

| 文件 | 改动 |
|---|---|
| `game/particles.js` | 仅 `_updatePool()`：`i*16`→`w*16`、颜色 `i*3`→`w*3`、`mesh.count = w`（净 diff ±10 行，含注释） |
| `tools/verify/particle-patch-probe.mjs` | 新建（保留复用）：专项探针，见下 |
| `scripts/HANDOFF-particle-patches.md` | 本文件 |

其余文件零改动（git status 可证）；未动 STATE/LOG/GUIDANCE/REQUIREMENTS；未 push。

## 验证

探针检查（每池）：a) `mesh.count <= 活跃实例数`；b) 前 count 个槽位矩阵均非单位矩阵；
c) **幽灵检测**：每个被渲染槽位的平移分量必须命中某活跃实例位置（b 在自然场景抓不到
旧矩阵幽灵，c 才是复现主力）。阶段：idle 13s → ArrowUp 3s（密集轮询）→
emitPickup/emitSlip 连续 8 轮爆发模拟真实道具战（每轮爆发后 450ms 内密集轮询），取最差快照。

### 1. node --check

`cp game/particles.js /tmp/p.mjs && node --check /tmp/p.mjs` → 通过。

### 2. particle-patch-probe.mjs 修复前/后对比

修复前（原 particles.js 挂临时端口 8907，不占主 agent 的 8901）——**复现成功**：

```
ok: false
burst FAIL: pickupMushroom ghostSlots=4 (count=76)
            pickupBanana  ghostSlots=2 (count=66)
            slip          ghostSlots=4 (count=76)
consoleErrors: [] pageErrors: []
```

（idle/drive 阶段全过——空洞需爆发+过期乱序才出现，与"监工玩了一段才看到"吻合）

修复后（8901，同探针同流程）——**全绿**：

```
ok: true
idle ok / drive ok / burst ok（各池 ghostSlots=0、identityInCount=0、count<=active）
consoleErrors: [] pageErrors: []
```

### 3. verify.js 完整回归

`node verify.js http://127.0.0.1:8901/ /tmp/pp1.png --drive /tmp/pp2.png`

```
ok: true  consoleErrors: []  pageErrors: []
hud: before speed=0 → after(drive) speed=5 (>0)
```

## 总结

绿/橙圆斑确认为粒子池 count 截断与非紧凑槽位写入的 bug：过期乱序产生的空洞让未激活实例
的残留矩阵被画在赛道上（颜色池残留色即橙/黄）。修复只改 particles.js 的 _updatePool，
矩阵/颜色紧凑写入前部槽位后 count=w。专项探针修复前复现（3 池共 10 个幽灵槽位）、修复后
全绿，verify.js 回归 ok:true 零 error、drive 速度 5 km/h。
