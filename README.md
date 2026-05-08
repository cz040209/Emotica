# Emotica: Real-Time Emotion-Aware Voice AI System

A full-stack, real-time voice interaction system that detects speaker emotions and responds with emotion-aware AI responses. This system combines speech recognition, emotion detection via LSTM-Attention deep learning models, LLM-powered conversational AI, and text-to-speech synthesis.

---

## 🎯 System Overview

Emotica is designed to create human-like conversational experiences by understanding emotional context from the speaker's voice and responding appropriately. The system processes audio in real-time with minimal latency through an optimized pipeline that handles:

- **Voice Activity Detection (VAD)**: Detects when the user is speaking
- **Speech-to-Text (STT)**: Converts audio to text using Deepgram
- **Emotion Recognition (SER)**: Predicts emotional state using LSTM-Attention models
- **LLM Response Generation**: Creates context-aware responses with Groq
- **Text-to-Speech (TTS)**: Converts responses to natural, emotion-aware speech using Hume AI

---

## 📊 System Architecture & Workflow

### Real-Time Voice Pipeline Flow

```
                  USER SPEAKS & STOPS
                          │
                          ▼
        ┌───────────────────────────────────┐
        │ VAD (Voice Activity Detection)    │
        │ detects speech & buffers audio    │
        └───────────────────┬───────────────┘
                            │
                    VAD END DETECTED
                            │
        ┌───────────────────┴───────────────┐
        │                                   │
        │   PARALLEL / ASYNC EXECUTION      │
        │                                   │
    ┌───▼──────────────┐           ┌───────▼────────────┐
    │ PATH A: STT      │           │ PATH B: EMOTION    │
    │ (AWAITED)        │           │ (NOT AWAITED)      │
    │                  │           │                    │
    │ Deepgram         │           │ Flask + LSTM       │
    │ WebSocket        │           │ Inference          │
    │ Finalize stream  │           │ (Fire & forget)    │
    │ ⏳ Blocks        │           │ ✓ Async runs       │
    │ response gen     │           │   parallel         │
    │                  │           │                    │
    │ Get transcript   │           │ Get emotion        │
    └───┬──────────────┘           └───────┬────────────┘
        │                                   │
        └──────────┬──────────────────────┬─┘
                   │ Both complete        │
                   │ simultaneously       │
                   │                      │
            ┌──────▼──────────────────────▼─────┐
            │ Store emotion in memory            │
            │ (for next turn's prompt context)   │
            └──────┬─────────────────────────────┘
                   │
        ┌──────────▼──────────────────────────┐
        │ Build Emotion-Aware Prompt:         │
        │ • USER: {transcript}                │
        │ • EMOTION: {detected_emotion}       │
        │ • INTENT: {emotion context}         │
        └──────┬───────────────────────────────┘
               │
        ┌──────▼────────────────────┐
        │ Groq LLM                   │
        │ Stream response tokens     │
        │ with emotional context     │
        └──────┬────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │ Segment into TTS chunks (8-220 chr) │
        │ Stream to Hume AI TTS                │
        └──────┬───────────────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │ Hume AI TTS with emotion voice:     │
        │ • Apply emotion persona              │
        │ • Stream MP3 audio chunks            │
        └──────┬───────────────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │ Browser: Play emotion-matched audio │
        └──────┬───────────────────────────────┘
               │
               └─────────────────────────────┐
                    (Loop for next turn)    │
                                            │
                    Ready for next input ◄──┘
```

---

## 📁 Project Structure

```
emotica/
├── apps/
│   └── frontend/                    # React + Vite Web UI
│       ├── src/
│       │   ├── App.jsx              # Main React component
│       │   └── main.jsx             # Entry point
│       ├── package.json
│       ├── vite.config.js
│       └── index.html
├── services/
│   ├── orchestrator-api/            # Node.js WebSocket server
│   │   ├── server.js                # Main orchestrator logic
│   │   ├── package.json
│   │   └── .env.example
│   └── stt-emotion-api/             # Python Flask Emotion API
│       ├── main.py                  # Flask app entry point
│       ├── app/                     # Flask application modules
│       └── lstm_attention_best_weights.weights.h5  # Pre-trained model
├── ml/
│   └── ser_pipeline/                # Speech Emotion Recognition (SER) pipeline
│       ├── config.py                # Configuration settings
│       ├── dataset_builder.py       # Build datasets from raw audio
│       ├── features.py              # Feature extraction (MFCC, Mel-spec)
│       ├── labels.py                # Emotion label management
│       ├── preprocess.py            # Audio preprocessing
│       ├── split_dataset.py         # Train/val/test split
│       └── train_lstm_attention.py  # Model training script
├── scripts/
│   └── ser_pipeline.py              # CLI for SER pipeline
├── datasets/
│   ├── RAVDESS/                     # Ryerson Audio-Visual Emotion Dataset
│   └── TESS Toronto emotional speech set data/  # Toronto emotion dataset
├── requirements.txt                 # Python dependencies
└── README.md
```

---

## 🛠️ Tech Stack

### **Frontend**
- **React** (18.x) - UI framework for interactive web interface
- **Vite** - Lightning-fast build tool and dev server
- **JavaScript/JSX** - Frontend logic and component development

### **Backend & APIs**
- **Node.js** - JavaScript runtime for backend services
- **Express.js** - Lightweight HTTP framework for REST endpoints
- **WebSocket** - Real-time bidirectional communication between frontend and orchestrator

### **Machine Learning & Audio**
- **Python** (3.10+) - Backend ML framework
- **TensorFlow/Keras** - Deep learning framework for model training
- **LSTM (Long Short-Term Memory)** - Recurrent neural network architecture for sequence modeling
- **Attention Mechanism** - Neural network layer for focusing on relevant audio features
- **librosa** - Audio feature extraction library
- **NumPy** - Numerical computing
- **SciPy** - Scientific computing
- **soundfile** - Audio file I/O

### **External APIs**
- **Deepgram** - Speech-to-Text (STT) with streaming WebSocket support
- **Groq** - LLM API for fast conversational responses with streaming tokens
- **Hume AI** - Emotion-aware Text-to-Speech (TTS) with voice persona customization

### **Data & Training**
- **RAVDESS Dataset** - Ryerson Audio-Visual Emotion Database (24 actors)
- **TESS Toronto Dataset** - Toronto Emotional Speech Set (2 speakers)
- **Scikit-learn** - Data preprocessing and splitting

### **Development Tools**
- **Git** - Version control
- **npm** - Node.js package manager
- **pip** - Python package manager
- **ESLint** - JavaScript linting

---

## 🚀 Runtime Ports

| Service | Port | Default |
|---------|------|---------|
| Frontend (Vite) | - | 5173 |
| Orchestrator API | - | 8080 |
| Emotion API (Flask) | - | 5001 |

---

## ⚡ Quick Start

### 1) Start Emotion API (Python Flask)

The emotion detection API uses LSTM-Attention deep learning models to predict emotional state from audio features.

```bash
cd services/stt-emotion-api
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r ../../requirements.txt

# Run the Flask server
python main.py
```

**What it does:**
- Extracts Mel-spectrogram features from audio
- Processes through pre-trained LSTM-Attention model
- Returns emotion classification (angry, happy, sad, neutral, fearful, etc.)
- Serves predictions via REST API at `http://localhost:5001`

---

### 2) Start Orchestrator API (Node.js)

The orchestrator coordinates all services and manages the real-time voice pipeline using WebSockets.

```bash
cd services/orchestrator-api
npm install

# Create environment file
copy .env.example .env

# Edit .env and add your API keys
# (see Environment Variables section below)

npm run dev
```

**What it does:**
- Receives audio streams from the browser via WebSocket
- Manages Voice Activity Detection (VAD)
- **Streams audio to Deepgram WebSocket** for real-time speech-to-text transcription
- **Fires async emotion detection** from Flask API (does NOT block STT)
- Emotion result from current turn stored for next turn's context
- **Builds emotion-aware prompts** using detected emotion + conversation history
- Calls Groq LLM with emotion context for conversational AI responses
- **Streams response to Hume AI TTS** with emotion persona (angry, happy, calm, sad, etc.)
- Returns synthesized emotion-matched speech to the browser

**Required Environment Variables:**

```env
# ─── DEEPGRAM (Speech-to-Text Streaming) ───
DEEPGRAM_API_KEY=your_deepgram_key              # REQUIRED
DEEPGRAM_LISTEN_URL=wss://api.deepgram.com/v1/listen  # optional
DEEPGRAM_MODEL=nova-3                          # optional - model for STT
DEEPGRAM_LANGUAGE=en-US                        # optional - language code
DEEPGRAM_ENDPOINTING_MS=300                    # optional - silence threshold (ms)
DEEPGRAM_UTTERANCE_END_MS=1000                 # optional - utterance timeout (ms)
DEEPGRAM_KEEPALIVE_MS=4000                     # optional - keepalive interval (ms)
DEEPGRAM_FINALIZE_GRACE_MS=900                 # optional - grace period after finalize (ms)

# ─── GROQ (LLM for Response Generation) ───
GROQ_API_KEY=your_groq_key                     # REQUIRED
GROQ_MODEL=llama-3.3-70b-versatile             # optional - LLM model

# ─── HUME AI (Emotion-Aware Text-to-Speech) ───
HUME_API_KEY=your_hume_api_key                 # REQUIRED
HUME_TTS_ENDPOINT=https://api.hume.ai/v0/tts   # optional - TTS endpoint

# ─── EMOTION API (Flask Emotion Detection) ───
EMOTION_API_URL=http://localhost:5001/emotion  # optional - emotion API endpoint

# ─── AUDIO PROCESSING ───
AUDIO_SAMPLE_RATE=48000                        # optional - client audio sample rate (Hz)
CALL_END_SILENCE_THRESHOLD_MS=5000             # optional - timeout before ending call (ms)
SILENCE_VOLUME_THRESHOLD=20                    # optional - RMS volume threshold for silence

# ─── TTS STREAMING ───
TTS_MIN_SEGMENT_CHARS=8                        # optional - min chars to send to TTS
TTS_MAX_SEGMENT_CHARS=220                      # optional - max chars per TTS segment

# ─── SERVER ───
PORT=8080                                      # optional - orchestrator server port
```

---

### 3) Start Frontend (React + Vite)

The browser-based user interface that handles real-time audio capture and playback.

```bash
cd apps/frontend
npm install
npm run dev
```

**What it does:**
- Captures user audio via browser microphone
- Implements client-side Voice Activity Detection
- Streams audio to the orchestrator via WebSocket
- Displays AI responses in real-time
- Plays back synthesized speech responses
- Shows emotion detection results

---

## 🧠 Speech Emotion Recognition (SER) Pipeline

The SER pipeline trains deep learning models to detect emotions from audio. It includes data preparation, feature extraction, and model training.

### Audio Feature Extraction

The system extracts multiple acoustic features:

- **Mel-Spectrogram** - Time-frequency representation of speech
- **MFCC (Mel-Frequency Cepstral Coefficients)** - Human auditory perception features
- **Chromagram** - Musical/harmonic features
- **Zero Crossing Rate (ZCR)** - Voice activity indicator
- **RMS Energy** - Loudness measurement
- **Spectral Centroid** - Brightness of sound

### Model Architecture

The emotion recognition model uses:

1. **LSTM Layers** - Process temporal sequences in audio
2. **Attention Mechanism** - Focus on important time steps
3. **Dense Layers** - Classification head
4. **Dropout** - Regularization to prevent overfitting

### Training Pipeline Commands

Run from repository root:

```bash
# Extract features from audio files
python scripts/ser_pipeline.py extract --audio-dir <wav_folder>

# Split data into train/val/test sets (80/10/10)
python scripts/ser_pipeline.py split --audio-dir <wav_folder>

# Train LSTM-Attention model
python scripts/ser_pipeline.py train --audio-dir <wav_folder>

# Run all steps at once
python scripts/ser_pipeline.py all --audio-dir <wav_folder>
```

**Output:**
- Processed features in `.pkl` format
- Trained model saved as `lstm_attention_best_weights.weights.h5`
- Training metrics and validation results

---

## 📈 Emotion-Aware Processing Pipeline

### Async/Parallel Architecture (Key Innovation)

When **user stops speaking (VAD ends)**, two critical processes execute **in parallel**:

```
┌────────────────────────────────────────────────────────────┐
│  VAD DETECTS END OF SPEECH → TRIGGER TWO PATHS             │
└────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
          ┌───────▼────────┐      ┌──────▼──────────┐
          │ PATH A: STT    │      │ PATH B: EMOTION │
          │ (AWAITED)      │      │ (NOT AWAITED)   │
          │                │      │                 │
          │ Deepgram       │      │ Flask API       │
          │ Finalize       │      │ LSTM Inference  │
          │ WebSocket      │      │ (Fire & forget) │
          │                │      │                 │
          │ ⏳ BLOCKS      │      │ ✓ ASYNC         │
          │ response gen   │      │ ✓ Runs parallel │
          │                │      │                 │
          └───────┬────────┘      └──────┬──────────┘
                  │                       │
                  │ Both complete         │
                  │ ~simultaneously       │
                  │                       │
          ┌───────▼───────────────────────▼──────┐
          │ Store emotion for NEXT turn           │
          │ (lastKnownEmotion = detected emotion) │
          └───────┬────────────────────────────────┘
                  │
          ┌───────▼────────────────────────────┐
          │ Build emotion-aware prompt with:   │
          │ • USER: {transcript from PATH A}   │
          │ • EMOTION: {emotion from PATH B}   │
          │ • INTENT: derived from emotion     │
          │ • RESPONSE_TEMPLATE: matched tone  │
          └───────┬────────────────────────────┘
                  │
          ┌───────▼────────────────────────────┐
          │ Groq streams response              │
          │ with emotion context               │
          └───────┬────────────────────────────┘
                  │
          ┌───────▼────────────────────────────┐
          │ Hume AI TTS with voice persona:    │
          │ • Apply emotion to speech          │
          │ • Stream MP3 audio chunks          │
          └───────┬────────────────────────────┘
                  │
          ┌───────▼────────────────────────────┐
          │ Browser plays response audio       │
          └────────────────────────────────────┘
```

### Detailed Step-by-Step Flow

1. **Audio Input** → Browser captures user speech (48kHz, PCM, mono)

2. **Client VAD Detection** → Detects speech start/end in real-time

3. **Streaming to Server** → Audio chunks streamed via WebSocket

4. **VAD End Detected** → Triggers parallel async execution:

   **PATH A: Speech-to-Text (AWAITED - blocks LLM call)**
   - Deepgram WebSocket receives audio chunks in real-time
   - Streams interim results as user speaks
   - When VAD ends, sends `Finalize` message
   - Waits for final transcript with grace period
   - Returns complete user utterance text

   **PATH B: Emotion Detection (NOT AWAITED - async fire-and-forget)**
   - Buffered audio sent to Flask emotion API
   - LSTM-Attention model extracts Mel-spectrogram
   - Runs inference (doesn't block STT or response generation)
   - Returns emotion probability: `{anger: 0.8, happy: 0.1, sad: 0.05, ...}`
   - Stores max emotion in `lastKnownEmotion` for next turn

5. **Emotion-Aware Prompt Construction** → After both complete:
   ```
   System: You are a compassionate AI assistant. Respond with empathy.
   
   USER: "I'm really frustrated with this situation!"
   EMOTION: angry
   INTENT: User is upset, needs reassurance
   → Respond calmly, validate feelings, offer help
   
   RESPONSE_TEMPLATE: {calm_understanding_tone}
   ```

6. **LLM Response Generation** → Groq processes with emotion context
   - Stream tokens as they arrive
   - Maintain emotional tone throughout

7. **Emotion-Aware TTS** → Hume AI applies voice persona:
   - **Detected emotion**: angry → `"Calm and grounded, steady and measured, de-escalating"`
   - **Generated speech**: Matches emotional context of response
   - Stream MP3 chunks to browser as generated

8. **Audio Playback** → Browser plays complete response with emotional tone

### Next Turn Emotion Context

The emotion detected in turn N is used in turn N+1's prompt:
- **Turn 1**: User speaks (angry) → emotion detected → stored
- **Turn 2**: Use turn 1's emotion in prompt context → current emotion detected for turn 3
- **Continuous**: Always using previous turn's emotion for context

This creates a continuous emotional thread through the conversation.

---

## 🔄 Low-Latency Architecture & Optimization

### Why This Design Minimizes Latency

**Standard Sequential Approach (SLOW):**
```
Audio → VAD End → STT (wait) → Emotion (wait) → LLM (wait) → TTS (wait)
        └─────────────────────────────────────────────────────────┘
                        Total: ~2-3 seconds
```

**Emotica Async Approach (FAST):**
```
Audio → VAD End → ┌─ STT (wait)     → LLM → TTS
                  │ Emotion (async) ↗
                Total: ~1-1.5 seconds
```

### Key Optimizations

1. **Parallel Processing**
   - Emotion detection runs **asynchronously** (fire-and-forget)
   - Does NOT block STT or response generation
   - Results arrive later but don't block critical path
   - Use previous turn's emotion immediately

2. **Streaming Architecture**
   - **Deepgram**: WebSocket streaming (not REST poll)
   - **Groq**: Token streaming for real-time responses
   - **Hume AI TTS**: Stream MP3 chunks as generated
   - No waiting for complete audio before playback

3. **Smart Buffering & Segmentation**
   - Client VAD: Only relevant speech sent upstream
   - Segment batching: 8-220 chars per TTS request
   - Accumulate segments before sending to TTS

4. **Emotion Context Reuse**
   - Current turn: Use emotion from previous turn
   - Next turn: Use emotion just-detected from current turn
   - Always have emotional context available immediately

### Latency Breakdown (Typical)

```
Client speaks:        0ms
├─ Audio streaming:   +100-200ms (real-time)
├─ VAD detects end:   +50-100ms
├─ Deepgram STT:      +300-500ms (awaited)
├─ Emotion inference: +200-400ms (async, parallel)
├─ Groq LLM:          +500-1000ms (streaming tokens)
├─ Hume AI TTS:       +300-600ms (streaming audio)
└─ Browser playback:  +100-200ms
──────────────────────────────────
Total end-to-end:     ~1.5-2.5 seconds
```

**Without async emotion**: Would add +200-400ms to critical path
**With async emotion**: 0ms delay (runs in parallel)

---

## 📦 Dependencies

### Python Requirements
- TensorFlow/Keras (Deep Learning)
- librosa (Audio feature extraction)
- NumPy, SciPy (Scientific computing)
- Flask (Web framework)
- soundfile (Audio I/O)
- scikit-learn (ML utilities)

See `requirements.txt` for complete list with versions.

### Node.js Requirements
- Express (HTTP server)
- WebSocket libraries for real-time communication
- Deepgram SDK (speech-to-text)
- Groq SDK (LLM)
- Hume AI API (emotion-aware TTS)
- fetch (for HTTP requests)

---

## 🎓 Model Training Details

### LSTM-Attention Architecture

```
Input: Audio Features (Mel-Spectrogram)
    ↓
[LSTM Layer 1] → 128 units, bidirectional
    ↓
[Dropout] → 0.3 regularization
    ↓
[LSTM Layer 2] → 64 units, bidirectional
    ↓
[Attention Mechanism] → Focus on important frames
    ↓
[Dense Layer] → 32 units, ReLU activation
    ↓
[Dropout] → 0.3 regularization
    ↓
[Output Layer] → Softmax (emotion classes)
    ↓
Output: Emotion Probabilities [0-1]
```

### Training Configuration

- **Batch Size**: 32
- **Epochs**: 100+ (with early stopping)
- **Optimizer**: Adam
- **Loss Function**: Categorical Crossentropy
- **Validation Split**: 20%
- **Early Stopping**: Monitor validation loss

### Supported Emotions

- Angry
- Happy
- Sad
- Neutral
- Fearful
- Disgust (from TESS)
- Pleasant Surprise

---

## 🗂️ Datasets

### RAVDESS (Ryerson Audio-Visual Emotion Database)
- 24 professional actors (12M, 12F)
- 1,440 audio files
- 7 emotions recorded twice each
- Standardized neutral accent

### TESS (Toronto Emotional Speech Set)
- 2 female speakers (Young Adult, Older Adult)
- 2,800 audio files
- 7 emotions
- High quality, natural speech

---

## 🐛 Troubleshooting

### Common Issues

**Audio API not responding:**
- Ensure Flask server is running on port 5001
- Check `EMOTION_API_URL` in orchestrator .env

**No audio from TTS:**
- Verify `UNREAL_SPEECH_API_KEY` is valid
- Check browser microphone permissions

**Emotion detection returns `neutral` always:**
- Verify pre-trained model file exists: `lstm_attention_best_weights.weights.h5`
- Retrain model with your dataset if needed

**WebSocket connection fails:**
- Check if orchestrator is running on port 8080
- Verify firewall allows WebSocket connections

---

## 📝 Development Notes

- **Frontend** reloads automatically with Vite on code changes
- **Backend services** require manual restart after code changes
- **Pre-trained models** are included; retrain only if using new datasets
- **API keys** should never be committed to Git (use .env files)

---

## 🔐 Security Notes

- API keys should be stored in `.env` files (not committed to Git)
- WebSocket should be secured with WSS in production
- Audio data should be encrypted in transit
- Consider rate limiting on production deployments

---

## 📝 Cleanup & Improvements Applied

- Renamed folders to explicit domain names (`apps/`, `services/`, `ml/`, `scripts/`)
- Removed generated frontend `dist` artifact from tracked workspace
- Removed local Python virtual environment from tracked workspace
- Removed duplicate legacy API entrypoint; using single startup: `services/stt-emotion-api/main.py`

---

## 📄 License

This project uses open-source datasets and libraries. Refer to individual component licenses for details.

---

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test all three services locally
4. Submit a pull request

---

## 📞 Support

For issues or questions about:
- **Frontend**: Check `apps/frontend/README.md`
- **Emotion Model**: Refer to `ml/ser_pipeline/README.md`
- **API Services**: See individual service directories
