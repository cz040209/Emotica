# SER Module (Emotica)

This package contains modular Speech Emotion Recognition training utilities.

## Files

- `config.py`: Shared paths and constants.
- `preprocess.py`: Audio normalization, trimming, padding, denoising.
- `features.py`: Wav2Vec2 feature extraction.
- `dataset_builder.py`: Build HDF5 feature store.
- `split_dataset.py`: Train/val/test split index generation.
- `train_lstm_attention.py`: LSTM + Attention training loop.

## CLI entry

Use `scripts/ser_pipeline.py` from project root:

- `python scripts/ser_pipeline.py extract --audio-dir <wav_folder>`
- `python scripts/ser_pipeline.py split --audio-dir <wav_folder>`
- `python scripts/ser_pipeline.py train --audio-dir <wav_folder>`
- `python scripts/ser_pipeline.py all --audio-dir <wav_folder>`
