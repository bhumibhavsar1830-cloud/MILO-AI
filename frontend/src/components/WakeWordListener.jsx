import { useEffect, useRef } from "react";

const isMobileDevice = () =>
  typeof navigator !== "undefined" &&
  (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const WAKE_REGEX = /\b(milo|mylo|meelo|millo)\b/;

function WakeWordListener({ onWake, paused }) {
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const activeRef = useRef(false);
  const lastWakeRef = useRef(0);
  const onWakeRef = useRef(onWake);
  const pausedRef = useRef(paused);

  useEffect(() => {
    onWakeRef.current = onWake;
    pausedRef.current = paused;
  });

  useEffect(() => {
    if (isMobileDevice()) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Wake word ke liye Chrome ya Edge chahiye");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    const safeStart = () => {
      if (pausedRef.current || activeRef.current) return;
      try {
        recognition.start();
        activeRef.current = true;
      } catch {
        /* already started */
      }
    };

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript.toLowerCase();
      if (WAKE_REGEX.test(text) && Date.now() - lastWakeRef.current > 4000) {
        lastWakeRef.current = Date.now();
        onWakeRef.current && onWakeRef.current();
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Wake word error:", e.error);
      }
    };

    recognition.onend = () => {
      activeRef.current = false;
      if (!pausedRef.current) {
        restartTimerRef.current = setTimeout(safeStart, 400);
      }
    };

    recognitionRef.current = recognition;
    safeStart();

    return () => {
      clearTimeout(restartTimerRef.current);
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (paused) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    } else {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (!pausedRef.current && !activeRef.current) {
          try {
            recognition.start();
            activeRef.current = true;
          } catch {
            /* ignore */
          }
        }
      }, 600);
    }
  }, [paused]);

  return null;
}

export default WakeWordListener;