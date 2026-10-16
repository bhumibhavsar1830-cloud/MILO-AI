import { useState, useRef } from "react";
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


  const sanitizeForSpeech = (text) =>
    String(text || "")
      .replace(/[*_#>]/g, "")
      .replace(/\n+/g, " ")
      .trim();


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
      const res = await fetch(${API_BASE}/speak, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, lang }),
      });


      if (!res.ok) {
        throw new Error(Speech request failed: ${res.status});
      }


      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);


      setAudioUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return url;
      });
    } catch (err) {
      console.error("TTS failed:", err);
    }
  };


  const startRecording = async () => {
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


      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });


      const supportedMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];


      const mimeType = supportedMimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );


      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);


      chunksRef.current = [];


      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };


      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());


        if (audioContextRef.current) {
          try {
            await audioContextRef.current.close();
          } catch (err) {
            console.warn("AudioContext close warning:", err);
          }
          audioContextRef.current = null;
        }


        const actualMimeType =
          mediaRecorder.mimeType || "audio/webm";


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
        formData.append("file", audioBlob, voice.${extension});


        try {
          const transcribeRes = await fetch(
            ${API_BASE}/transcribe,
            {
              method: "POST",
              body: formData,
            }
          );


          if (!transcribeRes.ok) {
            const errorText = await transcribeRes.text();
            console.error(
              "Transcription request failed:",
              transcribeRes.status,
              errorText
            );
            throw new Error(
              Transcription failed: ${transcribeRes.status}
            );
          }


          const data = await transcribeRes.json();
          const text = data.transcript?.trim();


          if (!text) {
            setStatus("Kuch sunayi nahi diya, dobara try karo");
            return;
          }


          setTranscript(text);
          setStatus("Processing your message...");


          const command = parseCommand(text);
          let finalReply = "";


          if (command.type === "add_contact") {
            const res = await fetch(${API_BASE}/add_contact, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: command.payload.name,
                number: command.payload.number,
              }),
            });


            if (!res.ok) throw new Error("Add contact request failed");


            finalReply = (await res.json()).message;
          } else if (command.type === "whatsapp") {
            const res = await fetch(${API_BASE}/whatsapp, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contact: command.payload.contact,
                message: command.payload.message,
              }),
            });


            if (!res.ok) throw new Error("WhatsApp request failed");


            finalReply = (await res.json()).message;
          } else if (command.type === "youtube") {
            const res = await fetch(${API_BASE}/youtube, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: command.payload }),
            });


            if (!res.ok) throw new Error("YouTube request failed");


            finalReply = (await res.json()).message;
          } else if (command.type === "app") {
            const res = await fetch(${API_BASE}/action, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ app: command.payload }),
            });


            if (!res.ok) throw new Error("App action request failed");


            finalReply = (await res.json()).message;
          } else if (command.type === "weather") {
            const res = await fetch(${API_BASE}/weather, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ city: command.payload }),
            });


            if (!res.ok) throw new Error("Weather request failed");


            finalReply = (await res.json()).message;
          } else if (command.type === "info") {
            finalReply = command.payload;
          } else {
            const res = await fetch(${API_BASE}/chat, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: text,
                history: historyRef.current.slice(-12),
              }),
            });


            if (!res.ok) throw new Error("Chat request failed");


            const data = await res.json();
            finalReply = data.reply || "Sorry, I couldn't generate an answer.";


            historyRef.current.push(
              { role: "user", content: text },
              { role: "assistant", content: finalReply }
            );
          }


          setReply(finalReply);
          setStatus("Tap the mic to talk");
          await speak(finalReply);
        } catch (err) {
          console.error("MILO request failed:", err);
          setStatus("Backend se connect nahi ho paya");
        }
      };


      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setStatus("Recording failed. Please try again.");
      };


      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();


      setRecording(true);
      setStatus("Listening...");


      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;


      if (!AudioContextClass) {
        // Recording can still work without silence detection.
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


      // Lower thresholds help detect quieter phone microphones.
      const SPEECH_RMS_THRESHOLD = 0.015;
      const SILENCE_RMS_THRESHOLD = 0.008;
      const SILENCE_DURATION = 1000;
      const MAX_RECORDING_MS = 8000;
      const WARMUP_MS = 400;


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
            if (!silenceStart) {
              silenceStart = Date.now();
            } else if (
              Date.now() - silenceStart >= SILENCE_DURATION
            ) {
              stopRecording();
              return;
            }
          }
        }


        requestAnimationFrame(checkSilence);
      };


      requestAnimationFrame(checkSilence);
    } catch (err) {
      console.error("Microphone start failed:", err);
      setRecording(false);
      setStatus(
        "Mic start nahi hua. Permission check karke dobara try karo."
      );
    }
  };


  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
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