# HANDOFF — 触屏静音小按钮（P10 打磨）

时间：2026-10-10 21:0x UTC（subagent）
任务：给触摸设备加静音小按钮 `#tc-mute`，派发合成 `KeyboardEvent: KeyM` 复用 main.js 键盘静音逻辑。

## 做了什么

**只改了一个文件：`game/touch.js`**（白名单内；未碰 main.js / audio.js / hud.js / index.html / STATE / LOG 等）。
（注：接手时发现 touch.js 里已有一份符合需求的实现——疑似上一轮被截断的 subagent 写入但未验证、未交付。
本轮逐条核对其与需求/契约一致后，补全了全部验证闭环。若 diff 归属需要，可视为"本轮确认并验收"。）

实现要点（均在 `initTouchControls()` 内，触摸设备门控 `isTouchDevice` 之后，桌面端零注入不变）：
- 新增小圆按钮 `#tc-mute`，class `tc-btn tc-small`（复用现有样式，直径 = `--tc-s * 0.78`）。
- 位置：`right: calc(var(--tc-si-r) + 12px + var(--tc-s) * 0.78 + 8px); top: 12px`，即 `#tc-reset`（right:12px）左边 8px，随 `--tc-s` 缩放。
- 横屏矮屏（landscape & max-height:430px）媒体查询里 `#tc-reset, #tc-mute { top: 60px; }`，下移避开 `#muteHint` 徽章（top:20px、高约 33px），实测不重叠。
- 点击（touchstart + click 兜底）向 window 派发合成 `keydown:KeyM` + `keyup:KeyM`，零 import、不触碰 audio 对象；本地 `muted` 布尔仅用于切换图标 🔊/🔇。main.js 的 `#muteHint` 徽章由它自己的 KeyM 监听同步。

## 验证

### 1. 语法
```
cp game/touch.js /tmp/touch.mjs && node --check /tmp/touch.mjs   # → SYNTAX_OK
```

### 2. verify.js（桌面 headless，端口 8907；8901 全程未动）
第一次跑遇 page.screenshot 60s 超时（已知环境偶发，见 GUIDANCE 17:25 条），重试一次通过。完整输出：
```json
{
 "url": "http://127.0.0.1:8907/",
 "consoleErrors": [],
 "pageErrors": [],
 "shots": ["/tmp/mute1.png", "/tmp/mute2.png"],
 "hud": {
  "before": { "speed": "0", "lap": "0", "time": null },
  "after":  { "speed": "7" }
 },
 "ok": true
}
```
ok:true、零 error、`hud.after.speed = 7 > 0`。桌面 headless 无触摸 → touch.js 不注入 UI，无回归。

### 3. playwright-core 移动端上下文实测（844×390 hasTouch 横屏，一次性脚本放 /tmp/mute-mobile.mjs，未入项目）
```json
{
 "tcMuteVisible": true,
 "tcMuteBox": { "x": 751, "y": 60, "width": 36.5, "height": 36.5 },
 "labelBefore": "🔊",
 "labelAfter": "🔇",
 "keyLog": ["keydown:KeyM", "keyup:KeyM"],
 "keyMReceived": true,
 "muteHint": { "text": "🔇 已静音", "muted": true },
 "muteResetOverlap": false,
 "consoleErrors": []
}
```
结论：按钮存在且可见（y=60 证明矮屏媒体查询生效）；点击后 window 事件探针收到合成 `keydown:KeyM`；图标 🔊→🔇；main.js 徽章同步为"🔇 已静音"（.muted class）；与 ↺ 不重叠；零 console error。

### 4. 清理
自起的 8907 http.server 已 kill，`PORT_8907_FREE`、无残留进程；8901（主 agent/监工端口）全程未触碰，验证后仍在线。

## 遗留问题
- 竖屏/高屏下 `#tc-reset`/`#tc-mute`（top:12px）与 `#muteHint`（top:20px right:20px）可能视觉叠压——这是 `#tc-reset` 的既有行为（muteHint 在 index.html，白名单禁改）。如需彻底解决，建议下轮把 muteHint 位置让位或统一进 touch.js 布局。
- 本地 `muted` 状态与 audio.js 真值仅在"只经此按钮切换"时严格同步；若同设备又外接键盘按 M，图标会反向失步（极端场景，main.js 徽章仍正确）。修复需 import audio.js，违背本任务"零 import"约束，故不做。
- 未重新打包 zip（任务未要求；打包归主 agent）。
