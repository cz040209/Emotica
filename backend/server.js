// server.js
// This Node.js server handles WebSocket connections for real-time audio streaming
// from the frontend. It now integrates a simple silence detection/VAD to trigger
// STT, Emotion Recognition, LLM, and TTS processes based on user utterances.
// It uses a Python Whisper microservice for STT and Emotion, ElevenLabs for Text-to-Speech (TTS),
// and Google Gemini LLM.

const WebSocket = require('ws');
const http = require('http');
const https = require('https'); // Import https module for secure connections
const url = require('url'); // To parse the API URL
require('dotenv').config(); // Load environment variables from .env file

// Import the ElevenLabs Node.js SDK
const { ElevenLabsClient } = require('elevenlabs');
// Import the Google Generative AI SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuration ---
const PORT = process.env.PORT || 8080;
// Fetching GEMINI_API_KEY from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Fetching ELEVENLABS_API_KEY from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// URL for the Python Whisper & Emotion STT API
const WHISPER_API_URL = "http://localhost:5001/transcribe_and_emotion";

// Silence Detection Parameters
// MODIFIED: Increased silence threshold for more natural pauses
const SILENCE_THRESHOLD_MS = 1500; // milliseconds of silence to detect end of utterance
// MODIFIED: Adjusted volume threshold for potentially better silence detection
const SILENCE_VOLUME_THRESHOLD = 70; // Adjust this value based on your microphone's noise floor (e.g., 50-200)
// Minimum audio duration (in seconds) to consider for processing
const MIN_AUDIO_DURATION_SECONDS = 1.0;
// Assuming 48kHz sample rate, 16-bit PCM, mono (2 bytes per sample)
const SAMPLE_RATE = 48000;
const BYTES_PER_SAMPLE = 2; // for Int16Array
const CHANNELS = 1; // Assuming mono from frontend

// Calculate minimum bytes needed for processing
const MIN_AUDIO_BUFFER_BYTES_FOR_PROCESSING = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * MIN_AUDIO_DURATION_SECONDS;
// Calculate minimum chunks needed (each chunk is 8192 bytes)
const CHUNK_SIZE = 8192;
const MIN_AUDIO_CHUNKS_FOR_PROCESSING = Math.ceil(MIN_AUDIO_BUFFER_BYTES_FOR_PROCESSING / CHUNK_SIZE);

// MODIFICATION: Add error debouncing variables
let lastSttErrorTime = 0;
const STT_ERROR_COOLDOWN_MS = 5000; // Only send STT error message every 5 seconds
// MODIFICATION: Flag to ensure error message is sent only once per call session
let sttErrorSentDuringCall = false;

console.log(`Server Config: SILENCE_THRESHOLD_MS: ${SILENCE_THRESHOLD_MS}ms`);
console.log(`Server Config: SILENCE_VOLUME_THRESHOLD: ${SILENCE_VOLUME_THRESHOLD}`);
console.log(`Server Config: MIN_AUDIO_BUFFER_BYTES_FOR_PROCESSING: ${MIN_AUDIO_BUFFER_BYTES_FOR_PROCESSING} bytes`);
console.log(`Server Config: MIN_AUDIO_CHUNKS_FOR_PROCESSING: ${MIN_AUDIO_CHUNKS_FOR_PROCESSING} chunks`);


if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set in your .env file. AI functionalities may not work.");
}
if (!ELEVENLABS_API_KEY) {
    console.warn("ELEVENLABS_API_KEY is not set in your .env file. ElevenLabs TTS may not work.");
}


// Initialize ElevenLabs client
const elevenlabs = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

// Define a default voice ID for ElevenLabs. You can find available voice IDs in your ElevenLabs dashboard
// or by using the elevenlabs.voices.search() method.
// '21m00Tcm4TlvDq8ikWAM' is a common default voice (e.g., 'Rachel').
const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';


// Initialize Gemini Generative Model
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// MODIFIED: Changed model to gemini-1.5-flash
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- HTTP Server Setup ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running');
});

// --- WebSocket Server Setup ---
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('Server: Client connected via WebSocket.');

    let audioBuffer = []; // Accumulates audio chunks for processing an utterance
    let silenceStartTimestamp = null; // Timestamp when silence began
    let conversationHistory = []; // To maintain context for Gemini
    let isProcessingUtterance = false; // Flag to prevent multiple concurrent processes
    let botSpeaking = false; // Flag to indicate if the bot is currently speaking

    // Function to calculate RMS (Root Mean Square) for volume detection
    // This is a simple form of Voice Activity Detection (VAD)
    function calculateRMS(buffer) {
        if (buffer.length === 0) return 0;
        // FIX: Create a new Int16Array from a slice of the buffer's ArrayBuffer.
        // This guarantees that the Int16Array starts at a byte-aligned position,
        // preventing the "start offset of Int16Array should be a multiple of 2" error.
        const pcmData = new Int16Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        
        let sumOfSquares = 0;
        for (let i = 0; i < pcmData.length; i++) {
            sumOfSquares += pcmData[i] * pcmData[i];
        }
        return Math.sqrt(sumOfSquares / pcmData.length);
    }

    // Resets the audio buffering and processing state
    const resetAudioProcessing = () => {
        audioBuffer = [];
        silenceStartTimestamp = null;
        isProcessingUtterance = false;
        console.log('Server: Audio processing state reset.');
    };


    ws.on('message', async message => {
        if (typeof message === 'string') {
            // Handle control signals from the frontend
            if (message === 'start_audio_stream') {
                console.log('Server: Frontend signaled start of audio stream. Resetting.');
                resetAudioProcessing();
                // MODIFICATION: Reset error cooldown and error sent flag on new stream start
                lastSttErrorTime = 0;
                sttErrorSentDuringCall = false;
            } else if (message === 'stop_audio_stream') { // This signal will now only trigger a final flush if needed
                console.log('Server: Frontend signaled end of recording. Flushing remaining audio...');
                // Process any remaining audio if enough accumulated
                if (audioBuffer.length >= MIN_AUDIO_CHUNKS_FOR_PROCESSING) { // Check against chunk count
                    console.log('Server: Processing remaining audio on stop_audio_stream signal.');
                    await processCurrentUtterance();
                } else {
                    console.log('Server: No significant audio to process on stop_audio_stream signal.');
                    resetAudioProcessing();
                }
            } else {
                console.log('Server: Received text message (non-audio):', message);
                await sendTextToGeminiAndRespond(message, "neutral"); // Assume neutral emotion for direct text input
            }
        } else if (message instanceof Buffer) {
            console.log(`Server: Received binary audio chunk (${message.length} bytes).`);
            // If the bot is speaking, and user starts talking, optionally interrupt bot.
            if (botSpeaking) {
                console.log("Server: User speaking, interrupting bot...");
                // Logic to stop current bot audio playback on the frontend would be here (e.g., another WebSocket message)
                // For now, we'll just process the user's new utterance.
                // It's crucial for the frontend to clear its audio queue/buffer here.
                botSpeaking = false; // Reset bot speaking flag
                resetAudioProcessing(); // Clear any partial buffer from before interruption
            }

            audioBuffer.push(message);

            // Simple silence detection logic
            const rms = calculateRMS(message);
            console.log(`Server: RMS for current chunk: ${rms.toFixed(2)}`);

            if (rms < SILENCE_VOLUME_THRESHOLD) {
                if (silenceStartTimestamp === null) {
                    silenceStartTimestamp = Date.now(); // Start silence timer
                    console.log('Server: Silence started.');
                } else if (Date.now() - silenceStartTimestamp > SILENCE_THRESHOLD_MS) {
                    // Silence detected for long enough, process the accumulated audio
                    // Ensure enough audio has been buffered before processing
                    console.log(`Server: VAD Check - isProcessingUtterance: ${isProcessingUtterance}, audioBuffer.length: ${audioBuffer.length}, MIN_AUDIO_CHUNKS_FOR_PROCESSING: ${MIN_AUDIO_CHUNKS_FOR_PROCESSING}`);
                    if (!isProcessingUtterance && audioBuffer.length >= MIN_AUDIO_CHUNKS_FOR_PROCESSING) { // Check against chunk count
                        isProcessingUtterance = true; // Set flag to prevent re-triggering
                        console.log(`Server: Silence detected (${SILENCE_THRESHOLD_MS}ms). Triggering utterance processing.`);
                        await processCurrentUtterance();
                    } else {
                        console.log(`Server: Silence detected, but not triggering processing. Conditions: isProcessingUtterance=${isProcessingUtterance}, audioBuffer.length=${audioBuffer.length} (min ${MIN_AUDIO_CHUNKS_FOR_PROCESSING}).`);
                    }
                }
            } else {
                // User is speaking (above threshold), reset silence timer
                if (silenceStartTimestamp !== null) {
                    console.log('Server: Speech detected, resetting silence timer.');
                }
                silenceStartTimestamp = null;
            }
        }
    });

    // This function now encapsulates the core processing logic for an utterance
    async function processCurrentUtterance() {
        console.log('Server: Entering processCurrentUtterance.');
        if (audioBuffer.length === 0) {
            console.log('Server: No audio in buffer to process for utterance.');
            resetAudioProcessing();
            return;
        }

        const fullAudioData = Buffer.concat(audioBuffer);
        const audioByteLength = fullAudioData.length;
        resetAudioProcessing(); // Reset buffer immediately after taking data

        // Final check for minimum audio bytes after concatenation
        if (audioByteLength < MIN_AUDIO_BUFFER_BYTES_FOR_PROCESSING) {
            console.log(`Server: Utterance too short (${audioByteLength} bytes). Minimum required: ${MIN_AUDIO_BUFFER_BYTES_FOR_PROCESSING} bytes. Skipping processing.`);
            isProcessingUtterance = false; // Reset flag
            return;
        }

        console.log(`Server: Processing utterance with ${audioByteLength} bytes of audio.`);

        const parsedUrl = url.parse(WHISPER_API_URL);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        // MODIFICATION: Explicitly add padding to base64 string
        let base64Audio = fullAudioData.toString('base64');
        while (base64Audio.length % 4 !== 0) {
            base64Audio += '=';
        }

        const postData = JSON.stringify({ audio: base64Audio });

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        let transcribedText = "";
        let detectedEmotion = "neutral";
        let isSystemMessage = false; // NEW: Flag to indicate if the transcription is a system message

        try {
            console.log(`Server: Attempting to send audio data to Whisper & Emotion API at ${WHISPER_API_URL} (Buffer size: ${audioByteLength} bytes, Base64 string length: ${base64Audio.length}) using Node.js built-in HTTP module with JSON payload...`);

            const apiResponse = await new Promise((resolve, reject) => {
                const req = client.request(options, (res) => {
                    let responseBody = '';
                    res.on('data', (chunk) => {
                        responseBody += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ statusCode: res.statusCode, body: responseBody });
                        } else {
                            // MODIFICATION: Log the full response body for 500 errors
                            console.error(`Server: API returned status ${res.statusCode}: ${responseBody}`);
                            reject(new Error(`API returned status ${res.statusCode}: ${responseBody}`));
                        }
                    });
                });

                req.on('error', (e) => {
                    console.error('Server: HTTP Request Error to Whisper API:', e.message);
                    reject(e);
                });

                req.write(postData);
                req.end();
            });

            const data = JSON.parse(apiResponse.body);
            transcribedText = data.transcription || "";
            detectedEmotion = data.emotion || "neutral";
            console.log('Server: Whisper Transcription:', transcribedText);
            console.log('Server: Detected Emotion:', detectedEmotion);

            // NEW: Check if the transcription is a system message from Whisper API
            const systemMessages = [
                "Please speak a bit louder, I didn't catch that clearly.",
                "Please speak a bit longer, I didn't catch that clearly.",
                "No audio detected."
            ];
            
            // Debug log to see the exact value and comparison result
            console.log(`DEBUG: transcribedText.trim(): "${transcribedText.trim()}"`);
            console.log(`DEBUG: systemMessages.includes(transcribedText.trim()): ${systemMessages.includes(transcribedText.trim())}`);

            if (systemMessages.includes(transcribedText.trim())) {
                isSystemMessage = true;
            }


            // MODIFICATION: Reset error cooldown and error sent flag on successful API call
            lastSttErrorTime = 0;
            sttErrorSentDuringCall = false;

            // Send user's transcribed text to frontend
            if (ws.readyState === WebSocket.OPEN) {
                // MODIFIED: Prefix with "Bot:" if it's a system message, otherwise "You:"
                const messagePrefix = isSystemMessage ? 'Bot: ' : 'You: ';
                console.log(`Server: Preparing to dispatch user transcription: "${messagePrefix}${transcribedText}"`);
                ws.send(JSON.stringify({ type: 'message', text: `${messagePrefix}${transcribedText}` }));
                console.log(`Server: Dispatched user transcription to client.`);
            } else {
                console.warn(`Server: WebSocket not open, cannot dispatch user transcription: "${transcribedText}"`);
            }


            // Send detected emotion to frontend
            if (ws.readyState === WebSocket.OPEN) {
                console.log(`Server: Preparing to dispatch emotion: "${detectedEmotion}"`);
                ws.send(JSON.stringify({ type: 'emotion', value: detectedEmotion }));
                console.log(`Server: Dispatched emotion to client.`);
            } else {
                console.warn(`Server: WebSocket not open, cannot dispatch emotion: "${detectedEmotion}"`);
            }

        } catch (error) {
            console.error('Server: Failed to connect to Whisper & Emotion API or API returned error:', error);
            transcribedText = `Failed to connect to STT/Emotion API: ${error.message}`;

            // MODIFICATION: Only send error message if cooldown has passed AND it hasn't been sent for this call session
            const currentTime = Date.now();
            if (!sttErrorSentDuringCall && (currentTime - lastSttErrorTime > STT_ERROR_COOLDOWN_MS)) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: transcribedText }));
                    console.log(`Server: Dispatched error message to client: "${transcribedText}" (debounced)`);
                }
                lastSttErrorTime = currentTime; // Update last error time
                sttErrorSentDuringCall = true; // Set flag to true for this call session
            } else {
                console.log(`Server: Suppressing duplicate STT/Emotion API error message due to cooldown or already sent this session.`);
            }

            transcribedText = ""; // Clear text if there was a connection error
        } finally {
            isProcessingUtterance = false; // Ensure flag is reset after processing attempt
            console.log('Server: Exiting processCurrentUtterance.');
        }

        // MODIFIED: Ensure Gemini always receives a prompt
        // Only send to Gemini if it's actual user speech, not a system message from Whisper
        if (transcribedText.trim() !== "" && !isSystemMessage) { // Added !isSystemMessage
            await sendTextToGeminiAndRespond(transcribedText, detectedEmotion); // Pass actualTextForGemini
        } else {
            console.log("Server: No valid user speech to send to Gemini (from Whisper or fallback, or it was a system message).");
            // The "Please try speaking again..." message is now handled by Whisper's response directly
            // No need for a separate fallback message here if isSystemMessage is true.
            if (ws.readyState === WebSocket.OPEN && !isSystemMessage) { // Only send if not a system message
                ws.send(JSON.stringify({ type: 'emotion', value: "neutral" }));
                console.log("Server: Dispatched neutral emotion to client.");
            }
        }
    }

    // NEW: Helper function to extract a single direct response from Gemini's output
    function extractDirectResponse(geminiOutput) {
        // This regex looks for lines starting with "Option X (" and captures the text until the next option or end of string.
        // It's designed to extract the conversational part.
        const optionRegex = /^(?:Option \d+ \([^)]+\):\s*")?([^"]+)"?$/im; // Adjusted regex
        const lines = geminiOutput.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        for (const line of lines) {
            const match = line.match(optionRegex);
            if (match && match[1]) {
                // If it's an option line, return the captured group (the actual response)
                return match[1].trim();
            }
            // If it's not an option line but a direct response, return it
            if (!line.toLowerCase().includes("option") && !line.toLowerCase().includes("best response") && !line.toLowerCase().includes("depends on the context")) {
                return line.trim();
            }
        }

        // Fallback: If no clear option or direct response is found, take the first non-empty line
        // or a default message.
        const firstMeaningfulLine = lines.find(line => !line.toLowerCase().includes("option") && !line.toLowerCase().includes("best response") && !line.toLowerCase().includes("depends on the context"));
        return firstMeaningfulLine || "I'm not sure how to respond to that.";
    }


    async function sendTextToGeminiAndRespond(text, userEmotion = "neutral") {
        if (!GEMINI_API_KEY) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'message', text: "Server: My AI capabilities are not configured (missing Gemini API key)." }));
                console.log("Server: Dispatched Gemini API key missing message.");
            }
            return;
        }
        if (!ELEVENLABS_API_KEY) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'message', text: "Server: My voice is not configured (missing ElevenLabs API key)." }));
                console.log("Server: Dispatched ElevenLabs API key missing message.");
            }
            return;
        }

        // MODIFIED: Added instruction to the prompt for a single, direct response
        // Also added an instruction to choose the single best option if it generates multiple.
        const enhancedPrompt = `User's input (emotion: ${userEmotion}): "${text}"\n\nAs a conversational AI, provide a single, direct, and empathetic response to the user based on their input and emotion. Do not offer multiple options or analyze the input. Just give a direct conversational reply.`;
        conversationHistory.push({ role: "user", parts: [{ text: enhancedPrompt }] });

        try {
            console.log("Server: Sending to Gemini:", enhancedPrompt);
            const result = await model.generateContent({
                contents: conversationHistory,
                // NEW: Added generationConfig to control temperature for more direct responses
                generationConfig: {
                    temperature: 0.5, // Lower temperature for less diversity, more directness
                },
            });
            const response = await result.response;
            let llmText = response.text(); // Get the full response from Gemini
            console.log("Server: Received raw from Gemini:", llmText); // Log raw response

            // NEW: Extract the direct response before using it for TTS and dispatch
            const directResponse = extractDirectResponse(llmText);
            console.log("Server: Extracted direct response:", directResponse); // Log extracted response
            llmText = directResponse; // Use the extracted direct response for subsequent steps

            conversationHistory.push({ role: "model", parts: [{ text: llmText }] });

            botSpeaking = true; // Set bot speaking flag
            // --- STEP 4: Text-to-Speech (TTS) using ElevenLabs ---
            console.log('Server: Streaming audio response from ElevenLabs...');
            // FIX: Corrected ElevenLabs SDK call to use elevenlabs.generate
            const audioStream = await elevenlabs.generate({
                voice_id: DEFAULT_ELEVENLABS_VOICE_ID,
                text: llmText,
                model_id: 'eleven_turbo_v2_5', // A good balance of quality and latency for conversational AI
                // You can adjust voice settings here for stability, similarity_boost, etc.
                // See ElevenLabs documentation for more options.
            });

            // Send each audio chunk (Buffer) directly to the frontend via WebSocket
            for await (const chunk of audioStream) {
                if (chunk instanceof Buffer) {
                    if (ws.readyState === WebSocket.OPEN) { // Check WebSocket state before sending
                        ws.send(chunk);
                    } else {
                        console.warn('Server: WebSocket not open, cannot stream ElevenLabs audio chunk.');
                    }
                }
            }
            console.log('Server: Finished streaming audio from ElevenLabs.');
            botSpeaking = false; // Reset bot speaking flag after sending audio

            // --- STEP 5: Send response text back to frontend (optional, for chat display) ---
            // Only send if llmText.trim() is not empty
            if (llmText.trim() !== "") {
                if (ws.readyState === WebSocket.OPEN) { // Check WebSocket state before sending
                    console.log(`Server: Preparing to dispatch bot response: "Bot: ${llmText}"`);
                    ws.send(JSON.stringify({ type: 'message', text: `Bot: ${llmText}` }));
                    console.log(`Server: Dispatched bot response to client.`);
                } else {
                    console.warn(`Server: WebSocket not open, cannot dispatch bot response: "Bot: ${llmText}"`);
                }
            } else {
                console.log("Server: Gemini returned empty response, not dispatching text message.");
            }


        } catch (error) {
            console.error('Server: Gemini API or ElevenLabs TTS Error:', error);
            let errorMessage = "Server: Sorry, I encountered an error trying to process that.";
            // Check if the error message from ElevenLabs specifically mentions missing permissions
            if (error.body && error.body.detail && error.body.detail.message && error.body.detail.message.includes("missing the permission")) {
                errorMessage = "Server: ElevenLabs API key missing required permissions. Please check your ElevenLabs account settings.";
            } else if (error.message.includes("API key")) { // General API key check
                errorMessage = "Server: My AI brain or voice seems disconnected! Please check the API keys.";
            }

            if (ws.readyState === WebSocket.OPEN) { // Check WebSocket state before sending
                ws.send(JSON.stringify({ type: 'error', message: errorMessage }));
                console.log(`Server: Dispatched error to client: "${errorMessage}"`);
                ws.send(JSON.stringify({ type: 'message', text: errorMessage })); // Send as a regular message too for visibility
                console.log(`Server: Dispatched fallback message to client: "${errorMessage}"`);
            } else {
                console.warn(`Server: WebSocket not open, cannot dispatch error or fallback message: "${errorMessage}"`);
            }
            botSpeaking = false; // Ensure flag is reset on error
        }
    }


    ws.onclose = () => {
        console.log('Server: Client disconnected.');
        resetAudioProcessing(); // Clear all state on disconnect
        conversationHistory = [];
    };

    ws.onerror = error => {
        console.error('Server: WebSocket Error:', error);
    };
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/`);
});
