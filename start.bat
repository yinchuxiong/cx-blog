@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ============================================
echo     Soar Blog - 启动中...
echo   ============================================
echo.

REM 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [1/2] 正在安装依赖...
    call npm install
) else (
    echo [1/2] 依赖已存在，跳过安装
)

echo [2/2] 启动 Hexo 服务器...
echo.
echo   访问地址: http://localhost:4000
echo   按 Ctrl+C 停止服务器
echo.

set NODE_TLS_REJECT_UNAUTHORIZED=0
call npx hexo server -p 4006

pause
