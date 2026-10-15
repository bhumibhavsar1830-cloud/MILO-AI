import { useEffect, useRef } from "react";

// If the browser's speech recognition keeps failing with "network" errors
// in a row, stop retrying entirely instead of hammering it forever - a
// bad network / blocked endpoint won't fix itself by retrying every 300ms.
const MAX_CONSECUTIVE_ERRORS = 5;

function WakeWordListener({ onWake, paused }) {
  const recognitionRef = useRef(null);
  const restartTimeoutRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  const gaveUpRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Wake word ke liye Chrome ya Edge browser chahiye");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const text = lastResult[0].transcript.toLowerCase();
      if (text.includes("milo")) {
        onWake();
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        consecutiveErrorsRef.current += 1;
        console.error(
          `Wake word error: ${e.error} (consecutive: ${consecutiveErrorsRef.current})`
        );

        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS && !gaveUpRef.current) {
          gaveUpRef.current = true;
          console.warn(
            "Wake word listening disabled after repeated errors - mic button se manually bol sakti hai."
          );
        }
      } else {
        // A clean no-speech/aborted event means recognition is healthy again.
        consecutiveErrorsRef.current = 0;
      }
    };

    recognition.onend = () => {
      if (paused || gaveUpRef.current) return;

      // Exponential-ish backoff: longer wait the more it keeps failing,
      // so a broken network doesn't spin in a tight 300ms loop.
      const delay = Math.min(300 * 2 ** consecutiveErrorsRef.current, 15000);
      restartTimeoutRef.current = setTimeout(() => {
        try {
          recognition.start();
        } catch (err) {
          // ignore - already started / not allowed yet
        }
      }, delay);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {}

    return () => {
      clearTimeout(restartTimeoutRef.current);
      recognition.onend = null;
      recognition.stop();
    };
  }, []);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (paused) {
      recognition.stop();
    } else if (!gaveUpRef.current) {
      try {
        recognition.start();
      } catch (err) {}
    }
  }, [paused]);

  return null;
}

export default WakeWordListener;