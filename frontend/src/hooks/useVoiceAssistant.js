
import { useCallback, useEffect, useRef, useState } from "react";
import { parseCommand } from "../utils/commandParser";

import API_BASE_URL from "../config";

const BACKEND_URL = API_BASE_URL;
const SILENCE_DURATION = 1400;
const MAX_RECORDING_DURATION = 15000;
const MIN_SPEECH_DURATION = 300;

function sanitizeForSpeech(text) {
  if (!text) return "";

  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function useVoiceAssistant() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Click the microphone and speak");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [stopSignal, setStopSignal] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const monitorRef = useRef(null);
  const silenceStartRef = useRef(null);
  const speechStartRef = useRef(null);
  const autoModeRef = useRef(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const restartTimerRef = useRef(null);
  const audioUrlRef = useRef("");

  const clearMonitor = useCallback(() => {
    if (monitorRef.current) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    clearMonitor();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, [clearMonitor]);

  const scheduleListening = useCallback((delay = 600) => {
    if (!autoModeRef.current || !mountedRef.current) return;

    clearTimeout(restartTimerRef.current);

    restartTimerRef.current = setTimeout(() => {
      if (
        autoModeRef.current &&
        mountedRef.current &&
        !busyRef.current
      ) {
        startRecordingRef.current?.();
      }
    }, delay);
  }, []);

  const startRecordingRef = useRef(null);

  const stopCapture = useCallback((process = true) => {
    clearMonitor();

    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setRecording(false);
      return;
    }

    recorder.onstop = async () => {
      cleanupStream();

      if (!process || !mountedRef.current) {
        chunksRef.current = [];
        return;
      }

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });

      chunksRef.current = [];

      console.log("🎙️ Audio size:", blob.size);

      if (blob.size === 0) {
        setStatus("No audio captured. Please speak again.");
        scheduleListening();
        return;
      }

      busyRef.current = true;
      setIsProcessing(true);
      setStatus("Thinking...");

      try {
        await processAudioRef.current(blob);
      } finally {
        busyRef.current = false;

        if (mountedRef.current) {
          setIsProcessing(false);
        }
      }
    };

    try {
      recorder.stop();
    } catch (error) {
      console.error("❌ Stop recording error:", error);
      cleanupStream();
      setRecording(false);
    }
  }, [cleanupStream, clearMonitor, scheduleListening]);

  const processAudioRef = useRef(null);

  const processAudio = useCallback(async (audioBlob) => {
    try {
      setStatus("Processing your voice...");

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      const transcriptionResponse = await fetch(
        `${BACKEND_URL}/transcribe`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!transcriptionResponse.ok) {
        const details = await transcriptionResponse.text();
        throw new Error(
          `Transcription failed (${transcriptionResponse.status}): ${details}`
        );
      }

      const transcriptionData = await transcriptionResponse.json();
      const text = transcriptionData.text?.trim() || "";

      console.log("🎤 Transcript:", text);

      if (!text) {
        setStatus("I couldn't hear you clearly. Try again.");
        scheduleListening();
        return;
      }

      setTranscript(text);
      setStatus("Thinking...");

      const command = parseCommand(text);
      console.log("🧠 Parsed command:", command);

      let finalReply = "";

      if (command.type === "youtube") {
        setYoutubeVideoId("");
        setYoutubeTitle("");

        const response = await fetch(`${BACKEND_URL}/youtube`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: command.payload }),
        });

        if (!response.ok) {
          throw new Error(`YouTube request failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "success" && data.video_id) {
          setYoutubeVideoId(data.video_id);
          setYoutubeTitle(data.title || command.payload);
          finalReply = `Playing ${data.title || command.payload}.`;
        } else {
          finalReply = data.message || "I couldn't find that YouTube video.";
        }
      } else if (command.type === "app") {
        const response = await fetch(`${BACKEND_URL}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: command.payload }),
        });

        if (!response.ok) {
          throw new Error(`Application request failed: ${response.status}`);
        }

        const data = await response.json();
        finalReply = data.message || `Opening ${command.payload}.`;
      } else if (command.type === "weather") {
        finalReply = "The weather feature is not connected to a live weather service yet.";
      } else if (command.type === "time") {
        finalReply = `The time is ${new Date().toLocaleTimeString()}.`;
      } else if (command.type === "date") {
        finalReply = `Today is ${new Date().toLocaleDateString()}.`;
      } else {
        const response = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: command.payload || text }),
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        const data = await response.json();
        finalReply = data.reply || "Sorry, I couldn't generate an answer.";
      }

      if (!mountedRef.current) return;

      setReply(finalReply);
      setStatus("Speaking...");

      const speechText = sanitizeForSpeech(finalReply);

      if (!speechText || !("speechSynthesis" in window)) {
        setStatus("Ready");
        scheduleListening();
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        if (!mountedRef.current) return;
        setIsSpeaking(true);
        setStatus("Speaking...");
      };

      utterance.onend = () => {
        if (!mountedRef.current) return;
        setIsSpeaking(false);
        setStopSignal((value) => value + 1);
        setStatus(autoModeRef.current ? "Ready — listening again soon" : "Ready");
        scheduleListening(700);
      };

      utterance.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error("❌ Speech synthesis error:", event.error);
        setIsSpeaking(false);
        setStatus("Ready");
        scheduleListening();
      };

      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("❌ Voice assistant error:", error);

      if (mountedRef.current) {
        setStatus("Something went wrong. Check the backend terminal.");
        setReply("Sorry, I couldn't process that. Please try again.");
      }

      scheduleListening(1500);
    }
  }, [scheduleListening]);

  processAudioRef.current = processAudio;

  const startRecording = useCallback(async () => {
    if (busyRef.current || !mountedRef.current) return;

    try {
      clearTimeout(restartTimerRef.current);

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      setIsSpeaking(false);
      setStatus("Listening... Speak now");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      if (!autoModeRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      silenceStartRef.current = null;
      speechStartRef.current = null;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        cleanupStream();

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        chunksRef.current = [];
        console.log("🎙️ Audio size:", blob.size);

        if (!autoModeRef.current || !mountedRef.current) return;

        if (blob.size === 0) {
          setStatus("I couldn't hear you. Please speak again.");
          scheduleListening();
          return;
        }

        busyRef.current = true;
        setIsProcessing(true);
        setStatus("Thinking...");

        try {
          await processAudioRef.current(blob);
        } finally {
          busyRef.current = false;
          if (mountedRef.current) setIsProcessing(false);
        }
      };

      recorder.start(250);
      setRecording(true);

      console.log("🎤 Recording started");

      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = Date.now();

      monitorRef.current = setInterval(() => {
        if (
          !autoModeRef.current ||
          !mountedRef.current ||
          recorder.state !== "recording"
        ) {
          return;
        }

        analyser.getByteTimeDomainData(samples);

        let sum = 0;

        for (let i = 0; i < samples.length; i++) {
          const normalized = (samples[i] - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / samples.length);
        const speakingNow = rms > 0.025;
        const elapsed = Date.now() - startedAt;

        if (speakingNow) {
          if (!speechStartRef.current) {
            speechStartRef.current = Date.now();
            console.log("🗣️ Speech detected");
          }

          silenceStartRef.current = null;
          setStatus("Listening...");
        } else if (speechStartRef.current) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          }

          const silentFor = Date.now() - silenceStartRef.current;
          const spokenFor = silenceStartRef.current - speechStartRef.current;

          if (
            silentFor >= SILENCE_DURATION &&
            spokenFor >= MIN_SPEECH_DURATION
          ) {
            console.log("🤫 Silence detected — processing");
            setRecording(false);
            clearMonitor();
            recorder.stop();
          }
        }

        if (elapsed >= MAX_RECORDING_DURATION) {
          console.log("⏱️ Maximum recording duration reached");
          setRecording(false);
          clearMonitor();
          recorder.stop();
        }
      }, 100);
    } catch (error) {
      console.error("❌ Microphone error:", error);
      cleanupStream();
      setRecording(false);
      autoModeRef.current = false;

      setStatus(
        error.name === "NotAllowedError"
          ? "Microphone permission denied. Allow microphone access."
          : "Could not access microphone. Check browser permissions."
      );
    }
  }, [cleanupStream, clearMonitor, scheduleListening]);

  startRecordingRef.current = startRecording;

  const stopRecording = useCallback(() => {
    autoModeRef.current = false;
    clearTimeout(restartTimerRef.current);
    clearMonitor();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
    setIsProcessing(false);
    busyRef.current = false;

    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        cleanupStream();
        chunksRef.current = [];
      };
      recorder.stop();
    } else {
      cleanupStream();
    }

    setRecording(false);
    setStatus("Stopped — click the microphone to talk again");
  }, [cleanupStream, clearMonitor]);

  const toggleConversation = useCallback(() => {
    if (autoModeRef.current) {
      stopRecording();
      return;
    }

    autoModeRef.current = true;
    setTranscript("");
    setReply("");
    startRecording();
  }, [startRecording, stopRecording]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      autoModeRef.current = false;
      clearTimeout(restartTimerRef.current);
      cleanupStream();

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [cleanupStream]);

  return {
    recording,
    status,
    transcript,
    reply,
    audioUrl,
    stopSignal,
    isSpeaking,
    isProcessing,
    setIsSpeaking,
    startRecording: toggleConversation,
    stopRecording,
    youtubeVideoId,
    youtubeTitle,
  };
}

export default useVoiceAssistant;
export { useVoiceAssistant };
