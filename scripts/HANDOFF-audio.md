# HANDOFF — game/audio.js（WebAudio 程序化音效模块）

日期：2026-10-11 · 负责：游戏开发 subagent · 集成：主 agent（main.js）

## 做了什么

新建独立音效模块 `game/audio.js`，导出 `AudioManager` 类。纯 WebAudio 程序化合成，
零外部音频文件、零 import（连 three 都不引）。所有方法在未 unlock / ctx 不可用时
安全 no-op，绝不 throw、绝不 console.*，适配 headless 环境红线。

## 新建文件（白名单内）

- `game/audio.js`
- `scripts/HANDOFF-audio.md`（本文件）

未触碰任何其他文件。

## API 契约实现情况（逐方法）

| 方法 | 状态 | 说明 |
|---|---|---|
| `constructor()` | ✅ | 不创建 AudioContext、不抛错，只置空字段 |
| `unlock()` | ✅ | 创建 ctx + masterGain(0.5) + 引擎链路；resume 的 Promise 失败被 catch；幂等（unlocked 标志 + ctx 复用）；构造/创建失败静默（ctx 置 null） |
| `setEngine(speedRatio, accelInput)` | ✅ | 每帧调用；speedRatio 钳制 0~1；基频 55~190Hz（+accel 微调 ±8Hz），sawtooth 主 + triangle 低八度 → lowpass（随速度 400~2000Hz 开亮）→ engineGain；全部 `setTargetAtTime` 平滑；speedRatio≤0.001 时音量趋近 0；未 unlock 时 no-op |
| `stopEngine()` | ✅ | `cancelScheduledValues + setValueAtTime(0)` 立即归零；节点保留可复用 |
| `playCountdownBeep()` | ✅ | 方波 600Hz、0.12s，12ms attack + 尾部 decay 防爆音 |
| `playGoBeep()` | ✅ | 方波 900Hz、0.4s |
| `playPickup()` | ✅ | 双音上行：方波 660Hz(0.09s) → 880Hz(0.12s) |
| `playMushroom()` | ✅ | sawtooth 300→1200Hz 指数上行扫频 0.35s |
| `playBanana()` | ✅ | 白噪声 buffer + bandpass 400→3200Hz 扫频 0.3s（whoosh） |
| `playSlip()` | ✅ | sawtooth 800→200Hz 下行滑音 0.4s + 两声短促方波（1000/800Hz）警报感 |

节点泄漏防护：一次性音效的 oscillator/bufferSource 均在固定 stop 时间后经
`onended` 回调 disconnect（osc→gain→master 全链）；引擎音为常驻节点，仅创建一次。

## 验证结果

1. `cp game/audio.js /tmp/audio-check.mjs && node --check /tmp/audio-check.mjs` → **通过**（SYNTAX OK）
2. grep 自检：无 `import`/`require`（零外部依赖）、无任何 `console.` 调用 → **通过**
3. 额外冒烟测试（/tmp/audio-smoke.mjs，node 运行）：
   - 无 window 环境（模拟 headless node）：全部方法调用不抛错 ✅
   - mock AudioContext：unlock 幂等、setEngine 越界入参钳制、全部 play* 正常排程、onended 触发无异常 ✅
   - AudioContext 构造即抛错的环境：unlock 静默失败（unlocked=false），后续调用全部 no-op ✅

## 偏离契约之处

无。方法名/签名与契约完全一致。

## 集成提示（给主 agent）

- 首次 `pointerdown`/`keydown` 手势里调 `audio.unlock()`（一次性）。
- 每帧 `audio.setEngine(Math.abs(speed)/maxSpeed, accelInput)`；比赛结束/重置调 `stopEngine()`。
- suspended 状态下调用 play* 是安全的（事件照常排程，resume 后播放或过期即弃），不会报错。
