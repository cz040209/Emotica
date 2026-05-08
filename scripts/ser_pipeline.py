import argparse
from pathlib import Path

from ml.ser_pipeline import SERConfig, build_feature_hdf5, split_indices, train_lstm_attention


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Emotica SER pipeline CLI")
    parser.add_argument("command", choices=["extract", "split", "train", "all"], help="Pipeline step to run")
    parser.add_argument("--audio-dir", required=True, help="Folder containing wav files")
    parser.add_argument("--output-dir", default="./ml/artifacts", help="Folder for generated artifacts")
    parser.add_argument("--epochs", type=int, default=80, help="Epochs for train command")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size for train command")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = SERConfig(audio_dir=Path(args.audio_dir), output_dir=Path(args.output_dir))

    if args.command in {"extract", "all"}:
        total = build_feature_hdf5(config)
        print(f"Feature extraction complete. Total records in HDF5: {total}")

    if args.command in {"split", "all"}:
        train_n, val_n, test_n = split_indices(config)
        print(f"Split complete. train={train_n}, val={val_n}, test={test_n}")

    if args.command in {"train", "all"}:
        checkpoint = train_lstm_attention(config, batch_size=args.batch_size, epochs=args.epochs)
        print(f"Training complete. Best weights saved to: {checkpoint}")


if __name__ == "__main__":
    main()
