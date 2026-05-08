# Emotica: Real-Time Emotion-Aware Voice AI System

A full-stack, real-time voice interaction system that detects speaker emotions and responds with emotion-aware AI responses. This system combines speech recognition, emotion detection via LSTM-Attention deep learning models, LLM-powered conversational AI, and text-to-speech synthesis.

---

## 🎯 System Overview

Emotica is designed to create human-like conversational experiences by understanding emotional context from the speaker's voice and responding appropriately. The system processes audio in real-time with minimal latency through an optimized pipeline that handles:

- **Voice Activity Detection (VAD)**: Detects when the user is speaking
- **Speech-to-Text (STT)**: Converts audio to text using Deepgram
- **Emotion Recognition (SER)**: Predicts emotional state using LSTM-Attention models
- **LLM Response Generation**: Creates context-aware responses with Groq
- **Text-to-Speech (TTS)**: Converts responses to natural speech using Unreal Speech

---

## 📊 System Architecture & Workflow

### Real-Time Voice Pipeline Flow

```
┌─────────────────┐
│  User speaks    │
│  (browser audio)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ VAD (Voice Activity         │
│ Detection) detects speech   │
│ & buffers audio             │
└────────┬────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Stream LINEAR16 audio +          │
│ pre-roll to Deepgram WebSocket   │
│ (Speech-to-Text)                 │
└────────┬───────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ VAD ends turn,               │
│ emotion inference starts     │
│ (async from buffered audio)  │
└────────┬───────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ LSTM-Attention Model         │
│ predicts emotion:            │
│ (angry, happy, sad, neutral) │
└────────┬───────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ LLM (Groq) generates          │
│ response with context of      │
│ detected emotion              │
└────────┬───────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Split response into           │
│ segments & stream to          │
│ Unreal Speech (TTS)           │
└────────┬───────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Play audio response           │
│ to user (browser)             │
└────────┬───────────────────────┘
         │
         ▼
    Loop again
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
- **Deepgram** - Speech-to-Text (STT) with streaming support
- **Groq** - LLM API for fast conversational responses
- **Unreal Speech** - Text-to-Speech (TTS) synthesis

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
- Pipes audio to Deepgram for speech-to-text
- Requests emotion prediction from the emotion API
- Calls Groq LLM for context-aware responses
- Streams text segments to Unreal Speech for audio synthesis
- Returns synthesized speech to the browser

**Required Environment Variables:**

```env
# Speech-to-Text (Deepgram)
DEEPGRAM_API_KEY=your_deepgram_key
DEEPGRAM_MODEL=nova-3                    # optional
DEEPGRAM_LANGUAGE=en-US                  # optional
DEEPGRAM_ENDPOINTING_MS=300              # optional
DEEPGRAM_UTTERANCE_END_MS=1000           # optional
DEEPGRAM_KEEPALIVE_MS=4000               # optional
DEEPGRAM_FINALIZE_GRACE_MS=900           # optional

# LLM (Groq)
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile       # optional

# Text-to-Speech (Unreal Speech)
UNREAL_SPEECH_API_KEY=your_unreal_speech_key
UNREAL_SPEECH_ENDPOINT=https://api.v8.unrealspeech.com/stream  # optional
UNREAL_SPEECH_VOICE_ID=Emily              # optional
TTS_MIN_SEGMENT_CHARS=8                   # optional
TTS_MAX_SEGMENT_CHARS=220                 # optional

# Service URLs
EMOTION_API_URL=http://localhost:5001/emotion  # optional
PORT=8080                                 # optional
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

## 📈 Emotion Pipeline Details

### Step-by-Step Flow

1. **Audio Input** → Browser captures user speech (16kHz, mono)
2. **VAD Detection** → Client-side voice detection sends chunks to server
3. **STT Processing** → Deepgram converts audio to text in real-time
4. **Emotion Inference** → LSTM-Attention model analyzes audio features
   - Input: Mel-spectrogram (time × frequency)
   - Output: Emotion probabilities [angry, happy, sad, neutral, etc.]
5. **Context Building** → Emotion + previous context passed to LLM
6. **Response Generation** → Groq generates emotion-aware response
7. **TTS Synthesis** → Unreal Speech converts response to audio
8. **Audio Playback** → Browser plays synthesized response

---

## 🔄 Low-Latency Optimization

The system is optimized for real-time performance:

- **Lightweight VAD**: Only speech chunks sent to server
- **Direct Deepgram WebSocket**: Minimizes latency for speech-to-text
- **Asynchronous Emotion Inference**: Happens in parallel with STT
- **Smart Segment Batching**: TTS segments sent as soon as complete
- **Previous Emotion Memory**: LLM uses known emotion from previous turn

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
- WebSocket libraries
- Deepgram SDK
- Groq SDK
- Unreal Speech SDK

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
