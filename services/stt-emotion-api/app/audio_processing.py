import base64
import numpy as np
import librosa


def decode_pcm16_base64(audio_base64: str) -> np.ndarray:
    audio_bytes = base64.b64decode(audio_base64)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    return audio_int16.astype(np.float32) / 32768.0


def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if audio.size == 0:
        return np.array([], dtype=np.float32)
    if orig_sr == target_sr:
        return audio.astype(np.float32)
    return librosa.resample(y=audio, orig_sr=orig_sr, target_sr=target_sr).astype(np.float32)


def is_low_energy(audio: np.ndarray, threshold: float) -> bool:
    if audio.size == 0:
        return True
    return float(np.std(audio)) < threshold
