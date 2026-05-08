# Emotica

Full-stack real-time emotion-aware voice AI system.

## Clean Project Structure

- `apps/frontend/`
    - React + Vite user interface
- `services/orchestrator-api/`
    - Node.js WebSocket orchestrator (VAD, LLM, TTS, service coordination)
- `services/stt-emotion-api/`
    - Python Flask API for speech emotion prediction
- `ml/ser_pipeline/`
    - Modular SER data prep and training package
- `scripts/ser_pipeline.py`
    - CLI entry for SER pipeline steps
- `requirements.txt`
    - Python dependencies for the emotion API and SER training pipeline

## Runtime Ports

- Frontend (Vite): `5173` (default)
- Orchestrator API: `8080` (default)
- Emotion API: `5001` (default)

## Quick Start

### 1) Start Emotion API

```bash
cd services/stt-emotion-api
python -m venv .venv
# activate env, then:
pip install -r ../../requirements.txt
python main.py
```

### 2) Start Orchestrator API

```bash
cd services/orchestrator-api
npm install
copy .env.example .env
# edit .env and paste your real API keys
npm run dev
```

Environment variables used by orchestrator:

- `GROQ_API_KEY`
- `GROQ_MODEL` (optional, default `llama-3.3-70b-versatile`)
- `DEEPGRAM_API_KEY`
- `DEEPGRAM_MODEL` (optional, default `nova-3`)
- `DEEPGRAM_LANGUAGE` (optional, default `en-US`)
- `DEEPGRAM_ENDPOINTING_MS` (optional, default `300`)
- `DEEPGRAM_UTTERANCE_END_MS` (optional, default `1000`)
- `DEEPGRAM_KEEPALIVE_MS` (optional, default `4000`)
- `DEEPGRAM_FINALIZE_GRACE_MS` (optional, default `900`)
- `UNREAL_SPEECH_API_KEY`
- `UNREAL_SPEECH_ENDPOINT` (optional, default `https://api.v8.unrealspeech.com/stream`)
- `UNREAL_SPEECH_VOICE_ID` (optional, default `Emily`)
- `TTS_MIN_SEGMENT_CHARS` (optional, default `8`)
- `TTS_MAX_SEGMENT_CHARS` (optional, default `220`)
- `EMOTION_API_URL` (optional, default `http://localhost:5001/emotion`)
- `PORT` (optional, default `8080`)

## Real-Time Voice Pipeline

The voice path is optimized for low latency:

1. Browser audio uses lightweight VAD and streams only speech chunks plus a short pre-roll.
2. The Node orchestrator opens a direct Deepgram WebSocket and pipes LINEAR16 audio immediately.
3. When VAD ends the turn, emotion inference starts asynchronously from the buffered audio and Deepgram is finalized.
4. The LLM starts immediately with the previous known emotion, or `neutral` on the first turn.
5. The newly detected emotion is stored for the next turn.
6. Groq streams text tokens; complete sentence segments are sent to Unreal Speech as soon as they are ready.

### 3) Start Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

## SER Training Pipeline

Run from repository root:

```bash
python scripts/ser_pipeline.py extract --audio-dir <wav_folder>
python scripts/ser_pipeline.py split --audio-dir <wav_folder>
python scripts/ser_pipeline.py train --audio-dir <wav_folder>
# or all in one
python scripts/ser_pipeline.py all --audio-dir <wav_folder>
```

## Cleanup Notes Applied

- Renamed folders to explicit domain names (apps/services/ml/scripts).
- Removed generated frontend `dist` artifact from tracked workspace.
- Removed local Python virtual environment from tracked workspace.
- Removed duplicate legacy API entrypoint and kept a single startup file: `services/stt-emotion-api/main.py`.
