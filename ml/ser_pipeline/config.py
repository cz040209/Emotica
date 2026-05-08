from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SERConfig:
    audio_dir: Path
    output_dir: Path
    total_length: int = 228864
    normalization_headroom_dbfs: float = 5.0
    trim_top_db: int = 30
    target_wav2vec2_sr: int = 16000
    target_feature_length: int = 716
    wav2vec2_model_name: str = "facebook/wav2vec2-base-960h"

    @property
    def hdf5_path(self) -> Path:
        return self.output_dir / "emotion_features.h5"

    @property
    def train_indices_path(self) -> Path:
        return self.output_dir / "train_indices.npy"

    @property
    def val_indices_path(self) -> Path:
        return self.output_dir / "val_indices.npy"

    @property
    def test_indices_path(self) -> Path:
        return self.output_dir / "test_indices.npy"

    @property
    def labels_mapping_path(self) -> Path:
        return self.output_dir / "labels_mapping.npy"

    @property
    def checkpoint_path(self) -> Path:
        return self.output_dir / "lstm_attention_best_weights.weights.h5"
