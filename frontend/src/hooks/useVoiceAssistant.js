
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

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const historyRef = useRef([]);

  const stopSpeaking = useCallback(() => {
    setStopSignal((n) => n + 1);
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const speak = useCallback(async (text) => {
    if (!text?.trim()) return;

    const lang = /[\u0A80-\u0AFF]/.test(text)
      ? "gu"
      : /[\u0900-\u097F]/.test(text)
      ? "hi"
      : "en";

    try {
      const response = await fetch(`${API_BASE}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });

      if (!response.ok) {
        throw new Error(`Speech API error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setAudioUrl((oldUrl) => {
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        return url;
      });
    } catch (error) {
      console.error("MILO speech error:", error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const recorder = recorderRef.current;

    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recorderRef.current?.state === "recording") return;

    try {
      stopSpeaking();
      setTranscript("");
      setReply("");
      setStatus("Requesting microphone...");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Open MILO using HTTPS and allow microphone access.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType = types.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Recorder error:", event.error);
        cleanup();
        setRecording(false);
        setStatus("Recording failed. Please try again.");
      };

      recorder.onstop = async () => {
        setRecording(false);
        cleanup();

        const blobType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, {
          type: blobType,
        });

        console.log("MILO recording:", {
          mimeType: blobType,
          size: audioBlob.size,
          chunks: chunksRef.current.length,
        });

        if (!audioBlob.size) {
          setStatus("Audio record nahi hua. Dobara try karo.");
          return;
        }

        const extension = blobType.includes("mp4") ? "mp4" : "webm";
        const formData = new FormData();
        formData.append("file", audioBlob, `voice.${extension}`);

        try {
          setStatus("MILO is listening...");

          const transcribeResponse = await fetch(
            `${API_BASE}/transcribe`,
            { method: "POST", body: formData }
          );

          if (!transcribeResponse.ok) {
            throw new Error(
              `Transcription API error: ${transcribeResponse.status} ${await transcribeResponse.text()}`
            );
          }

          const data = await transcribeResponse.json();
          const spokenText = data.transcript?.trim();

          if (!spokenText) {
            setStatus("Awaaz clear nahi thi. Thoda paas se bolo.");
            return;
          }

          setTranscript(spokenText);
          setStatus("MILO is thinking...");

          const command = parseCommand(spokenText);
          let finalReply = "";

          const postJSON = async (endpoint, body) => {
            const response = await fetch(`${API_BASE}/${endpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              throw new Error(`${endpoint} API error: ${response.status}`);
            }

            return response.json();
          };

          if (command.type === "add_contact") {
            const result = await postJSON("add_contact", {
              name: command.payload.name,
              number: command.payload.number,
            });
            finalReply = result.message;
          } else if (command.type === "whatsapp") {
            const result = await postJSON("whatsapp", {
              contact: command.payload.contact,
              message: command.payload.message,
            });
            finalReply = result.message;
          } else if (command.type === "youtube") {
            const result = await postJSON("youtube", {
              query: command.payload,
            });
            finalReply = result.message;
          } else if (command.type === "app") {
            const result = await postJSON("action", {
              app: command.payload,
            });
            finalReply = result.message;
          } else if (command.type === "weather") {
            const result = await postJSON("weather", {
              city: command.payload,
            });
            finalReply = result.message;
          } else if (command.type === "info") {
            finalReply = command.payload;
          } else {
            const result = await postJSON("chat", {
              message: spokenText,
              history: historyRef.current.slice(-12),
            });

            finalReply =
              result.reply || "Sorry, I couldn't generate an answer.";

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
          console.error("MILO request error:", error);
          setStatus("Connection error. Please try again.");
        }
      };

      recorder.start(250);
      setRecording(true);
      setStatus("Listening... Speak now.");

      // Allow enough time for phone microphones and speech.
      timerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 10000);
    } catch (error) {
      console.error("MILO microphone error:", error);
      cleanup();
      setRecording(false);
      setStatus(
        error.name === "NotAllowedError"
          ? "Microphone permission allow karo."
          : "Mic start nahi hua. HTTPS aur mic permission check karo."
      );
    }
  }, [cleanup, speak, stopSpeaking]);

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
