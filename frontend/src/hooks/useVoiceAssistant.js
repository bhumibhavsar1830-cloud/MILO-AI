import { useState, useRef, useEffect } from "react";
import { parseCommand } from "../utils/commandParser";
import { postForm, postForBlob, runCommand, openExternal, warmUp } from "../services/api";

const IDLE_STATUS = "Tap the mic to talk";
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

const IS_IOS =
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const SPEECH_RMS = 0.035;
const SILENCE_RMS = 0.02;
const SILENCE_MS = 900;
const NO_SPEECH_TIMEOUT_MS = 6000;
const MAX_RECORDING_MS = 12000;
const WARMUP_MS = 300;

const sanitizeForSpeech = (text) =>
  text.replace(/\*\*/g, "").replace(/[*_#`>]/g, "").replace(/\n+/g, " ").trim();

const detectLang = (text) => {
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return "en";
};

const pickMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
};

const extFromMime = (mime) => {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
};

export function useVoiceAssistant() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [actionUrl, setActionUrl] = useState(null);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioCtxRef = useRef(null);
  const audioElRef = useRef(null);
  const analyserRef = useRef(null);
  const unlockedRef = useRef(false);
  const lastUrlRef = useRef(null);

  const mouthRafRef = useRef(null);
  const lastLevelRef = useRef(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const micSourceRef = useRef(null);
  const vadTimerRef = useRef(null);
  const chunksRef = useRef([]);
  const discardRef = useRef(false);
  const recordingRef = useRef(false);
  const busyRef = useRef(false);
  const historyRef = useRef([]);

  // ---------- Audio basics ----------
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };

  const getAudioElement = () => {
    if (!audioElRef.current) {
      const el = new Audio();
      el.preload = "auto";
      audioElRef.current = el;
    }
    return audioElRef.current;
  };

  // Phone pe audio tabhi bajta hai jab user ke tap ke andar unlock ho
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") ctx.resume();
      if (!unlockedRef.current) {
        const el = getAudioElement();
        el.src = SILENT_WAV;
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        unlockedRef.current = true;
      }
    } catch {
      /* ignore */
    }
  };

  const ensurePlaybackAnalyser = () => {
    if (analyserRef.current) return analyserRef.current;
    const ctx = getAudioContext();
    const el = getAudioElement();
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    return analyser;
  };

  // ---------- Mouth animation ----------
  const pushMouthLevel = (v) => {
    if (v === 0 || Math.abs(v - lastLevelRef.current) > 0.03) {
      lastLevelRef.current = v;
      setMouthLevel(v);
    }
  };

  const stopMouthLoop = () => {
    if (mouthRafRef.current) cancelAnimationFrame(mouthRafRef.current);
    mouthRafRef.current = null;
    pushMouthLevel(0);
  };

  const startMouthLoop = () => {
    if (mouthRafRef.current) cancelAnimationFrame(mouthRafRef.current);
    const analyser = !IS_IOS ? analyserRef.current : null;

    if (analyser) {
      const buf = new Uint8Array(analyser.fftSize);
      let smooth = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        smooth = smooth * 0.65 + Math.min(1, rms * 6) * 0.35;
        pushMouthLevel(smooth);
        mouthRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } else {
      // iPhone pe WebAudio silent-switch se mute ho jata hai, isliye simulated mooh
      const start = performance.now();
      const tick = (now) => {
        const t = (now - start) / 1000;
        const v = 0.35 + 0.3 * Math.sin(t * 9) + 0.2 * Math.sin(t * 5.3 + 1) + 0.15 * Math.sin(t * 13.7);
        pushMouthLevel(Math.max(0, Math.min(1, v)));
        mouthRafRef.current = requestAnimationFrame(tick);
      };
      mouthRafRef.current = requestAnimationFrame(tick);
    }
  };

  // ---------- Speaking ----------
  const stopSpeaking = () => {
    const el = audioElRef.current;
    if (el) {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    stopMouthLoop();
    setIsSpeaking(false);
  };

  const speak = async (text) => {
    const clean = sanitizeForSpeech(text);
    if (!clean) return;

    try {
      const blob = await postForBlob("/speak", { text: clean, lang: detectLang(clean) });
      const url = URL.createObjectURL(blob);
      const el = getAudioElement();

      if (!IS_IOS) {
        try {
          ensurePlaybackAnalyser();
        } catch {
          /* analyser na bane to bhi audio chalega */
        }
      }

      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;

      el.onplay = () => {
        setIsSpeaking(true);
        startMouthLoop();
      };
      const finish = () => {
        setIsSpeaking(false);
        stopMouthLoop();
      };
      el.onended = finish;
      el.onerror = finish;

      el.src = url;
      await el.play();
    } catch (err) {
      console.error("TTS failed", err);
      setIsSpeaking(false);
      stopMouthLoop();
      if (err && err.name === "NotAllowedError") {
        setStatus("Browser ne awaaz block ki, mic ko ek baar tap karo");
      }
    }
  };

  // ---------- Recording ----------
  const releaseMic = () => {
    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        /* ignore */
      }
      micSourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const processAudio = async (blob, mime) => {
    busyRef.current = true;
    setStatus("Thinking...");
    try {
      const form = new FormData();
      form.append("file", blob, `voice.${extFromMime(mime)}`);
      const { transcript: text } = await postForm("/transcribe", form);

      if (!text || !text.trim()) {
        setStatus("Kuch sunayi nahi diya, dobara try karo");
        return;
      }

      setTranscript(text);
      const command = parseCommand(text);
      const { reply: finalReply, url, isChat } = await runCommand(
        command,
        text,
        historyRef.current.slice(-12)
      );

      if (isChat) {
        historyRef.current.push({ role: "user", content: text });
        historyRef.current.push({ role: "assistant", content: finalReply });
      }

      setReply(finalReply);
      setActionUrl(url || null);
      if (url) openExternal(url);

      setStatus(IDLE_STATUS);
      speak(finalReply);
    } catch (err) {
      console.error(err);
      setStatus(
        err && err.name === "AbortError"
          ? "Server slow hai, thodi der baad try karo"
          : "Backend se connect nahi ho paya"
      );
    } finally {
      busyRef.current = false;
    }
  };

  const stopRecording = (opts = {}) => {
    discardRef.current = !!(opts && opts.discard);
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
    recordingRef.current = false;
    setRecording(false);
  };

  const startRecording = async () => {
    if (recordingRef.current || busyRef.current) return;

    unlockAudio(); // tap ke andar hi, await se pehle
    stopSpeaking();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("Is browser mein mic support nahi hai (HTTPS + Chrome/Safari chahiye)");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      setStatus(
        err && err.name === "NotAllowedError"
          ? "Mic permission band hai, browser settings mein allow karo"
          : "Mic start nahi ho paya"
      );
      return;
    }

    streamRef.current = stream;
    discardRef.current = false;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const actualMime = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      releaseMic();
      if (discardRef.current) {
        setStatus("Kuch sunayi nahi diya, dobara tap karo");
        return;
      }
      const blob = new Blob(chunksRef.current, { type: actualMime });
      if (blob.size < 1500) {
        setStatus("Kuch sunayi nahi diya, dobara tap karo");
        return;
      }
      processAudio(blob, actualMime);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    recordingRef.current = true;
    setRecording(true);
    setStatus("Listening...");

    // Chup hote hi auto-stop
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const startTime = Date.now();
      let silenceStart = null;
      let hasSpoken = false;

      vadTimerRef.current = setInterval(() => {
        const rec = mediaRecorderRef.current;
        if (!rec || rec.state !== "recording") return;

        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_RECORDING_MS) {
          stopRecording({ discard: !hasSpoken });
          return;
        }
        if (!hasSpoken && elapsed > NO_SPEECH_TIMEOUT_MS) {
          stopRecording({ discard: true });
          return;
        }
        if (elapsed < WARMUP_MS) return;

        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);

        if (rms > SPEECH_RMS) {
          hasSpoken = true;
          silenceStart = null;
        } else if (hasSpoken && rms < SILENCE_RMS) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > SILENCE_MS) stopRecording();
        }
      }, 60);
    } catch (err) {
      console.warn("Auto-stop detection start nahi hua, manual tap se roko", err);
    }
  };

  // ---------- Lifecycle ----------
  useEffect(() => {
    warmUp();

    const unlock = () => unlockAudio();
    const events = ["pointerdown", "touchstart", "keydown"];
    events.forEach((e) => window.addEventListener(e, unlock, { once: true, passive: true }));

    return () => {
      events.forEach((e) => window.removeEventListener(e, unlock));
      releaseMic();
      if (mouthRafRef.current) cancelAnimationFrame(mouthRafRef.current);
      if (audioElRef.current) audioElRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    recording,
    status,
    transcript,
    reply,
    actionUrl,
    mouthLevel,
    isSpeaking,
    startRecording,
    stopRecording,
  };
}