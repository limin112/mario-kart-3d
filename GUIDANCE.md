# GUIDANCE — 监工指导（Muse 维护，Pi 每轮开始必读，用户不可直接改）

- 2026-10-10 09:00 初始化：按 REQUIREMENTS.md 从 P1 开始。
  记住三件事：①小步快跑，每轮只做"下一步"里的一小步；
  ②改完必须验证（headless 截图 + console 无 error），红线不让步；
  ③诚实记录，修不好就标 BLOCKED，不要伪造完成。
- 2026-10-10 09:30 验证方案更新（覆盖 09:20 那条）：监工已装好真机验证工具，
  以后每轮用它，不许再用本机 chrome 命令行：
  `cd tools/verify && node verify.js http://127.0.0.1:8901/ /tmp/s1.png --drive /tmp/s2.png`
  （先 `cd game && python3 -m http.server 8901 &` 起服务）。
  要求输出 `ok:true` 且 `--drive` 后 `hud.after.speed > 0`。
  另外 Three.js 已改为本地 vendor（game/vendor/three.module.js），
  importmap 不许再指回 CDN。
- 2026-10-10 09:10 用户指令：美术效果现在太差，但**等玩法做完（P1–P5）之后再统一提升**，
  P6 才是美术阶段。P1–P5 阶段不许在美术上磨洋工：盒子车、纯色材质可以接受，
  把精力放在玩法、物理、AI、道具逻辑和可玩性上。
- 2026-10-10 13:15 运行模式升级（用户指令）：① loop 改为持续守护进程
  （scripts/loop-daemon.sh，一轮接一轮、轮间歇 90 秒），由 mario-kart-pi-loop
  看门狗 cron（30 分钟）保活，死了会自动拉起；② babysit 改为每 2 小时简报；
  ③ 你现在可以开 ONE 个 subagent 并行工作（协议见 scripts/iteration-prompt.txt
  "并行 subagent"一节）：文件白名单严格隔离、等 HANDOFF、跑 verify.js、
  本轮结束前必须收尾不许留残留进程。拿不准能不能并行时，单干更稳。
- 2026-10-10 13:55 新增 P7（用户指令）：学 @lxfater 四驱兄弟赛车宣传片的
  "爆炸拆解展示"模式。P6 美术收尾后做 P7：游戏加载先进入车辆展示
  （深色舞台+蓝图网格，kart 部件分离悬浮自转、镜头环绕），按任意键进比赛。
  细节见 REQUIREMENTS.md P7。注意 kart 模型要做成部件 group 才好拆。
- 2026-10-10 15:14 P8 回归检查项（监工观察）：headless 验证里"当前圈/总时间"走得比墙钟快约 3 倍
  （两次截图分别显示 29.76s / 36.99s，而页面只加载了十几秒），同时 verify.js 的 hud.after.speed
  读到 0（截图里 HUD 实际显示 9 km/h，驾驶正常，是采样时序问题不是 bug）。
  打包验收时顺手确认两件事：① 真实浏览器里圈速计时是否与墙钟一致（检查 main.js 计时是否用了
  未钳制的 dt 累加、update 是否被多调了一次）；② verify.js 的驾驶采样可适当延后读数，
  别被这个 0 误导。游戏本身渲染/驾驶/零报错都正常，P8 继续按计划做回归+打包即可。
- 2026-10-10 17:25 运维小提醒（监工观察）：① 8901 是大家共用的验证端口，这轮你反复
  `lsof -ti:8901 | xargs kill -9` 再起 http.server，把监工的验证也打断了好几次；
  而且命令里 `sleep 1` 和 `cd` 之间漏了分号，cd 根本没生效。以后改成幂等式：
  先 curl 探活，通了就别动，不通再起，一次就够，别循环 kill。② verify.js 的
  page.screenshot 在这台无头机上偶发 30s 超时（软件渲染重场景，单张抓图就要
  ~19s，这是验证工具/环境的问题，不是游戏 bug）：先重试一次，还不行就用 CDP
  的 Page.captureScreenshot 直抓（监工已验证可行），不要为了让截图通过去改
  游戏代码。③ 渲染/驾驶/零 console error 都正常，P8 继续按计划做回归+打包即可。
- 2026-10-10 19:15 项目完结运维提醒（监工观察）：P8 已验收，STATE 标记"项目完结、无后续任务"。
  轮次开始看到这一点就直接休眠等待新指令，不要为了"找事做"去调用模型——免费模型日配额
  已用完（429，次日 08:00 +08 恢复），重试风暴既无产出也无费用，只是刷爆日志。
  用户若下达新任务，会写在 STATE/GUIDANCE 里，到时再干活。
- 2026-10-10 21:00 打磨清单（用户手机体验反馈）：加移动端触屏控制——
  屏幕左右两侧虚拟按键（左转/右转/油门/刹车/道具），touchstart/touchend 映射
  到现有键盘输入，HUD 按钮半透明不遮挡画面；桌面端保持键盘操作不变。
  verify.js 在 headless 下只需保证触屏代码不报错（无真实触摸也可 ok:true）。
- 2026-10-10 21:15 429 熔断指导（监工观察）：免费模型日配额已耗尽（429，次日 08:00 +08 恢复），
  90 秒一轮的重试只是在刷日志。以后每轮开始前先看 usage.log 最后几行：如果最近一次调用
  是 429 且当前时间早于配额重置时间，直接休眠跳过本轮，不许调用模型（连 fallback 也不许）。
  配额恢复后第一件事：把 STATE 的"项目完结、无后续任务"改成新任务（用户 21:00 需求：
  移动端触屏控制，见本文件 21:00 条），然后按小步快跑从那开始。重试不创造价值，睡
  觉创造配额。
- 2026-10-11 01:30 Pi 接入 Qwen（用户指令"pi接入qwen"）：loop 改为 Qwen 优先——
  每轮先经 strata 中继（127.0.0.1:18182）健康检查用户本地 worker3 的 Qwen
  （strata/qwen-flash，本地量化版 qwen3.8-flash），通了就用 Qwen 跑本轮；
  不通则降级 OpenRouter（免费配额每日 1000 次，UTC 午夜=北京时间 08:00 重置）。
  注意：用户本地机器睡眠/离线时 Qwen 无响应属正常，等唤醒后 loop 自动恢复，
  不要为此改配置。Qwen 是小量化模型，写代码够用但弱于 Nemotron 550B，
  复杂任务自觉拆小步，每步必跑 verify.js。
- 2026-10-11 03:20 Qwen 健康检查 bug 已修复（监工直接修了 loop-iteration.sh，因为你当时卡死在 429 循环里读不到新指导）：qwen_up() 之前是裸 curl 不带 Authorization，worker3 的 llama.cpp 要求 Bearer key，返回 401 → 检查永远失败 → 每轮误报 "qwen down" → 回退 OpenRouter（配额已空，429）→ sleep 600 空转。过去两小时 81 次调用里 80 次都是 429，纯粹在刷日志。修复后健康检查从 ~/.pi/agent/models.json 现取 strata key 带 Bearer 鉴权（只在进程内存里，不落盘、不进命令行参数），实测 qwen_up=PASS，/v1/chat/completions 真实打通（HTTP 200）。下一轮（约 03:18）daemon 自动用新逻辑走 Qwen 跑。轮次开始后请：①按 21:15 条把 STATE 从"项目完结"改成待办任务（用户 21:00 指令：移动端触屏控制）；②Qwen 是小量化模型，任务自觉拆小步，每步必跑 verify.js；③如果 Qwen 又报 down，先用同样带鉴权的命令手工验一下再下结论，别又掉回 429 循环。
- 2026-10-11 11:30 紧急 bug（用户亲自发现，我已复现确认）：发车时玩家+AI 卡丁车
  出生在草地上的灰色平台（疑似 P7 展示舞台残留/未隐藏），根本不在赛道上。
  证据截图：shots/spawn-bug-20261011.png（加载后 6.5s，发车瞬间）。
  修复要求：① 进入比赛（倒计时开始）时必须隐藏/移除展示舞台及一切展示场景物体；
  ② 所有卡丁车出生点必须在赛道起点线之后、路面宽度以内，车头朝向赛道行进方向；
  ③ 出生后相机、HUD、圈速检查点逻辑不受影响。修完跑 tools/verify/verify.js，
  并用 headless 截图（加载后 6-7s）亲眼确认车在路面上再收工。这是 P0，优先于一切打磨。
- 2026-10-11 13:10 P11 返工（我已亲眼验证截图）：灰色展示台已移除是对的，
  但出生点仍在草地上——shots/spawn-still-off-20261011.png（发车后 12s 未驾驶），
  4 台车全在赛道外约 5 米的草地上，沥青路面就在旁边。
  根因：main.js placeKartAtStartLine 用"起点线后 8 米+偏左 3 米"固定偏移，
  在弯道/路面收窄处直接落到路面外；ai.js placeAtStartLine 同理。
  修复：出生点必须走 track 样条采样——取起点处 spline 点+切线，
  4 台车放在起点线后方路面宽度内横向排开（2×2 或品字形）、纵向错开 3-4 米，
  每个出生点都做路面内检查（到 spline 中心线距离 < 路面半宽-1 米），
  出界就沿法线往中心线收。修完 headless 截图（6s/12s 两张）亲眼确认
  4 台车全在沥青路面上再收工。这是 P0。
- 2026-10-11 13:15 返工：P11 出生点 bug 修完后我独立复验了一遍（Playwright 加载、等 12 秒截图，
  证据 shots/spawn-recheck-20261011-1315.png），发车时卡丁车还是停在草地上的灰色平台上，
  没有回到沥青赛道——看起来修复没有生效。别灰心，这种"看着改了但没生效"的情况多半是：
  ① 展示舞台在进入比赛时没有真正隐藏/移除（检查 showcase 相关物体的 visible/dispose，
  尤其 GridHelper 这类非 Mesh）；② 出生点计算用的 forward/leftNormal 还是反的，
  或者起点线位置本身就不在路面上——建议先在控制台打印出生点世界坐标，
  对照赛道样条起点确认。另外确认改的是 game/ 下正在被 8901 服务的文件。
  修完老规矩：verify.js + 6-7 秒截图亲眼确认车在路面上。
- 2026-10-11 13:15 babysit 独立复核（verify.js ok:true、零 error、--drive 14 km/h，
  证据 shots/babysit-20261011-0513.png / -drive.png）：发车时 4 台车确实还在草地上，
  呈 2×2 排布，沥青赛道在右侧约 5 米处，13:10 的结论依然成立。
  新增线索帮你排除一条路：index.html 实际加载的是 game/ 下的 .js 文件
  （<script type="module" src="main.js">），而非同名的 .mjs 镜像——
  你的修改落在了正确的文件上（main.js 里 placeKartAtStartLine 在第 809 行，
  ai.js 里 placeAtStartLine 在第 448 行，都存在），"改错文件"可以排除了。
  问题就在出生点坐标的数学里。另外从我的截图看灰色平台似乎已经不在画面里，
  展示舞台清理可能已生效，剩下要修的就只有出生点本身。
  不急，一步一步来：先在控制台打印 4 台车的出生点世界坐标（x, z），
  再从 track 的 spline 上取起点处中心点坐标，两个数字摆在一起看，
  差多少、偏哪边，答案就出来了。
- 2026-10-11 14:03 重要发现（Muse 研究轮，非 Pi）：困扰大家两天的"车在草地上、不在沥青路上"，
  真正的根因不是出生点坐标——而是赛道沥青路面网格本身从 P2 起就一直是不可见的！
  证据：track.js _createRoad() 的三角形绕序是 (idx, idx+1, idx+2)/(idx+2, idx+1, idx+3)，
  我用 Node + 三个样条在 6 个 t 值处复算了面法线，6/6 朝下（y 为负），Three.js 默认
  FrontSide 下从上方看会被背面剔除——等于路面从没渲染过，大家看到的"草地"就是被镂空的路面。
  修复（已由我直接改好，game/track.js 第 442 行，2 行）：绕序改为 (idx, idx+2, idx+1) /
  (idx+2, idx+3, idx+1)，同样 6 点复算面法线 6/6 朝上；verify.js ok:true 零 error，
  --drive 10 km/h，截图亲眼确认 4 台车站在深色沥青路面上（/tmp/roadfix-verify.png、
  /tmp/roadfix-drive.png）。注意：① 不要把这个绕序改回去；② 你正在做的 getSpawnPositions
  2×2 出生点重排不受影响，继续；③ 出生点本身的数学之前就是对的（AI 出生点日志 onRoad:true），
  之前"看着在草地"纯粹是路面没画出来。④ mario-kart-3d-final.zip 我已重打，含本修复。
  截图里起点线附近还有两块白色半透明竖片（疑似起点线/广告牌背面），算小瑕疵，可顺手看一眼。
- 2026-10-11 14:50 P11 返工（独立复验）：Pi 在 14:40/14:55 宣布修好，但我用 Playwright
  独立验证了一遍（加载、等 12 秒、不驾驶截图）：玩家卡丁车**仍在草地上的灰色平台上**，
  沥青赛道在背景约 20 米处。证据：shots/spawn-still-off2-20261011.png。
  这次不一样的地方：我查了代码，track.getSpawnPositions() 已经写好，
  main.js:809 和 ai.js:450 也确实在调用它——说明方法的数学本身还有问题，
  或者灰色平台（展示舞台？）仍在出生点位置渲染。
  别灰心，方向是对的，就差最后一步：建议在控制台打印 getSpawnPositions()
  返回的 4 个世界坐标，再打印起点处 spline 中心点坐标，两个数字摆在一起，
  看看到底差在哪、偏向哪边。另外确认进入比赛时展示舞台真的被隐藏了
  （截图里灰色平台看着还在）。修完老规矩：headless 截图亲眼确认 4 台车
  全在沥青路面上再收工。
- 2026-10-11 15:20 babysit 独立验证发现游戏现在启动就崩：verify.js ok:false，pageError 只有一条 "ReferenceError: t is not defined"（consoleErrors 为空），画面全黑只有 HUD、--drive 速度 0。根因我已经帮你定位了，就在 game/track.js 的 getSpawnPosition 里（约 1541 行）：你 14:58 那轮把局部变量 `t` 改名成了 `u`（用 spline.getUtoTmapping 做弧长映射那处，思路是对的），但 return 语句还写着简写形式 `{ position, rotation, onRoad, t }`——`t` 已经不存在，一调用就抛错，整个游戏起不来。最小修复：把那行改成 `return { position, rotation, onRoad, u };`（getSpawnPositions 里的 console.log 已经在读 spawn.u，和这个对得上）。改完跑一遍 verify.js --drive，确认 ok:true 且画面里有沥青路面再收工。别灰心，这类"改名漏一处"是最常见的笔误，node --check 查不出来（语法没问题），只能靠真机验证抓——你的验证流程是对的，继续保持每轮必跑。
- 2026-10-11 15:35 用户铁律：每次改完代码必须 push 到 GitHub 仓库
  limin112/mario-kart-3d。本地已 git init，push 走 GitHub API
  （git HTTPS 直推不走 surrogate 交换，会 401；空仓库先用 Contents API
  建 README 初始化，再用 git database API 推 blobs/tree/commit）。
- 2026-10-11 16:30 用户新一轮需求（P12 起，致敬马里奥赛车，持续推进）：
  1. 【P12 修起点柱子】发车位置有根柱子挡在赛道上（起点拱门立柱位置错误），
     移到路面外侧或改成横跨赛道的拱门，绝不能挡住行车线。修完截图确认。
  2. 【P13 修边缘线 Z-fighting】行驶中赛道边缘线（红白路肩）闪烁，
     用 polygonOffset 或把线抬高 0.02-0.05 解决，跑一圈确认不闪。
  3. 【P14 新地图】再做 1-2 张新赛道（不同主题：如沙漠/雪山/夜景），
     复用 Track 类参数化生成，选单可切换。
  4. 【P15 可玩性】道具系统加深：已有蘑菇/香蕉，再加红龟壳（追踪第一名）、
     绿龟壳（直线弹射）、闪电（全体减速），AI 也会用道具。
  5. 【P16 开屏动画】做个马里奥赛车式的开屏：logo 大字 + 引擎轰鸣 + 倒计时，
     现在的 P7 展示可以保留但要更流畅。
  6. 【P17 选手个性】4 位选手给名字/颜色/性格（参考马力欧/路易吉/碧姬/库巴），
     选人界面 + 每人不同的加速度/极速/操控三维属性，AI 难度区分。
  7. 【P18 回合播报】Round 1 / Round 2 / Final Lap 大字播报 + 音效，
     冲线时名次结算画面。
  顺序：P12 → P13 先修 bug，再 P16/P18（体验），再 P14/P15/P17（内容）。
  每个 P 独立验证（verify.js + 截图），不要一次改太多。
- 2026-10-11 17:14 P16 开屏进行中但通道出问题（监工观察）：连续三轮 exit=1（16:54→16:59、17:01→17:08、17:09→17:13），
  错误都是 "Stream ended without finish_reason"——注意这不是你的代码问题，是 Qwen 侧流式输出中断
  （worker3 的 llama.cpp 或 strata 中继在 chat 阶段断流）。qwen_up 健康检查只看 /v1/models，
  能过不代表 chat 真的能走通，别被它误导。
  下一步（按顺序，先修通道再写代码）：① 下一轮开始先别写代码，用一个极小请求手工验证
  Qwen 的 /v1/chat/completions 是否真通（经 127.0.0.1:18182，Bearer key 从
  ~/.pi/agent/models.json 现取，取法抄 loop-iteration.sh 里 qwen_up()，只放进程内存）。
  ② 如果手工单轮也断流，说明 Qwen 通道这会儿不可用——按 21:15 条精神，老实降级走
  OpenRouter（免费配额今晨 08:00 已重置，现在全是 200，没限流），别在坏通道上空转刷日志。
  ③ 通道修好后第一件事是收你上一轮的断尾：main.js 现在 import 了不存在的 ./splash.js
  （17:05 那轮 subagent 流中断，splash.js 没建出来），游戏黑屏、verify.js ok:false。
  要么亲手建好 game/splash.js（最小可用版，按 subagent-prompt-splash.txt 的白名单和接口约定），
  要么先把那行 import 注释掉恢复可玩再慢慢做 P16。subagent 是加速手段不是必经之路，
  它挂了就自己把这一个文件写完，别干等。收工前 verify.js 必须 ok:true，红线不让步。

- 2026-10-11 16:35 【P19 赛道复杂度与模块合理性】用户新要求：
  1. 地图复杂性：赛道布局加料——组合弯（S 弯、发夹弯）、高低起伏（上坡/下坡
     影响车速）、窄道超车点、捷径小路（高风险高回报）。别再是平坦大椭圆。
  2. 赛道路肩/护栏合理性：弯道外侧加护栏防飞出，路肩宽度随弯道曲率变化，
     急弯前加减速提示标识。
  3. 观众合理性：观众只出现在看台/护栏后，不站在赛道上或挡视线；
     看台沿弯道外侧和终点线布置，人群密度有疏有密。
  4. 赛道模块合理性（加速带/灯柱/广告牌等）：加速带放在直道末端和出弯口
     （符合赛车逻辑），灯柱沿赛道等距、高度一致，广告牌朝向行车方向。
  先做 1+2（赛道本体），再做 3+4（周边模块）。改完跑一圈截图验证。
- 2026-10-11 17:22 【P20 3D 建模品质提升】用户觉得现在 3D 效果一般，要求全面提升：
  1. 卡丁车建模：现在的盒子车太简陋。车身加流线型（圆角/楔形）、座舱、
     方向盘、排气管、尾翼；轮胎加轮毂细节；4 位选手配色区分更鲜明。
  2. 材质灯光：车身用金属漆质感（metalness+clearcoat），地面加反射；
     优化阴影（PCFSoft），加环境光遮蔽感；黄昏/夜景模式备选。
  3. 赛道周边：树做成立体的（树冠分层），看台加顶棚和座椅排布，
     广告牌加发光效果，起点拱门做扎实。
  4. 特效：漂移火花、加速尾焰、道具命中爆炸粒子、水花/尘土。
  原则：性能优先——合并几何体、控制 draw call，手机上也要流畅。
  先做 1（车是主角），再做 4（特效最出效果），再做 2+3。
  每步截图对比验证。
- 2026-10-11 17:29 【P16 开屏动画第二步：splash→引擎轰鸣→P7 展示→倒计时的衔接打磨】
  第一步已闭环（splash.js + playRev + P7 展示 + 倒计时全接通，verify.js ok:true）。
  本轮只打磨节奏与过渡质感，不加新机制：
  1. 总节奏：从 splash 出现到 3-2-1-GO 开始，目标 5~6s 内进入比赛，
     当前 intro(0.6s)+explode(1.2s)+exit(0.2s)+倒计时(1.6s) 偏紧凑，确认 splash
     (2.3s 自动退场/按键跳过) 与其衔接不打架——跳过路径下总时长不膨胀。
  2. 过渡质感：splash 退场 250ms 淡出与 showcase 相机推进（intro 0.6s）衔接，
     不能有黑屏帧、不能有相机跳变；playRev 轰鸣（~1.1s 两段式扫频）与
     explode 阶段视觉峰值对齐（"看到车散开的同时听到转速起来"）。
  3. 触屏一致性：触摸跳过 splash 后流程同样走 playRev→展示→倒计时，
     不要有触摸专属的卡顿或跳步。
  4. 验收：node --check 全过；verify.js ok:true 零 console/page error、--drive 速度
     ≥5 km/h；复用 tools/verify/splash-probe.mjs 跑自动+跳过两路径全绿；
     发车视角截图 1 张对比存 shots/（与 gate-p12-fixed 风格一致）；
     手头有 P18 大字播报草稿也顺手的话不拦，但本轮主线是衔接打磨。
  改完更新 STATE/LOG，重打 zip，按 15:35 铁律 push。

- 2026-10-12 11:20 【babysit 视觉回归】发车视角画面中央有一块白色半透明矩形长期挡视线。
  证据：shots/babysit-20261012-0314.png / -drive.png（11:14 实测），Pi 自己的
  shots/splash-p16b-grid-20261012.png（10:44）也有，P18 的 shots/rounds-p18-banner.png
  （09:57）里 FINAL LAP 大字后面同样能看到它——至少从今早 09:57 就存在，不是 P16b 新引入的。
  已帮你排除两条路：① 不是 DOM（页面里只有 #hud 一个大 fixed 元素，
  elementFromPoint(640,250) 打到的是 CANVAS）；② 不是 P7 展示标题 Sprite
  （它在 showcaseScene 里且是深蓝底）。它大概率是主 scene 里一块相机空间/贴相机的
  半透明平面（两张截图相机动了但它在屏幕上的位置/大小几乎不变）。
  下一步：复现很简单——起 8901，headless 加载等 12 秒截图就能看到。
  建议从"贴相机/每帧跟相机"的平面查起（搜索 camera.add、每帧按相机位置重设的 mesh、
  renderOrder 很高 + depthTest:false 的材质），找到后要么修要么删。
  修完老规矩：verify.js ok:true + 截图亲眼确认方块消失。verify.js 本身是绿的
  （ok:true、零 console/page error、drive 10 km/h），这是纯视觉问题，红线没破，
  但挡视线必须修。别灰心，定位已经收得很窄了。
- 2026-10-12 11:20 【babysit 运维】11:10 看门狗重启了 daemon，新 daemon 不知道老轮次还在跑，
  于是出现了两轮并行：老轮（10:55 启动、走 Qwen 的 pi 9951）和新 daemon 起的 OpenRouter 轮。
  另外新 daemon 在 11:11 的 qwen_up 检查报了 "qwen down" 于是降级，但我随后用真 key 手工
  测了 18182 的 /v1/models 和一个极小 chat/completions，两个都是 200——Qwen 根本没 down，
  那次检查是误判（大概率撞上了中继/上游的瞬时抖动，或当时老轮正占着通道）。
  误判之后连续几轮 OpenRouter 都 "Connection error." 退出，但我手工经 18080 打 OpenRouter
  chat 是通的（Nvidia 正常返回），所以那几轮的 Connection error 也是偶发。
  教练式的三条：① 以后每轮开始先 pgrep 看看有没有上一轮的 `pi -p` 还活着，有就等它
  （或确认它已死），不要两轮同时改 game/ 下同一批文件——并行写文件早晚会互相覆盖；
  ② qwen_up 只看 /v1/models，容易误判：它报 down 时先打一个 max_tokens=4 的极小
  chat 探针，两次都失败再降级，别一次抖动就切通道；③ 两个通道都坏的时候就老实休眠
  （21:15 条精神），别在坏通道上 90 秒一轮空转刷日志。
  另：dd80c15（P16b WIP）还没 push，game/main.js、splash.js 还有未提交的修改，
  按 15:35 铁律记得 push 到 limin112/mario-kart-3d。
  → ✅ 已由 12:30 taskmaster 补 push：提交 077baed7（含 P16b WIP + GUIDANCE/探针/zip），
     已 push 到 main（远程 commit b519e7d0）。下一轮继续改 main.js/splash.js 后自行重 push。
- 2026-10-12 13:15 【babysit 表扬+跟进】干得漂亮：白色方块根因定位得准（拱顶两面旗正好贴在出生点相机前 3 米），改到拱脚（|横向|≥13）+ 探针白盒二分法，这个处理很专业。13:12 监工实机截图确认画面中央干净了，修法生效。两件小事顺手带一下：① 截图里赛道上有绿/橙两块贴地圆斑（drive 视角两张都有），像没激活的粒子池实例被画出来了——正好你探针第 3 条就在查单位矩阵，这批圆斑大概率是同一个案子的现场，探针跑完顺带定个性；② 这轮的 main.js/track.js/loop-iteration.sh/probe 还没 push，按 15:35 铁律下一轮收尾时一起推掉。qwen_up 加 3 次重试这事改得对——误判降级这个坑算是从根上填了。
- 2026-10-12 13:35 【taskmaster】13:15 条的 push 欠账已清：提交 abf27ea7（GUIDANCE 补记 + loop-iteration.sh qwen_up 重试根治），已 push 到 main（远程 16e313cb）。daemon.pid/proxy.pid 为运行时文件不提交。P16b 衔接打磨 WIP 中，Pi 新一轮（strata/qwen-flash）在跑，未卡住，本轮不另布置任务。
- 2026-10-12 15:12 【babysit 视觉观察，非 blocker】15:12 实机截图（shots/babysit-20261012-1512.png / -drive.png，两张相机位置相同）显示路面固定位置有绿/橙两块扁圆盘（绿色在画面右下中、橙色在右边缘），两张截图位置完全一致→是赛道空间里的静态物体，不是粒子幽灵（幽灵会漂移）也不是本轮 verify 的采样问题。可能只是掉在地上的蘑菇/香蕉道具模型从低角度看起来像圆盘（P20a 修复的粒子空洞是另一个案子，那个探针已通过）。白色遮挡已确认保持修复状态，verify.js ok:true 零 error、drive 10 km/h，红线没破。下一轮顺手定性一下那两块圆盘是什么（打印出它们的 mesh 位置和材质名，和 item 掉落物列表对一对），确认是道具就不用管；如果是别的来历再修。
- 2026-10-12 15:30 【P14b 新赛道布局（红线修复优先）】当前状态：main.js/track.js 已接好 ?track= 解析与 Track(scene, theme, layout) 构造（Track 构造已加 layoutName 参数、未知名兜底 classic），但 game/trackdefs.js 不存在 → 8901 404、verify.js ok:false，红线已断。第一优先级是把红线接回去：① 亲手写 game/trackdefs.js（纯数据零 import，export const TRACK_LAYOUTS；契约见 scripts/subagent-prompt-trackdefs.txt）：classic 照抄当前 TRACK_CONFIG 的 9 个控制点（theme:'classic'），dune 长直道+发夹（theme:'desert'），glacier S 弯+发夹（theme:'snow'），每布局带 roadWidth。② 不要再为这文件开 subagent——Qwen 流式通道在这文件上已断 3 次（"Stream ended without finish_reason" 秒断，15:05 taskmaster 条），60 行纯数据自己写最快；以后凡纯数据小文件都自己写，别走 subagent。③ 跑 node verify.js（带全参数：url + 截图路径 + --drive）+ track-probe.mjs（tools/verify/ 已就位，import 的就是你写的这个文件）：三布局 ?track= 切换、?theme= 缺省走布局建议主题、无参数零回归，全绿后再 push。红线没接回去之前不要开新活。

- 2026-10-12 17:06 【用户直接反馈，三件事优先修】用户看了实机，提了三个问题，按优先级排序：
  1. 【赛道太简单】现在赛道是圆形/椭圆形，需要设计得复杂一些：参考 P19 标准——S 弯、发夹弯、上下坡、窄道超车点、捷径；弯道外侧加护栏；曲率自适应路肩；急弯前减速提示；加速带放直道末端和出弯口。这是 P19 的核心，现在就动手，不要等。
  2. 【观众站到场地上】观众都跑到赛道/场地上来了，这是 bug：观众只允许在看台和护栏后面，主要沿弯道外侧和终点布置；检查观众生成逻辑，确保他们不会生成在赛道范围内（用赛道样条做距离剔除）。
  3. 【AI 对手太弱+轨迹有问题】对手车速太慢、没有竞争力；行驶轨迹有问题（切弯不合理/撞墙/走直线）。修：AI 按赛道曲率动态调速（直道加速、弯道减速）；走 racing line（外-内-外出弯）；相互之间有超车/防守行为；整体速度提到能给玩家压力的水平。
  验收：verify.js ok:true + 新赛道截图 + AI 能跑完 3 圈不撞墙 + 观众全部在护栏外。

- 2026-10-12 17:27 【taskmaster】本轮检查：Pi 主循环正在响应监工 17:06 用户反馈——已开两个 subagent：ai-upgrade（AI 对手加强，运行中，pid 8030，约 4h elapsed，.out 暂空进行中）+ projectiles（P15 projectiles.js 模块）。projectiles subagent 已秒断（.out 仅 "Stream ended without finish_reason"），game/projectiles.js 未产出——Qwen 流式通道今日第 4 次在 subagent 上断流。tools/verify/spectator-probe.mjs 已新建（观众 bug 定性用）。game/items.js 近 1 小时有修改（主 agent 侧推进中）。
  指导：① projectiles.js 允许再试一次 subagent（纯数据规则不适用，它是代码文件，主 agent 自写成本高；若第二次仍秒断则主 agent 按 scripts/subagent-prompt-projectiles.txt 契约亲手写，别再烧轮次）；② ai-upgrade 子任务收编后，下一轮优先排用户 17:06 第 1 项——P19 赛道复杂度（"现在就动手，不要等"，S 弯/发夹弯/上下坡/窄道超车点/捷径/外侧护栏/自适应路肩/弯前减速提示/加速带位置），这是用户看实机后的最高优先级；③ 观众 bug 用 spectator-probe.mjs 定性（15:12 条：绿/橙圆盘可能是掉落道具模型，先确认再决定修不修），验收按 17:06 条：观众全部在护栏外。本轮不另布置新任务（两项进行中）。
  Qwen 健康：18182 chat 200、finish_reason=length（max_tokens 60 截断）、content 非 null、reasoning_content 有值（thinking 模式，预期内）——健康。8901：200。verify.js：ok:true 零 console/page error、--drive 10 km/h，红线保持。

- 2026-10-12 18:32 【taskmaster】本轮检查：Pi 主循环在推进用户 17:06 反馈（AI 加强 + 观众 bug）：game/ai.js 加了 window.__ai 探针钩子（DEBUG 行，redline 未破）、新建 tools/verify/ai-probe.mjs（60s 采样 AI 均速/横向出界/NaN，可跑基线）。items.js 17:27 有改动（P15 相关推进中）。
  ① 【需主循环本轮处理】ai-upgrade subagent（pid 8030，约 13:27 启动）.out 已空 ~5 小时、无 HANDOFF，远超 subagent 协议 60 分钟上限——本轮先 tail 看一眼；若仍无输出/HANDOFF，按协议 kill 掉，AI 加强改由主 agent 在主循环里直接做（trackdefs.js 的"纯数据自写"先例同样适用：该文件开 subagent 已 4 连断，Qwen 流式通道对它的流断是老毛病，主循环亲手写最快）。ai-probe + window.__ai 钩子已就位，可先跑基线再开工。
  ② projectiles.js：17:27 条"允许再试一次 subagent，第二次仍秒断则按 scripts/subagent-prompt-projectiles.txt 契约亲手写"——本轮迭代内执行/收尾，红线（verify.js ok:true）保持的前提下合并。
  ③ AI + 观众两项落地后，立即启动 P19 赛道复杂度（用户 17:06 最高优先级，"现在就动手"：S 弯/发夹弯/上下坡/窄道超车点/捷径/外侧护栏/自适应路肩/弯前减速提示/加速带位置），验收=verify.js ok:true + 新赛道截图 + AI 跑完 3 圈不撞墙 + 观众全部在护栏外。
  本轮检查：verify.js ok:true 零 console/page error、--drive 5 km/h（注意第一次我忘了传 url 参数拿到 ok:false 属调用错误非红线破，带全参数重跑 ok:true）；8901 200；已 push 75c896cc（ai.js 钩子 + ai-probe.mjs）→ main @ 4d53024f。
  Qwen 健康：18182 chat 200、3.7s、content 非 null、reasoning_content 有值（thinking 模式，预期内）——健康。

- 2026-10-12 18:55 【用户看实机截图，直接反馈"不行"】用户发了一张驾驶截图，问题：
  1. 【广告牌文字镜像反了】所有路边广告牌的文字都是左右镜像的："SPEED"显示成反的，"TIME TRIAL"/"MARIO KART 3D"全反，部分还显示"undefined"。根因：广告牌平面朝向反了（看到的是背面）或纹理 UV 镜像了。修：翻转平面法线/旋转180度，或修正纹理映射；"undefined"说明文字纹理生成时变量没传进去，一起查。
  2. 【赛道还是圆形】用户 17:06 就说了赛道太简单，到现在还是椭圆。P19 赛道复杂化必须提速：S 弯、发夹弯、上下坡，不要再拖。
  3. 观众这次在看台上是对的（护栏后），保持。
  验收：截图里广告牌文字全部正向可读，无"undefined"；新赛道有明显弯道变化。

- 2026-10-12 18:59 【用户需求：加截图模块】用户说"你需要加截图模块，这样好开发"。做一个 Pi 自用的视觉验证截图模块：
  1. 新建 tools/shot/shot.js：一行命令出多张关键截图——选单界面、发车视角、驾驶 5 秒后、俯视赛道全景。用法：`node tools/shot/shot.js --out shots/auto-<时间>/`。
  2. 每张截图文件名带场景名和时间戳，顺手输出一张拼盘对比图（2x2）。
  3. Pi 的开发流程改成：改完视觉相关代码 → 跑 shot.js → 自己看截图确认 → 再跑 verify.js。两次截图 diff 肉眼可见变化才算改完。
  4. 截图存到 shots/auto/ 下，定期清理只留最近 10 组。
  验收：shot.js 一次跑完 4 张截图无报错；Pi 下次改广告牌/赛道时用它自验证。

- 2026-10-12 19:15 【babysit】两小时进展盘点：① projectiles subagent 重试成功，game/projectiles.js 已产出（Shell 类红/绿龟壳 + triggerLightningFlash，HANDOFF 契约零偏离），这一步走得对；② ai-upgrade subagent 和 billboard-probe subagent 相继 "Stream ended without finish_reason" 秒断——Qwen 流式通道今天在这类小任务上已经是第 5 次断了。别灰心，但也别再往这个通道里扔小任务：用户 18:55 的广告牌镜像修复、18:59 的 shot.js 截图模块，这两个都小（广告牌就是 track.js 里平面朝向/UV 纹理那一小块，shot.js 是独立 playwright 脚本 tools/shot/shot.js），主循环亲手写最快，写完老规矩 verify.js + 截图自验。③ projectiles.js 还没集成：items.js/main.js 接红壳追踪第一名/绿壳直线/闪电全体减速，集成了 P15 才算闭环。④ push 欠账（15:35 铁律）：game/projectiles.js、game/ai.js（__ai 钩子）、tools/verify/ai-probe.mjs 都还没 commit，本轮收尾一起推。verify.js 本轮 ok:true 零 error、--drive 10 km/h，红线稳的。

- 2026-10-12 19:35 【taskmaster】本轮检查：Pi 本轮已亲手修好广告牌（track.js：side=-1 朝向条件写反致背面朝赛道+负 seed 致 "undefined"，两处已修），taskmaster 代 verify.js 验收 ok:true 零 console/page error、--drive 10 km/h，红线稳；已 commit+push → main @ 461ed54d。projectiles.js 已在仓库（HANDOFF 齐）但 items.js/main.js 集成仍未动；shot.js 还没做。Qwen 健康：18182 chat 200、finish_reason=stop、content 非 null（reasoning 有值系 thinking 模式，预期内）；8901 200；loop-daemon active。下一轮按序推进：
  1. 【shot.js 截图模块】（用户 18:59 明确需求，优先级最高——以后所有视觉改动都要走它自验）按 18:59 条契约亲手写 tools/shot/shot.js（选单/发车/驾驶5秒/俯视全景 4 张 + 2x2 拼盘，`node tools/shot/shot.js --out shots/auto-<时间>/`，shots/auto 只留最近 10 组）；window.__mk 钩子已就位可用。验收：一次跑完 4 张无报错，文件名带场景+时间戳。
  2. 【广告牌修复视觉验收】用 shot.js 出驾驶视角截图，肉眼确认广告牌文字全部正向可读、无 "undefined"（像素探针代替不了人眼，这次必须看图）。无误后在 LOG 记一条闭环。
  3. 【P15 集成】projectiles.js → items.js/main.js：红壳追踪第一名 / 绿壳直线飞行 / 闪电全体减速；AI 会捡会用（ai.js 已有探针钩子可复用验证）。集成完老规矩 verify.js + shot.js 自验，通过算 P15 闭环。
  4. 【P19 提速预告】P15 闭环后直接上 P19 赛道复杂化（用户 17:06、18:55 两次点名"赛道还是圆形"）：S 弯/发夹弯/上下坡，trackdefs 布局数据按 P19 标准重做。这是用户的明确催促，不要再拖。
  记住：不要再给 Qwen 流式 subagent 派小任务（今天第 5+ 次秒断了），小的都自己写。

- 2026-10-12 20:35 【taskmaster】shot.js 状态更新（19:35①）：Pi 已按契约写出 tools/shot/shot.js（4 场景+2x2 拼盘+只留 10 组），taskmaster 已 commit+push → main @ 09bdfb10。但验收未通过：实测 `node tools/shot/shot.js` 挂在"timeout waiting for countdown visible"（180s），console/page 零 error——不是游戏 bug，是 shot.js 自身的竞态，根因已由 taskmaster 实测锁定：
  按一次 ESC 会同时触发三件事——splash 跳过（splash.js onSkip）、main.js 展示跳过（phase='exit'）、select 关闭（hideOverlay 淡出）。倒计时链（展示 2s + 倒计时 1.6s）在 headless 软渲染下约 1~2 帧就跑完（下一帧 stepElapsed 直接跳过 1.6s，四步一次跑完；taskmaster 用 200ms 轮询实测到 `block|3` 在 3.1s 出现、3.3s 消失，一闪而过），而 select 淡出在 headless 下要 3.9~7.5s。于是"等 select 消失再等倒计时出现"永远等不到——倒计时在等待开始前就已经跑完了。
  修法（只改 tools/shot/shot.js，不动游戏代码）：拆成两页——01-select 用无参数 URL（现有流程保留）；02/03/04 另起一页带 `?track=classic` 调试参数（select.js 调试入口：无选单直接进比赛，不用按 ESC、无竞态），splash 2.4s → 展示 2s → 倒计时 1.6s 按部就班出现。另注意 headless 下倒计时 `display='block'` 窗口只有约一帧，轮询间隔改 200ms；03-drive5s 前先确认比赛已开始（HUD 时间在走），别在展示阶段按 ArrowUp（会被吞键）。注：真机 60fps 下倒计时显示正常（96 帧），这是 headless-only 现象，不用修游戏。
  ②③④（广告牌视觉验收 / P15 集成 / P19 预告）保持 19:35 顺序不变，shot.js 修好验收通过后依次推进。

- 2026-10-12 21:20 【babysit：Qwen chat 通道静默挂死 1 小时，qwen_up 必须升级成 chat 真探针】20:10→21:10 +08 约 18 轮全部 exit=1，last-run-output 只有一句 "Connection error."，而 qwen_up 整整一小时都在报 up——因为它只看 /v1/models（走同一条中继、同一台 worker3，但不经过模型生成，永远 200）。babysit 21:13 直接打了个 max_tokens=4 的 chat 探针（Bearer 走 relay，现取现用不落盘）：25 秒无响应挂死；21:15 同样探针 2.9s 200 恢复——证实 /v1/models 200 ≠ chat 可用（11:20 ②、17:14 ② 的老结论，今晚第一次被 1 小时空转坐实）。别灰心，通道已经恢复，当前轮应该能正常跑。但这坑必须从根上填：① 把 qwen_up 升级成 chat 真探针：一个 max_tokens=4 的 chat/completions（走 127.0.0.1:18182 带 Bearer，超时 20s）；连续两次失败才算 down，然后老实降级 OpenRouter（17:14 ②，今日配额全是 200 别怕用）；② 两个通道都连挂就 sleep 600 写 LOG（21:15 精神）；③ 加熔断计数：同一错误（比如 Connection error.）连续 10 轮 → 休眠 30 分钟并在 LOG 标红，别 90 秒一轮刷一小时。另：worker3 是用户自己的机器，模型侧为什么生成挂死一个小时（llama.cpp 队列/推理卡住？）只如实报告原文，由用户自己看一眼，不许动他的部署。

- 2026-10-12 22:27 【taskmaster】Qwen 通道再次静默挂死（21:20 babysit 同症状复发）：21:53→22:39 +08 连续 13 轮 `pi exit=1 (qwen)`，每轮约 2 分钟，last-run-output 只有一句 `Connection error.`。taskmaster 实测：非流式 chat 200（4.4s，finish_reason=length，content=null 但 reasoning 有值=thinking 模式预期内）+ 流式 chat 200（5s，[DONE] 完整）+ `pi -p` 短 prompt 实测 28s 正常返回——中继+worker3 对小请求全可用。结论：挂死的是大 prompt（~15KB 迭代提示）/长生成的流式通道，或 worker3 侧（llama.cpp）间歇性卡住；按铁律不动用户部署，已在汇报里请用户看一眼 worker3（错误原文 `Connection error.` 附上）。
  babysit 21:20 布置的两项 Pi 一直没落实，本轮 taskmaster 已亲手代落实进 scripts/loop-iteration.sh（bash -n 通过；新 qwen_up 探针实测 UP 3s）：① qwen_up 升级为 chat 真探针（max_tokens=4 非流式 chat，超时 20s，连续两次失败才算 down，再降级 OpenRouter）；② 熔断：`Connection error` 连续 10 轮 → 休眠 30 分钟（scripts/circuit-breaker.state 计数）。下一轮 daemon 自动生效。
  另：8901 的 http.server 僵死（监听但连接被拒，pid 10120 跑了 8.5 小时），已 kill + start_server.sh 重拉，200；verify.js ok:true、--drive 10 km/h，红线稳。
  任务队列不变（Qwen 恢复前不开新 P）：P15 已闭环（STATE 17:10，items.js 414 行集成 + audio.js 音效已 push）；恢复后按 20:35 顺序：① shot.js 竞态修复（20:35 修法：02/03/04 用 ?track=classic 调试入口另起一页，轮询 200ms）② 广告牌视觉验收（必须肉眼看图确认文字正向无 undefined）③ P19 赛道复杂化（用户两次点名"赛道还是圆形"）。

- 2026-10-12 23:25 【babysit：VM 重启导致 daemon 掉线，看门狗会自动恢复】23:14 左右运行时服务重启（/etc 被清空，mario-kart-loop.service unit 消失、daemon 进程没了、8901 http.server 也挂了）。别慌，这不是你的错，也不是代码问题：
  1. 8901 我已用 start_server.sh 重拉（200 正常），verify.js 本轮重跑 ok:true、零 console/page error、--drive 10 km/h，红线稳。
  2. loop daemon 由 mario-kart-loop-watchdog（15 分钟一轮）负责恢复：它会从 ~/workspace/mario-kart-3d/scripts/mario-kart-loop.service 正本重装 unit + daemon-reload + enable/start（上次 12:33 也是这么恢复的）。daemon 下一轮会自动从 loop-iteration.sh 第 45-46 行自检重拉 or-proxy（我确认过 18080 现在是 000，但脚本里有自动拉起逻辑，不用手动管）。
  3. daemon 恢复后按 22:27 队列继续，不用重新想顺序：① shot.js 竞态修复（20:35 修法：02/03/04 用 ?track=classic 调试入口另起一页、轮询 200ms）② 广告牌视觉验收（必须看图确认文字正向无 undefined）③ P19 赛道复杂化。
  4. Qwen 大 prompt 的 `Connection error.` 今天 21:53 起还在断（last-run-output 仍是这一句）。22:27 的熔断+qwen_up 真探针已进 loop-iteration.sh，恢复后下一轮自动生效。worker3 是用户自己的机器，通道问题只如实报原文，不许动他的部署。
  本轮未布置新 P（P15 已闭环；队列等 daemon 恢复后自动推进）。

- 2026-10-12 23:30 【babysit】23:25 条修正：看门狗 23:26 轮迟迟没触发（VM 时钟跳变），不等了，按 AGENTS.md 换机恢复路径已亲手执行——sudo cp 正本 unit → daemon-reload → systemctl set-environment 注入代理环境（含 no_proxy/NO_PROXY，取本机 env，绝不写文件）→ enable --now。服务 active，daemon 进程在，loop-runs.log 新行 `[loop] 15:24:11 qwen up, running round with strata/qwen-flash`——新一轮已用 Qwen 开跑。恢复后队列不变（shot.js 竞态修复→广告牌视觉验收→P19）。

- 2026-10-13 00:05 【taskmaster】Qwen 通道间歇性不稳（非连续双失败，暂不报修阈值但需关注）：本轮 00:0x 探针第 1 次 chat 8s 超时（http=000；连 /v1/models 都挂；中继"sent bytes to proxy, awaiting response"后无响应；隧道代理 hatch-egress-proxy:3130 直连 12s 超时），第 2 次 chat 3.8s 200（finish_reason=length，content=null+reasoning 有值=thinking 模式预期内）。daemon 23:46 轮的 qwen_up 真探针判 down，本轮 Pi 已降级 openrouter-free 跑（仍在进行中）。如接下来 1-2 轮仍间歇挂死，请用户看一眼 worker3（llama.cpp 侧），原文已备。任务队列不变：① shot.js 竞态修复（Pi 本轮在应用 20:35 修法，shot.js 已改）② 广告牌视觉验收（必须看图确认）③ P19 赛道复杂化。

- 2026-10-13 00:35 【taskmaster】本轮检查：① Qwen 通道：taskmaster 两次独立 chat 探针（非流式 max_tokens=60，经 127.0.0.1:18182 带 Bearer）全部 8.1s 后 `RemoteDisconnected('Remote end closed connection without response')`——连续 2 次失败，达到报修阈值：请用户看一眼 worker3（llama.cpp 侧），错误原文如上。注意细微差别：daemon 自带的 qwen_up 真探针（max_tokens=4）在 00:27 判 up 并已用 Qwen 开新一轮（pid 9745 在跑），小请求能过、中请求挂死——像是 worker3 侧负载/队列间歇性卡住而非全 down，不动他的部署，只如实报。② 救回事故：00:07-00:10 之间的某轮把 LOG.md 整文件重写成 9 行旧快照（只剩 P1-P3 + 一条粘连的 P20），近两天的任务/taskmaster/babysit 记录全丢——已从 git HEAD（189 行）恢复 + 补回 P20 那条。Pi 以后只许往 LOG.md 追加整行，永远不许整文件重写（想清理先跟监工说）。③ Pi 本轮在 Qwen 上推进：game/main.js、kart.js、track.js、trackdefs.js 过去 1 小时都有修改（STATE 已改成 P20 第一步完成，kart.js 底盘长高修改在 working tree 待 push）。④ verify.js（本轮实测）ok:true 零 console/page error、--drive 10 km/h，红线稳；8901 200；loop-daemon systemd active。⑤ push 欠账（15:35 铁律）：本轮已 commit+push → limin112/mario-kart-3d（含恢复的 LOG.md、STATE、GUIDANCE、game/kart.js）。任务队列不变：① shot.js 竞态修复（Pi 本轮在改 tools/shot/shot.js）② 广告牌视觉验收（必须看图）③ P19 赛道复杂化。不布置新 P。

- 2026-10-13 01:38 【taskmaster】本轮检查：① Pi 上一轮（01:06 开、01:28 结束）在 Qwen 流式通道上又跪了（last-run-output=`Stream ended without finish_reason`，circuit-breaker x3），但本轮干活落盘了：tools/shot/shot.js 的 20:35 竞态修法已应用（waitFor 改传 pg 参数 + 02/03/04 走 ?track=classic 调试入口另起一页 + 200ms 轮询），新探针 tools/verify/billboard-probe.mjs（广告牌朝向几何验收：正面法线朝赛道 + titles 种子回归，76 行）已就位——本轮 commit+push（见 ⑤）。② Qwen 健康恢复：非流式 chat 200、finish_reason=stop、content 非 null（2.8s），thinking 模式预期内；不到连续 2 次失败阈值，不报修；但注意 Pi 的大 prompt 流式通道仍间歇秒断（x3），如继续跪仍按 22:27 熔断走。③ 红线：8901 200；verify.js 基础跑 ok:true（page.screenshot 在 headless 下间歇 60s 超时属环境问题，非游戏错误）；taskmaster 自写 15s soak 探针：零 console/page error。④ 下一轮：用修好的 shot.js 跑 4 场景截图 → 广告牌视觉验收（billboard-probe.mjs 先行几何验收，文字正向无 undefined 最终仍要肉眼看图确认）→ 然后 P19 赛道复杂化。⑤ push：commit 本轮（shot.js 竞态修复 + billboard-probe.mjs + GUIDANCE/LOG）→ limin112/mario-kart-3d。不布置新 P（队列①②在推进中）。

- 2026-10-13 02:30 【taskmaster：P19 耐心拆解——Qwen 大 prompt 流式通道连跪 6 轮，game/ 一小时零修改】Pi，你这 6 轮全跪在"Stream ended without finish_reason"上，不是你的错——是 Qwen 大 prompt 流式通道间歇秒断（worker3 侧/隧道间歇问题，用户自己看机器，我们不碰他的部署）。对策：把 P19 第一步拆成每轮只做一件事的小任务，prompt 越小流式通道越稳。按下面顺序一轮一件，做完 verify.js ok 再写 LOG 追加（永远不许整文件重写）：
  1. 【P19a S 弯】只改 game/trackdefs.js 的 glacier 布局：把顶部现有的 56°/-71° S 组合弯的两个转向点间距拉大到 ≥25m、转角再反向 10°，让 S 形从"挤在一起"变成"能看清的两连弯"。只改坐标，不碰样条逻辑。验证：node 跑 check-trackdefs.mjs（自交断言）+ verify.js ok。
  2. 【P19b 发夹弯护栏】只改 track.js：给 dune 右侧 128° 发夹和 glacier 左侧 124° 发夹的外侧加连续护栏段（复用现有 curb/护栏逻辑，长度按弯道弧长×1.2）。验证：verify.js ok + --drive 发夹段不穿出。
  3. 【P19c 上下坡】只改 track.js：路面 mesh 的 y 按弧长做 ±1.5m 缓坡（sin 曲线，先只做 dune 的双直道段），检查点/出生点 y 同步跟路面走。验证：verify.js ok + 出生点 onRoad 仍成立。
  4. 【P19d 减速提示】只改 track.js：在两个发夹弯入口前 20m 路面加黄色减速箭头纹理（程序化 canvas 纹理，不用外部资源）。验证：verify.js ok。
  5. 【P19e 捷径】只改 trackdefs.js：给 classic 加一条捷径（一条短直线切过草地，赛道宽减半 rw=6，中间放 1 个香蕉做代价），同时确认检查点防切弯逻辑仍然有效（捷径内必须经过新增检查点）。验证：verify.js ok + 全圈驾驶一圈不断。
  每件都是独立的 commit，标题带 P19a~e。遇到流式再断就原样重发本轮同一个小任务，别加料。下一轮从 P19a 开始。
- 2026-10-13 03:15 熔断触发确认（babysit）：02:48 +08 circuit-breaker 已按 22:27 规则触发（Qwen 流式通道连续 10 轮 `Stream ended without finish_reason`），daemon 休眠 30 分钟，约 03:18 +08 自动唤醒。醒来第一件事不要想着补回进度，直接按 02:30 条执行 P19a——只改 trackdefs.js 的 glacier S 弯两转向点间距（纯数据、prompt 最小），写完 node 断言 + verify.js ok 再追加 LOG。记住 breaker 的规则不变：醒来后新轮次从 x0 重新计数，同一错误再连跪 10 轮就再睡 30 分钟，别手忙脚乱。游戏本身健康（verify ok:true 零 error、drive 10 km/h），你只需要一次只做一件小事。

- 2026-10-13 11:12 【babysit：Qwen 大 prompt 流式 `Stream ended without finish_reason` 再度连跪（02:30 UTC 之后 x7，同一 error 远超 2 轮）】先说清楚：这不是你的逻辑问题，是通道问题（小探针 200 一直过、大 prompt 流式间歇秒断，昨晚 22:27 同症状），别灰心。但熔断器 x10 休眠是钝器，这 2 小时你只落盘了 1 行探针钩子（main.js:323 加 kartPhysics/state 到 __mk），P19e 收尾还在原地。教练式的两条硬规矩：
  1. 【先落盘、再流式】每一轮的第一动作必须是"能独立存活的最小落盘"：打开游戏文件、写下一小块改动、**先 `git add + commit + push`（15:35 铁律），然后才追加 LOG.md**。不要把"验证→总结→LOG"全攒到流式最后一步——你这几轮每次都是写完代码死在流式收尾，改动虽然落盘但 LOG 没记、STATE 没更新，下一轮又要重新想起从哪开始。P19e 收尾拆成轮级原子块：① shortcut-probe.mjs 写完并跑通（全圈驾驶一圈不断、捷径内必经新增检查点）；② 验收通过后 STATE/LAST 更新 → push。每块单独 commit。
  2. 【单句任务、不加量】02:30 拆解的"一轮一件"继续有效，但现在更极端：本轮 prompt 只写一件事，例如"给 P19e 写 shortcut-probe，验证捷径内检查点防切弯，跑通，commit+push+追加 LOG"。prompt 越小，流式秒断的概率越低；就算断了，上一轮的 commit 也保住了进度。别在断流的轮次里开 subagent、别改两份文件、别碰 require 之外的红线。
  备注：breaker x10→30 分钟休眠继续兜底；唤醒后从 x0 重新计数，正常开工。

- 2026-10-13 11:51 【用户新需求：小地图 + 新角色】P19e 闭环后按顺序做下面两件（P19e 仍是当前最高优先级，先收尾）：
  1. 【P22 小地图】HUD 右下角加一块圆形/方形小地图（canvas 2D 叠加层，约 160×160px，半透明黑底）：① 用 track 样条控制点投影画出赛道轮廓线（白色描边）；② 玩家画成白色三角箭头（带朝向），3 台 AI 按各自配色画圆点；③ 道具箱画成小黄点（可选）；④ 小地图不随镜头转（北向上固定），每帧更新位置点。验证：verify.js ok + 截图里小地图可见、玩家箭头随驾驶移动。
  2. 【P23 新角色】新增 3 名可选车手（致敬马里奥赛车）：公主（粉色系：粉裙+金色皇冠+粉色卡丁车）、恐龙（绿色系：绿皮肤+红色背鞍+绿色卡丁车）、酷霸王（深红/橙色系：尖刺龟壳+红色鬃毛+黑色卡丁车）。要求：① 每名车手有独立配色的卡丁车（复用 kart.js 流线型车身换色 + 特征部件：皇冠/背鞍/尖刺壳用低多边形几何体拼）；② 驾驶员小人换对应配色和特征（头盔→皇冠/恐龙头/尖角头）；③ 3 台 AI 分别开这三辆新车（替代现有绿/蓝/橙），玩家默认仍是红色马里奥风；④ 可选：角色选择界面（如下拉或左右切换，选完进倒计时）。验证：verify.js ok + 截图里 4 辆车配色分明、特征部件可见。

- 2026-10-13 11:53 【用户指令：熔断机制已撤除，替代本文件 11:12 条中"breaker 继续兜底"的备注】用户 11:50 在 side chat 明确拍板"撤掉"熔断（连续失败 10 次休眠 30 分钟）。已落实：scripts/loop-iteration.sh 和 scripts/loop-iteration-or-primary.sh 里的计数/休眠代码全部删除（改后有注释留档），当时正在休眠的 breaker 进程已被终止，daemon 03:52:33 已按正常 90s 间隔开了新轮（Qwen 探针正常）。以后失败轮只记退出码到 loop-runs.log，不再休眠；worker3 是用户自己的部署，只如实记录不动它。

- 2026-10-13 12:00 【用户反馈：入场动画不对、没美感 → P24 发车格巡游开场】Pi，现在 showcase 的"黑舞台零件爆炸"概念错了——那是汽车广告，不是赛车开场。改成发车格巡游式开场（致敬马里奥赛车）：
  1. 开场镜头从发车格侧前方低角度（约车头高度）开始，四辆车（玩家红+三台AI新角色车）已在发车位排好，车灯亮起；
  2. 镜头 2.5 秒内平滑滑过四辆车侧面（dolly 运镜，easeInOut），经过每辆车时引擎轰鸣音量渐起（复用 audio.playRev）；
  3. 滑到末端后镜头上扬拉升、绕到玩家车后方，进入现有 3-2-1 倒计时机位（与倒计时衔接零跳变）；
  4. 总时长压在 4 秒内；旧的零件爆炸 showcase 整段删掉，别留两套开场。
  验证：verify.js ok + 开场截图 3 张（起始/中段/倒计时衔接帧），画面里四辆车+发车格+拱门同框。

- 2026-10-13 17:12 先说清楚：这仍然是通道问题，不是你的逻辑问题。小探针（18182 非流式 chat）一直 200、finish_reason 正常，说明 worker3 上的模型本体活着；死的是带 ~15KB 迭代 prompt 的大 prompt 流式（`Stream ended without finish_reason`）。15:31→17:09 +08 约 12 轮全部 `pi exit=1 (qwen)`，game/ 自 12:54 +08（main.js 探针钩子 commit 748b167）后零修改。熔断已按用户 11:51 指令撤除，daemon 每 90s 正常开新轮——失败只记退出码，你不需要"赶进度"。
最小可行下一步（通道恢复后第一轮就做这个，一轮只做一块，不加量）：P19e 收官只剩验收——① 写 tools/verify/shortcut-probe.mjs：捷径 ribbon 真实渲染、全圈驾驶一圈不断、走捷径必经新增检查点（防白嫖切弯）；② 跑通后 commit+push；③ 再跑 verify.js 确认 ok:true；④ STATE/LAST 更新+push。每块独立 commit（11:12「先落盘再流式」继续有效）。
别做的事：P19e 不闭环不开 P24（11:12 规则不变）；断流的轮次里不开 subagent、一次不改两份文件；本轮 prompt 只写当前这一小块的事，别把历史全塞进去。

- 2026-10-13 23:13 【babysit：game/ 自 12:54 +08 起约 10 小时零落盘（最后一次落盘 main.js:323 探针钩子），轮次持续在 Qwen 大 prompt 流式 `Stream ended without finish_reason` 上秒断——每轮存活约 2 分钟即 pi exit=1 (qwen)，qwen_up 的 max_tokens=4 小探针每次都过，daemon 按用户 11:51 指令每 90s 正常开新轮】先说清楚：这不是你的逻辑问题，是通道问题，而且今天的症状给了一个明确线索——小探针 200 必过、~15KB 迭代 prompt 流式必死，死因和 prompt 大小正相关。教练式的两条：
  1. 【prompt 压小】下一轮别把整个 GUIDANCE/LOG 上下文都塞进 prompt，只写一件事+必要的三行上下文，例如："只跑 `node tools/verify/shortcut-probe.mjs`，把 FAIL 贴出来"——这个探针文件已经在仓库里（19:28 taskmaster 已收编），不用再写代码，17:12 收官四件套的下一步就是② 探针跑通。prompt 越小，流式秒断概率越低（11:12「单句任务」同一条道理，这次更极端）。
  2. 【8901 别被验证卡住】8901 http.server 今晚 babysit 又发现掉过一次（已重拉，200）。以后每轮跑 verify.js 之前先 `curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8901/` 探活，不通再起（17:25 幂等规则：通了就别动，不通再起，一次就够）。
  P19e 闭环前不开 P24（11:12 规则不变）；通道切换（OpenRouter 主模型草稿）需用户明确拍板，Pi 不要擅自改。

- 2026-10-14 01:17 【babysit：game/ 自 10-13 12:54 +08 起约 12.5 小时零落盘；轮次在 Qwen 大 prompt 长流式 `Stream ended without finish_reason` 上连跪（上次 exit=0 是 10-12 21:49 UTC，约 28 小时前），qwen_up 小探针每次都过、daemon 每 90s 正常开新轮】先说清楚：这不是你的代码问题。23:27 taskmaster 已证实病灶是本机→tailnet 隧道间歇劣化（小请求 200 必过、长流式连接随机断），23:13 条"死因和 prompt 大小正相关"的结论已经修正——别再纠结 prompt 大小，你控制不了隧道。
  最小可行下一步（下一轮只做这一件，不写新代码——长生成必死，写了也落不了盘）：`node tools/verify/shortcut-probe.mjs` 跑通，把输出追加到 LOG.md，git add + commit + push。探针已经在仓库里（taskmaster 收编 f7f480d2 / 7536eff，node --check 通过），零新代码、纯本地运行，一轮 10 分钟的存活窗口足够跑完。这是 ROADMAP M1（P19e 捷径）收官的最后一件：探针全 PASS 即闭环，然后才开 M2（P24 开场 + P22 小地图）。
  如果这轮流式又在中途断了：让这轮自然结束（90s 后新轮再来），不重试同一件事、不加量、不开 subagent。通道恢复前，活着的轮次只做"本地能闭环"的小事。

- 2026-10-14 03:15 你现在卡住不是因为代码写得不好——是 Qwen 大 prompt 长流式通道从昨天起就没好过（小探针每次 200，长生成随机秒断）。这不是你的错，别灰心，也别想着"下一轮多努力一点"把它熬过去：同一个大 prompt 重发十几次，结果都一样，只是把 90 秒的轮次烧掉。
最小可行下一步不变（01:17 条）：这轮只跑 `node tools/verify/shortcut-probe.mjs`，把输出追加到 LOG.md，commit+push，然后让这轮干净地结束——不写新代码、不开 subagent、不重试。注意一个新细节：如果流式又在中途断了，你的回答越短越容易活下来——把这轮的结论压成一句话写进 LOG（"本轮跑通 shortcut-probe，结果 X，未改动"），长篇的复盘等通道好了再写。活着的轮次只做"本地能闭环"的事，剩下的交给通道恢复或用户拍板（OpenRouter 临时接管已在等用户决定，你不用管）。

- 2026-10-14 05:36 【taskmaster：M1 收官 → M2 开场，布置 P24 发车格巡游开场】P19 赛道复杂度 M1 收官：P19e 捷径由 OpenRouter 降级轮（21:26:55 UTC qwen down 自动 fallback 到 nvidia/nemotron-3-ultra-550b）于 21:33 UTC 闭环——trackdefs.js classic shortcuts[0]（a/b/halfWidth=6/yA/yB/hazardPos）+ track.js _buildShortcuts（捷径 mesh polygonOffset 覆盖草地、shortcutCheckpoints[0] bypass 1→3 防白嫖切弯、常驻香蕉 lifetime=Infinity 正中 hazardPos）；shortcut-probe.mjs 20 项全 PASS（俯视沥青 21% 真实渲染，存证 shots/shortcut-p19e-classic-*.png）；verify.js ok:true 零 console/page error、--drive 10 km/h。收官 commit 31f57e0 → 远端 c5d32961。
M2 任务来源：ROADMAP（M2=P24 开场 + P22 小地图）+ GUIDANCE 2026-10-13 12:00 用户反馈（P24 完整需求，见该条）。Pi 下一轮只做 P24 第一块：一轮只做一件事（建议先写发车格巡游镜头脚本骨架：dolly 滑过四车侧面+拉升到玩家车后，旧 showcase 零件爆炸全段后删），不写 UI 不加量；流式再断让本轮自然结束（90s 新轮），不重试；每块独立 commit+push，LOG 记一句话。P24 不闭环不开 P22（11:12 规则延续）。
别做的事：game/ 过去约 18 小时零落盘的是 Qwen 大 prompt 流式必死（隧道劣化，23:27 已证实，非逻辑问题），降级到 OpenRouter 的轮是能产出的——当前 fallback 轮已经证明了这一点，不必等 Qwen 通道恢复。

- 2026-10-14 07:16 【babysit：verify.js ok:false —— 真回归，非环境问题】这轮（23:10:59 UTC 那轮）在执行服务重启中被杀掉，main.js 留着你的 P24 WIP 改动（删旧 showcase → parade 骨架），工作树里有 1 个未提交文件。babysit 的 verify 抓到了一个 pageError：`ReferenceError: paradeDone is not defined` —— game/main.js 第 128 行和第 154 行都在读裸变量 `paradeDone`（`if (state.paradeMode && !paradeDone)`），但它既没有在 state 对象里声明，也没有 `let` 声明过。旧 showcase 删掉前 `showcaseProgress`/`showcasePhase` 是 state 字段，而你新引入的 paradeDone 漏了声明 —— 很常见，删旧代码时把旧字段清掉、新字段忘了加回去。
  最小可行下一步（下一轮只做这一件，改一行）：在 state 对象里加 `paradeDone: false`（paradeStartTime 旁边），并把两处 `!paradeDone` 读 `state.paradeDone`；巡游镜头落位玩家车后那条分支里写 `state.paradeDone = true`（如果那分支还没写完，就先让它能跑——开场跑不通别的都验不了）。然后 `node --check game/main.js` + verify.js 跑一轮（8901 还在，200），ok:true 后 commit+push（铁律：别让 WIP 带着 ReferenceError 过夜）。这是你的新代码 bug，不是通道问题，修起来比任何绕行都快——你负责的 P24 第一块本来就快闭环了，别让这一个漏声明耽误它。

- 2026-10-14 08:28 【taskmaster：paradeDone 漏声明已修复+验证通过，P24 第一块继续收尾】game/main.js 的 07:16 babysit bug（裸变量 paradeDone ReferenceError）本轮 Pi 已修：state 里声明了 paradeDone:false，三处读取全改 state.paradeDone，落位分支写 state.paradeDone=true。taskmaster 本轮 node --check 全过、verify.js ok:true 零 error（开场改动未阻驾驶）——旧 bug 闭环，GUIDANCE 07:16 条的"修一行→verify→commit+push"三步走了前两步。
  下一轮只做一件事：跑 `node tools/verify/parade-probe.mjs`（Pi 本轮已写好，8446 字节），把 FAIL 项修到全绿→ STATE/LAST 更新 → commit+push。别在这轮里开新功能（P24 不闭环不开 P22，05:36 规则不变）。
