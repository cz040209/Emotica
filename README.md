# Emotica

# [Your Project Name] - Emotion-Aligned Conversational AI Assistant

## 🌟 Project Overview

**Emotica** is an innovative real-time conversational AI assistant designed to understand and respond to user emotions. By integrating Speech-to-Text (STT), Emotion Recognition, a Large Language Model (LLM), and Text-to-Speech (TTS), the application provides a dynamic and empathetic voice-based interaction experience. It aims to create a more natural and understanding dialogue by aligning the AI's responses with the user's detected emotional state.

This project was developed as a Final Year Project ([FYP/Capstone Project - specify if applicable]) to explore the integration of various AI technologies for enhanced human-computer interaction.

## ✨ Features

* **Real-time Voice Interaction:** Speak naturally to the AI assistant.
* **Speech-to-Text (STT):** Transcribes user's spoken words into text using a local Whisper microservice.
* **Emotion Recognition:** Identifies 8 distinct emotions from user's speech (Neutral, Calm, Happy, Sad, Angry, Fearful, Disgust, Surprise - adjust if your model has different categories) and displays them in real-time.
* **Emotion-Aligned LLM Responses:** The Google Gemini LLM generates responses that are tailored to the detected emotion, ensuring empathetic and appropriate conversational flow.
* **Text-to-Speech (TTS):** Converts the AI's text responses back into natural-sounding speech using ElevenLabs.
* **Intuitive User Interface:** A clean and responsive chat interface built with React and Tailwind CSS.
* **WebSocket Communication:** Enables low-latency, real-time data exchange between the frontend and backend.

## 🚀 Technologies Used

* **Frontend:**
    * React.js
    * Tailwind CSS
    * Web Audio API
    * Lucide React (for icons)
* **Backend (Node.js):**
    * Node.js (Express.js for server, WebSockets for communication)
    * `ws` (WebSocket library)
    * `dotenv` (for environment variables)
    * `@elevenlabs/elevenlabs-js` (ElevenLabs SDK for TTS)
    * `@google/generative-ai` (Google Gemini SDK for LLM)
* **AI Microservice (Python):**
    * Python 3
    * Flask (for REST API)
    * `transformers` (for Whisper STT model)
    * `librosa` (for audio processing)
    * `numpy` (for numerical operations)
    * `scikit-learn` (for emotion recognition model) - *Or specify your actual emotion recognition library/framework*
    * `soundfile` (for audio file handling)
* **Deployment:**
    * GitHub (Version Control)
    * Render (PaaS for hosting)

## 🏗️ Architecture

The application follows a modular architecture to handle real-time voice interactions:

1.  **React Frontend:** Captures user audio from the microphone, displays chat messages, and shows the detected emotion. It communicates with the Node.js backend via WebSockets.
2.  **Node.js Backend:**
    * Acts as the central orchestrator.
    * Receives raw audio chunks from the frontend via WebSocket.
    * Forwards the audio to the Python Flask Microservice for STT and Emotion Recognition.
    * Receives transcription and emotion from the Flask Microservice.
    * Constructs an emotion-aligned prompt and sends it to the Google Gemini LLM.
    * Receives the text response from Gemini.
    * Sends the text response to ElevenLabs for TTS.
    * Streams the generated audio back to the frontend via WebSocket.
    * Sends text messages (user transcription, bot response) back to the frontend for display.
3.  **Python Flask Microservice:**
    * A lightweight Flask API that receives base64-encoded audio from the Node.js backend.
    * Performs Speech-to-Text (STT) using the Whisper model.
    * Performs Emotion Recognition on the transcribed audio/features.
    * Returns the transcription and detected emotion to the Node.js backend.

```mermaid
graph TD
    A[User's Microphone] --> B(React Frontend);
    B -- WebSocket (Raw Audio Chunks) --> C(Node.js Backend);
    C -- HTTP POST (Base64 Audio) --> D(Python Flask Microservice);
    D -- (Transcription, Emotion) --> C;
    C -- Prompt (User Input, Emotion, Intent) --> E(Google Gemini LLM);
    E -- Text Response --> C;
    C -- Text Response --> F(ElevenLabs TTS);
    F -- Audio Stream --> C;
    C -- WebSocket (Audio Chunks) --> B;
    C -- WebSocket (Text Messages, Emotion) --> B;
    B --> G[User's Speaker/Screen];
