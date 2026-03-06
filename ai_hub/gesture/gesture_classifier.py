"""
gesture_classifier.py
MediaPipe 手部关键点 → 手势分类

手势定义：
  - overload : 单手 >= 3 根手指展开（大幅降低阈值，更易触发）
  - gather   : 单手 <= 1 根手指展开（握拳）
  - split    : 双手检测到且腕间距超过阈值（双手分开）
"""
import math

# 手指末端 landmark index（MediaPipe 21点）
FINGER_TIPS  = [4, 8, 12, 16, 20]   # 拇指末 + 其余四指末
FINGER_BASES = [2, 5,  9, 13, 17]   # 对应 MCP/IP 关节

SPLIT_WRIST_THRESHOLD = 0.30   # 两手腕归一化距离（调低让 split 更容易触发）

# 手指张开判定阈值（归一化坐标，降低让识别更宽松）
THUMB_OPEN_THRESHOLD  = 0.04   # 拇指横向展开（原来 0.06）
FINGER_OPEN_THRESHOLD = 0.01   # 其余手指纵向展开（原来 0.03，大幅降低）


def _is_finger_open(landmarks, tip_id, base_id, is_thumb=False) -> bool:
    tip  = landmarks[tip_id]
    base = landmarks[base_id]
    if is_thumb:
        # 拇指：横向展开（用绝对距离，无论左右手）
        return abs(tip.x - base.x) > THUMB_OPEN_THRESHOLD
    else:
        # 其余手指：指尖 Y 坐标 < 关节 Y 坐标（表示手指伸直朝上）
        # 用更宽松的阈值 0.01（允许手略微倾斜也能判为张开）
        return tip.y < base.y - FINGER_OPEN_THRESHOLD


def count_open_fingers(hand_landmarks) -> int:
    lm = hand_landmarks.landmark
    count = 0
    for i, (tip, base) in enumerate(zip(FINGER_TIPS, FINGER_BASES)):
        if _is_finger_open(lm, tip, base, is_thumb=(i == 0)):
            count += 1
    return count


def wrist_distance(hand_landmarks_list) -> float:
    """计算两手腕间归一化距离"""
    w0 = hand_landmarks_list[0].landmark[0]  # 手腕0
    w1 = hand_landmarks_list[1].landmark[0]  # 手腕1
    return math.sqrt((w0.x - w1.x)**2 + (w0.y - w1.y)**2)


def classify_gesture(hand_landmarks_list) -> tuple[str | None, float, float]:
    if not hand_landmarks_list:
        return None, 0.0, 0.0

    # 1. 首先检查是不是双手 SPLIT 动作
    if len(hand_landmarks_list) >= 2:
        dist = wrist_distance(hand_landmarks_list)
        if dist > SPLIT_WRIST_THRESHOLD:
            return "split", 0.0, 0.0

    # 2. 分析第一只手（主导手）
    lm = hand_landmarks_list[0].landmark
    open_count = count_open_fingers(hand_landmarks_list[0])

    # 调试输出方便排查
    # print(f"[Debug] open_count={open_count}")

    # 提取手掌中心坐标（手腕0 和 掌根9 中点）
    cx = (lm[0].x + lm[9].x) / 2.0
    cy = (lm[0].y + lm[9].y) / 2.0

    # 降低阈值：>= 3 根手指展开就算 OVERLOAD（更宽容）
    if open_count >= 3:
        return "overload", cx, cy
    if open_count <= 1:
        return "gather", cx, cy

    return None, 0.0, 0.0
