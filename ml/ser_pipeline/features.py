import numpy as np
import librosa
import torch
from transformers import Wav2Vec2Model, Wav2Vec2Processor


class Wav2Vec2FeatureExtractor:
    def __init__(self, model_name: str, target_sr: int, target_length: int):
        self.processor = Wav2Vec2Processor.from_pretrained(model_name)
        self.model = Wav2Vec2Model.from_pretrained(model_name)
        self.model.eval()
        self.target_sr = target_sr
        self.target_length = target_length
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)

    def _pad_or_trim(self, feats: np.ndarray) -> np.ndarray:
        if feats.ndim == 1:
            feats = np.expand_dims(feats, axis=0)

        n = feats.shape[0]
        if n < self.target_length:
            return np.pad(feats, ((0, self.target_length - n), (0, 0)), mode="constant")
        if n > self.target_length:
            return feats[:self.target_length, :]
        return feats

    def extract(self, audio: np.ndarray, sr: int) -> np.ndarray:
        if sr != self.target_sr:
            audio = librosa.resample(y=audio, orig_sr=sr, target_sr=self.target_sr)

        inputs = self.processor(audio, sampling_rate=self.target_sr, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)

        feats = outputs.last_hidden_state.squeeze().cpu().numpy()
        return self._pad_or_trim(feats).astype(np.float32)
