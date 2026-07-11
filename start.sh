#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  ============================================"
echo "    Soar Blog - 启动中..."
echo "  ============================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "[1/2] 正在安装依赖..."
    npm install
else
    echo "[1/2] 依赖已存在，跳过安装"
fi

echo "[2/2] 启动 Hexo 服务器..."
echo ""
echo "  访问地址: http://localhost:4000"
echo "  按 Ctrl+C 停止服务器"
echo ""

export NODE_TLS_REJECT_UNAUTHORIZED=0
npx hexo server -p 4006
