import numpy as np
import librosa
import noisereduce as nr
from pydub import AudioSegment, effects


def load_normalize_trim(audio_file: str, headroom_dbfs: float, trim_top_db: int) -> tuple[np.ndarray, int]:
    raw = AudioSegment.from_file(audio_file)
    normalized = effects.normalize(raw, headroom=headroom_dbfs)

    sr = normalized.frame_rate
    data = np.array(normalized.get_array_of_samples(), dtype=np.float32)
    max_amp = normalized.max_possible_amplitude
    if max_amp > 0:
        data = data / max_amp
    else:
        data = np.array([0.0], dtype=np.float32)

    trimmed, _ = librosa.effects.trim(data, top_db=trim_top_db)
    return trimmed, sr


def right_pad_or_trim(data: np.ndarray, target_length: int) -> np.ndarray:
    if len(data) < target_length:
        return np.pad(data, (0, target_length - len(data)), mode="constant")
    return data[:target_length]


def denoise(data: np.ndarray, sr: int) -> np.ndarray:
    return nr.reduce_noise(y=data, sr=sr)
