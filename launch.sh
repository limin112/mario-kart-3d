#!/bin/bash
# Mario Kart 3D - 一键启动脚本
# 双击此文件即可在浏览器中玩游戏

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "=========================================="
echo "  Mario Kart 3D - 启动器"
echo "=========================================="
echo ""

# 检查 game 目录是否存在
if [ ! -d "game" ]; then
    echo "错误: 找不到 game 目录"
    echo "请确保在项目根目录下运行此脚本"
    read -p "按回车键退出..."
    exit 1
fi

# 检查必要文件
if [ ! -f "game/index.html" ]; then
    echo "错误: 找不到 game/index.html"
    read -p "按回车键退出..."
    exit 1
fi

if [ ! -f "game/vendor/three.module.js" ]; then
    echo "错误: 找不到 Three.js (game/vendor/three.module.js)"
    read -p "按回车键退出..."
    exit 1
fi

echo "正在启动本地服务器..."

# 杀掉可能已存在的同端口进程
lsof -ti:8901 | xargs -r kill -9 2>/dev/null

# 启动 HTTP 服务器（后台运行）
cd game
python3 -m http.server 8901 > /dev/null 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 2

# 检查服务器是否启动成功
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "错误: 服务器启动失败"
    echo "请确保已安装 Python 3"
    read -p "按回车键退出..."
    exit 1
fi

# 检查端口是否可访问
if ! curl -s http://127.0.0.1:8901/ > /dev/null; then
    echo "错误: 无法连接到本地服务器"
    kill $SERVER_PID 2>/dev/null
    read -p "按回车键退出..."
    exit 1
fi

echo "服务器已启动: http://127.0.0.1:8901/"
echo ""

# 尝试在默认浏览器中打开
URL="http://127.0.0.1:8901/"

echo "正在打开浏览器..."

# 跨平台打开浏览器
if command -v xdg-open > /dev/null; then
    # Linux
    xdg-open "$URL" 2>/dev/null &
elif command -v open > /dev/null; then
    # macOS
    open "$URL" 2>/dev/null &
elif command -v start > /dev/null; then
    # Windows (Git Bash / WSL)
    start "$URL" 2>/dev/null &
else
    echo "无法自动打开浏览器，请手动访问: $URL"
fi

echo ""
echo "=========================================="
echo "  游戏已启动！"
echo "=========================================="
echo ""
echo "操作说明:"
echo "  WASD / 方向键  - 控制赛车"
echo "  空格键         - 使用道具"
echo "  R 键           - 重新开始（比赛结束后）"
echo ""
echo "游戏流程:"
echo "  1. 车辆展示模式 (约 4 秒，或按任意键跳过)"
echo "  2. 3-2-1-GO 倒计时"
echo "  3. 3 圈竞速比赛"
echo "  4. 结算界面显示圈速和名次"
echo ""
echo "关闭此终端窗口将停止服务器并退出游戏"
echo ""

# 等待用户按 Ctrl+C 或关闭窗口
trap "echo ''; echo '正在关闭服务器...'; kill $SERVER_PID 2>/dev/null; echo '已退出'; exit 0" INT TERM

# 保持脚本运行
wait $SERVER_PID