import { useState, useRef } from "react";
import { parseCommand } from "../utils/commandParser";
  const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
export function useVoiceAssistant() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Tap the mic to talk');
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [stopSignal, setStopSignal] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const historyRef = useRef([]);

  const sanitizeForSpeech = (text) =>
    text.replace(/\*\*/g, "").replace(/[*_#`>]/g, "").replace(/\n+/g, " ").trim();

  const stopSpeaking = () => {
    setStopSignal((s) => s + 1);
  };

  const speak = async (text) => {
    const clean = sanitizeForSpeech(text);
    if (!clean) return;
    const isGujarati = /[\u0A80-\u0AFF]/.test(clean);
    const isDevanagari = /[\u0900-\u097F]/.test(clean);
    const lang = isGujarati ? "gu" : isDevanagari ? "hi" : "en";
    try {
      const res = await fetch("http://localhost:8000/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, lang }),
      });
      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
    } catch (err) {
      console.error("TTS failed", err);
    }
  };

  const startRecording = async () => {
    stopSpeaking();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    chunksRef.current = [];
    mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      setStatus("Thinking...");
      const formData = new FormData();
      formData.append("file", audioBlob, "voice.webm");

      try {
        const transcribeRes = await fetch("http://localhost:8000/transcribe", {
          method: "POST",
          body: formData,
        });
        const { transcript: text } = await transcribeRes.json();

        if (!text || !text.trim()) {
          setStatus('Kuch sunayi nahi diya, dobara try karo');
          return;
        }

        setTranscript(text);
        const command = parseCommand(text);
        let finalReply = "";

        if (command.type === "add_contact") {
          const res = await fetch("http://localhost:8000/add_contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: command.payload.name, number: command.payload.number }),
          });
          finalReply = (await res.json()).message;
        } else if (command.type === "whatsapp") {
          const res = await fetch("http://localhost:8000/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contact: command.payload.contact, message: command.payload.message }),
          });
          finalReply = (await res.json()).message;
        } else if (command.type === "youtube") {
          const res = await fetch("http://localhost:8000/youtube", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: command.payload }),
          });
          finalReply = (await res.json()).message;
        } else if (command.type === "app") {
          const res = await fetch("http://localhost:8000/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app: command.payload }),
          });
          finalReply = (await res.json()).message;
        } else if (command.type === "weather") {
          const res = await fetch("http://localhost:8000/weather", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city: command.payload }),
          });
          finalReply = (await res.json()).message;
        } else if (command.type === "info") {
          finalReply = command.payload;
        } else {
          const res = await fetch("http://localhost:8000/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, history: historyRef.current.slice(-12) }),
          });
          finalReply = (await res.json()).reply;
          historyRef.current.push({ role: "user", content: text });
          historyRef.current.push({ role: "assistant", content: finalReply });
        }

        setReply(finalReply);
        setStatus('Tap the mic to talk');
        speak(finalReply);
      } catch (err) {
        setStatus("Backend se connect nahi ho paya");
      }
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setRecording(true);
    setStatus("Listening...");

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") await audioContext.resume();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const recordingStartTime = Date.now();
    let silenceStart = null;
    let hasSpoken = false;
    const SPEECH_RMS_THRESHOLD = 0.035;
    const SILENCE_RMS_THRESHOLD = 0.02;
    const SILENCE_DURATION = 800;
    const MAX_RECORDING_MS = 8000;
    const WARMUP_MS = 300;

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
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
      const elapsed = Date.now() - recordingStartTime;
      if (elapsed > MAX_RECORDING_MS) {
        stopRecording();
        return;
      }
      if (elapsed > WARMUP_MS) {
        const rms = getRMS();
        if (rms > SPEECH_RMS_THRESHOLD) {
          hasSpoken = true;
          silenceStart = null;
        } else if (hasSpoken && rms < SILENCE_RMS_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > SILENCE_DURATION) {
            stopRecording();
            return;
          }
        }
      }
      requestAnimationFrame(checkSilence);
    };
    requestAnimationFrame(checkSilence);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

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