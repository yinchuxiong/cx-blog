@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ============================================
echo     Soar Blog - 重启中...
echo   ============================================
echo.

echo [1/2] 停止端口 4000 的旧服务 + 清理缓存...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul
call npx hexo clean

echo.
echo [2/2] 启动 Hexo 服务器...
echo.
echo   访问地址: http://localhost:4000
echo   按 Ctrl+C 停止服务器
echo.

set NODE_TLS_REJECT_UNAUTHORIZED=0
call npx hexo server -p 4000

pause
