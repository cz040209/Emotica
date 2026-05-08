import h5py
import numpy as np
from sklearn.model_selection import train_test_split

from .config import SERConfig


def split_indices(config: SERConfig, random_state: int = 42) -> tuple[int, int, int]:
    with h5py.File(config.hdf5_path, "r") as hf:
        total_samples = hf["X_wav2vec2_features"].shape[0]
        labels = np.array(hf["Y_labels"])

    all_indices = np.arange(total_samples)

    temp_idx, test_idx = train_test_split(
        all_indices,
        test_size=0.2,
        random_state=random_state,
        stratify=labels,
    )

    train_idx, val_idx = train_test_split(
        temp_idx,
        test_size=0.25,
        random_state=random_state,
        stratify=labels[temp_idx],
    )

    np.save(config.train_indices_path, train_idx)
    np.save(config.val_indices_path, val_idx)
    np.save(config.test_indices_path, test_idx)
    np.save(config.labels_mapping_path, np.unique(labels))

    return len(train_idx), len(val_idx), len(test_idx)
