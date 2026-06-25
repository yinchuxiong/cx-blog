#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  ============================================"
echo "    Soar Blog - 重启中..."
echo "  ============================================"
echo ""

echo "[1/2] 停止端口 4000 的旧服务 + 清理缓存..."
npx kill-port 4000 2>/dev/null
npx hexo clean

echo ""
echo "[2/2] 启动 Hexo 服务器..."
echo ""
echo "  访问地址: http://localhost:4000"
echo "  按 Ctrl+C 停止服务器"
echo ""

export NODE_TLS_REJECT_UNAUTHORIZED=0
npx hexo server -p 4000
