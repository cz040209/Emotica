from pathlib import Path

import h5py
import numpy as np

from .config import SERConfig
from .features import Wav2Vec2FeatureExtractor
from .labels import infer_emotion_from_filename
from .preprocess import denoise, load_normalize_trim, right_pad_or_trim


def build_feature_hdf5(config: SERConfig) -> int:
    config.output_dir.mkdir(parents=True, exist_ok=True)

    extractor = Wav2Vec2FeatureExtractor(
        model_name=config.wav2vec2_model_name,
        target_sr=config.target_wav2vec2_sr,
        target_length=config.target_feature_length,
    )

    count = 0
    with h5py.File(config.hdf5_path, "a") as hf:
        if "X_wav2vec2_features" not in hf:
            x_ds = hf.create_dataset(
                "X_wav2vec2_features",
                shape=(0, config.target_feature_length, 768),
                maxshape=(None, config.target_feature_length, 768),
                dtype="float32",
                chunks=True,
            )
        else:
            x_ds = hf["X_wav2vec2_features"]

        if "Y_labels" not in hf:
            y_ds = hf.create_dataset(
                "Y_labels",
                shape=(0,),
                maxshape=(None,),
                dtype="int8",
                chunks=True,
            )
        else:
            y_ds = hf["Y_labels"]

        count = int(x_ds.shape[0])

        for audio_file in config.audio_dir.rglob("*.wav"):
            try:
                trimmed, sr = load_normalize_trim(
                    str(audio_file),
                    headroom_dbfs=config.normalization_headroom_dbfs,
                    trim_top_db=config.trim_top_db,
                )
                padded = right_pad_or_trim(trimmed, config.total_length)
                cleaned = denoise(padded, sr)
                feats = extractor.extract(cleaned, sr)

                label_id = infer_emotion_from_filename(audio_file.name)
                if label_id < 0:
                    continue

                x_ds.resize(count + 1, axis=0)
                y_ds.resize(count + 1, axis=0)
                x_ds[count] = feats
                y_ds[count] = label_id
                count += 1
            except Exception as exc:
                print(f"Skipping {audio_file}: {exc}")

    return count
