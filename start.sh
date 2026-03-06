#!/bin/bash
# start.sh — 一键启动 SwarmGame（游戏 + AI 中枢）
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "╔══════════════════════════════════════════╗"
echo "║      SwarmGame — Commander's Link        ║"
echo "╚══════════════════════════════════════════╝"

# 终端1：启动 AI 中枢
echo "[1/2] Starting AI Hub (Voice + Gesture + WebSocket)..."
cd "$ROOT/ai_hub"
source .venv/bin/activate
python3 main.py &
AI_PID=$!

sleep 2

# 终端2：启动游戏前端
echo "[2/2] Starting Game Frontend (Vite)..."
cd "$ROOT/game"
pnpm dev &
GAME_PID=$!

echo ""
echo "✅  Both services started!"
echo "   🎮 Game:   http://localhost:5173"
echo "   🧠 AI Hub: ws://localhost:8765"
echo ""
echo "   Press Ctrl+C to stop everything."

cleanup() {
    echo ""
    echo "Shutting down..."
    kill $AI_PID $GAME_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM
wait
