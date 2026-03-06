"""
gesture_classifier.py
MediaPipe 手部关键点 → 手势分类

手势定义：
  - overload : 单手 >= 4 根手指展开（五指张开 = 火力全开）
  - gather   : 单手 0 根手指展开（握拳 = 集合）
  - split    : 双手检测到且腕间距超过阈值（双手分开 = 分裂）
"""
import math

# 手指末端 landmark index（MediaPipe 21点）
FINGER_TIPS  = [4, 8, 12, 16, 20]   # 拇指末 + 其余四指末
FINGER_BASES = [2, 5,  9, 13, 17]   # 对应 MCP/IP 关节

SPLIT_WRIST_THRESHOLD = 0.35   # 归一化坐标系下的腕间距（相对图像宽）


def _is_finger_open(landmarks, tip_id, base_id, is_thumb=False) -> bool:
    tip  = landmarks[tip_id]
    base = landmarks[base_id]
    if is_thumb:
        # 拇指：X 轴判断（右手向右展开）
        return abs(tip.x - base.x) > 0.06
    else:
        # 其余手指：Y 轴（tip 比 base 更高 = 展开）
        return tip.y < base.y - 0.03


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

    # 2. 如果不是明确的 SPLIT，退而求其次分析第一只手（主导手）
    lm = hand_landmarks_list[0].landmark
    open_count = count_open_fingers(hand_landmarks_list[0])
    
    # 提取手掌中心坐标 (用手腕 0 和掌根 9 的中点代表大概方向)
    cx = (lm[0].x + lm[9].x) / 2.0
    cy = (lm[0].y + lm[9].y) / 2.0
    
    # 即使画面出现两手，只有张开度足够，也认作指令
    if open_count >= 4:
        return "overload", cx, cy
    if open_count <= 1:
        return "gather", cx, cy

    return None, 0.0, 0.0
