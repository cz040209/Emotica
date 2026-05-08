const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const PORT = process.env.PORT || 8080;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// --- HUME AI TTS Configuration ---
const HUME_API_KEY = process.env.HUME_API_KEY || "zHaaYIDHpNk5SLT2mljv8XGQY8oulooB0BwaLPAwtj0nNp28";
const HUME_TTS_ENDPOINT = "https://api.hume.ai/v0/tts";

// Emotion-aware voice descriptions for Hume AI
const emotionVoiceDescriptions = {
    neutral: "Clear and conversational, steady and warm, natural pacing",
    calm: "Soft and relaxed, gentle and unhurried, smooth and reassuring tone",
    happy: "Bright and warm, upbeat and energetic, friendly and enthusiastic, light and lively",
    sad: "Warm and tender, slow and quiet, gentle and empathetic, slightly hushed, careful and compassionate",
    angry: "Calm and grounded, steady and measured, gently de-escalating, firm but non-confrontational",
    fearful: "Soft and reassuring, slow and steady, calm and stabilising, gentle and patient",
    disgust: "Neutral and composed, steady and respectful, calm and non-reactive",
    surprised: "Warm and curious, gently animated, open and engaging, slightly elevated energy",
};

// --- COMMENTED OUT: Unreal Speech Configuration (Replaced by Hume AI) ---
// const UNREAL_SPEECH_API_KEY = process.env.UNREAL_SPEECH_API_KEY;
// const UNREAL_SPEECH_ENDPOINT = process.env.UNREAL_SPEECH_ENDPOINT || "https://api.v8.unrealspeech.com/stream";
// const UNREAL_SPEECH_VOICE_ID = process.env.UNREAL_SPEECH_VOICE_ID || "Emily";
// const UNREAL_SPEECH_BITRATE = process.env.UNREAL_SPEECH_BITRATE || "192k";
// const UNREAL_SPEECH_SPEED = process.env.UNREAL_SPEECH_SPEED || "0";
// const UNREAL_SPEECH_PITCH = process.env.UNREAL_SPEECH_PITCH || "1";
// const UNREAL_SPEECH_CODEC = process.env.UNREAL_SPEECH_CODEC || "libmp3lame";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_LISTEN_URL = process.env.DEEPGRAM_LISTEN_URL || "wss://api.deepgram.com/v1/listen";
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || "nova-3";
const DEEPGRAM_LANGUAGE = process.env.DEEPGRAM_LANGUAGE || "en-US";
const DEEPGRAM_ENDPOINTING_MS = Number(process.env.DEEPGRAM_ENDPOINTING_MS || 300);
const DEEPGRAM_UTTERANCE_END_MS = Number(process.env.DEEPGRAM_UTTERANCE_END_MS || 1000);
const DEEPGRAM_KEEPALIVE_MS = Number(process.env.DEEPGRAM_KEEPALIVE_MS || 4000);
const DEEPGRAM_FINALIZE_GRACE_MS = Number(process.env.DEEPGRAM_FINALIZE_GRACE_MS || 900);
const EMOTION_API_URL = process.env.EMOTION_API_URL || "http://localhost:5001/emotion";

const CALL_END_SILENCE_THRESHOLD_MS = Number(process.env.CALL_END_SILENCE_THRESHOLD_MS || 5000);
const SILENCE_VOLUME_THRESHOLD = Number(process.env.SILENCE_VOLUME_THRESHOLD || 20);
const SAMPLE_RATE = Number(process.env.AUDIO_SAMPLE_RATE || 48000);
const CHANNELS = 1;
const TTS_MIN_SEGMENT_CHARS = Number(process.env.TTS_MIN_SEGMENT_CHARS || 8);
const TTS_MAX_SEGMENT_CHARS = Number(process.env.TTS_MAX_SEGMENT_CHARS || 220);

let lastSttErrorTime = 0;
const STT_ERROR_COOLDOWN_MS = 5000;
let sttErrorSentDuringCall = false;

console.log(`Server Config: CALL_END_SILENCE_THRESHOLD_MS: ${CALL_END_SILENCE_THRESHOLD_MS}ms`);
console.log(`Server Config: SILENCE_VOLUME_THRESHOLD: ${SILENCE_VOLUME_THRESHOLD}`);
console.log(`Server Config: DEEPGRAM_MODEL: ${DEEPGRAM_MODEL}`);
console.log(`Server Config: DEEPGRAM_LANGUAGE: ${DEEPGRAM_LANGUAGE}`);
console.log(`Server Config: DEEPGRAM_ENDPOINTING_MS: ${DEEPGRAM_ENDPOINTING_MS}ms`);

if (!GROQ_API_KEY) {
    console.warn("GROQ_API_KEY is not set in your .env file. AI functionalities may not work.");
}
if (!HUME_API_KEY) {
    console.warn("HUME_API_KEY is not set in your .env file. TTS may not work.");
}
if (!DEEPGRAM_API_KEY) {
    console.warn("DEEPGRAM_API_KEY is not set in your .env file. Live transcription will not work.");
}

function safeSendJson(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function sanitizeSampleRate(value) {
    const sampleRate = Number(value);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
        return SAMPLE_RATE;
    }
    return Math.round(sampleRate);
}

function buildDeepgramUrl(sampleRate) {
    const url = new URL(DEEPGRAM_LISTEN_URL);
    url.searchParams.set("model", DEEPGRAM_MODEL);
    url.searchParams.set("language", DEEPGRAM_LANGUAGE);
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", String(sampleRate));
    url.searchParams.set("channels", String(CHANNELS));
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("endpointing", String(DEEPGRAM_ENDPOINTING_MS));
    url.searchParams.set("utterance_end_ms", String(DEEPGRAM_UTTERANCE_END_MS));
    url.searchParams.set("vad_events", "true");
    return url.toString();
}

function streamGroqResponse(messages, onToken) {
    const postData = JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.5,
        stream: true,
    });

    const options = {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
        },
    };

    console.log(`Server: Groq request - Model: ${GROQ_MODEL}, API Key loaded: ${!!GROQ_API_KEY}`);

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = "";
            let eventBuffer = "";
            let fullText = "";

            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    responseBody += chunk;
                });
                res.on("end", () => {
                    console.error(`Server: Groq API Error - Status: ${res.statusCode}`);
                    console.error(`Server: Groq API Error - Response: ${responseBody}`);
                    reject(new Error(`Groq API returned status ${res.statusCode}: ${responseBody}`));
                });
                return;
            }

            res.setEncoding("utf8");
            res.on("data", (chunk) => {
                eventBuffer += chunk;
                const events = eventBuffer.split(/\r?\n\r?\n/);
                eventBuffer = events.pop() || "";

                for (const event of events) {
                    const dataLines = event
                        .split(/\r?\n/)
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trim());

                    for (const payload of dataLines) {
                        if (!payload || payload === "[DONE]") {
                            continue;
                        }

                        try {
                            const data = JSON.parse(payload);
                            const token = data.choices?.[0]?.delta?.content || "";
                            if (token) {
                                fullText += token;
                                onToken(token, fullText);
                            }
                        } catch (error) {
                            console.warn("Server: Could not parse Groq stream event:", error.message);
                        }
                    }
                }
            });

            res.on("end", () => {
                resolve(fullText.trim());
            });
        });

        req.on("error", reject);
        req.write(postData);
        req.end();
    });
}

// --- HUME AI TTS Function with Emotion-Aware Voice ---
async function streamHumeTTS(text, emotion, sessionId, onAudioChunk) {
    const payload = {
        utterances: [
            {
                text: text
                // No voice specification - Hume will generate a novel voice dynamically
                // The emotional tone comes from the text itself (generated by Groq with emotion prompt)
            }
        ],
        instant_mode: false  // Disable instant mode to allow dynamic voice generation
    };

    try {
        console.log(`Server: Starting Hume TTS for text: "${text.substring(0, 50)}..." with emotion: "${emotion}"`);
        console.log(`Server: Hume API Key loaded: ${!!HUME_API_KEY}`);

        const response = await fetch("https://api.hume.ai/v0/tts/stream/json", {
            method: "POST",
            headers: {
                "X-Hume-Api-Key": HUME_API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server: Hume API Error - Status: ${response.status}`);
            console.error(`Server: Hume API Error - Response: ${errorText}`);
            throw new Error(
                `Hume AI TTS API returned status ${response.status}: ${errorText}`
            );
        }

        // Stream JSON responses and extract base64 audio
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let totalAudioBytes = 0;
        let chunkCount = 0;
        let lineCount = 0;
        let firstLine = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.trim()) {
                    lineCount++;
                    try {
                        const json = JSON.parse(line);
                        
                        // Log first line to understand structure
                        if (lineCount === 1) {
                            firstLine = JSON.stringify(json).substring(0, 500);
                            console.log(`Server: First Hume response line:`, firstLine);
                        }
                        
                        // The response contains an 'audio' field with metadata
                        // including 'data' which has the base64 MP3 audio
                        let audioData = null;
                        
                        if (json.audio?.data) {
                            audioData = json.audio.data;
                        } else if (json.data?.audio) {
                            audioData = json.data.audio;
                        } else if (json.audio) {
                            audioData = json.audio;
                        } else if (json.data) {
                            audioData = json.data;
                        }
                        
                        if (audioData && typeof audioData === 'string') {
                            try {
                                const audioBuffer = Buffer.from(audioData, "base64");
                                if (audioBuffer.length > 0) {
                                    totalAudioBytes += audioBuffer.length;
                                    chunkCount++;
                                    if (chunkCount <= 2) {
                                        console.log(`Server: TTS audio chunk ${chunkCount}: ${audioBuffer.length} bytes`);
                                    }
                                    onAudioChunk(audioBuffer);
                                }
                            } catch (e) {
                                console.warn(`Server: Failed to decode audio base64 for chunk ${chunkCount + 1}:`, e.message);
                            }
                        }
                    } catch (error) {
                        console.warn("Server: Could not parse Hume TTS JSON line:", error.message);
                        if (lineCount === 1) {
                            console.warn("Server: Raw line was:", line.substring(0, 200));
                        }
                    }
                }
            }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
            try {
                const json = JSON.parse(buffer);
                let audioData = null;
                if (json.audio?.data) {
                    audioData = json.audio.data;
                } else if (json.data?.audio) {
                    audioData = json.data.audio;
                } else if (json.audio) {
                    audioData = json.audio;
                } else if (json.data) {
                    audioData = json.data;
                }
                
                if (audioData && typeof audioData === 'string') {
                    try {
                        const audioBuffer = Buffer.from(audioData, "base64");
                        if (audioBuffer.length > 0) {
                            totalAudioBytes += audioBuffer.length;
                            chunkCount++;
                            onAudioChunk(audioBuffer);
                        }
                    } catch (e) {
                        console.warn(`Server: Failed to decode final audio chunk:`, e.message);
                    }
                }
            } catch (error) {
                console.warn("Server: Could not parse final Hume TTS JSON line:", error.message);
            }
        }

        console.log(`Server: TTS streaming complete. Lines: ${lineCount}, chunks: ${chunkCount}, bytes: ${totalAudioBytes}`);
        if (lineCount > 0 && chunkCount === 0) {
            console.log(`Server: No audio chunks extracted. First response line: ${firstLine}`);
        }
    } catch (error) {
        throw error;
    }
}

// --- COMMENTED OUT: Unreal Speech Function (Replaced by Hume AI) ---
// async function streamUnrealSpeech(text, onAudioChunk) {
//     ... (commented out)
// }

function requestEmotion(audioBuffer, sourceSampleRate = SAMPLE_RATE) {
    const parsedUrl = new URL(EMOTION_API_URL);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const base64Audio = audioBuffer.toString('base64');
    const postData = JSON.stringify({
        audio: base64Audio,
        source_sample_rate: sanitizeSampleRate(sourceSampleRate),
    });

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };

    return new Promise((resolve, reject) => {
        const req = client.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Emotion API returned status ${res.statusCode}: ${responseBody}`));
                    return;
                }

                try {
                    const data = JSON.parse(responseBody);
                    resolve(data.emotion || "neutral");
                } catch (error) {
                    reject(new Error(`Could not parse emotion response: ${error.message}`));
                }
            });
        });

        req.setTimeout(5000, () => {
            req.destroy(new Error("Emotion API request timed out"));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function extractSpeakableSegments(buffer, force = false) {
    const segments = [];
    let remaining = buffer;

    while (remaining.trim().length > 0) {
        let boundaryIndex = -1;
        const boundaryMatches = remaining.matchAll(/[.!?]+["')\]]*(?=\s|$)/g);

        for (const match of boundaryMatches) {
            const candidateEnd = match.index + match[0].length;
            if (candidateEnd >= TTS_MIN_SEGMENT_CHARS) {
                boundaryIndex = candidateEnd;
                break;
            }
        }

        if (boundaryIndex === -1 && remaining.length >= TTS_MAX_SEGMENT_CHARS) {
            const splitAt = remaining.lastIndexOf(" ", TTS_MAX_SEGMENT_CHARS);
            boundaryIndex = splitAt > TTS_MIN_SEGMENT_CHARS ? splitAt : TTS_MAX_SEGMENT_CHARS;
        }

        if (boundaryIndex === -1) {
            break;
        }

        const segment = remaining.slice(0, boundaryIndex).trim();
        if (segment) {
            segments.push(segment);
        }
        remaining = remaining.slice(boundaryIndex).trimStart();
    }

    if (force && remaining.trim()) {
        segments.push(remaining.trim());
        remaining = "";
    }

    return { segments, rest: remaining };
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('Server: Client connected via WebSocket.');

    // Generate unique session ID for voice naming consistency across a session
    const clientSessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log(`Server: Session ID assigned: ${clientSessionId}`);

    let audioBuffer = [];
    let silenceStartTimestamp = null;
    let conversationHistory = [];
    let botSpeaking = false;
    let callEndTimeoutId = null;
    let deepgramConnection = null;
    let deepgramOpen = false;
    let deepgramStarting = null;
    let deepgramKeepAliveId = null;
    let pendingDeepgramAudio = [];
    let finalizedTranscriptParts = [];
    let finalTranscriptQueue = [];
    let isProcessingFinalTranscript = false;
    let pendingFinalizeResolve = null;
    let clientSampleRate = SAMPLE_RATE;
    let clientVadEnabled = false;
    let utteranceOpen = false;
    let currentUtteranceId = 0;
    let currentUtterancePromptEmotion = "neutral";
    let currentUtteranceEmotionStarted = false;
    let lastKnownEmotion = "neutral";
    let latestAppliedEmotionTurnId = 0;
    let responseGenerationId = 0;

    function calculateRMS(buffer) {
        if (buffer.length === 0) return 0;
        const alignedByteLength = buffer.byteLength % 2 === 0 ? buffer.byteLength : buffer.byteLength - 1;
        const pcmData = new Int16Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + alignedByteLength));
        if (pcmData.length === 0) return 0;

        let sumOfSquares = 0;
        for (let i = 0; i < pcmData.length; i++) {
            sumOfSquares += pcmData[i] * pcmData[i];
        }
        return Math.sqrt(sumOfSquares / pcmData.length);
    }

    const clearCallEndTimeout = () => {
        clearTimeout(callEndTimeoutId);
        callEndTimeoutId = null;
    };

    const scheduleCallEndTimeout = (reason = 'prolonged_silence') => {
        clearCallEndTimeout();
        callEndTimeoutId = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                console.log(`Server: Ending call due to ${CALL_END_SILENCE_THRESHOLD_MS / 1000}s silence.`);
                safeSendJson(ws, { type: 'call_ended_by_server', reason });
            }
            resetAudioProcessing();
        }, CALL_END_SILENCE_THRESHOLD_MS);
    };

    const interruptBotPlayback = () => {
        if (!botSpeaking) {
            return;
        }
        responseGenerationId += 1;
        botSpeaking = false;
        safeSendJson(ws, { type: 'clear_audio' });
        console.log("Server: User barge-in detected; stopped outgoing audio for the previous response.");
    };

    const flushPendingDeepgramAudio = () => {
        if (!deepgramConnection || deepgramConnection.readyState !== WebSocket.OPEN) {
            return;
        }

        while (pendingDeepgramAudio.length > 0) {
            deepgramConnection.send(pendingDeepgramAudio.shift());
        }
    };

    const closeDeepgramStream = () => {
        clearInterval(deepgramKeepAliveId);
        deepgramKeepAliveId = null;

        if (deepgramConnection) {
            try {
                if (deepgramConnection.readyState === WebSocket.OPEN) {
                    deepgramConnection.send(JSON.stringify({ type: "CloseStream" }));
                }
                deepgramConnection.close();
            } catch (error) {
                console.warn('Server: Error while closing Deepgram stream:', error.message);
            }
        }

        deepgramConnection = null;
        deepgramOpen = false;
        deepgramStarting = null;
    };

    const resetAudioProcessing = () => {
        audioBuffer = [];
        silenceStartTimestamp = null;
        finalizedTranscriptParts = [];
        finalTranscriptQueue = [];
        isProcessingFinalTranscript = false;
        pendingDeepgramAudio = [];
        utteranceOpen = false;
        currentUtteranceEmotionStarted = false;
        if (pendingFinalizeResolve) {
            pendingFinalizeResolve();
            pendingFinalizeResolve = null;
        }
        clearCallEndTimeout();
        interruptBotPlayback();
        closeDeepgramStream();
        console.log('Server: Audio processing state reset.');
    };

    const reportSttError = (error) => {
        console.error('Server: Deepgram STT Error:', error);
        const errorMessage = "Server: Sorry, I encountered an error trying to transcribe your speech.";
        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }

        if (Date.now() - lastSttErrorTime > STT_ERROR_COOLDOWN_MS || !sttErrorSentDuringCall) {
            safeSendJson(ws, { type: 'error', message: errorMessage });
            safeSendJson(ws, { type: 'message', text: errorMessage });
            lastSttErrorTime = Date.now();
            sttErrorSentDuringCall = true;
        }
    };

    const startDeepgramStream = async () => {
        if (deepgramOpen && deepgramConnection?.readyState === WebSocket.OPEN) {
            return deepgramConnection;
        }
        if (deepgramStarting) {
            return deepgramStarting;
        }
        if (!DEEPGRAM_API_KEY) {
            reportSttError(new Error("Missing DEEPGRAM_API_KEY"));
            return null;
        }

        deepgramStarting = new Promise((resolve, reject) => {
            const deepgramUrl = buildDeepgramUrl(clientSampleRate);
            const connection = new WebSocket(deepgramUrl, {
                headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
            });
            deepgramConnection = connection;
            let settled = false;

            const settle = (callback, value) => {
                if (!settled) {
                    settled = true;
                    callback(value);
                }
            };

            connection.on("open", () => {
                deepgramOpen = true;
                deepgramKeepAliveId = setInterval(() => {
                    if (connection.readyState === WebSocket.OPEN) {
                        connection.send(JSON.stringify({ type: "KeepAlive" }));
                    }
                }, DEEPGRAM_KEEPALIVE_MS);
                console.log("Server: Direct Deepgram WebSocket opened.");
                flushPendingDeepgramAudio();
                settle(resolve, connection);
            });

            connection.on("message", (rawData) => {
                try {
                    const data = JSON.parse(rawData.toString());
                    handleDeepgramMessage(data);
                } catch (error) {
                    console.warn("Server: Could not parse Deepgram message:", error.message);
                }
            });

            connection.on("close", (code, reason) => {
                if (deepgramConnection === connection) {
                    clearInterval(deepgramKeepAliveId);
                    deepgramKeepAliveId = null;
                    deepgramOpen = false;
                    deepgramConnection = null;
                }
                console.log(`Server: Deepgram WebSocket closed (${code}) ${reason?.toString() || ""}`.trim());
                if (!settled) {
                    settle(reject, new Error(`Deepgram WebSocket closed before opening (${code})`));
                }
            });

            connection.on("error", (error) => {
                if (deepgramConnection === connection) {
                    deepgramOpen = false;
                }
                if (!settled) {
                    settle(reject, error);
                    return;
                }
                reportSttError(error);
            });
        });

        try {
            return await deepgramStarting;
        } catch (error) {
            deepgramConnection = null;
            deepgramOpen = false;
            reportSttError(error);
            return null;
        } finally {
            deepgramStarting = null;
        }
    };

    const sendAudioToDeepgram = (audioChunk) => {
        if (!audioChunk?.length) {
            return;
        }

        if (deepgramOpen && deepgramConnection?.readyState === WebSocket.OPEN) {
            deepgramConnection.send(audioChunk);
            return;
        }

        pendingDeepgramAudio.push(Buffer.from(audioChunk));
        startDeepgramStream().then(flushPendingDeepgramAudio).catch(reportSttError);
    };

    const flushDeepgramStream = async () => {
        if (!deepgramConnection || deepgramConnection.readyState !== WebSocket.OPEN) {
            return;
        }

        const finalizeWait = new Promise((resolve) => {
            let timeoutId;
            const done = () => {
                clearTimeout(timeoutId);
                resolve();
            };

            pendingFinalizeResolve = done;
            timeoutId = setTimeout(() => {
                if (pendingFinalizeResolve === done) {
                    pendingFinalizeResolve = null;
                }
                if (finalizedTranscriptParts.length > 0) {
                    enqueueFinalTranscript();
                }
                resolve();
            }, DEEPGRAM_FINALIZE_GRACE_MS);
        });

        try {
            deepgramConnection.send(JSON.stringify({ type: "Finalize" }));
            await finalizeWait;
        } catch (error) {
            reportSttError(error);
        } finally {
            pendingFinalizeResolve = null;
        }
    };

    function beginUtterance(source = "audio") {
        if (!utteranceOpen) {
            currentUtteranceId += 1;
            currentUtterancePromptEmotion = lastKnownEmotion || "neutral";
            currentUtteranceEmotionStarted = false;
            utteranceOpen = true;
            console.log(`Server: Utterance ${currentUtteranceId} started by ${source}; prompt emotion=${currentUtterancePromptEmotion}.`);
        }

        clearCallEndTimeout();
        interruptBotPlayback();
    }

    function startEmotionForCurrentUtterance(reason = "utterance_end") {
        const turnId = currentUtteranceId || ++currentUtteranceId;
        if (currentUtteranceEmotionStarted) {
            return;
        }

        currentUtteranceEmotionStarted = true;
        const sourceSampleRate = clientSampleRate;
        const utteranceAudio = Buffer.concat(audioBuffer);
        audioBuffer = [];

        if (utteranceAudio.length === 0) {
            console.log(`Server: Skipping emotion for utterance ${turnId}; no audio buffered.`);
            return;
        }

        console.log(`Server: Starting async emotion inference for utterance ${turnId} (${reason}).`);
        requestEmotion(utteranceAudio, sourceSampleRate)
            .then((detectedEmotion) => {
                if (turnId >= latestAppliedEmotionTurnId) {
                    latestAppliedEmotionTurnId = turnId;
                    lastKnownEmotion = detectedEmotion || "neutral";
                }

                console.log(`Server: Emotion ready for utterance ${turnId}: ${detectedEmotion}; next prompt emotion=${lastKnownEmotion}.`);
                safeSendJson(ws, {
                    type: 'emotion',
                    value: detectedEmotion,
                    turnId,
                    appliesTo: 'next_turn',
                });
            })
            .catch((error) => {
                console.error(`Server: Async emotion inference failed for utterance ${turnId}:`, error);
            });
    }

    async function handleClientVadEnd() {
        if (!utteranceOpen && audioBuffer.length === 0) {
            await flushDeepgramStream();
            return;
        }

        startEmotionForCurrentUtterance("client_vad_end");
        utteranceOpen = false;
        await flushDeepgramStream();
    }

    function enqueueFinalTranscript() {
        const finalText = finalizedTranscriptParts.join(" ").replace(/\s+/g, " ").trim();
        finalizedTranscriptParts = [];

        if (finalText) {
            const turnId = currentUtteranceId || ++currentUtteranceId;
            const emotionForPrompt = currentUtterancePromptEmotion || lastKnownEmotion || "neutral";

            if (!clientVadEnabled) {
                startEmotionForCurrentUtterance("deepgram_final");
                utteranceOpen = false;
            }

            finalTranscriptQueue.push({ text: finalText, emotionForPrompt, turnId });
            processFinalTranscriptQueue();
        }

        if (pendingFinalizeResolve) {
            pendingFinalizeResolve();
            pendingFinalizeResolve = null;
        }
    }

    function handleDeepgramMessage(data) {
        if (data.type === "SpeechStarted") {
            beginUtterance("deepgram_speech_started");
            return;
        }

        if (data.type === "UtteranceEnd") {
            if (finalizedTranscriptParts.length > 0) {
                enqueueFinalTranscript();
            }
            return;
        }

        if (data.type !== "Results") {
            return;
        }

        const transcript = data.channel?.alternatives?.[0]?.transcript?.trim() || "";
        if (!transcript && !(data.speech_final || data.from_finalize)) {
            return;
        }

        if (!data.is_final) {
            if (transcript) {
                safeSendJson(ws, { type: 'stt_interim', text: transcript });
            }
            return;
        }

        if (transcript) {
            finalizedTranscriptParts.push(transcript);
        }

        if (data.speech_final || data.from_finalize) {
            enqueueFinalTranscript();
        }
    }

    async function processFinalTranscriptQueue() {
        if (isProcessingFinalTranscript) {
            return;
        }

        isProcessingFinalTranscript = true;
        while (finalTranscriptQueue.length > 0) {
            const { text, emotionForPrompt, turnId } = finalTranscriptQueue.shift();

            try {
                console.log(`Server: Deepgram final transcription for utterance ${turnId}:`, text);
                console.log(`Server: Using emotion for current prompt: ${emotionForPrompt}`);

                lastSttErrorTime = 0;
                sttErrorSentDuringCall = false;

                safeSendJson(ws, { type: 'message', text: `You: ${text}`, sender: 'user' });
                await sendTextToGroqAndRespond(text, emotionForPrompt);
                scheduleCallEndTimeout('prolonged_silence');
            } catch (error) {
                console.error('Server: Error processing final transcript:', error);
                reportSttError(error);
            }
        }
        isProcessingFinalTranscript = false;
    }

    function updateFallbackSilenceDetection(audioChunk) {
        const rms = calculateRMS(audioChunk);

        if (rms < SILENCE_VOLUME_THRESHOLD) {
            if (silenceStartTimestamp === null) {
                silenceStartTimestamp = Date.now();
                scheduleCallEndTimeout('prolonged_silence');
            }
            return;
        }

        silenceStartTimestamp = null;
        clearCallEndTimeout();
    }

    async function handleControlMessage(messageText) {
        let control = null;
        try {
            const parsed = JSON.parse(messageText);
            if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
                control = parsed;
            }
        } catch {
            control = null;
        }

        const type = control?.type || messageText;

        if (type === 'start_audio_stream') {
            console.log('Server: Frontend signaled start of audio stream. Resetting.');
            resetAudioProcessing();
            clientSampleRate = sanitizeSampleRate(control?.sampleRate || SAMPLE_RATE);
            clientVadEnabled = Boolean(control?.clientVad);
            lastKnownEmotion = "neutral";
            latestAppliedEmotionTurnId = 0;
            currentUtteranceId = 0;
            currentUtterancePromptEmotion = "neutral";
            lastSttErrorTime = 0;
            sttErrorSentDuringCall = false;
            await startDeepgramStream();
            scheduleCallEndTimeout('initial_silence');
            return;
        }

        if (type === 'vad_start') {
            clientVadEnabled = true;
            beginUtterance("client_vad_start");
            await startDeepgramStream();
            return;
        }

        if (type === 'vad_end') {
            clientVadEnabled = true;
            console.log('Server: Client VAD ended; emotion is starting async and Deepgram is finalizing.');
            await handleClientVadEnd();
            return;
        }

        if (type === 'stop_audio_stream') {
            console.log('Server: Frontend signaled end of recording. Flushing Deepgram stream...');
            if (utteranceOpen || audioBuffer.length > 0) {
                startEmotionForCurrentUtterance("manual_stop");
                utteranceOpen = false;
            }
            await flushDeepgramStream();
            closeDeepgramStream();
            safeSendJson(ws, { type: 'call_ended_by_server', reason: 'manual_stop' });
            resetAudioProcessing();
            return;
        }

        console.log('Server: Received text message (non-audio):', messageText);
        await sendTextToGroqAndRespond(messageText, lastKnownEmotion || "neutral");
    }

    ws.on('message', async (message, isBinary) => {
        if (!isBinary) {
            await handleControlMessage(message.toString());
            return;
        }

        const audioChunk = Buffer.isBuffer(message) ? message : Buffer.from(message);
        beginUtterance("audio_chunk");
        audioBuffer.push(audioChunk);
        sendAudioToDeepgram(audioChunk);

        if (!clientVadEnabled) {
            updateFallbackSilenceDetection(audioChunk);
        }
    });

    async function sendTextToGroqAndRespond(text, userEmotion = "neutral") {
        if (!GROQ_API_KEY) {
            safeSendJson(ws, { type: 'message', text: "Server: My AI capabilities are not configured (missing Groq API key)." });
            return;
        }
        if (!HUME_API_KEY) {
            safeSendJson(ws, { type: 'message', text: "Server: My voice is not configured (missing Hume AI API key)." });
            return;
        }

        const promptTemplates = {
            "neutral": `USER: {user_input}\nEMOTION: Neutral\nINTENT: Neutral\nRespond with clarity, keep tone balanced and neutral, and avoid unnecessary emotional cues.`,
            "calm": `USER: {user_input}\nEMOTION: Calm\nINTENT: Match their calmness\nRespond in a relaxed tone. Match their calmness while offering thoughtful support or feedback.`,
            "happy": `USER: {user_input}\nEMOTION: Happy\nINTENT: Sharing joy\nRespond with enthusiasm and positivity. Acknowledge their happiness and mirror their joy.`,
            "sad": `USER: {user_input}\nEMOTION: Sad\nINTENT: Venting\nOffer emotional validation, avoid advice unless asked, and express support with a soft and kind tone.`,
            "angry": `USER: {user_input}\nEMOTION: Angry\nINTENT: Seeking support or venting\nAcknowledge frustration without judgment, and offer grounded, calming suggestions.`,
            "fearful": `USER: {user_input}\nEMOTION: Fearful\nINTENT: Reassurance\nRespond gently. Reassure the user and reduce their anxiety by focusing on safety, clarity, and empathy.`,
            "disgust": `USER: {user_input}\nEMOTION: Disgust\nINTENT: Expressing rejection or discomfort\nAcknowledge their discomfort without amplifying negativity. Stay respectful and neutral.`,
            "surprised": `USER: {user_input}\nEMOTION: Surprised\nINTENT: Processing new info\nMatch surprise gently. Ask open-ended questions or offer confirmation to help them process the surprise.`,
        };

        const selectedTemplate = promptTemplates[userEmotion.toLowerCase()] || promptTemplates["neutral"];
        const enhancedPrompt = selectedTemplate.replace('{user_input}', text);
        conversationHistory.push({ role: "user", content: enhancedPrompt });

        const generationId = ++responseGenerationId;
        let pendingTtsText = "";
        let ttsQueue = Promise.resolve();

        const isCurrentGeneration = () => generationId === responseGenerationId && ws.readyState === WebSocket.OPEN;

        const queueTtsSegment = (segment) => {
            const cleanSegment = segment.trim();
            if (!cleanSegment) {
                return;
            }

            ttsQueue = ttsQueue.then(async () => {
                if (!isCurrentGeneration()) {
                    return;
                }

                console.log(`Server: Streaming Hume AI TTS segment with emotion "${userEmotion}": "${cleanSegment}"`);
                await streamHumeTTS(cleanSegment, userEmotion, clientSessionId, (audioChunk) => {
                    if (isCurrentGeneration()) {
                        ws.send(audioChunk, { binary: true });
                    }
                });
            });
        };

        const flushReadyTtsSegments = (force = false) => {
            const { segments, rest } = extractSpeakableSegments(pendingTtsText, force);
            pendingTtsText = rest;
            for (const segment of segments) {
                queueTtsSegment(segment);
            }
        };

        try {
            console.log("Server: Streaming Groq response with prompt emotion:", userEmotion);
            const messages = [
                {
                    role: "system",
                    content: "You are Emotica, an emotionally aware voice assistant. Reply naturally, briefly, and empathetically.",
                },
                ...conversationHistory,
            ];

            botSpeaking = true;
            const fullLlmResponseText = await streamGroqResponse(messages, (token) => {
                if (!isCurrentGeneration()) {
                    return;
                }

                pendingTtsText += token;
                flushReadyTtsSegments(false);
            });

            if (!isCurrentGeneration()) {
                return;
            }

            flushReadyTtsSegments(true);
            await ttsQueue;

            if (!isCurrentGeneration()) {
                return;
            }

            botSpeaking = false;
            conversationHistory.push({ role: "assistant", content: fullLlmResponseText });

            if (fullLlmResponseText.trim() !== "") {
                console.log(`Server: Sending bot message: "${fullLlmResponseText}"`);
                safeSendJson(ws, { type: 'message', text: `Bot: ${fullLlmResponseText}`, sender: 'bot' });
                console.log(`Server: Bot message sent successfully.`);
            } else {
                console.log("Server: Groq returned empty response, not dispatching text message.");
            }
        } catch (error) {
            console.error('Server: Groq API or Hume AI TTS Error:', error);
            let errorMessage = "Server: Sorry, I encountered an error trying to process that.";
            if (error.message.includes("API key") || error.message.includes("Authorization")) {
                errorMessage = "Server: My AI brain or voice seems disconnected! Please check the API keys.";
            }

            safeSendJson(ws, { type: 'error', message: errorMessage });
            safeSendJson(ws, { type: 'message', text: errorMessage });
            botSpeaking = false;
        } finally {
            if (generationId === responseGenerationId) {
                botSpeaking = false;
            }
        }
    }

    ws.onclose = () => {
        console.log('Server: Client disconnected.');
        resetAudioProcessing();
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
