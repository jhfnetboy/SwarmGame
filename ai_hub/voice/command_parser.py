"""
command_parser.py - 中英文指令归一化
"""

COMMAND_MAP = {
    # start / deploy
    "start": "start", "起飞": "start", "出发": "start", "setup": "start",
    "launch": "start", "go": "start", "开始": "start", "deploy": "start",
    "開始": "start", "启动": "start", "啟動": "start", "动": "start", "啟": "start", "启": "start", 
    "起": "start", "开始吧": "start", "飞": "start",
    # attack
    "attack": "attack", "攻击": "attack", "打": "attack", "fire": "attack",
    "攻擊": "attack", "打击": "attack", "打擊": "attack", "进攻": "attack", "進攻": "attack",
    # avoid / dodge
    "avoid": "avoid", "躲避": "avoid", "dodge": "avoid", "evade": "avoid",
    "躲": "avoid", "规避": "avoid", "閃": "avoid", "闪": "avoid", "避": "avoid", "閃避": "avoid"
}

def parse_command(text: str) -> str | None:
    """
    从 STT 文本中提取标准指令。
    支持中英文混合短句，如 "please attack now" / "开始攻击"。
    """
    text = text.lower().strip()
    for keyword, cmd in COMMAND_MAP.items():
        if keyword in text:
            return cmd
    return None
