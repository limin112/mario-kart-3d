@echo off
REM Mario Kart 3D - 一键启动脚本 (Windows)
REM 双击此文件即可在浏览器中玩游戏

chcp 65001 >nul
title Mario Kart 3D Launcher

echo ==========================================
echo   Mario Kart 3D - 启动器
echo ==========================================
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 检查 game 目录是否存在
if not exist "game" (
    echo 错误: 找不到 game 目录
    echo 请确保在项目根目录下运行此脚本
    pause
    exit /b 1
)

REM 检查必要文件
if not exist "game\index.html" (
    echo 错误: 找不到 game\index.html
    pause
    exit /b 1
)

if not exist "game\vendor\three.module.js" (
    echo 错误: 找不到 Three.js (game\vendor\three.module.js)
    pause
    exit /b 1
)

echo 正在启动本地服务器...

REM 杀掉可能已存在的同端口进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8901') do taskkill /f /pid %%a >nul 2>&1

REM 启动 HTTP 服务器（后台运行）
cd game
start /b python -m http.server 8901 >nul 2>&1

REM 等待服务器启动
timeout /t 3 /nobreak >nul

REM 检查服务器是否启动成功
curl -s http://127.0.0.1:8901/ >nul 2>&1
if errorlevel 1 (
    echo 错误: 无法连接到本地服务器
    echo 请确保已安装 Python 3 并添加到 PATH
    pause
    exit /b 1
)

echo 服务器已启动: http://127.0.0.1:8901/
echo.

REM 在默认浏览器中打开
start "" "http://127.0.0.1:8901/"

echo ==========================================
echo   游戏已启动！
echo ==========================================
echo.
echo 操作说明:
echo   WASD / 方向键  - 控制赛车
echo   空格键         - 使用道具
echo   R 键           - 重新开始（比赛结束后）
echo.
echo 游戏流程:
echo   1. 车辆展示模式 (约 4 秒，或按任意键跳过)
echo   2. 3-2-1-GO 倒计时
echo   3. 3 圈竞速比赛
echo   4. 结算界面显示圈速和名次
echo.
echo 关闭此窗口将停止服务器并退出游戏
echo.

REM 保持窗口打开，等待用户关闭
pause

REM 清理：关闭时尝试杀掉 python 进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8901') do taskkill /f /pid %%a >nul 2>&1