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

from .gesture_classifier import classify_gesture

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
            
        gesture_history.append((raw_gesture, raw_x, raw_y))
        if len(gesture_history) > HISTORY_LEN:
            gesture_history.pop(0)
            
        # 多数投票决定当前稳定手势（忽略 None，如果 None 居多则释放）
        gesture = None
        gx, gy = 0.0, 0.0
        if gesture_history:
            # 统计名称
            names = [h[0] for h in gesture_history]
            c = Counter(names)
            most_common, count = c.most_common(1)[0]
            # 至少有 6 帧稳定才认作该手势，否则维持上一次明确的手势或 None
            if most_common is not None and count >= 6:
                gesture = most_common
                # 均值滤波取坐标平滑
                valid_coords = [h for h in gesture_history if h[0] == gesture]
                gx = sum(h[1] for h in valid_coords) / len(valid_coords)
                gy = sum(h[2] for h in valid_coords) / len(valid_coords)

        now = time.time()
        # 对于带坐标的手势 (overload)，不用 debouncing 限流，只要位置变化就发送（前端带平滑插值）
        # 给 gather/split 保留频率限制
        should_send = False
        if gesture == "overload" and gesture == last_gesture:
            should_send = True # 持续发送坐标
        elif gesture and gesture != last_gesture and (now - last_sent_time) > DEBOUNCE_SEC:
            should_send = True
            
        if should_send:
            if gesture != "overload": 
                print(f"[Gesture] 🎯 Confirmed: {gesture}")
            command_queue.put({"type": "gesture", "cmd": gesture, "x": gx, "y": gy})
            last_sent_time = now

        if gesture is not None:
             last_gesture = gesture

        # 帧率控制
        elapsed = time.time() - t0
        sleep_t = frame_interval - elapsed
        if sleep_t > 0:
            time.sleep(sleep_t)

    cap.release()
    hands_sol.close()
    print("[Gesture] Camera released.")
