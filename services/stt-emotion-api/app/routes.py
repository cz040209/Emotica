from flask import Blueprint, current_app, jsonify, request

from .audio_processing import decode_pcm16_base64, is_low_energy, resample_audio
from .services import predict_emotion

api = Blueprint("api", __name__)


@api.get("/")
def health_check():
    return "Emotion API is running!", 200


@api.post("/emotion")
def emotion_audio():
    bundle = current_app.config["INFERENCE_BUNDLE"]
    settings = bundle.settings

    data = request.get_json(silent=True) or {}
    audio_base64 = data.get("audio")
    if not audio_base64:
        return jsonify({"error": "No audio data provided"}), 400

    try:
        source_sample_rate = int(data.get("source_sample_rate", settings.source_sample_rate))
        audio_48khz = decode_pcm16_base64(audio_base64)
        audio_16khz = resample_audio(audio_48khz, source_sample_rate, settings.target_audio_sr)

        if audio_16khz.size == 0:
            return jsonify({"emotion": "neutral"}), 200

        if is_low_energy(audio_16khz, settings.audio_content_threshold):
            return jsonify({"emotion": "neutral"}), 200

        if len(audio_16khz) < settings.min_samples_for_processing:
            return jsonify({"emotion": "neutral"}), 200

        detected_emotion = predict_emotion(bundle, audio_16khz)

        return jsonify({"emotion": detected_emotion}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
