"""
mediapipe_tracker.py
摄像头捕获 → MediaPipe Hands → 手势分类 → 推入 Queue

降级策略：
  - 若摄像头不可用，进程静默退出（游戏通过鼠标指令操作）
  - 支持 Mac FaceTime 摄像头（camera_index=0）
"""
import time
import cv2
import mediapipe as mp
from multiprocessing import Queue, Event

from .gesture_classifier import classify_gesture, count_open_fingers

CAMERA_INDEX   = 0      # Mac FaceTime 摄像头
TARGET_FPS     = 30
DEBOUNCE_SEC   = 0.8    # 同一手势最小触发间隔


def _run_tracker(command_queue: Queue, internal_stop: Event):
    print("[Gesture] Tracker engine initializing MediaPipe and Camera...", flush=True)
    mp_hands  = mp.solutions.hands
    hands_sol = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.65,
        min_tracking_confidence=0.55,
    )

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print("[Gesture] ⚠️ Camera error during wakeup. Hardware stuck?", flush=True)
        hands_sol.close()
        return
        
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)

    last_gesture  = None
    last_sent_time = 0.0
    last_print_time = 0.0 
    frame_interval = 1.0 / TARGET_FPS
    
    gesture_history = []
    HISTORY_LEN = 12

    try:
        while not internal_stop.is_set():
            t0 = time.time()
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = hands_sol.process(rgb)

            raw_gesture, raw_x, raw_y = None, 0.0, 0.0
            if results.multi_hand_landmarks:
                raw_gesture, raw_x, raw_y = classify_gesture(results.multi_hand_landmarks)
                
            gesture_history.append((raw_gesture, raw_x, raw_y))
            if len(gesture_history) > HISTORY_LEN:
                gesture_history.pop(0)
                
            gesture = None
            gx, gy = 0.0, 0.0
            
            if gesture_history:
                most_recent_gestures = [h[0] for h in gesture_history[-3:] if h[0] is not None]
                if most_recent_gestures:
                    gesture = most_recent_gestures[-1]
                    valid_coords = [h for h in gesture_history[-3:] if h[0] == gesture]
                    gx = sum(h[1] for h in valid_coords) / len(valid_coords)
                    gy = sum(h[2] for h in valid_coords) / len(valid_coords)

            now = time.time()
            should_send = False
            
            if gesture == "overload":
                 should_send = True
            elif gesture and gesture != last_gesture and (now - last_sent_time) > DEBOUNCE_SEC:
                 should_send = True
            elif not gesture:
                 last_gesture = None
                 
            if should_send:
                 if gesture == "overload": 
                     if (now - last_print_time) > 1.0:
                         print(f"[Gesture] 🎯 Confirmed: {gesture} (Throttled Log)", flush=True)
                         last_print_time = now
                 else:
                     print(f"[Gesture] 🎯 Confirmed: {gesture}", flush=True)
                     last_sent_time = now
                     
                 command_queue.put({"type": "gesture", "cmd": gesture, "x": gx, "y": gy})
                 last_gesture = gesture

            elapsed = time.time() - t0
            sleep_t = frame_interval - elapsed
            if sleep_t > 0:
                time.sleep(sleep_t)
                
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"[Gesture] ⚠️ Fatal Error in Engine: {e}", flush=True)
    finally:
        print("[Gesture] Engine tearing down pipeline...", flush=True)
        try:
            hands_sol.close()
        except:
            pass
        if cap is not None:
            cap.release()
            for _ in range(5):
                cv2.waitKey(10)
        print("[Gesture] Engine cleanly exited.", flush=True)

import multiprocessing

def gesture_process(command_queue: Queue, stop_event: Event, clients_event: Event = None):
    print("[Gesture] Track manager online.")
    
    tracker_proc = None
    internal_stop = None

    def kill_tracker():
        nonlocal tracker_proc, internal_stop
        if tracker_proc and tracker_proc.is_alive():
            print("[Gesture] Terminating active tracker...", flush=True)
            internal_stop.set()
            tracker_proc.join(timeout=1.0)
            if tracker_proc.is_alive():
                tracker_proc.terminate()
                tracker_proc.join()
            tracker_proc = None
            internal_stop = None

    while not stop_event.is_set():
        if clients_event and not clients_event.is_set():
            kill_tracker()
            print("[Gesture] Suspending — Waiting for Web UI connection...", flush=True)
            clients_event.wait()
            if stop_event.is_set():
                break
            print("[Gesture] Waking up...", flush=True)

        if tracker_proc is None and not stop_event.is_set():
            internal_stop = multiprocessing.Event()
            tracker_proc = multiprocessing.Process(
                target=_run_tracker,
                args=(command_queue, internal_stop),
                daemon=True,
                name="GestureEngineChild"
            )
            tracker_proc.start()
            
        time.sleep(0.1) # Orchestrator logic loop

    kill_tracker()
    print("[Gesture] Manager exited.")
