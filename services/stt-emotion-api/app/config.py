from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    wav2vec2_model_name: str = "facebook/wav2vec2-base-960h"
    emotion_model_path: Path = Path(__file__).resolve().parents[1] / "lstm_attention_best_weights.weights.h5"
    target_audio_sr: int = 16000
    target_wav2vec2_sr: int = 16000
    target_wav2vec2_feature_length: int = 716
    audio_content_threshold: float = 0.01
    min_seconds_for_processing: float = 1.0
    max_content_length_bytes: int = 16 * 1024 * 1024
    source_sample_rate: int = 48000

    @property
    def min_samples_for_processing(self) -> int:
        return int(self.target_audio_sr * self.min_seconds_for_processing)


EMOTION_CLASSES = [
    "neutral",
    "calm",
    "happy",
    "sad",
    "angry",
    "fearful",
    "disgust",
    "surprised",
]
