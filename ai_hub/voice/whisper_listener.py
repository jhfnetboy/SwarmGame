"""
whisper_listener.py
实时麦克风采集 → VAD 静音检测 → Faster-Whisper 推理 → 指令推入 Queue

运行要求：
  - faster-whisper, sounddevice, numpy
  - Mac 麦克风权限授权
"""
import time
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from .command_parser import parse_command

SAMPLE_RATE = 16000       # Whisper 固定采样率
CHUNK_MS    = 300         # 每次读取的毫秒数
VAD_SILENCE = 0.5         # 静音超过此秒数则触发推理
ENERGY_THR  = 0.01        # 能量阈值（避免噪音误触）
MAX_RECORD  = 5.0         # 最长录音片段（秒）


def _rms(buf: np.ndarray) -> float:
    return float(np.sqrt(np.mean(buf.astype(np.float32) ** 2)))


def voice_process(command_queue, stop_event):
    """
    主循环：在独立子进程中运行。
    将识别到的指令 dict 放入 command_queue。
    """
    print("[Voice] Loading Whisper tiny (int8)...")
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    print("[Voice] Whisper ready. Listening...")

    chunk_size = int(SAMPLE_RATE * CHUNK_MS / 1000)
    buffer = []
    silence_time = 0.0
    recording = False

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='int16',
            blocksize=chunk_size,
        ) as stream:
            while not stop_event.is_set():
                audio_chunk, _ = stream.read(chunk_size)
                audio_flat = audio_chunk.flatten()
                rms = _rms(audio_flat)

                if rms > ENERGY_THR:
                    buffer.append(audio_flat)
                    silence_time = 0.0
                    recording = True
                elif recording:
                    silence_time += CHUNK_MS / 1000.0
                    buffer.append(audio_flat)  # include trailing silence

                    total_sec = len(buffer) * CHUNK_MS / 1000.0
                    if silence_time >= VAD_SILENCE or total_sec >= MAX_RECORD:
                        # Transcribe
                        audio_arr = np.concatenate(buffer).astype(np.float32) / 32768.0
                        try:
                            segments, _ = model.transcribe(
                                audio_arr,
                                language=None,          # auto detect zh/en
                                beam_size=1,
                                vad_filter=True,
                            )
                            text = " ".join(s.text for s in segments).strip()
                            if text:
                                print(f"[Voice] STT: '{text}'")
                                cmd = parse_command(text)
                                if cmd:
                                    print(f"[Voice] → Command: {cmd}")
                                    command_queue.put({"type": "voice", "cmd": cmd})
                        except Exception as e:
                            print(f"[Voice] transcribe error: {e}")

                        buffer = []
                        silence_time = 0.0
                        recording = False
    except Exception as e:
        print(f"[Voice] Stream error: {e}")
