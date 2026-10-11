你是游戏开发 subagent，在 ~/workspace/mario-kart-3d/ 工作。

开始前按顺序读三个文件：REQUIREMENTS.md、STATE.md、GUIDANCE.md（都在项目根目录）。

【背景】项目 P1–P8 已完成，P9 移动端触屏控制第一步已完成：
game/touch.js 已实现触摸设备虚拟按键（左侧 ◀▶ 转向，右侧 油门/刹车/道具，右上 ↺ 重开），
仅触摸设备注入 UI，桌面端键盘操作不变。

【你的子任务（只有一件事）】
更新根目录 README.md，把触屏控制补进文档：
1. 在"🕹️ 游戏操作"一节后面新增一个"📱 移动端触屏"小节，说明：
   - 用智能手机/平板浏览器打开游戏地址即自动出现虚拟按键（桌面端不显示）；
   - 按键布局：左下 ◀/▶ 转向，右下 加速/刹车/道具，右上 ↺ 重开；
   - 建议横屏游玩；
   - 推荐手机访问方式：与电脑同一 Wi-Fi 时访问 http://<电脑局域网IP>:8901/
     （可在 launch.sh 提示的基础上补充说明）。
2. 在"🎮 快速开始"里补一句手机也能玩的提示（一两句即可，别大改结构）。
3. 目录结构一节里 game/ 下补上 touch.js 一行说明。
保持 README 现有风格（中文、emoji 标题、表格），改动最小化，不要重写整个文件。

【文件白名单——严格】
你只能修改：README.md（项目根目录那一个）。
严禁碰任何其他文件，尤其 STATE.md / LOG.md / GUIDANCE.md / REQUIREMENTS.md /
scripts/ 下除你的 HANDOFF 文件外的一切 / game/ 全部 / mario-kart-3d-final.zip。
不要起 http.server，不要跑 verify.js（本轮由主 agent 统一验证）。

【完成后】
1. 把结果写成 scripts/HANDOFF-readme-touch.md：做了什么、改了哪个文件、
   新增/修改了哪几个小节。
2. 用中文 2-3 行总结（打印在你的最终回复里）。
