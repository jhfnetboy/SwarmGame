"""
command_parser.py - 中英文指令归一化
"""

COMMAND_MAP = {
    # start / deploy
    "start": "start", "起飞": "start", "出发": "start", "setup": "start",
    "launch": "start", "go": "start", "开始": "start", "deploy": "start",
    # attack
    "attack": "attack", "攻击": "attack", "打": "attack", "fire": "attack",
    # avoid / dodge
    "avoid": "avoid", "躲避": "avoid", "dodge": "avoid", "evade": "avoid",
    "躲": "avoid", "规避": "avoid",
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
