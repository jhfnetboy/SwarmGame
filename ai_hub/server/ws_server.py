"""
ws_server.py - asyncio WebSocket 服务
接收来自各识别子进程的指令，推送给浏览器前端
"""
import asyncio
import json
import time
import websockets
from multiprocessing import Queue

CLIENTS = set()
CLIENTS_EVENT = None

async def handler(websocket):
    CLIENTS.add(websocket)
    if CLIENTS_EVENT and not CLIENTS_EVENT.is_set():
        CLIENTS_EVENT.set()
        print("[WS] First client connected. Waking up hardware...", flush=True)
        
    print(f"[WS] Client connected: {websocket.remote_address} (Total: {len(CLIENTS)})")
    try:
        async for msg in websocket:
            pass  # 前端只读不写
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"[WS] Client disconnected (Total: {len(CLIENTS)})")
        if len(CLIENTS) == 0 and CLIENTS_EVENT:
            CLIENTS_EVENT.clear()
            print("[WS] Zero clients. Suspending hardware...", flush=True)

async def broadcast(data: dict):
    if not CLIENTS:
        return
    msg = json.dumps(data)
    dead = set()
    for ws in CLIENTS:
        try:
            await ws.send(msg)
        except Exception:
            dead.add(ws)
    CLIENTS.difference_update(dead)

async def queue_consumer(q: Queue):
    """轮询多进程 Queue，将指令广播给所有 WebSocket 客户端"""
    loop = asyncio.get_event_loop()
    while True:
        try:
            # 非阻塞 get
            item = await loop.run_in_executor(None, _safe_get, q)
            if item:
                item['ts'] = time.time()
                await broadcast(item)
        except Exception as e:
            print(f"[WS] queue error: {e}")
        await asyncio.sleep(0.01)

def _safe_get(q: Queue):
    try:
        return q.get(timeout=0.05)
    except Exception:
        return None

async def run_server(command_queue: Queue, clients_event=None, host='0.0.0.0', port=8765):
    global CLIENTS_EVENT
    CLIENTS_EVENT = clients_event
    
    print(f"[WS] Starting WebSocket server on ws://{host}:{port}")
    async with websockets.serve(handler, host, port):
        await queue_consumer(command_queue)
