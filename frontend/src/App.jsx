import React, { useState, useEffect, useRef, useCallback } from 'react'; // Import useRef for scrolling
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, onSnapshot, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';

// --- Helper function to generate a color from a string (for consistent avatar colors) ---
const stringToColor = (str) => {
    let hash = 0;
    // Corrected loop condition: should be i < str.length
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    // Corrected loop condition: should be i < 3
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2); // Corrected: value.toString(16)
    }
    return color;
};

// --- Helper to generate a unique ID, with fallback for older browsers ---
const generateUniqueId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers or environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// --- Function to create an initial avatar (Base64 SVG) ---
const createInitialAvatar = (name) => {
    if (!name) return null;
    const initial = name.charAt(0).toUpperCase();
    const bgColor = stringToColor(name); // Generate a unique color based on the name
    const textColor = '#FFFFFF'; // White text for contrast

    // Use String.raw for maximal safety against unexpected escape sequences
    const svg = String.raw`<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="${bgColor}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="${textColor}">${initial}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// Using a robust and complete SVG path for a generic person icon.
const genericPersonIconPath = "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";

// Function to create an SVG icon data URI from a path and color
const createIconSvgDataUri = (pathData, color, width = 24, height = 24) => {
    // Use String.raw for maximal safety against unexpected escape sequences
    const svg = String.raw`<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="${pathData}"/></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// Data URIs for specific icons - explicitly using String.raw and ensuring single line
const addCharacterIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`;
const newChatIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`; // Corrected: String.raw
const hamburgerIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>`;
const leftArrowIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>`;
const startCallIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.107l-3.397 3.397a1 1 0 01-1.414 0l-3.397-3.397m5.656-5.656l3.397-3.397a1 1 0 010-1.414l-3.397-3.397"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>`;
const endCallIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14L21 3m0 0l-7.962 7.962M21 3v7.962m0 0a3 3 0 01-3 3v2a3 3 0 01-3-3m-4 0a3 3 0 01-3-3v-2a3 3 0 013-3m0 0h4m-7 0a3 3 0 01-3-3v-2a3 3 0 013-3m0 0h4m0 0a3 3 0 01-3-3v-2a3 3 0 013-3"/></svg>`;
const videoCallIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.555-4.555A1 1 0 0121 6.445v11.11a1 1 0 01-1.445.89L15 14M5 18H3a2 2 0 01-2-2V8a2 2 0 012-2h2l3-3 3 3h2a2 2 0 012 2v8a2 2 0 01-2 2H5z"/></svg>`;
const settingsIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00-.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001.51-1V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path></svg>`;


const addCharacterIconUri = `data:image/svg+xml;base64,${btoa(addCharacterIconSvgContent)}`; // Re-added for "Create New"
const newChatIconUri = `data:image/svg+xml;base64,${btoa(newChatIconSvgContent)}`;
const hamburgerIconUri = `data:image/svg+xml;base64,${btoa(hamburgerIconSvgContent)}`;
const leftArrowIconUri = `data:image/svg+xml;base64,${btoa(leftArrowIconSvgContent)}`;
const startCallIconUri = `data:image/svg+xml;base64,${btoa(startCallIconSvgContent)}`;
const endCallIconUri = `data:image/svg+xml;base64,${btoa(endCallIconSvgContent)}`;
const videoCallIconUri = `data:image/svg+xml;base64,${btoa(videoCallIconSvgContent)}`;
const settingsIconUri = `data:image/svg+xml;base64,${btoa(settingsIconSvgContent)}`;

// New SVG icons for password visibility toggle
// MODIFIED: Changed fill="none" to fill="currentColor" for solid icons
const eyeOpenIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeClosedIconSvgContent = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.54 18.54 0 015.04-5.04M9.91 4.24A9.91 9.91 0 0112 4c7 0 11 8 11 8a18.54 18.54 0 01-5.04 5.04M12 12a3 3 0 100-6 3 3 0 000 6z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

const eyeOpenIconUri = `data:image/svg+xml;base64,${btoa(eyeOpenIconSvgContent)}`;
const eyeClosedIconUri = `data:image/svg+xml;base64,${btoa(eyeClosedIconSvgContent)}`;


// --- Message Box Component (replaces browser's alert() for better UI) ---
const MessageBox = ({ message, onClose }) => {
    if (!message) return null; // Don't render if no message

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-700 p-6 rounded-lg shadow-xl max-w-sm w-full text-center text-white">
                <p className="text-lg font-semibold mb-4">{message}</p>
                <button
                    onClick={onClose}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200"
                >
                    OK
                </button>
            </div>
        </div>
    );
};

// --- Home Page Component ---
const HomePage = ({ navigateTo, characters, defaultCharacters }) => { // Added defaultCharacters prop
    const allCharacters = [...defaultCharacters, ...characters];

    const handleCharacterSelect = (char) => { // Now receives the full character object
        navigateTo('chat', char); // Pass the full character object
    };

    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-gray-100">
            <h2 className="text-4xl font-extrabold mb-6 text-blue-300">Welcome to Emotica</h2>
            <p className="text-xl mb-8 max-w-xl text-gray-300">
                Start your conversation with our emotionally aware AI assistant!
            </p>
            {/* Character Selection Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 w-full max-w-4xl px-4">
                {allCharacters.map((char) => (
                    <button
                        key={char.id}
                        onClick={() => handleCharacterSelect(char)} // Pass the full character object
                        className="flex flex-col items-center p-4 bg-gray-800 rounded-xl shadow-lg hover:bg-gray-700 transition duration-200 ease-in-out transform hover:scale-105 cursor-pointer"
                    >
                        {/* Display character avatar (which is now always a data URI) */}
                        <div className="rounded-full overflow-hidden w-20 h-20 flex items-center justify-center bg-gray-700 border-2 border-gray-600">
                            {char.avatar ? (
                                <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                            ) : (
                                // Fallback for custom characters if no image is uploaded. Will use createInitialAvatar.
                                <img src={createInitialAvatar(char.name)} alt={char.name} className="w-full h-full object-cover" />
                            )}
                        </div>
                        <span className="mt-2 text-lg font-semibold text-gray-100">{char.name}</span>
                    </button>
                ))}
                {/* Button to create a new character */}
                <button
                    onClick={() => navigateTo('create-character')}
                    className="flex flex-col items-center p-4 bg-gray-800 rounded-xl shadow-lg hover:bg-gray-700 transition duration-200 ease-in-out transform hover:scale-105 cursor-pointer border-2 border-gray-600 border-dashed"
                >
                    <img src={addCharacterIconUri} alt="Add Character" className="h-20 w-20 text-gray-400" />
                    <span className="mt-2 text-lg font-semibold text-gray-400">Create New</span>
                </button>
            </div>
        </div>
    );
};

// --- Audio Visualizer Component ---
const AudioVisualizer = ({ analyser, isBotSpeaking }) => {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.log('AudioVisualizer: Canvas ref is null. Not drawing.');
            return;
        }
        if (!analyser) {
            console.log('AudioVisualizer: Analyser prop is null. Cannot draw.');
            return;
        }

        const canvasCtx = canvas.getContext('2d');
        // Set canvas dimensions to match display size for crisp rendering
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const bufferLength = analyser.fftSize; // Use fftSize for waveform data
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationFrameId.current = requestAnimationFrame(draw);

            analyser.getByteTimeDomainData(dataArray); // Get waveform data

            // Check if audio data is non-zero (i.e., sound is present)
            // 128 is the midpoint for 8-bit unsigned data, meaning silence.
            const hasSound = dataArray.some(value => value !== 128);

            canvasCtx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
            canvasCtx.fillStyle = 'rgba(0, 0, 0, 0)'; // Transparent background
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            canvasCtx.lineWidth = 2;
            // Change color based on who is speaking, or grey if no sound detected
            canvasCtx.strokeStyle = hasSound
                                    ? (isBotSpeaking ? 'rgb(100, 255, 100)' : 'rgb(50, 150, 255)') // Green for bot, blue for user
                                    : 'rgba(150, 150, 150, 0.5)'; // Greyed out if no sound
            canvasCtx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0; // Normalize to 0-2
                const y = v * canvas.height / 2; // Scale to canvas height

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.lineTo(canvas.width, canvas.height / 2); // Draw to the center line at the end
            canvasCtx.stroke();
        };

        draw();

        // Cleanup function for when component unmounts or dependencies change
        return () => {
            cancelAnimationFrame(animationFrameId.current);
        };
    }, [analyser, isBotSpeaking]); // Re-run effect if analyser or bot speaking state changes

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-24 bg-gray-800 rounded-lg mt-4"
            style={{ border: '1px solid #4A5568' }}
        ></canvas>
    );
};


// --- Voice Call Feature Component ---
const VoiceCallFeature = ({ showMessageBox, closeMessageBox, setMessages, setDetectedEmotion, characterName, wsRef, audioContext, analyserNode, onCallStateChange }) => {
    const [isCalling, setIsCalling] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = []; // No longer a ref, just a local array for simplicity
    const audioSourceRef = useRef(null); // Reference for audio source node
    const scriptProcessorRef = useRef(null); // Reference for ScriptProcessorNode
    const streamRef = useRef(null); // Reference to the MediaStream from getUserMedia

    // Ref to hold the latest isCalling state for cleanup
    const isCallingRef = useRef(isCalling);
    useEffect(() => {
        isCallingRef.current = isCalling; // Keep the ref updated with the latest isCalling state
    }, [isCalling]);

    const endCall = useCallback(() => { // Wrapped in useCallback
        console.log('Attempting to end call...');

        // Stop the original media stream (microphone) tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped media stream track:', track.kind);
            });
            streamRef.current = null; // Clear the reference
        }

        // Stop MediaRecorder if active
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            console.log('MediaRecorder stopped.');
        }
        mediaRecorderRef.current = null; // Always clear the reference

        // Disconnect Web Audio API nodes
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current.onaudioprocess = null; // Clear event handler
            console.log('ScriptProcessorNode disconnected.');
        }
        scriptProcessorRef.current = null; // Always clear the reference

        if (audioSourceRef.current) {
            // Disconnect from the shared analyserNode
            audioSourceRef.current.disconnect(analyserNode);
            audioSourceRef.current.disconnect(); // Disconnect from other nodes too
            console.log('Audio source disconnected.');
        }
        audioSourceRef.current = null; // Always clear the reference

        // Signal backend to flush any remaining buffer, but DO NOT close the WebSocket here.
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send('stop_audio_stream');
            console.log('Sent stop_audio_stream signal.');
        }

        setIsCalling(false); // Update calling state to false
        onCallStateChange(false); // Notify parent ChatPage that call is not active
        console.log('Call ended successfully. isCalling set to false.'); // Added log
        showMessageBox('Call ended.');

        // Add the "Call ended, thank you..." message to the chat history
        setMessages(prevMessages => [...prevMessages, {
            id: Date.now() + '-' + generateUniqueId(), // MODIFICATION: Used generateUniqueId()
            text: `Call ended. Thank you for calling with ${characterName}!`,
            sender: 'bot'
        }]);
    }, [analyserNode, characterName, onCallStateChange, setMessages, showMessageBox, wsRef]); // Removed setIsCalling from dependencies of endCall

    const startCall = async () => {
        // Check if the passed wsRef is valid and open BEFORE proceeding
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            showMessageBox('WebSocket connection not open. Please ensure the server is running and refresh the page.');
            console.error('VoiceCallFeature: WebSocket is not open, cannot start call.');
            return; // Exit if WebSocket is not ready
        }
        if (!audioContext || !analyserNode) {
            showMessageBox('Audio system not initialized. Please try again.');
            console.error('VoiceCallFeature: AudioContext or AnalyserNode not passed.');
            return;
        }

        try {
            // 1. Audio Capture: Get user's microphone stream
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream; // Store the stream in the ref
            showMessageBox('Microphone access granted. Connecting to server...');
            setIsCalling(true);
            onCallStateChange(true); // Notify parent ChatPage that call is active
            console.log('setIsCalling(true) - isCalling now:', true); // Added log

            // Add initial welcome message from bot
            setMessages(prevMessages => [...prevMessages, {
                id: Date.now() + '-' + generateUniqueId(), // MODIFICATION: Used generateUniqueId()
                text: `Hello! I'm ${characterName}. Let's have a voice call!`,
                sender: 'bot'
            }]);

            // Function to send start_audio_stream signal with retry logic
            const sendStartAudioStream = () => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send('start_audio_stream');
                    console.log('Sent start_audio_stream signal.');
                } else {
                    console.warn('WebSocket not open yet, retrying send_start_audio_stream in 500ms...');
                    setTimeout(sendStartAudioStream, 500); // Retry after 500ms
                }
            };
            sendStartAudioStream(); // Initial call to send the signal


            // Initialize Web Audio API for real-time processing
            audioSourceRef.current = audioContext.createMediaStreamSource(stream);

            // Connect microphone source to the shared analyserNode for visualization
            audioSourceRef.current.connect(analyserNode);
            console.log('Microphone stream connected to AnalyserNode.');


            // Create a ScriptProcessorNode to get raw audio data for sending to backend
            // NOTE: ScriptProcessorNode is deprecated. For production, consider AudioWorkletNode.
            scriptProcessorRef.current = audioContext.createScriptProcessor(4096, 1, 1);
            audioSourceRef.current.connect(scriptProcessorRef.current);
            // Connect to destination to keep scriptProcessor active, but actual output is not needed.
            scriptProcessorRef.current.connect(audioContext.destination);

            scriptProcessorRef.current.onaudioprocess = (event) => {
                const inputBuffer = event.inputBuffer;
                const audioData = inputBuffer.getChannelData(0); // Get raw Float32Array data

                // Convert Float32Array to a more efficient transferable format (e.g., Int16Array)
                // The backend expects LINEAR16, so 16-bit PCM is appropriate.
                const pcmData = new Int16Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    // Convert float to 16-bit integer, scaling to the full range
                    pcmData[i] = Math.max(-1, Math.min(1, audioData[i])) * 0x7FFF;
                }

                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(pcmData.buffer); // Corrected: ws.send to wsRef.current.send
                } else {
                    console.warn('WebSocket not open, cannot send audio data.');
                }
            };

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.push(event.data);
                }
            };
            mediaRecorderRef.current.onstop = () => {
                console.log('MediaRecorder stopped.');
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send('stop_audio_stream'); // Signal backend to flush any remaining buffer
                } else {
                    console.warn('WebSocket not open, cannot send stop_audio_stream signal on recorder stop.');
                }
            };

            mediaRecorderRef.current.start(100); // Collect data every 100ms
            console.log("MediaRecorder started."); // Added log

        } catch (error) {
            console.error('Error accessing microphone or setting up WebSocket:', error);
            console.trace('Stack trace for startCall error:'); // Added for better debugging
            showMessageBox(`Failed to start call: ${error.message}. Please allow microphone access and ensure backend server is running.`);
            setIsCalling(false);
            onCallStateChange(false); // Notify parent ChatPage that call is not active
            console.log('setIsCalling(false) - isCalling now (due to error):', false); // Added log
        }
    };

    useEffect(() => {
        console.log("VoiceCallFeature useEffect mounted."); // Changed log message
        // The cleanup function runs when the component unmounts.
        return () => {
            console.log("VoiceCallFeature useEffect cleanup running on unmount."); // Changed log message
            // Perform cleanup actions directly here if streamRef.current is active
            if (streamRef.current) {
                console.log('VoiceCallFeature cleanup: Stopping media stream tracks.');
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                console.log('VoiceCallFeature cleanup: Stopping MediaRecorder.');
                mediaRecorderRef.current.stop();
            }
            mediaRecorderRef.current = null;

            if (scriptProcessorRef.current) {
                console.log('VoiceCallFeature cleanup: Disconnecting ScriptProcessorNode.');
                scriptProcessorRef.current.disconnect();
                scriptProcessorRef.current.onaudioprocess = null;
            }
            scriptProcessorRef.current = null;

            if (audioSourceRef.current) {
                console.log('VoiceCallFeature cleanup: Disconnecting audio source.');
                audioSourceRef.current.disconnect(analyserNode);
                audioSourceRef.current.disconnect();
            }
            audioSourceRef.current = null;

            // Signal backend if WebSocket is still open and call was active when unmounting
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isCallingRef.current) {
                console.log('VoiceCallFeature cleanup: Sending stop_audio_stream signal.');
                wsRef.current.send('stop_audio_stream');
            }
            // Do NOT set isCalling to false here, as this is for unmount.
            // The endCall button handles setting it to false.
            console.log('VoiceCallFeature cleanup finished.');
        };
    }, []); // Empty dependency array: runs only on mount and cleanup on unmount.

    return (
        <div className="flex justify-center items-center space-x-3 mt-auto">
            {!isCalling ? (
                <button
                    onClick={startCall}
                    className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center text-lg font-medium"
                >
                    <img src={startCallIconUri} alt="Start Call" className="h-6 w-6 mr-2" />
                    Start Voice Call
                </button>
            ) : (
                <button
                    onClick={endCall}
                    className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 flex items-center justify-center text-lg font-medium"
                >
                    <img src={endCallIconUri} alt="End Call" className="h-6 w-6 mr-2" />
                    End Voice Call
                </button>
            )}
            {/* Removed the Video Call button */}
        </div>
    );
};

// Global variables for Firebase configuration, provided by the Canvas environment.
// These are checked for existence to ensure the app runs correctly within the environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Corrected: initialAuthToken should be used directly here

// Initialize Firebase App and Firestore outside of the component to prevent re-initialization.
let app;
let db;
let auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase initialization error:", error);
    // Handle the error, e.g., display a message to the user
}

// --- Message Component (for displaying individual chat messages) ---
const Message = ({ message, userAvatar, characterAvatar, characterName }) => { // Added characterName prop
    const isUser = message.sender === 'user';
    const avatar = isUser ? userAvatar : characterAvatar;
    const senderName = isUser ? 'You' : characterName; // Use characterName for bot messages
    const bgColor = isUser ? 'bg-blue-600' : 'bg-gray-700';
    const textColor = 'text-white';

    return (
        <div className={`flex mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}>
            {/* Avatar */}
            <div className="rounded-full overflow-hidden w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-700 border-2 border-gray-600 mx-2">
                <img src={avatar} alt={senderName} className="w-full h-full object-cover" />
            </div>

            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%]`}>
                {/* Sender Name */}
                <p className="font-semibold text-sm mb-1 px-1 text-gray-300">
                    {senderName}
                </p>
                {/* Message Bubble */}
                <div className={`p-3 rounded-lg shadow-md ${bgColor} ${textColor} ${isUser ? 'rounded-br-none' : 'rounded-bl-none'}`}>
                    <p className="text-base">{message.text}</p>
                </div>
            </div>
        </div>
    );
};


// --- Chat Page Component ---
const ChatPage = ({ selectedCharacter, userAvatar, initialMessages, onMessagesChange, closeAppMessageBox }) => { // Added closeAppMessageBox prop
    const [messages, setMessages] = useState(initialMessages); // Initialize with passed messages
    const [detectedEmotion, setDetectedEmotion] = useState('');
    const [messageBoxContent, setMessageBoxContent] = useState('');
    const messagesEndRef = useRef(null);
    const wsRef = useRef(null);

    const audioContextRef = useRef(null);
    const analyserNodeRef = useRef(null);
    const audioQueueRef = useRef([]);
    const audioPlayingRef = useRef(false);
    const [isBotSpeaking, setIsBotSpeaking] = useState(false);
    const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);

    const showMessageBox = (content) => {
        setMessageBoxContent(content);
    };

    const closeMessageBox = () => {
        setMessageBoxContent('');
    };

    const characterName = selectedCharacter ? selectedCharacter.name : 'Character';
    const characterAvatar = selectedCharacter ? selectedCharacter.avatar : null;

    const getAudioContext = useCallback(async () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    const playAudioBuffer = useCallback(async (arrayBuffer) => {
        const audioCtx = await getAudioContext();
        const analyser = analyserNodeRef.current;

        if (!analyser) {
            console.error("AnalyserNode not initialized for playback.");
            return;
        }

        try {
            const decodedAudio = await audioCtx.decodeAudioData(arrayBuffer);
            const source = audioCtx.createBufferSource();
            source.buffer = decodedAudio;
            source.connect(analyser);
            source.connect(audioCtx.destination); // Connect to speakers
            source.start(0);
            source.onended = () => {
                console.log('Audio chunk ended.');
                playNextAudioChunk();
            };
            console.log('Playing audio from server.');
        } catch (error) {
            console.error('Error playing audio from server:', error);
            showMessageBox('Error playing audio from server.');
            playNextAudioChunk();
        }
    }, [getAudioContext, showMessageBox]);

    const playNextAudioChunk = useCallback(() => {
        if (audioQueueRef.current.length > 0) {
            audioPlayingRef.current = true;
            setIsBotSpeaking(true);
            const nextChunk = audioQueueRef.current.shift();
            playAudioBuffer(nextChunk);
        } else {
            audioPlayingRef.current = false;
            setIsBotSpeaking(false);
        }
    }, [playAudioBuffer]);


    useEffect(() => {
        const initAudioSystem = async () => {
            const audioCtx = await getAudioContext();
            if (!analyserNodeRef.current) {
                analyserNodeRef.current = audioCtx.createAnalyser();
                analyserNodeRef.current.fftSize = 2048;
                // analyserNodeRef.current.connect(audioCtx.destination); // No longer connect directly here, source connects to it
                console.log('AnalyserNode initialized.');
            }
        };
        initAudioSystem();

        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            wsRef.current = new WebSocket('ws://localhost:8080/');

            wsRef.current.onopen = () => {
                console.log('WebSocket for text connected.');
            };
            wsRef.current.onerror = (error) => {
                console.error('WebSocket for text error:', error);
                console.error('WebSocket for text error details (ChatPage):', JSON.stringify(error, Object.getOwnPropertyNames(error)));
                showMessageBox('Failed to connect to the server. Please ensure your Node.js server is running on `http://localhost:8080/` and your Python API on `http://localhost:5001/`.');
            };
            wsRef.current.onclose = (event) => {
                console.log('WebSocket for text closed. Code:', event.code, 'Reason:', event.reason);
                setIsBotSpeaking(false);
                setIsVoiceCallActive(false);
                if (event.code !== 1000) {
                    showMessageBox('Server connection lost unexpectedly. Please ensure your Node.js server is running.');
                }
            };

            wsRef.current.onmessage = async event => {
                try {
                    // Log all incoming data for debugging
                    console.log('ChatPage received raw WebSocket data:', event.data);

                    // Attempt to parse as JSON
                    const data = JSON.parse(event.data);
                    console.log('ChatPage received JSON data:', data); // Log parsed JSON data

                    if (data.type === 'message' || data.type === 'transcription') { // Handle both 'message' and 'transcription' types for text
                        // Determine sender based on backend's message structure or content
                        const sender = data.sender || (data.text.startsWith("You:") ? 'user' : 'bot');
                        setMessages(prevMessages => {
                            // MODIFICATION: Use Date.now() + '-' + generateUniqueId() for unique IDs
                            const newMessages = [...prevMessages, { id: Date.now() + '-' + generateUniqueId(), text: data.text, sender: sender }];
                            // MODIFICATION: Call onMessagesChange asynchronously to avoid React warning
                            setTimeout(() => onMessagesChange(newMessages), 0);
                            return newMessages;
                        });
                    } else if (data.type === 'emotion') {
                        setDetectedEmotion(data.value);
                        console.log('Emotion detected:', data.value); // Log emotion detection
                    } else if (data.type === 'error') {
                        showMessageBox(`Server Error: ${data.message}`);
                        setMessages(prevMessages => {
                            // MODIFICATION: Use Date.now() + '-' + generateUniqueId() for unique IDs
                            const newMessages = [...prevMessages, { id: Date.now() + '-' + generateUniqueId(), text: `Server Error: ${data.message}`, sender: 'bot' }];
                            // MODIFICATION: Call onMessagesChange asynchronously to avoid React warning
                            setTimeout(() => onMessagesChange(newMessages), 0);
                            return newMessages;
                        });
                    }
                } catch (e) {
                    // If parsing as JSON fails, it might be an ArrayBuffer (audio data)
                    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                        const arrayBuffer = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
                        audioQueueRef.current.push(arrayBuffer);
                        if (!audioPlayingRef.current) {
                            playNextAudioChunk();
                        }
                    } else {
                        console.warn('ChatPage received unexpected message format (not JSON or audio buffer):', event.data);
                        setMessages(prevMessages => {
                            // MODIFICATION: Use Date.now() + '-' + generateUniqueId() for unique IDs
                            const newMessages = [...prevMessages, { id: Date.now() + '-' + generateUniqueId(), text: `Bot: Received unexpected data.`, sender: 'bot' }];
                            // MODIFICATION: Call onMessagesChange asynchronously to avoid React warning
                            setTimeout(() => onMessagesChange(newMessages), 0);
                            return newMessages;
                        });
                    }
                }
            };
        }

        return () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(e => console.error("Error closing AudioContext on unmount:", e));
                audioContextRef.current = null;
                analyserNodeRef.current = null;
            }
        };
    }, []);

    // Effect to update local messages state when initialMessages prop changes (e.g., when switching chats)
    useEffect(() => {
        setMessages(initialMessages);
        // If initialMessages is empty (new chat), add a welcome message
        if (initialMessages.length === 0 && selectedCharacter) {
            setMessages([{ id: Date.now() + '-' + generateUniqueId(), text: `Hello! I am ${characterName}. How can I help you today?`, sender: 'bot' }]); // MODIFICATION: Used generateUniqueId()
        }
    }, [initialMessages, selectedCharacter, characterName]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="flex flex-col h-full relative overflow-hidden p-4 max-w-4xl mx-auto">

            <div className="flex flex-col items-center justify-center mb-6 pt-16">
                <div className="rounded-full overflow-hidden w-24 h-24 flex items-center justify-center bg-gray-700 border-2 border-gray-600 mb-2">
                    {characterAvatar ? (
                        <img src={characterAvatar} alt={characterName} className="w-full h-full object-cover" />
                    ) : (
                        <img src={createInitialAvatar(characterName)} alt={characterName} className="w-full h-full object-cover" />
                    )}
                </div>
                <h1 className="text-3xl font-bold text-gray-100">{characterName}</h1>
                <p className="text-md text-gray-300">{selectedCharacter ? selectedCharacter.description : 'Your AI companion'}</p>
                <p className="text-sm text-gray-400 mt-1">{selectedCharacter ? selectedCharacter.by : '@EmoticaAI'}</p>
            </div>

            {isVoiceCallActive && analyserNodeRef.current && (
                <AudioVisualizer analyser={analyserNodeRef.current} isBotSpeaking={isBotSpeaking} />
            )}

            <div className="bg-blue-600 text-white px-4 py-2 rounded-lg mb-4 text-center text-lg font-medium">
                Detected Emotion: <span className="font-bold">{detectedEmotion || 'Detecting...'}</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 mb-4 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-gray-700">
                {messages.map((msg) => (
                    <Message
                        key={msg.id}
                        message={msg}
                        userAvatar={userAvatar}
                        characterAvatar={characterAvatar}
                        characterName={characterName}
                    />
                ))}
                {isBotSpeaking && (
                    <div className="flex justify-start">
                        <div className="max-w-[70%] px-4 py-2 rounded-xl shadow-md bg-gray-700 text-gray-100 animate-pulse">
                            <span>Bot is speaking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-0"></div>
            </div>

            <VoiceCallFeature
                showMessageBox={showMessageBox}
                closeMessageBox={closeMessageBox} // Pass local closeMessageBox
                setMessages={setMessages} // Pass local setMessages
                setDetectedEmotion={setDetectedEmotion}
                characterName={characterName}
                wsRef={wsRef}
                audioContext={audioContextRef.current}
                analyserNode={analyserNodeRef.current}
                onCallStateChange={setIsVoiceCallActive}
            />

            <MessageBox message={messageBoxContent} onClose={closeMessageBox} />
        </div>
    );
};

// --- Character Creation Page Component ---
const CharacterCreationPage = ({ navigateTo, onSaveCharacter }) => {
    const [characterName, setCharacterName] = useState('');
    const [characterDescription, setCharacterDescription] = useState('');
    const [characterBy, setCharacterBy] = useState('');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
    const [messageBoxContent, setMessageBoxContent] = useState('');

    const showMessageBox = (content) => setMessageBoxContent(content);
    const closeMessageBox = () => setMessageBoxContent('');

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreviewUrl(URL.createObjectURL(file));
        } else {
            setAvatarFile(null);
            setAvatarPreviewUrl(null);
        }
    };

    const handleSave = (e) => {
        e.preventDefault();
        // MODIFICATION: Changed validation to require characterName only
        if (characterName.trim()) { // Only checking characterName now
            if (avatarFile) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    onSaveCharacter({
                        id: `custom-char-${Date.now()}`,
                        name: characterName,
                        description: characterDescription, // Description will be an empty string if not provided
                        by: characterBy.trim() || `@${characterName.replace(/\s/g, '')}AI`,
                        avatar: reader.result,
                    });
                    showMessageBox('Assistant created successfully! Returning to Home.');
                    setTimeout(() => navigateTo('home'), 1500);
                };
                reader.readAsDataURL(avatarFile);
            } else {
                onSaveCharacter({
                    id: `custom-char-${Date.now()}`,
                    name: characterName,
                    description: characterDescription, // Description will be an empty string if not provided
                    by: characterBy.trim() || `@${characterName.replace(/\s/g, '')}AI`,
                    avatar: createInitialAvatar(characterName),
                });
                showMessageBox('Assistant created successfully! Returning to Home.');
                setTimeout(() => navigateTo('home'), 1500);
            }
        } else {
            // MODIFICATION: Updated error message to reflect only name requirement
            showMessageBox('Please fill in assistant name.');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-100">
            <h2 className="text-4xl font-bold mb-8 text-blue-300">Create New Assistant</h2>
            <form onSubmit={handleSave} className="w-full max-w-sm bg-gray-800 p-8 rounded-xl shadow-lg">
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="characterName">
                        Assistant Name
                    </label>
                    <input
                        type="text"
                        id="characterName"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                        placeholder="e.g., Mood Tracker Bot"
                        value={characterName}
                        onChange={(e) => setCharacterName(e.target.value)}
                        required
                    />
                </div>
                {/* REMOVED: Description field */}
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="characterBy">
                        Created By (@handle)
                    </label>
                    <input
                        type="text"
                        id="characterBy"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                        placeholder="e.g., @YourUserName"
                        value={characterBy}
                        onChange={(e) => setCharacterBy(e.target.value)}
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="avatarUpload">
                        Upload Avatar (Optional)
                    </label>
                    <input
                        type="file"
                        id="avatarUpload"
                        accept="image/*"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        onChange={handleAvatarChange}
                    />
                    {avatarPreviewUrl && (
                        <div className="mt-4 flex flex-col items-center">
                            <p className="text-gray-300 text-sm mb-2">Avatar Preview:</p>
                            <div className="rounded-full overflow-hidden w-24 h-24 flex items-center justify-center border-2 border-gray-600">
                                <img src={avatarPreviewUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between">
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Create Assistant
                    </button>
                    <button
                        type="button"
                        onClick={() => navigateTo('home')}
                        className="text-gray-400 hover:text-gray-100 font-bold focus:outline-none transition duration-200"
                    >
                        Cancel
                    </button>
                </div>
            </form>
            <MessageBox message={messageBoxContent} onClose={closeMessageBox} />
        </div>
    );
};

// --- NEW: Privacy Policy Page Component ---
const PrivacyPolicyPage = ({ navigateTo }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-100 p-4 overflow-y-auto">
            <h2 className="text-4xl font-bold mb-8 text-blue-300 text-center">Privacy Policy</h2>
            <div className="bg-gray-800 p-8 rounded-xl shadow-lg max-w-3xl w-full text-left leading-relaxed">
                <p className="mb-4">
                    This Privacy Policy describes how your personal information is collected, used, and shared when you use the Emotica application.
                </p>
                <h3 className="text-2xl font-semibold mb-3 text-blue-200">1. Information We Collect</h3>
                <p className="mb-2">
                    When you register for an account, we collect your email address and a password. We also store your chosen assistant names and any uploaded avatars.
                </p>
                <p className="mb-4">
                    During voice interactions, audio data is temporarily processed for Speech-to-Text (STT) and Speech Emotion Recognition (SER). If enabled, video data may also be temporarily processed for Facial Emotion Recognition (FER). This audio and video data is not stored permanently on our servers after processing. Transcribed text, detected emotions, and facial expressions may be used to improve AI services.
                </p>
                <h3 className="text-2xl font-semibold mb-3 text-blue-200">2. How We Use Your Information</h3>
                <ul className="list-disc list-inside mb-4 pl-4">
                    <li>To provide and maintain our service, including processing your voice or video commands and generating responses.</li>
                    <li>To improve and personalize AI models for better emotion recognition and natural language understanding.</li>
                    <li>To communicate with you regarding service updates or support.</li>
                    <li>To ensure the security and integrity of our application.</li>
                </ul>
                <h3 className="text-2xl font-semibold mb-3 text-blue-200">3. Data Sharing and Disclosure</h3>
                <p className="mb-4">
                    We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. This does not include trusted third parties who assist us in operating our application, conducting our business, or serving our users, so long as those parties agree to keep this information confidential. We may also release your information when we believe release is appropriate to comply with the law, enforce our site policies, or protect ours or others' rights, property or safety.
                </p>
                <h3 className="text-2xl font-semibold mb-3 text-blue-200">4. Your Consent</h3>
                <p className="mb-4">
                    By registering for an account and using our service, you consent to our Privacy Policy and agree to its terms.
                </p>
                <h3 className="text-2xl font-semibold mb-3 text-blue-200">5. Changes to This Privacy Policy</h3>
                <p className="mb-4">
                    We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
                </p>
                <h3 className="text-2xl font-semibold mb-3 text-blue-200">6. Contact Us</h3>
                <p className="mb-6">
                    If you have any questions about this Privacy Policy, please contact us at support@emotica.com.
                </p>
                <div className="text-center">
                    <button
                        onClick={() => navigateTo('auth')}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Back to Login/Register
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Account Settings Page Component ---
const AccountSettingsPage = ({ navigateTo, userName, userEmail, handleUpdateUser, handleDeleteUser, showMessageBox }) => { // Added handleDeleteUser prop
    const [name, setName] = useState(userName);
    const [email, setEmail] = useState(userEmail);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [currentPasswordVerification, setCurrentPasswordVerification] = useState('');

    // NEW: States for password visibility
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
    const [showCurrentPasswordVerification, setShowCurrentPasswordVerification] = useState(false);

    // State for delete confirmation modal
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');


    // Regex for strong password validation (re-used from AuthPage)
    const strongPasswordRegex = new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})"
    );

    const handleUpdateProfile = (e) => {
        e.preventDefault();

        // Basic validation
        if (!name.trim() || !email.trim() || !currentPasswordVerification.trim()) {
            showMessageBox('Please fill in all required fields (Name, Email, Current Password).');
            return;
        }

        // Email format validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showMessageBox('Please enter a valid email address.');
            return;
        }

        // Password change validation
        if (newPassword) {
            if (newPassword !== confirmNewPassword) {
                showMessageBox('New password and confirm password do not match.');
                return;
            }
            if (!strongPasswordRegex.test(newPassword)) {
                showMessageBox('New password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.');
                return;
            }
        }

        // Call the parent update function
        handleUpdateUser({
            oldEmail: userEmail, // Pass old email to find the user
            newName: name,
            newEmail: email,
            newPassword: newPassword || null, // Pass null if password is not being changed
            currentPassword: currentPasswordVerification
        });

        // Clear password fields after attempt
        setNewPassword('');
        setConfirmNewPassword('');
        setCurrentPasswordVerification('');
    };

    const confirmDelete = () => {
        setShowDeleteConfirm(true);
    };

    const executeDelete = () => {
        if (!deletePassword.trim()) {
            showMessageBox('Please enter your password to confirm deletion.');
            return;
        }
        handleDeleteUser(userEmail, deletePassword);
        setShowDeleteConfirm(false);
        setDeletePassword(''); // Clear password field
    };

    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-100 p-4 overflow-y-auto">
            <h2 className="text-4xl font-bold mb-8 text-blue-300">Account Settings</h2>
            <form onSubmit={handleUpdateProfile} className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-lg">
                <h3 className="text-2xl font-semibold mb-6 text-gray-100">Update Profile</h3>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="name">
                        Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                        placeholder="Your Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="email">
                        Email
                    </label>
                    <input
                        type="email"
                        id="email"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="newPassword">
                        New Password (optional)
                    </label>
                    <div className="relative">
                        <input
                            type={showNewPassword ? 'text' : 'password'}
                            id="newPassword"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 pr-10 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                            placeholder="Leave blank to keep current password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)} // NEW: Toggle visibility
                            className="absolute inset-y-0 right-2 p-2 flex items-center justify-center text-sm leading-5 bg-transparent border-none focus:outline-none hover:bg-gray-700 hover:bg-opacity-20 hover:rounded-full transition-colors duration-200" // Adjusted classes
                            aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                        >
                            <img
                                src={showNewPassword ? eyeOpenIconUri : eyeClosedIconUri} // NEW: Use eye icons
                                alt={showNewPassword ? 'Hide new password' : 'Show new password'}
                                className="h-5 w-5 text-white" // MODIFIED: Changed text-gray-400 to text-white
                            />
                        </button>
                    </div>
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="confirmNewPassword">
                        Confirm New Password
                    </label>
                    <div className="relative">
                        <input
                            type={showConfirmNewPassword ? 'text' : 'password'}
                            id="confirmNewPassword"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 pr-10 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                            className="absolute inset-y-0 right-2 p-2 flex items-center justify-center text-sm leading-5 bg-transparent border-none focus:outline-none hover:bg-gray-700 hover:bg-opacity-20 hover:rounded-full transition-colors duration-200" // Adjusted classes
                            aria-label={showConfirmNewPassword ? 'Hide confirm new password' : 'Show confirm new password'}
                        >
                            <img
                                src={showConfirmNewPassword ? eyeOpenIconUri : eyeClosedIconUri}
                                alt={showConfirmNewPassword ? 'Hide confirm new password' : 'Show confirm new password'}
                                className="h-5 w-5 text-white" // MODIFIED: Changed text-gray-400 to text-white
                            />
                        </button>
                    </div>
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="currentPasswordVerification">
                        Current Password (to confirm changes)
                    </label>
                    <div className="relative">
                        <input
                            type={showCurrentPasswordVerification ? 'text' : 'password'}
                            id="currentPasswordVerification"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 pr-10 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                            value={currentPasswordVerification}
                            onChange={(e) => setCurrentPasswordVerification(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowCurrentPasswordVerification(!showCurrentPasswordVerification)} // NEW: Toggle visibility
                            className="absolute inset-y-0 right-2 p-2 flex items-center justify-center text-sm leading-5 bg-transparent border-none focus:outline-none hover:bg-gray-700 hover:bg-opacity-20 hover:rounded-full transition-colors duration-200" // Adjusted classes
                            aria-label={showCurrentPasswordVerification ? 'Hide current password' : 'Show current password'}
                        >
                            <img
                                src={showCurrentPasswordVerification ? eyeOpenIconUri : eyeClosedIconUri} // NEW: Use eye icons
                                alt={showCurrentPasswordVerification ? 'Hide current password' : 'Show current password'}
                                className="h-5 w-5 text-white" // MODIFIED: Changed text-gray-400 to text-white
                            />
                        </button>
                    </div>
                </div>
                <div className="flex items-center justify-center">
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Update Profile
                    </button>
                </div>
            </form>

            <div className="mt-8 w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-lg border border-red-700">
                <h3 className="text-2xl font-semibold mb-6 text-red-400">Danger Zone</h3>
                <p className="text-gray-300 mb-4">
                    Deleting your account is permanent and cannot be undone. All your data, including chat history, will be removed.
                </p>
                <button
                    onClick={confirmDelete}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 w-full"
                >
                    Delete Account
                </button>
            </div>

            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center z-50">
                    <div className="bg-gray-700 p-6 rounded-lg shadow-xl max-w-sm w-full text-center text-white">
                        <p className="text-lg font-semibold mb-4 text-red-400">Confirm Account Deletion</p>
                        <p className="mb-4">This action cannot be undone. Please enter your current password to confirm.</p>
                        <input
                            type="password"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-800 border-gray-600 placeholder-gray-400 mb-4"
                            placeholder="Your password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            required
                        />
                        <div className="flex justify-around space-x-4">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition duration-200 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDelete}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition duration-200 flex-1"
                            >
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- Auth Page Component (for Login/Register) ---
const AuthPage = ({ navigateTo, setIsLoggedIn, setUserName, setUserAvatar, setUserEmail }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [hasConsented, setHasConsented] = useState(false); // MODIFICATION: New state for consent
    const [messageBoxContent, setMessageBoxContent] = useState('');
    const [showPassword, setShowPassword] = useState(false); // NEW: State for password visibility

    const [registeredUsers, setRegisteredUsers] = useState(() => {
        try {
            const storedUsers = localStorage.getItem('registeredUsers');
            // MODIFICATION: Ensure hasConsented is loaded from storedUsers, default to false if not present
            return storedUsers ? JSON.parse(storedUsers).map(user => ({ ...user, hasConsented: user.hasConsented || false })) : [];
        }
        catch (error) {
            console.error("Failed to parse registered users from localStorage:", error);
            return [];
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('registeredUsers', JSON.stringify(registeredUsers));
        }
        catch (error) {
            console.error("Failed to save registered users to localStorage:", error);
        }
    }, [registeredUsers]);

    const showMessageBox = (content) => setMessageBoxContent(content);
    const closeMessageBox = () => setMessageBoxContent('');

    // MODIFICATION: Strong password validation regex
    const strongPasswordRegex = new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})"
    );

    const handleAuthSubmit = (e) => {
        e.preventDefault();

        if (isLogin) {
            const user = registeredUsers.find(
                (u) => u.email === email && u.password === password
            );

            if (user) {
                const userNameToSet = user.name || email.split('@')[0]; // Use stored name or derive
                const generatedAvatar = createInitialAvatar(userNameToSet);

                showMessageBox('Login successful! Navigating to Home.');
                setTimeout(() => {
                    closeMessageBox();
                    setIsLoggedIn(true);
                    setUserName(userNameToSet);
                    setUserEmail(user.email); // Set user email
                    setUserAvatar(generatedAvatar);
                    navigateTo('home');
                }, 1500);
            } else {
                showMessageBox('Login failed: Invalid email or password. Please register if you don\'t have an account.');
            }
        } else { // Registration logic
            const existingUser = registeredUsers.find((u) => u.email === email);

            if (existingUser) {
                showMessageBox('Registration failed: An account with this email already exists.');
            } else if (!strongPasswordRegex.test(password)) { // MODIFICATION: Validate password strength
                showMessageBox('Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.');
            } else if (!hasConsented) { // MODIFICATION: Validate consent
                showMessageBox('Please agree to the privacy policy and data usage to register.');
            }
            else {
                showMessageBox('Attempting to register...');
                const userNameToStore = email.split('@')[0]; // Initial name from email
                const generatedAvatar = createInitialAvatar(userNameToStore);
                // MODIFICATION: Store hasConsented and initial name with the new user
                const newUser = { email, password, avatar: generatedAvatar, hasConsented, name: userNameToStore };
                setRegisteredUsers((prevUsers) => [...prevUsers, newUser]);
                closeMessageBox();
                showMessageBox('Registration successful! Please log in.');
                setIsLogin(true);
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-100">
            <h2 className="text-4xl font-bold mb-8 text-blue-300">
                {isLogin ? 'Login' : 'Register'}
            </h2>
            <form onSubmit={handleAuthSubmit} className="w-full max-w-sm bg-gray-800 p-8 rounded-xl shadow-lg">
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="email">
                        Email
                    </label>
                    <input
                        type="email"
                        id="email"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="password">
                        Password
                    </label>
                    <div className="relative"> {/* NEW: Wrap input and button in a relative container */}
                        <input
                            type={showPassword ? 'text' : 'password'} /* NEW: Toggle type */
                            id="password"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 pr-10 text-gray-100 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-600 placeholder-gray-400"
                            placeholder="********"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)} // NEW: Toggle visibility
                            className="absolute inset-y-0 right-2 p-2 flex items-center justify-center text-sm leading-5 bg-transparent border-none focus:outline-none hover:bg-gray-700 hover:bg-opacity-20 hover:rounded-full transition-colors duration-200" // Adjusted classes
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            <img
                                src={showPassword ? eyeOpenIconUri : eyeClosedIconUri} // NEW: Use eye icons
                                alt={showPassword ? 'Hide password' : 'Show password'}
                                className="h-5 w-5 text-white" // MODIFIED: Changed text-gray-400 to text-white
                            />
                        </button>
                    </div>
                </div>
                {/* MODIFICATION: Privacy Consent Checkbox (only for registration) */}
                {!isLogin && (
                    <div className="mb-6 flex items-start">
                        <input
                            type="checkbox"
                            id="consent"
                            className="mr-2 mt-1 h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            checked={hasConsented}
                            onChange={(e) => setHasConsented(e.target.checked)}
                            required // Make consent mandatory for registration
                        />
                        <label htmlFor="consent" className="text-gray-300 text-sm">
                            I agree to the <span
                                onClick={() => navigateTo('privacy-policy')} // MODIFICATION: Make text clickable
                                className="text-blue-300 hover:underline cursor-pointer"
                            >Privacy Policy</span> and consent to data usage for improving AI services.
                        </label>
                    </div>
                )}
                <div className="flex items-center justify-between mb-4">
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        {isLogin ? 'Login' : 'Register'}
                    </button>
                </div>
                <p className="text-center text-sm text-gray-300">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                    <button
                        type="button"
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-blue-300 hover:text-blue-200 font-bold focus:outline-none"
                    >
                        {isLogin ? 'Register here' : 'Login here'}
                    </button>
                </p>
            </form>
            <MessageBox message={messageBoxContent} onClose={closeMessageBox} />
        </div>
    );
};


// --- Main App Component (Controls page routing and character state) ---
const App = () => {
    const [currentPage, setCurrentPage] = useState('auth'); // Start at auth page
    const [customCharacters, setCustomCharacters] = useState([]); // State for user-created characters
    const [isLoggedIn, setIsLoggedIn] = useState(false); // New state for login status
    const [userName, setUserName] = useState(''); // New state for user name
    const [userEmail, setUserEmail] = useState(''); // New state for user email
    const [userAvatar, setUserAvatar] = useState(null); // New state for user's own avatar
    const [activeCharacter, setActiveCharacter] = useState(null); // State to hold the active character object
    const [isHistoryOpen, setIsHistoryOpen] = useState(false); // State to control history sidebar visibility
    // chatHistory now stores full messages array for each chat
    const [chatHistory, setChatHistory] = useState([]);
    // New state to hold messages of the currently active chat
    const [currentChatMessages, setCurrentChatMessages] = useState([]);
    const [chatSessionKey, setChatSessionKey] = useState(0); // New state to force ChatPage re-mount

    const [appMessageBoxContent, setAppMessageBoxContent] = useState('');
    const showAppMessageBox = (content) => setAppMessageBoxContent(content);
    const closeAppMessageBox = () => setAppMessageBoxContent('');

    // Define defaultCharacters here to avoid duplication
    const defaultCharacters = [
        { id: 'char1', name: 'Anya', description: 'Your bubbly companion for daily chats.', by: '@AnyaAI',
            avatar: createIconSvgDataUri(genericPersonIconPath, '#FBCFE8', 100, 100),
        },
        { id: 'char2', name: 'Zoltan', description: 'A wise old sage with stories to tell.', by: '@ZoltanLore',
            avatar: createIconSvgDataUri(genericPersonIconPath, '#A7F3D0', 100, 100),
        },
        { id: 'char3', name: 'Nova', description: 'Your personal fitness and well-being coach.', by: '@NovaFit',
            avatar: createIconSvgDataUri(genericPersonIconPath, '#FDE68A', 100, 100),
        },
        { id: 'char4', name: 'Cypher', description: 'A cryptic AI, speaks in riddles and code.', by: '@CypherCode',
            avatar: createIconSvgDataUri(genericPersonIconPath, '#C7D2FE', 100, 100),
        },
    ];

    // Firebase Authentication and User ID setup - Kept for potential future use/context, though local storage handles user data
    useEffect(() => {
        if (!auth) {
            console.error("Firebase Auth is not initialized.");
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // userId is set for Firebase context, but isLoggedIn and user details are managed by AuthPage
                // setUserId(user.uid); // Not directly used for local storage auth flow
                // setIsAuthReady(true); // Not directly used for local storage auth flow
                console.log("Firebase Auth state changed. User:", user.uid);
            } else {
                try {
                    await signInAnonymously(auth);
                    console.log("Signed in anonymously via Firebase.");
                } catch (error) {
                    console.error("Firebase anonymous sign-in failed:", error);
                }
            }
        });

        // Attempt to sign in with custom token if available (from Canvas environment)
        const signInWithToken = async () => {
            if (initialAuthToken) {
                try {
                    await signInWithCustomToken(auth, initialAuthToken);
                    console.log("Signed in with custom token via Firebase.");
                } catch (error) {
                    console.error("Firebase custom token sign-in failed:", error);
                    try {
                        await signInAnonymously(auth);
                    } catch (anonError) {
                        console.error("Firebase anonymous sign-in fallback failed:", anonError);
                    }
                }
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (anonError) {
                    console.error("Firebase anonymous sign-in failed:", anonError);
                }
            }
        };

        signInWithToken();

        return () => unsubscribe(); // Cleanup auth listener
    }, []); // Empty dependency array means this runs once on mount


    // Callback function to update messages for the active chat in chatHistory
    const handleMessagesChange = useCallback((newMessages) => {
        if (activeCharacter) {
            setChatHistory(prevChatHistory => {
                const updatedHistory = prevChatHistory.map(chat => {
                    if (chat.id === activeCharacter.id) {
                        return { ...chat, messages: newMessages, timestamp: new Date() };
                    }
                    return chat;
                });

                // If the active character's chat wasn't found (e.g., new chat just started), add it
                if (!updatedHistory.some(chat => chat.id === activeCharacter.id)) {
                    return [{
                        id: activeCharacter.id,
                        characterName: activeCharacter.name,
                        avatar: activeCharacter.avatar,
                        messages: newMessages,
                        timestamp: new Date()
                    }, ...updatedHistory];
                }
                return updatedHistory;
            });
            setCurrentChatMessages(newMessages); // Also update the current chat messages state
        }
    }, [activeCharacter]);


    // Effect to manage chat history state based on selectedCharacter
    useEffect(() => {
        if (activeCharacter) {
            setChatHistory(prevChatHistory => {
                const existingChat = prevChatHistory.find(chat => chat.id === activeCharacter.id);

                let newChatEntry;
                if (existingChat) {
                    newChatEntry = { ...existingChat, timestamp: new Date() };
                    setCurrentChatMessages(existingChat.messages); // Load existing messages
                } else {
                    // New chat, initialize with a welcome message
                    const initialMessagesForNewChat = [
                        { id: Date.now() + '-' + generateUniqueId(), text: `Hello! I am ${activeCharacter.name}. How can I help you today?`, sender: 'bot' } // MODIFICATION: Used generateUniqueId()
                    ];
                    newChatEntry = {
                        id: activeCharacter.id,
                        characterName: activeCharacter.name,
                        avatar: activeCharacter.avatar,
                        messages: initialMessagesForNewChat,
                        timestamp: new Date()
                    };
                    setCurrentChatMessages(initialMessagesForNewChat); // Set initial messages for new chat
                }
                // Move the current chat to the top of the history
                return [newChatEntry, ...prevChatHistory.filter(chat => chat.id !== activeCharacter.id)];
            });
        } else {
            // If no active character (e.g., on Home page), clear current messages
            setCurrentChatMessages([]);
        }
    }, [activeCharacter]);

    // Function to navigate between pages
    const navigateTo = (page, character = null) => {
        setCurrentPage(page);
        setActiveCharacter(character);
        setIsHistoryOpen(false); // Close history sidebar on page navigation
        // Reset chatSessionKey only if it's a new character or not a chat page
        // This ensures ChatPage remounts and gets fresh initialMessages
        if (character !== activeCharacter || page !== 'chat') {
            setChatSessionKey(prevKey => prevKey + 1);
        }
    };

    // Function to add a new character to the list
    const handleSaveNewCharacter = (newCharacter) => {
        setCustomCharacters((prevChars) => [...prevChars, newCharacter]);
    };

    // Function to handle logout
    const handleLogout = () => {
        setIsLoggedIn(false);
        setUserName('');
        setUserEmail(''); // Clear user email on logout
        setUserAvatar(null);
        setCurrentChatMessages([]); // Clear current messages on logout
        setChatHistory([]); // Clear chat history on logout
        navigateTo('home');
    };

    // Function to update user profile (name, email, password)
    const handleUpdateUser = ({ oldEmail, newName, newEmail, newPassword, currentPassword }) => {
        const storedUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
        let updatedUsers = [...storedUsers];
        let userFoundAndUpdated = false;

        updatedUsers = updatedUsers.map(user => {
            if (user.email === oldEmail) {
                // Verify current password
                if (user.password !== currentPassword) {
                    showAppMessageBox('Update failed: Incorrect current password.');
                    console.error('Update failed: Incorrect current password for', oldEmail);
                    return user; // Return original user if password doesn't match
                }

                // Check if new email already exists and is different from old email
                if (newEmail !== oldEmail && storedUsers.some(u => u.email === newEmail)) {
                    showAppMessageBox('Update failed: Email already in use by another account.');
                    console.error('Update failed: New email', newEmail, 'already in use.');
                    return user;
                }

                userFoundAndUpdated = true;
                return {
                    ...user,
                    name: newName,
                    email: newEmail,
                    password: newPassword || user.password, // Update password only if newPassword is provided
                    avatar: createInitialAvatar(newName) // Re-generate avatar based on new name
                };
            }
            return user;
        });

        if (userFoundAndUpdated) {
            localStorage.setItem('registeredUsers', JSON.stringify(updatedUsers));
            // Update App's main states
            setUserName(newName);
            setUserEmail(newEmail);
            setUserAvatar(createInitialAvatar(newName)); // Update avatar in App state
            showAppMessageBox('Profile updated successfully!');
            console.log('Profile for', newEmail, 'updated successfully.');
        } else {
            // This case should ideally not be hit if oldEmail matches an existing user
            // but is a fallback for unexpected scenarios.
            showAppMessageBox('Update failed: User not found or internal error.');
            console.error('Update failed: User with old email', oldEmail, 'not found or internal error.');
        }
    };

    // NEW: Function to handle user account deletion
    const handleDeleteUser = (emailToDelete, passwordToVerify) => {
        const storedUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
        const userToDelete = storedUsers.find(user => user.email === emailToDelete);

        if (!userToDelete) {
            showAppMessageBox('Account deletion failed: User not found.');
            console.error('Account deletion failed: User not found for email:', emailToDelete);
            return;
        }

        if (userToDelete.password !== passwordToVerify) {
            showAppMessageBox('Account deletion failed: Incorrect password.');
            console.error('Account deletion failed: Incorrect password for email:', emailToDelete);
            return;
        }

        const updatedUsers = storedUsers.filter(user => user.email !== emailToDelete);
        localStorage.setItem('registeredUsers', JSON.stringify(updatedUsers));

        showAppMessageBox('Account deleted successfully. You have been logged out.');
        console.log('Account for', emailToDelete, 'deleted successfully.');
        handleLogout(); // Log out the user after deletion
    };

    // Function to handle history item click
    const handleHistoryItemClick = (chatId) => {
        const allCharacters = [...defaultCharacters, ...customCharacters]; // Use the single source of truth
        const selectedChatCharacter = allCharacters.find(char => char.id === chatId);
        if (selectedChatCharacter) {
            // When clicking a history item, navigate to chat and set the active character
            navigateTo('chat', selectedChatCharacter);
        } else {
            showAppMessageBox(`Chat history for character ID: ${chatId} (Character not found).`);
            console.warn(`Chat history for character ID: ${chatId} (Character not found).`);
        }
    };

    // New function to handle "New Chat" button in sidebar
    const handleNewChatSidebar = () => {
        // If there's an active character, reset its session while keeping the character selected
        if (activeCharacter) {
            const initialMessagesForReset = [
                { id: Date.now() + '-' + generateUniqueId(), text: `Hello! I am ${activeCharacter.name}. How can I help you today?`, sender: 'bot' } // MODIFICATION: Used generateUniqueId()
            ];
            setCurrentChatMessages(initialMessagesForReset); // Clear current messages for the active character

            setChatHistory(prevChatHistory => {
                return prevChatHistory.map(chat => {
                    if (chat.id === activeCharacter.id) {
                        return { ...chat, messages: initialMessagesForReset, timestamp: new Date() };
                    }
                    return chat;
                });
            });
            setChatSessionKey(prevKey => prevKey + 1); // Force ChatPage remount
            setCurrentPage('chat'); // Ensure we are on the chat page
        } else {
            // If no character is active, act as a truly new chat (which defaults to generic "Character")
            setActiveCharacter(null); // This will cause ChatPage to use its default character logic
            setCurrentChatMessages([]); // Ensure messages are cleared
            setChatSessionKey(prevKey => prevKey + 1); // Force ChatPage remount
            setCurrentPage('chat'); // Navigate to chat page
        }
        setIsHistoryOpen(false); // Always close the sidebar after clicking "New Chat"
    };

    // Render content based on the currentPage state
    const renderPage = () => {
        switch (currentPage) {
            case 'home':
                return <HomePage navigateTo={navigateTo} characters={customCharacters} defaultCharacters={defaultCharacters} />; // Pass defaultCharacters
            case 'chat':
                return (
                    <ChatPage
                        key={chatSessionKey} // Key ensures remount when character changes
                        selectedCharacter={activeCharacter}
                        userAvatar={userAvatar}
                        initialMessages={currentChatMessages} // Pass current messages
                        onMessagesChange={handleMessagesChange} // Pass callback to update App's state
                        closeAppMessageBox={closeAppMessageBox} // Pass closeAppMessageBox to ChatPage
                    />
                );
            case 'auth':
                return <AuthPage navigateTo={navigateTo} setIsLoggedIn={setIsLoggedIn} setUserName={setUserName} setUserAvatar={setUserAvatar} setUserEmail={setUserEmail} />;
            case 'create-character':
                return <CharacterCreationPage navigateTo={navigateTo} onSaveCharacter={handleSaveNewCharacter} showMessageBox={showAppMessageBox} />;
            case 'privacy-policy': // MODIFICATION: New case for Privacy Policy page
                return <PrivacyPolicyPage navigateTo={navigateTo} />;
            case 'account-settings': // NEW: Account Settings page
                return (
                    <AccountSettingsPage
                        navigateTo={navigateTo}
                        userName={userName}
                        userEmail={userEmail}
                        handleUpdateUser={handleUpdateUser}
                        handleDeleteUser={handleDeleteUser} // Pass the new delete function
                        showMessageBox={showAppMessageBox} // Pass app-level message box
                    />
                );
            default:
                return <HomePage navigateTo={navigateTo} characters={customCharacters} defaultCharacters={defaultCharacters} />; // Pass defaultCharacters
        }
    };

    return (
        <div className="min-h-screen w-screen bg-gray-950 flex flex-col font-inter">
            <div className="fixed top-0 left-0 w-full bg-gray-900 z-50 px-6 py-4 flex justify-between items-center border-b border-gray-700">
                {isLoggedIn && ( // Only show hamburger menu if logged in
                    <button
                        onClick={() => setIsHistoryOpen(!isHistoryOpen)} // Re-added toggle button
                        className="p-2 rounded-full bg-gray-700 text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {isHistoryOpen ? (
                            <img src={leftArrowIconUri} alt="Close Sidebar" className="h-6 w-6 text-gray-100" />
                        ) : (
                            <img src={hamburgerIconUri} alt="Open Sidebar" className="h-6 w-6 text-gray-100" />
                        )}
                    </button>
                )}

                <button
                    onClick={() => { navigateTo('home'); setIsHistoryOpen(false); }} // Set isHistoryOpen to false on home navigation
                    className="group focus:outline-none bg-transparent p-0"
                    aria-label="Go to Home"
                >
                    <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-300 to-purple-400 text-transparent bg-clip-text
                                 group-hover:from-blue-200 group-hover:to-purple-300 transition-all duration-200">
                        Emotica
                    </h1>
                </button>

                <div className="flex items-center space-x-3">
                    {isLoggedIn ? (
                        <>
                            {userAvatar && (
                                <div className="rounded-full overflow-hidden w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-700 border border-gray-600">
                                    <img src={userAvatar} alt="User Avatar" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <span className="text-gray-300 text-lg font-medium">Hello, {userName}!</span>
                            <button
                                onClick={() => navigateTo('account-settings')} // NEW: Account Settings button
                                className="bg-gray-700 hover:bg-gray-600 text-gray-100 px-4 py-2 rounded-md transition duration-200"
                            >
                                Settings
                            </button>
                            <button
                                onClick={handleLogout}
                                className="bg-gray-700 hover:bg-gray-600 text-gray-100 px-4 py-2 rounded-md transition duration-200"
                            >
                                Logout
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => navigateTo('auth')}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200"
                        >
                            Login / Register
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-1 relative overflow-hidden pt-20">
                {/* Re-added sidebar toggle logic */}
                {isLoggedIn && ( // Only show sidebar if logged in
                    <div className={`
                        fixed inset-y-0 left-0 w-64 bg-gray-800 p-4 flex-col z-60
                        transform transition-transform duration-300 ease-in-out
                        ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'}
                        ${isHistoryOpen ? 'flex' : 'hidden'}
                        pt-20
                        `}>
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pt-4">
                            <h3 className="text-xl font-bold text-gray-100 mb-4">Recent Chats</h3>
                            <button
                                onClick={handleNewChatSidebar}
                                className="w-full flex items-center justify-center py-3 px-4 mb-4 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-200 ease-in-out transform hover:scale-105"
                            >
                                <img src={newChatIconUri} alt="New Chat" className="h-5 w-5 mr-2" />
                                New Chat
                            </button>

                            {chatHistory.length > 0 ? (
                                chatHistory.map((chat) => (
                                    <button
                                        key={chat.id}
                                        onClick={() => handleHistoryItemClick(chat.id)}
                                        className="w-full flex flex-col items-start text-left text-gray-400 mb-3 p-3 rounded-lg bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-150 group"
                                    >
                                        <div className="flex items-center w-full"> {/* Flex container for avatar and name */}
                                            {/* Avatar for chat history item */}
                                            <div className="rounded-full overflow-hidden w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-600 border border-gray-500 mr-3">
                                                {chat.avatar ? (
                                                    <img src={chat.avatar} alt={chat.characterName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={createInitialAvatar(chat.characterName)} alt={chat.characterName} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <p className="font-semibold text-gray-100 group-hover:text-blue-300 transition-colors duration-150 text-lg truncate flex-1"> {/* Added flex-1 to truncate */}
                                                {chat.characterName} {/* Headline of the chat */}
                                            </p>
                                        </div>
                                        {/* Display the last message snippet with timestamp below */}
                                        {chat.messages && chat.messages.length > 0 && (
                                            <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-150 truncate mt-1 w-full pl-11"> {/* Adjusted padding */}
                                                {chat.messages[chat.messages.length - 1].text}
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors duration-150 mt-1 w-full pl-11"> {/* Adjusted padding */}
                                            {chat.timestamp.toLocaleString()} {/* Display full date and time */}
                                        </p>
                                    </button>
                                ))
                            ) : (
                                <div className="text-gray-500 text-sm mt-4 text-center">No recent chats. Start a conversation!</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Card (content area) - now takes full width when sidebar is closed */}
                <div className={`bg-gray-900 rounded-xl shadow-2xl p-6 w-full flex-1 flex flex-col
                                 transition-all duration-300 ease-in-out
                                 ${isLoggedIn && isHistoryOpen ? 'ml-64' : 'ml-0'}`}> {/* Adjusted ml-0 when not logged in */}
                    {renderPage()}
                </div>
            </div>
            <MessageBox message={appMessageBoxContent} onClose={closeAppMessageBox} /> {/* App-level MessageBox */}
        </div>
    );
};

// Export the main App component as default
export default App;
