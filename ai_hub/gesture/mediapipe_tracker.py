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


def gesture_process(command_queue: Queue, stop_event: Event):
    print("[Gesture] Initializing MediaPipe Hands...")
    mp_hands  = mp.solutions.hands
    hands_sol = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.65,
        min_tracking_confidence=0.55,
    )

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print("[Gesture] ⚠️  Camera not available — gesture input disabled (use mouse fallback)")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)
    print("[Gesture] Camera opened. Tracking hands...")

    last_gesture  = None
    last_sent_time = 0.0
    frame_interval = 1.0 / TARGET_FPS
    
    # 增加滑动窗口防抖
    from collections import Counter
    gesture_history = []
    HISTORY_LEN = 12

    while not stop_event.is_set():
        t0 = time.time()
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        # MediaPipe 处理（RGB）
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = hands_sol.process(rgb)

        raw_gesture, raw_x, raw_y = None, 0.0, 0.0
        if results.multi_hand_landmarks:
            raw_gesture, raw_x, raw_y = classify_gesture(results.multi_hand_landmarks)
            # Debug: print finger count every frame (no relative import needed)
            open_ct = count_open_fingers(results.multi_hand_landmarks[0])
            print(f"[Gesture] raw={raw_gesture} fingers={open_ct}", end="\r")
            
        gesture_history.append((raw_gesture, raw_x, raw_y))
        if len(gesture_history) > HISTORY_LEN:
            gesture_history.pop(0)
            
        gesture = None
        gx, gy = 0.0, 0.0
        
        # 使用简单的两三帧平滑即可，不要太严厉的多数投票防止卡死
        if gesture_history:
            most_recent_gestures = [h[0] for h in gesture_history[-3:] if h[0] is not None]
            if most_recent_gestures:
                # 只要最近 3 帧里有有效手势，就采用最新的一帧
                gesture = most_recent_gestures[-1]
                # 找出对应手势的坐标做一下微小平均
                valid_coords = [h for h in gesture_history[-3:] if h[0] == gesture]
                gx = sum(h[1] for h in valid_coords) / len(valid_coords)
                gy = sum(h[2] for h in valid_coords) / len(valid_coords)

        now = time.time()
        should_send = False
        
        if gesture == "overload":
             # 永远允许发送，更新准星
             should_send = True
        elif gesture and gesture != last_gesture and (now - last_sent_time) > DEBOUNCE_SEC:
             # 其他动作保留防抖
             should_send = True
             
        if should_send:
             if gesture != "overload": 
                 print(f"[Gesture] 🎯 Confirmed: {gesture}")
             command_queue.put({"type": "gesture", "cmd": gesture, "x": gx, "y": gy})
             last_sent_time = now
             last_gesture = gesture

        # 帧率控制
        elapsed = time.time() - t0
        sleep_t = frame_interval - elapsed
        if sleep_t > 0:
            time.sleep(sleep_t)

    cap.release()
    hands_sol.close()
    print("[Gesture] Camera released.")
