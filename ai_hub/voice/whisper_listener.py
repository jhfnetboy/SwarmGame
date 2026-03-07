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
CHUNK_MS    = 400         # 每次读取的毫秒数
VAD_SILENCE = 0.5         # 静音超过此秒数则触发推理
ENERGY_THR  = 0.002       # 能量阈值（降低门限，对远处声音更敏感）
MAX_RECORD  = 5.0         # 最长录音片段（秒）


def _rms(buf: np.ndarray) -> float:
    return float(np.sqrt(np.mean(buf.astype(np.float32) ** 2)))


def voice_process(command_queue, stop_event, clients_event=None):
    """
    主循环：在独立子进程中运行。
    将识别到的指令 dict 放入 command_queue。
    """
    try:
        print("[Voice] Loading Whisper tiny (int8)...", flush=True)
        model = WhisperModel("tiny", device="cpu", compute_type="int8", download_root=".")
        print("[Voice] Whisper ready.", flush=True)
    except Exception as e:
        print(f"[Voice] ERROR initializing Whisper: {e}", flush=True)
        return

    chunk_size = int(SAMPLE_RATE * CHUNK_MS / 1000)

    while not stop_event.is_set():
        # Block until a client connects
        if clients_event and not clients_event.is_set():
            print("[Voice] Suspending microphone — Waiting for Web UI connection...", flush=True)
            clients_event.wait()
            if stop_event.is_set():
                break
            print("[Voice] Waking up microphone...", flush=True)

        buffer = []
        silence_time = 0.0
        recording = False

        try:
            # Re-acquire microphone hardware lock
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype='int16',
                blocksize=chunk_size,
            ) as stream:
                while not stop_event.is_set() and (not clients_event or clients_event.is_set()):
                    audio_chunk, _ = stream.read(chunk_size)
                    audio_flat = audio_chunk.flatten()
                    
                    # Normalize raw int16 (-32768~32767) to (0~1.0) energy magnitude scale
                    rms = _rms(audio_flat) / 32768.0

                    if rms > ENERGY_THR:
                        buffer.append(audio_flat)
                        silence_time = 0.0
                        recording = True
                    elif recording:
                        silence_time += CHUNK_MS / 1000.0
                        buffer.append(audio_flat)  # include trailing silence
                    
                    if recording:
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
                                    print(f"[Voice] STT: '{text}'", flush=True)
                                    # Always push the raw text to UI for feedback
                                    command_queue.put({"type": "speech", "text": text})
                                    
                                    cmd = parse_command(text)
                                    if cmd:
                                        print(f"        → Command: {cmd}", flush=True)
                                        command_queue.put({"type": "voice", "cmd": cmd})
                            except Exception as e:
                                print(f"[Voice] transcribe error: {e}", flush=True)

                            buffer = []
                            silence_time = 0.0
                            recording = False
                            
            # When the inner while loop breaks due to `not clients_event.is_set()`,
            # the `with` context exits, freeing the mic completely!
            
        except Exception as e:
            print(f"[Voice] Stream error: {e}")
            time.sleep(1) # Prevent rapid error spin
