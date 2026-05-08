from pathlib import Path


EMOTION_TO_ID = {
    "neutral": 0,
    "calm": 1,
    "happy": 2,
    "sad": 3,
    "angry": 4,
    "fear": 5,
    "fearful": 5,
    "disgust": 6,
    "surprise": 7,
    "surprised": 7,
}

RAVDESS_MAP = {
    1: "neutral",
    2: "calm",
    3: "happy",
    4: "sad",
    5: "angry",
    6: "fear",
    7: "surprise",
    8: "disgust",
}


def infer_emotion_from_filename(file_name: str) -> int:
    name = file_name.lower()

    for key in ["neutral", "happy", "sad", "angry", "fear", "disgust", "surprise", "surprised", "ps"]:
        if key in name:
            normalized = "surprise" if key in {"ps", "surprised"} else key
            return EMOTION_TO_ID.get(normalized, -1)

    parts = Path(file_name).stem.split("-")
    if len(parts) >= 3 and parts[2].isdigit():
        code = int(parts[2])
        label = RAVDESS_MAP.get(code)
        if label:
            return EMOTION_TO_ID[label]

    return -1
