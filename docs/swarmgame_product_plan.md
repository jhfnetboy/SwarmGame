# SwarmGame：蜂群指挥官——完整产品设计与技术开发计划

## 产品概述

《蜂群指挥官》是一个致敬《安德的游戏》的沉浸式局域网本地游戏原型。玩家佩戴耳机，通过**语音指令 + 手势操控**，在约 1-2 分钟内指挥数千架无人机蜂群，摧毁陨石与外星战舰，最终轰炸母星。全程完全本地运行，无云端依赖。

---

## 1. 目录结构

```
SwarmGame/
├── game/                        # Three.js 渲染前端
│   ├── index.html
│   ├── src/
│   │   ├── main.js              # 入口、场景初始化
│   │   ├── swarm/
│   │   │   ├── SwarmController.js   # 蜂群 AI 行为（集群/分裂/攻击）
│   │   │   ├── SwarmRenderer.js     # GPU Instancing 渲染器
│   │   │   └── BoidSystem.js        # Boid 算法（分离/内聚/对齐）
│   │   ├── enemies/
│   │   │   ├── Asteroid.js          # 陨石生成与物理
│   │   │   └── AlienFleet.js        # 外星战舰群（分形几何体）
│   │   ├── fx/
│   │   │   ├── LaserFX.js           # 激光特效（InstancedMesh）
│   │   │   ├── ExplosionFX.js       # 爆炸粒子系统
│   │   │   └── BackgroundStars.js   # 星空背景（Points）
│   │   ├── audio/
│   │   │   └── AudioManager.js      # Tone.js 三级动态音乐系统
│   │   ├── hud/
│   │   │   └── HUD.js               # HTML Overlay HUD（血条/状态）
│   │   └── net/
│   │       └── CommandReceiver.js   # WebSocket 客户端（接收 AI 指令）
│   ├── assets/
│   │   ├── audio/                   # 三段 BGM Loop（Ambient/March/Climax）
│   │   └── models/                  # GLB 模型（可选，轻量）
│   └── package.json                 # Vite + Three.js
│
├── ai_hub/                      # Python AI 中枢
│   ├── main.py                  # 入口：启动各子进程 + WebSocket 服务
│   ├── voice/
│   │   ├── whisper_listener.py  # Faster-Whisper 实时 STT
│   │   └── command_parser.py    # 指令归一化（中英文 → 标准指令）
│   ├── gesture/
│   │   ├── mediapipe_tracker.py # MediaPipe 摄像头手势识别
│   │   └── gesture_classifier.py # 手势分类（张开/分裂/握拳）
│   ├── server/
│   │   └── ws_server.py         # asyncio WebSocket 服务（推送指令给前端）
│   ├── requirements.txt
│   └── .env                     # 可选配置（摄像头 ID、端口等）
│
├── docs/
│   ├── Game-idea.md             # 原始设计文档
│   └── swarmgame_product_plan.md  # 本文档
└── README.md
```

---

## 2. 技术栈选型

### 渲染层（game/）

| 模块 | 技术 | 选型理由 |
|---|---|---|
| 3D 引擎 | **Three.js r165+** | 轻量、WebGL、GPU Instancing 原生支持 |
| 构建工具 | **Vite 5** | 极快 HMR，零配置 ES Module |
| 蜂群算法 | **Boid System（自实现）** | 仅需向量运算，0 依赖，友好于 16G |
| 蜂群渲染 | **InstancedMesh** | 单次 Draw Call 渲染 5000+ 单位 |
| 激光/爆炸 | **Points + BufferGeometry** | GPU 粒子，不占 CPU |
| 音频 | **Tone.js + Web Audio API** | 动态合成，三段 Loop 无缝切换 |
| WebSocket | **原生 WebSocket** | 浏览器内置，零依赖 |

### AI 中枢（ai_hub/）

| 模块 | 技术 | 内存占用 | 选型理由 |
|---|---|---|---|
| 语音 STT | **faster-whisper tiny (int8)** | ~200 MB | M 系芯片 CPU 推理毫秒级，中英文混合 ✓ |
| 音频采集 | **sounddevice + numpy** | 极低 | 流式采集，VAD 切片 |
| 手势识别 | **MediaPipe Hands 0.10** | ~150 MB | 实时 30fps，CPU only，手掌 21 关键点 |
| 摄像头采集 | **OpenCV** | 极低 | 标准方案 |
| 服务通信 | **websockets (asyncio)** | 极低 | 异步推送，延迟 <5ms 本地 |
| 进程管理 | **multiprocessing + Queue** | — | 语音/手势/WebSocket 三进程并行 |

**总内存预估（MacBook 16G）：**
- Three.js 游戏（浏览器标签）：~400-600 MB
- Python AI 中枢（三进程）：~600-800 MB
- 系统/其他：~2 GB
- **合计约 3-4 GB，16G 完全充裕**

---

## 3. 核心模块详细设计

### 3.1 Three.js 渲染引擎（game/）

#### A. 蜂群 Boid 系统

采用经典 3 规则 + 目标追踪：

```
每帧 update():
  对每个 Boid 计算:
  1. 分离力 (Separation)：避免与邻居碰撞
  2. 内聚力 (Cohesion)：向邻居中心靠拢
  3. 对齐力 (Alignment)：与邻居速度对齐
  4. 目标追踪力：朝向当前攻击目标
  5. 边界约束：软边界弹回

  根据游戏状态切换权重:
  - IDLE: 绕玩家轨道游荡
  - ATTACK: 目标权重 ×10，直线突刺
  - AVOID: 分离力 ×10，炸开
  - SPLIT: 将 Boid 分为两组，各组独立追踪不同目标
  - OVERLOAD: ATTACK 模式 + 开启 LaserFX
```

#### B. GPU Instancing 渲染

```javascript
// SwarmRenderer.js 核心思路
const geometry = new THREE.ConeGeometry(0.3, 1.2, 4); // 低多边形战机
const material = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
const instancedMesh = new THREE.InstancedMesh(geometry, material, MAX_DRONES); // 5000

// 每帧只更新 Matrix4 数组，单次 Draw Call
drones.forEach((boid, i) => {
  dummy.position.copy(boid.position);
  dummy.lookAt(boid.position.clone().add(boid.velocity));
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
});
instancedMesh.instanceMatrix.needsUpdate = true;
```

#### C. 敌人系统

- **陨石**：`IcosahedronGeometry` + 随机 scale/rotation 变形，从画面边缘随机刷新，带缓速轨道运动
- **外星战舰**：多个 `OctahedronGeometry` 组合（分形感），带发光材质 `MeshStandardMaterial` + `emissive`，受击时触发解体动画
- **母星（最终 Boss）**：球体 + 分形噪声位移（顶点 Shader），摧毁时分裂为碎片

#### D. 三级动态音乐系统

```
Level 1 (IDLE)     → 低频 Pad + 空间混响
Level 2 (ATTACK)   → 加入 Kick 鼓点 + 合成弦乐渐强
Level 3 (CLIMAX)   → 全频谱爆发，交叉淡入
语音确认音效       → 800Hz×2 的双音提示音（Tone.js 生成，100ms）
```

#### E. HUD（HTML Overlay）

- 左上：蜂群数量 / 存活比例（进度条）
- 右上：目标列表（陨石数 / 战舰数 / 母星血量）
- 底部中：当前识别到的指令闪烁提示（"🎤 ATTACK" / "✋ SPLIT"）
- 倒计时：90 秒，到时游戏失败

---

### 3.2 Python AI 中枢（ai_hub/）

#### A. 进程架构

```
main.py (主进程)
├── Process 1: VoiceProcess     → 采集麦克风 → Whisper → command_queue
├── Process 2: GestureProcess   → 读摄像头 → MediaPipe → command_queue
└── Process 3: WSServerProcess  → 监听 command_queue → 推送 WebSocket
                                                ↓
                                       浏览器 CommandReceiver.js
```

#### B. 语音识别流程

```python
# whisper_listener.py 核心逻辑
model = WhisperModel("tiny", device="cpu", compute_type="int8")

# VAD 静音检测：连续 >300ms 无声即切片
# 采集到短音频片段后推理
segments, _ = model.transcribe(audio_chunk, language=None)
text = " ".join([s.text for s in segments]).lower().strip()
cmd = parse_command(text)  # → "start" | "attack" | "avoid" | None
if cmd:
    command_queue.put({"type": "voice", "cmd": cmd})
```

#### C. 手势识别流程

```python
# mediapipe_tracker.py 核心逻辑
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.7)

def classify_gesture(hand_landmarks_list):
    if len(hand_landmarks_list) == 2:
        # 双手检测：计算两手腕间距
        dist = wrist_distance(hand_landmarks_list)
        if dist > SPLIT_THRESHOLD:
            return "split"
    
    if len(hand_landmarks_list) >= 1:
        # 单手：检测手指展开数
        fingers_open = count_open_fingers(hand_landmarks_list[0])
        if fingers_open >= 4:
            return "overload"   # 五指张开 → 火力全开
        elif fingers_open == 0:
            return "gather"     # 握拳 → 集合
    return None
```

#### D. 指令归一化

```python
# command_parser.py
COMMAND_MAP = {
    # 语音 → 标准指令
    "start": "start", "起飞": "start", "出发": "start", "setup": "start",
    "attack": "attack", "攻击": "attack",
    "avoid": "avoid", "躲避": "avoid", "dodge": "avoid",
}
def parse_command(text: str) -> str | None:
    for keyword, cmd in COMMAND_MAP.items():
        if keyword in text:
            return cmd
    return None
```

#### E. WebSocket 消息协议

```json
// 语音指令
{ "type": "voice", "cmd": "attack", "ts": 1710000000.123 }

// 手势指令
{ "type": "gesture", "cmd": "split", "ts": 1710000000.456 }

// 心跳
{ "type": "ping" }
```

---

## 4. 游戏流程状态机

```
BOOT → IDLE → DEPLOY → BATTLE → CLIMAX → VICTORY / DEFEAT → RESTART
            ↑voice:start  ↑持续   ↑母星出现  ↑母星死亡/时间到
```

| 状态 | 蜂群行为 | 音乐 | 触发条件 |
|---|---|---|---|
| BOOT | 无 | 无 | 页面加载 |
| IDLE | 绕玩家轨道盘旋 | Level 1 | 初始 |
| DEPLOY | 向星空扩散 | Level 1→2 | voice: start |
| BATTLE | 攻击最近敌人 | Level 2 | 自动 |
| CLIMAX | 全力攻击母星 | Level 3 | 所有战舰被摧毁 |
| VICTORY | 爆炸动画 | 胜利音效 | 母星摧毁 |
| DEFEAT | 蜂群凋零 | 失败音效 | 计时 90s 到 / 蜂群全灭 |

---

## 5. 开发里程碑

### Phase 0：环境准备（Day 1，约 1 小时）

- [ ] `game/` 目录：`pnpm create vite@latest . -- --template vanilla`
- [ ] 安装 Three.js：`pnpm add three`
- [ ] `ai_hub/` 目录：`python -m venv .venv && pip install faster-whisper mediapipe opencv-python sounddevice websockets`
- [ ] 验证 Whisper tiny 可以在 Mac 本地加载推理
- [ ] 验证 MediaPipe 可以打开摄像头

### Phase 1：蜂群核心（Day 1-2，约 4 小时）

- [ ] 实现 `BoidSystem.js`（Boid 算法 + 状态权重切换）
- [ ] 实现 `SwarmRenderer.js`（InstancedMesh，5000 单位，60fps 验证）
- [ ] 实现 `BackgroundStars.js`（Points，10000 星点）
- [ ] 游戏可以在 IDLE 状态运行蜂群盘旋动画

### Phase 2：敌人系统（Day 2-3，约 3 小时）

- [ ] 实现 `Asteroid.js`（随机生成、运动、碰撞检测）
- [ ] 实现 `AlienFleet.js`（分形几何体战舰，血量系统）
- [ ] 实现 `LaserFX.js` 和 `ExplosionFX.js`
- [ ] 蜂群可以在 ATTACK 状态自动消灭陨石

### Phase 3：AI 中枢（Day 3-4，约 3 小时）

- [ ] 实现 `ws_server.py`（asyncio WebSocket 服务，端口 8765）
- [ ] 实现 `whisper_listener.py`（麦克风→VAD→Whisper→指令）
- [ ] 实现 `mediapipe_tracker.py`（摄像头→手势分类）
- [ ] 实现 `main.py`（三进程启动管理）
- [ ] 前端 `CommandReceiver.js` 接收并触发游戏状态机

### Phase 4：音频 + HUD + 状态机（Day 4-5，约 3 小时）

- [ ] 实现 `AudioManager.js`（三级音乐 + 效果音）
- [ ] 实现 `HUD.js`（计时器、蜂群数、目标数、指令回显）
- [ ] 完整游戏状态机（`GameStateMachine.js`）
- [ ] VICTORY / DEFEAT 动画 + 自动 Restart

### Phase 5：调优与演示（Day 5-6，约 2 小时）

- [ ] 性能调优：确保 MacBook 16G 下 60fps
- [ ] 母星 Boss（球体 + 噪声 Shader + 分裂动画）
- [ ] 完整 1-2 分钟游戏流程联调
- [ ] 录制演示视频

---

## 6. 快速启动命令

```bash
# 终端 1：启动 AI 中枢
cd SwarmGame/ai_hub
source .venv/bin/activate
python main.py

# 终端 2：启动游戏渲染
cd SwarmGame/game
pnpm dev
# 浏览器打开 http://localhost:5173
```

---

## 7. 延伸方向（Mac Mini 联机版）

若要启用 Mac Mini 负责 Whisper：
- Mac Mini 运行 `ai_hub/voice/` 子集，暴露局域网 WebSocket
- MacBook 的 `main.py` 改为连接 Mac Mini 的 WS 而非本地子进程
- 局域网 WebSocket 延迟 <20ms，完全透明

---

> **文档状态**：产品设计阶段 ✅ | 开发中 🔲 | 已完成 🔲
