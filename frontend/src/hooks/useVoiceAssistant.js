
import { useState, useRef, useCallback } from "react";
import { parseCommand } from "../utils/commandParser";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

export function useVoiceAssistant() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Tap the mic to talk");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [stopSignal, setStopSignal] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const historyRef = useRef([]);
  const silenceFrameRef = useRef(null);
  const streamRef = useRef(null);

  const sanitizeForSpeech = (text) =>
    String(text || "")
      .replace(/[*_#>]/g, "")
      .replace(/\n+/g, " ")
      .trim();

  const stopSpeaking = useCallback(() => {
    setStopSignal((value) => value + 1);
  }, []);

  const cleanupRecording = useCallback(async () => {
    if (silenceFrameRef.current !== null) {
      cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (error) {
        console.warn("AudioContext cleanup warning:", error);
      }
      audioContextRef.current = null;
    }
  }, []);

  const speak = useCallback(async (text) => {
    const clean = sanitizeForSpeech(text);
    if (!clean) return;

    const isGujarati = /[\u0A80-\u0AFF]/.test(clean);
    const isDevanagari = /[\u0900-\u097F]/.test(clean);
    const lang = isGujarati ? "gu" : isDevanagari ? "hi" : "en";

    try {
      const response = await fetch(`${API_BASE}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, lang }),
      });

      if (!response.ok) {
        throw new Error(`Speech request failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);

      setAudioUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return url;
      });
    } catch (error) {
      console.error("TTS failed:", error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (silenceFrameRef.current !== null) {
      cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }

    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state === "recording") {
      recorder.stop();
    } else {
      setRecording(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "recording") return;

    try {
      stopSpeaking();
      setTranscript("");
      setReply("");
      setStatus("Requesting microphone...");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone is not supported by this browser.");
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Audio recording is not supported by this browser.");
      }

      await cleanupRecording();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const supportedMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType = supportedMimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setStatus("Recording failed. Please try again.");
        setRecording(false);
      };

      recorder.onstop = async () => {
        setRecording(false);
        await cleanupRecording();

        const actualMimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, {
          type: actualMimeType,
        });

        if (!audioBlob.size) {
          setStatus("Kuch sunayi nahi diya, dobara try karo");
          return;
        }

        const extension = actualMimeType.includes("mp4")
          ? "mp4"
          : actualMimeType.includes("ogg")
          ? "ogg"
          : actualMimeType.includes("wav")
          ? "wav"
          : "webm";

        setStatus("Transcribing audio...");

        const formData = new FormData();
        formData.append("file", audioBlob, `voice.${extension}`);

        try {
          const transcribeResponse = await fetch(
            `${API_BASE}/transcribe`,
            {
              method: "POST",
              body: formData,
            }
          );

          if (!transcribeResponse.ok) {
            const errorText = await transcribeResponse.text();
            console.error(
              "Transcription request failed:",
              transcribeResponse.status,
              errorText
            );
            throw new Error(
              `Transcription failed: ${transcribeResponse.status}`
            );
          }

          const transcriptionData = await transcribeResponse.json();
          const spokenText = transcriptionData.transcript?.trim();

          if (!spokenText) {
            setStatus("Kuch sunayi nahi diya, dobara try karo");
            return;
          }

          setTranscript(spokenText);
          setStatus("Processing your message...");

          const command = parseCommand(spokenText);
          let finalReply = "";

          if (command.type === "add_contact") {
            const response = await fetch(`${API_BASE}/add_contact`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: command.payload.name,
                number: command.payload.number,
              }),
            });

            if (!response.ok) {
              throw new Error("Add contact request failed");
            }

            finalReply = (await response.json()).message;
          } else if (command.type === "whatsapp") {
            const response = await fetch(`${API_BASE}/whatsapp`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contact: command.payload.contact,
                message: command.payload.message,
              }),
            });

            if (!response.ok) {
              throw new Error("WhatsApp request failed");
            }

            finalReply = (await response.json()).message;
          } else if (command.type === "youtube") {
            const response = await fetch(`${API_BASE}/youtube`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: command.payload }),
            });

            if (!response.ok) {
              throw new Error("YouTube request failed");
            }

            finalReply = (await response.json()).message;
          } else if (command.type === "app") {
            const response = await fetch(`${API_BASE}/action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ app: command.payload }),
            });

            if (!response.ok) {
              throw new Error("App action request failed");
            }

            finalReply = (await response.json()).message;
          } else if (command.type === "weather") {
            const response = await fetch(`${API_BASE}/weather`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ city: command.payload }),
            });

            if (!response.ok) {
              throw new Error("Weather request failed");
            }

            finalReply = (await response.json()).message;
          } else if (command.type === "info") {
            finalReply = command.payload;
          } else {
            const response = await fetch(`${API_BASE}/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: spokenText,
                history: historyRef.current.slice(-12),
              }),
            });

            if (!response.ok) {
              throw new Error("Chat request failed");
            }

            const chatData = await response.json();
            finalReply =
              chatData.reply || "Sorry, I couldn't generate an answer.";

            historyRef.current.push(
              { role: "user", content: spokenText },
              { role: "assistant", content: finalReply }
            );

            historyRef.current = historyRef.current.slice(-20);
          }

          finalReply = String(finalReply || "Request completed.");
          setReply(finalReply);
          setStatus("Tap the mic to talk");
          await speak(finalReply);
        } catch (error) {
          console.error("MILO request failed:", error);
          setStatus("Backend se connect nahi ho paya");
        }
      };

      recorder.start();
      setRecording(true);
      setStatus("Listening...");

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        // Recording still works; user can stop it manually.
        return;
      }

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      const recordingStartTime = Date.now();

      let silenceStart = null;
      let hasSpoken = false;

      const SPEECH_RMS_THRESHOLD = 0.015;
      const SILENCE_RMS_THRESHOLD = 0.008;
      const SILENCE_DURATION = 1200;
      const MAX_RECORDING_MS = 10000;
      const WARMUP_MS = 500;

      const getRMS = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;

        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        return Math.sqrt(sumSquares / bufferLength);
      };

      const checkSilence = () => {
        if (
          !mediaRecorderRef.current ||
          mediaRecorderRef.current.state !== "recording"
        ) {
          silenceFrameRef.current = null;
          return;
        }

        const elapsed = Date.now() - recordingStartTime;

        if (elapsed >= MAX_RECORDING_MS) {
          stopRecording();
          return;
        }

        if (elapsed >= WARMUP_MS) {
          const rms = getRMS();

          if (rms > SPEECH_RMS_THRESHOLD) {
            hasSpoken = true;
            silenceStart = null;
          } else if (hasSpoken && rms < SILENCE_RMS_THRESHOLD) {
            if (silenceStart === null) {
              silenceStart = Date.now();
            } else if (Date.now() - silenceStart >= SILENCE_DURATION) {
              stopRecording();
              return;
            }
          }
        }

        silenceFrameRef.current = requestAnimationFrame(checkSilence);
      };

      silenceFrameRef.current = requestAnimationFrame(checkSilence);
    } catch (error) {
      console.error("Microphone start failed:", error);
      await cleanupRecording();
      setRecording(false);
      setStatus(
        "Mic start nahi hua. Permission check karke dobara try karo."
      );
    }
  }, [cleanupRecording, speak, stopRecording, stopSpeaking]);

  return {
    recording,
    status,
    transcript,
    reply,
    audioUrl,
    stopSignal,
    isSpeaking,
    setIsSpeaking,
    startRecording,
    stopRecording,
  };
}
