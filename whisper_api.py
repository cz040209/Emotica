# whisper_api.py
# This Flask API integrates OpenAI Whisper for Speech-to-Text
# and now loads and uses a TensorFlow Keras model for Emotion Recognition.

import os
from flask import Flask, request, jsonify
import whisper
import soundfile as sf
import io
import base64
import numpy as np # For numerical operations
import librosa # For audio feature extraction
import torch # For Wav2Vec2 model
from transformers import Wav2Vec2Processor, Wav2Vec2Model # For Wav2Vec2

# Import TensorFlow for loading and using your .h5 model
import tensorflow as tf
# Using the Functional API for more explicit control over connections
from tensorflow.keras.models import Model # Model is used, Sequential is not needed here
from tensorflow.keras.layers import Input, LSTM, Dense, Dropout, Bidirectional, BatchNormalization, Attention # Added Attention
from tensorflow.keras import regularizers # Added for L2 regularization

app = Flask(__name__)

# MODIFICATION: Increase the maximum content length for incoming requests (e.g., 16 MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 Megabytes

# --- Configuration ---
# MODIFIED: Changed Whisper model size for better accuracy
WHISPER_MODEL_SIZE = "small" # Consider "medium" for even better accuracy if resources allow

# IMPORTANT: Update this path to your trained Keras model's .h5 file
# This path MUST match the `checkpoint_path` in your training script.
EMOTION_MODEL_PATH = r"C:\Users\chenz\Documents\lstm_attention_best_weights.weights.h5" # Corrected path

# Define the target sample rate and feature length for Wav2Vec2 features
TARGET_WHISPER_SR = 16000 # Whisper models are optimized for 16kHz
TARGET_WAV2VEC2_SR = 16000
# This must EXACTLY match the input_timesteps from your HDF5DataGenerator setup
TARGET_WAV2VEC2_FEATURE_LENGTH = 716 # Based on your HDF5 file shape (716, 768)

# FIX: Moved WAV2VEC2_MODEL_NAME definition here so it's available before use
WAV2VEC2_MODEL_NAME = "facebook/wav2vec2-base-960h" # Common base model, adjust if yours is different

# Add a threshold for audio content (standard deviation)
AUDIO_CONTENT_THRESHOLD = 0.005 # Adjust based on testing, small value for float32 normalized audio

# --- Load Whisper Model ---
print(f"Loading Whisper model '{WHISPER_MODEL_SIZE}' (this may take a while)...")
whisper_model = whisper.load_model(WHISPER_MODEL_SIZE)
print("Whisper model loaded.")

# IMPORTANT: These are the actual classes (labels) your model predicts, in the correct order!
# Based on the provided list:
EMOTION_CLASSES = ["neutral", "calm", "happy", "sad", "angry", "fearful", "disgust", "surprised"]

# --- Initialize Wav2Vec2 Processor and Model ---
print("Loading Wav2Vec2 Processor and Model...")
wav2vec2_processor = Wav2Vec2Processor.from_pretrained(WAV2VEC2_MODEL_NAME)
wav2vec2_model = Wav2Vec2Model.from_pretrained(WAV2VEC2_MODEL_NAME)
wav2vec2_model.eval() # Set model to evaluation mode

# Move Wav2Vec2 model to GPU if available
device = "cuda" if torch.cuda.is_available() else "cpu"
wav2vec2_model.to(device)
print(f"Wav2Vec2 Model loaded and moved to {device} device.")


# --- Define Emotion Recognition Model Architecture (CORRECTED) ---
# This function defines the Keras model architecture based on your provided training script.
# It should precisely match the architecture your 'lstm_attention_best_weights.weights.h5'
# file was trained with, including layer types, units, return_sequences, regularization,
# dropout rates, and the presence of the Attention layer.
def create_emotion_model(input_shape=(TARGET_WAV2VEC2_FEATURE_LENGTH, 768), num_classes=len(EMOTION_CLASSES)):
    inputs = Input(shape=input_shape, name='input_features')

    # First Bidirectional LSTM Block (Matching Training Script)
    x = Bidirectional(LSTM(64, return_sequences=True, kernel_regularizer=regularizers.l2(0.005)), name='bi_lstm_1')(inputs)
    x = BatchNormalization(name='batch_norm_1')(x)
    x = Dropout(0.5, name='dropout_1')(x)

    # --- Attention Mechanism (Added to Match Training Script) ---
    attention_output = Attention(name='self_attention_layer')([x, x])

    # Second Bidirectional LSTM Block (Matching Training Script)
    x = Bidirectional(LSTM(32, kernel_regularizer=regularizers.l2(0.005)), name='bi_lstm_2')(attention_output) # Connect to attention_output
    x = BatchNormalization(name='batch_norm_2')(x)
    x = Dropout(0.6, name='dropout_2')(x)

    # Classification Part (Matching Training Script)
    output_tensor = Dense(num_classes, activation='softmax', kernel_regularizer=regularizers.l2(0.01), name='output_dense')(x)

    # Create the model by specifying its inputs and outputs
    model = Model(inputs=inputs, outputs=output_tensor, name='LSTM_Attention_Model')

    # Compile is necessary for a functional model to be fully built before loading weights sometimes,
    # but the optimizer/loss do not need to match the training ones for loading weights, just for further training.
    # We use a dummy compile here, as the loaded weights already define the model's learned state.
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    return model

# --- Load Emotion Recognition Model ---
emotion_model = None
try:
    # 1. Create the model architecture
    emotion_model = create_emotion_model()
    
    # 2. Load only the weights into the created model
    # This assumes the architecture created above EXACTLY matches the saved weights.
    emotion_model.load_weights(EMOTION_MODEL_PATH)
    
    emotion_model.summary() # Print model summary for verification
    print(f"Emotion model architecture created and weights loaded successfully from {EMOTION_MODEL_PATH}")

except Exception as e:
    print(f"ERROR: Could not load emotion model from {EMOTION_MODEL_PATH}. Reason: {e}")
    print("Please ensure the model path and architecture in create_emotion_model() are correct and match your training script.")
    print("Proceeding with simulated emotion detection for now.")
    emotion_model = None # Ensure it's None if loading fails

def predict_emotion(audio_data_16khz, sample_rate_16khz):
    """
    Predicts emotion from audio data using the loaded TensorFlow model.

    Args:
        audio_data_16khz (np.ndarray): The raw audio samples (float32 array) at 16kHz.
        sample_rate_16khz (int): The sample rate of the audio (should be 16000 Hz).

    Returns:
        str: The predicted emotion label (e.g., "happy", "sad").
    """
    if emotion_model is not None:
        try:
            print(f"Emotion prediction: Input audio_data_16khz shape: {audio_data_16khz.shape}, sample_rate: {sample_rate_16khz}")
            
            # CRITICAL CHECK FOR EMPTY AUDIO DATA FOR WAV2VEC2
            if audio_data_16khz.size == 0:
                print("WARNING: Empty audio data provided for Wav2Vec2 feature extraction. Returning 'neutral'.")
                return "neutral"

            # --- WAV2VEC2 FEATURE EXTRACTION ---
            # Process audio data with Wav2Vec2 processor
            inputs = wav2vec2_processor(audio_data_16khz, sampling_rate=sample_rate_16khz, return_tensors="pt", padding=True)
            inputs = {name: tensor.to(device) for name, tensor in inputs.items()} # Move inputs to device
            print(f"Wav2Vec2 processor inputs: { {k: v.shape for k, v in inputs.items()} }")

            # Extract hidden states (features) from the Wav2Vec2 model
            with torch.no_grad():
                outputs = wav2vec2_model(**inputs)

            # Get the last hidden state, remove batch dimension, and move to CPU as numpy array
            features = outputs.last_hidden_state.squeeze().cpu().numpy()
            print(f"Wav2Vec2 extracted features shape: {features.shape}")

            # MODIFICATION: CRITICAL CHECK FOR EMPTY FEATURES HERE
            if features.size == 0 or features.shape[0] == 0:
                print("ERROR: Wav2Vec2 extracted an empty feature array. Cannot proceed with emotion prediction. Returning 'neutral'.")
                return "neutral"

            # Handle sequence length mismatch (pad or truncate to TARGET_WAV2VEC2_FEATURE_LENGTH)
            current_feature_length = features.shape[0]
            if current_feature_length < TARGET_WAV2VEC2_FEATURE_LENGTH:
                padding_needed = TARGET_WAV2VEC2_FEATURE_LENGTH - current_feature_length
                print(f"Padding features: {padding_needed} frames needed.")
                # Ensure features has at least 2 dimensions for padding (timesteps, features)
                if features.ndim == 1: # If squeeze resulted in 1D for very short audio
                    features = np.expand_dims(features, axis=0) # Make it (1, 768) or similar
                features_padded = np.pad(features, ((0, padding_needed), (0, 0)), mode='constant')
                features = features_padded
            elif current_feature_length > TARGET_WAV2VEC2_FEATURE_LENGTH:
                print(f"Truncating features: {current_feature_length - TARGET_WAV2VEC2_FEATURE_LENGTH} frames truncated.")
                features = features[:TARGET_WAV2VEC2_FEATURE_LENGTH, :]
            # If current_feature_length == TARGET_WAV2VEC2_FEATURE_LENGTH, no action needed
            print(f"Features shape after padding/truncation: {features.shape}")

            # Now 'features' has the shape (TARGET_WAV2VEC2_FEATURE_LENGTH, 768) as expected by your emotion model.
            # Step 3: Reshape for emotion model input: (1, timesteps, features)
            model_input = np.expand_dims(features, axis=0) # Shape (1, 716, 768)
            print(f"Emotion model input shape: {model_input.shape}")

            # --- MODEL INFERENCE ---
            predictions = emotion_model.predict(model_input, verbose=0) # Set verbose to 0 for cleaner output
            print(f"Raw emotion model predictions: {predictions}")
            predicted_label_idx = np.argmax(predictions[0]) # Assuming batch prediction and one-hot output
            
            # Ensure the predicted index is within the bounds of EMOTION_CLASSES
            if 0 <= predicted_label_idx < len(EMOTION_CLASSES):
                predicted_emotion = EMOTION_CLASSES[predicted_label_idx]
            else:
                predicted_emotion = "unknown" # Fallback if index is out of bounds

            print(f"Predicted Emotion: {predicted_emotion}")
            return predicted_emotion

        except Exception as e:
            print(f"ERROR during emotion prediction (inference step): {e}")
            import traceback
            traceback.print_exc() # Print full traceback for debugging
            return "neutral" # Fallback emotion
    else:
        # Fallback if no model is loaded
        print("Emotion model not loaded, returning simulated emotion.")
        return np.random.choice(EMOTION_CLASSES)


@app.route('/transcribe_and_emotion', methods=['POST'])
def transcribe_and_emotion_audio():
    # MODIFICATION: Expecting JSON payload with 'audio' field
    data = request.get_json()
    audio_base64 = data.get('audio')
    if not audio_base64:
        print("Error: No audio data provided in the JSON request.")
        return jsonify({"error": "No audio data provided"}), 400

    try:
        # Decode base64 to bytes
        audio_bytes = base64.b64decode(audio_base64)
        print(f"Received {len(audio_bytes)} bytes of base64 decoded audio.")

        # --- CORRECTED: Read raw 16-bit PCM audio data ---
        # Assuming 16-bit PCM (Int16Array) from frontend, 48kHz sample rate
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        # Convert to float32 and normalize to -1.0 to 1.0 range, as expected by Whisper and Librosa
        audio_data_48khz = audio_int16.astype(np.float32) / 32768.0
        sample_rate_48khz = 48000 # Frontend sends 48kHz audio

        print(f"Decoded audio_data_48khz shape: {audio_data_48khz.shape}, dtype: {audio_data_48khz.dtype}, assumed sample_rate: {sample_rate_48khz}")

        # --- Resample audio to 16kHz for Whisper and Emotion model ---
        if audio_data_48khz.size == 0:
            print("WARNING: Empty audio data before resampling. Returning early.")
            return jsonify({"transcription": "No audio detected.", "emotion": "neutral"}), 200

        audio_data_16khz = librosa.resample(y=audio_data_48khz, orig_sr=sample_rate_48khz, target_sr=TARGET_WHISPER_SR)
        print(f"Resampled audio_data_16khz shape: {audio_data_16khz.shape}, sample_rate: {TARGET_WHISPER_SR}")

        # --- NEW: Check for audio content (not just length) ---
        if np.std(audio_data_16khz) < AUDIO_CONTENT_THRESHOLD:
            print(f"WARNING: Resampled audio data is silent or too low volume (std: {np.std(audio_data_16khz):.5f}). Returning early.")
            return jsonify({"transcription": "Please speak a bit louder, I didn't catch that clearly.", "emotion": "neutral"}), 200

        # --- CRITICAL: Add a check for minimum audio length after resampling ---
        # Increased minimum duration to 1.0 second for more robust Whisper processing
        MIN_SAMPLES_FOR_PROCESSING = TARGET_WHISPER_SR * 1.0 # Minimum 1.0 seconds of audio at 16kHz
        if len(audio_data_16khz) < MIN_SAMPLES_FOR_PROCESSING:
            print(f"WARNING: Resampled audio data too short ({len(audio_data_16khz)} samples) for meaningful processing. Minimum required: {MIN_SAMPLES_FOR_PROCESSING} samples.")
            return jsonify({"transcription": "Please speak a bit longer, I didn't catch that clearly.", "emotion": "neutral"}), 200


        # --- Perform Speech-to-Text (STT) with Whisper ---
        print("Transcribing audio with Whisper...")
        # Pass the 16kHz resampled audio to Whisper, explicitly setting language to English
        whisper_result = whisper_model.transcribe(audio_data_16khz, language='en') # ADDED language='en'
        transcription = whisper_result["text"]
        print(f"Whisper Transcription: '{transcription}'")

        # --- Perform Emotion Recognition ---
        print("Detecting emotion...")
        # Pass the 16kHz resampled audio to emotion prediction
        detected_emotion = predict_emotion(audio_data_16khz, TARGET_WAV2VEC2_SR)
        print(f"Final Detected Emotion: '{detected_emotion}'")

        # MODIFIED: Handle empty/very short transcriptions
        if not transcription.strip() or len(transcription.strip().split()) < 2: # Check for empty or very short (e.g., just "The")
            print("WARNING: Whisper returned empty or very short transcription. Returning a default message.")
            return jsonify({"transcription": "Please try speaking again, I didn't catch that clearly.", "emotion": "neutral"}), 200


        return jsonify({
            "transcription": transcription,
            "emotion": detected_emotion
        }), 200

    except Exception as e:
        print(f"Error during transcription or emotion detection in /transcribe_and_emotion: {e}")
        import traceback
        traceback.print_exc() # Print full traceback for debugging
        return jsonify({"error": str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "Whisper & Emotion API is running!", 200

if __name__ == '__main__':
    # Running on port 5001 to avoid conflict with Node.js 8080
    app.run(host='0.0.0.0', port=5001, debug=True) # Added debug=True for more verbose output during development