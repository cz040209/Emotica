import traceback
from dataclasses import dataclass

import numpy as np
import torch
from transformers import Wav2Vec2Model, Wav2Vec2Processor

from .config import EMOTION_CLASSES, Settings
from .emotion_model import create_emotion_model, pad_or_trim_features


@dataclass
class InferenceBundle:
    settings: Settings
    wav2vec2_processor: Wav2Vec2Processor
    wav2vec2_model: Wav2Vec2Model
    emotion_model: any
    device: str


def load_inference_bundle(settings: Settings) -> InferenceBundle:
    wav2vec2_processor = Wav2Vec2Processor.from_pretrained(settings.wav2vec2_model_name)
    wav2vec2_model = Wav2Vec2Model.from_pretrained(settings.wav2vec2_model_name)
    wav2vec2_model.eval()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    wav2vec2_model.to(device)

    emotion_model = create_emotion_model(
        input_shape=(settings.target_wav2vec2_feature_length, 768),
        num_classes=len(EMOTION_CLASSES),
    )
    emotion_model.load_weights(str(settings.emotion_model_path))

    return InferenceBundle(
        settings=settings,
        wav2vec2_processor=wav2vec2_processor,
        wav2vec2_model=wav2vec2_model,
        emotion_model=emotion_model,
        device=device,
    )


def predict_emotion(bundle: InferenceBundle, audio_16khz: np.ndarray) -> str:
    try:
        if audio_16khz.size == 0:
            return "neutral"

        inputs = bundle.wav2vec2_processor(
            audio_16khz,
            sampling_rate=bundle.settings.target_wav2vec2_sr,
            return_tensors="pt",
            padding=True,
        )
        inputs = {k: v.to(bundle.device) for k, v in inputs.items()}

        if "input_values" in inputs and inputs["input_values"].shape[1] == 0:
            return "neutral"

        with torch.no_grad():
            outputs = bundle.wav2vec2_model(**inputs)

        features = outputs.last_hidden_state.squeeze().cpu().numpy()
        if features.size == 0 or features.shape[0] == 0:
            return "neutral"

        features = pad_or_trim_features(features, bundle.settings.target_wav2vec2_feature_length)
        model_input = np.expand_dims(features, axis=0)

        predictions = bundle.emotion_model.predict(model_input, verbose=0)
        predicted_idx = int(np.argmax(predictions[0]))
        if 0 <= predicted_idx < len(EMOTION_CLASSES):
            return EMOTION_CLASSES[predicted_idx]
        return "neutral"
    except Exception:
        traceback.print_exc()
        return "neutral"
