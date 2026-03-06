#!/bin/bash
# start.sh — 一键启动 SwarmGame（游戏 + AI 中枢）
# 启动前先 Kill 所有已占用的端口进程，避免残留进程干扰

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║      SwarmGame — Commander's Link        ║"
echo "╚══════════════════════════════════════════╝"

# ── 清理旧进程 ────────────────────────────────
echo "[0/2] Cleaning up old processes..."

# Kill 任何占用 5173 端口的进程（Vite dev server）
PIDS_5173=$(lsof -ti tcp:5173 2>/dev/null)
if [ -n "$PIDS_5173" ]; then
    echo "  Killing old Vite (port 5173): PIDs $PIDS_5173"
    kill -9 $PIDS_5173 2>/dev/null || true
fi

# Kill 任何占用 8765 端口的进程（WebSocket AI Hub）
PIDS_8765=$(lsof -ti tcp:8765 2>/dev/null)
if [ -n "$PIDS_8765" ]; then
    echo "  Killing old AI Hub (port 8765): PIDs $PIDS_8765"
    kill -9 $PIDS_8765 2>/dev/null || true
fi

sleep 1

# ── 启动 AI 中枢 ──────────────────────────────
echo "[1/2] Starting AI Hub (Voice + Gesture + WebSocket)..."
cd "$ROOT/ai_hub"
source .venv/bin/activate
python3 main.py &
AI_PID=$!

sleep 2

# ── 启动游戏前端（先构建最新版本）────────────
echo "[2/2] Building & Starting Game Frontend..."
cd "$ROOT/game"
pnpm build
pnpm preview --port 5173 &
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
    # Clean up ports again
    lsof -ti tcp:5173 | xargs kill -9 2>/dev/null || true
    lsof -ti tcp:8765 | xargs kill -9 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM
wait
