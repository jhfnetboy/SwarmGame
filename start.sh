#!/bin/bash
# start.sh — 一键启动 SwarmGame（游戏 + AI 中枢）
# 每次启动前强制清除所有缓存、Kill 所有旧进程

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║      SwarmGame — Commander's Link        ║"
echo "╚══════════════════════════════════════════╝"

# ── Step 0: 拉取最新代码 ─────────────────────
echo "► git pull..."
cd "$ROOT"
git pull --ff-only 2>/dev/null || echo "  (git pull skipped)"

# ── Step 1: 杀死所有旧进程 ───────────────────
echo "► Killing old processes..."

# Kill Vite dev server / preview (port 5173)
lsof -ti tcp:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
# Kill WebSocket AI Hub (port 8765)
lsof -ti tcp:8765 2>/dev/null | xargs kill -9 2>/dev/null || true
# Kill any lingering python3 main.py processes
pkill -f "python3 main.py" 2>/dev/null || true
# Deep kill to ensure mac AVFoundation python orphans are explicitly nuked
ps aux | grep -i "python" | grep -i "ai_hub" | awk '{print $2}' | xargs kill -9 2>/dev/null || true
# Kill any lingering vite processes
pkill -f "vite" 2>/dev/null || true

sleep 1

# ── Step 2: 彻底清除 Vite 缓存 ───────────────
echo "► Clearing all caches..."
cd "$ROOT/game"
rm -rf dist .vite node_modules/.vite node_modules/.cache

# ── Step 3: 构建最新版本 ─────────────────────
echo "► Building frontend..."
pnpm build

# ── Step 4: 启动 AI Hub ───────────────────────
echo "► Starting AI Hub..."
cd "$ROOT/ai_hub"
source .venv/bin/activate
python3 main.py &
AI_PID=$!
sleep 2

# ── Step 5: 启动静态服务器（preview 模式）────
echo "► Starting Game Server..."
cd "$ROOT/game"
pnpm preview --port 5173 &
GAME_PID=$!

echo ""
echo "✅  SwarmGame is running!"
echo "   🎮 Open: http://localhost:5173"
echo "   🧠 AI:   ws://localhost:8765"
echo "   Press Ctrl+C to stop."
echo ""

cleanup() {
    echo "Shutting down..."
    kill $AI_PID 2>/dev/null || true
    kill $GAME_PID 2>/dev/null || true
    lsof -ti tcp:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti tcp:8765 2>/dev/null | xargs kill -9 2>/dev/null || true
    pkill -f "python3 main.py" 2>/dev/null || true
    # Deep kill to ensure mac AVFoundation python orphans are explicitly nuked
    ps aux | grep -i "python" | grep -i "ai_hub" | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM
wait
