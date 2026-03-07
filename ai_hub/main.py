"""
main.py - AI 中枢入口
启动三个并行子进程：
  1. VoiceProcess    — 麦克风 → Whisper → 指令
  2. GestureProcess  — 摄像头 → MediaPipe → 手势
  3. WSServerProcess — asyncio WebSocket 服务（推送给前端）
"""
import asyncio
import multiprocessing as mp
import signal
import sys

from voice.whisper_listener import voice_process
from gesture.mediapipe_tracker import gesture_process
from server.ws_server import run_server

# ─── Heartbeat ────────────────────────────────────────────────────────────────
async def heartbeat(command_queue: mp.Queue):
    while True:
        await asyncio.sleep(5)
        command_queue.put({"type": "ping"})


# ─── WebSocket Server Process ─────────────────────────────────────────────────
def ws_server_process(command_queue: mp.Queue, clients_event: mp.Event):
    """在独立进程中运行 asyncio WebSocket 服务"""
    asyncio.run(run_server(command_queue, clients_event))


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 50)
    print("  SwarmGame AI Hub — Starting")
    print("=" * 50)

    command_queue = mp.Queue()
    stop_event    = mp.Event()
    clients_event = mp.Event() # Track active browser connections

    processes = []

    # WebSocket server（主推送服务）
    ws_proc = mp.Process(target=ws_server_process, args=(command_queue, clients_event), name="WSServer", daemon=True)
    ws_proc.start()
    processes.append(ws_proc)
    print("[Main] WebSocket server process started (port 8765)")

    # Voice recognition
    voice_proc = mp.Process(
        target=voice_process,
        args=(command_queue, stop_event, clients_event),
        name="VoiceRecognizer",
        daemon=True
    )
    voice_proc.start()
    processes.append(voice_proc)
    print("[Main] Voice recognition process started")

    # Gesture recognition
    gesture_proc = mp.Process(
        target=gesture_process,
        args=(command_queue, stop_event, clients_event),
        name="GestureTracker",
        daemon=False  # Must be False to allow the orchestrator to spawn _run_tracker child
    )
    gesture_proc.start()
    processes.append(gesture_proc)
    print("[Main] Gesture recognition process started")

    print()
    print("✅ AI Hub running. Open http://localhost:5173 to play.")
    print("   Voice: say 'start / attack / avoid / 起飞 / 攻击 / 躲避'")
    print("   Gesture: open palm = OVERLOAD | fists apart = SPLIT")
    print("   Press Ctrl+C to stop.")
    print()

    def shutdown(sig, frame):
        print("\n[Main] Shutting down...")
        stop_event.set()
        for p in processes:
            p.terminate()
        try:
            import os # Kill process group to destroy any orphaned sub-subprocesses
            os.killpg(os.getpgid(0), signal.SIGKILL)
        except Exception:
            pass
        sys.exit(0)

    try:
        import os
        os.setpgrp()
    except Exception:
        pass

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Keep main alive
    for p in processes:
        p.join()


if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)   # Mac 兼容
    main()
