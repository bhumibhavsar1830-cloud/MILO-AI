import { useEffect, useRef } from "react";
import { Application, Ticker } from "pixi.js";
import { Live2DModel } from "pixi-live2d-display-lipsyncpatch/cubism4";

Live2DModel.registerTicker(Ticker);

const MODEL_PATH = "/live2d/simple.model3.json";

// How often (ms) to trigger a random idle gesture when Milo is NOT speaking.
const IDLE_MOTION_INTERVAL = 6000;

function Live2DAvatar({ audioUrl, stopSignal, onSpeakingChange }) {
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const motionGroupsRef = useRef([]);
  const idleTimerRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const playRandomMotion = () => {
    const model = modelRef.current;
    const groups = motionGroupsRef.current;
    // Don't fire a new motion while one is already speaking/animating,
    // and don't fire if we don't actually have any motion groups.
    if (!model || groups.length === 0 || isSpeakingRef.current) return;

    const group = groups[Math.floor(Math.random() * groups.length)];
    // priority 2 = NORMAL - won't get stuck if something else has FORCE priority,
    // but is enough to play cleanly one at a time.
    model.motion(group, undefined, 2);
  };

  useEffect(() => {
    let cancelled = false;

    const app = new Application({
      view: canvasRef.current,
      autoStart: true,
      backgroundAlpha: 0,
      resizeTo: canvasRef.current.parentElement,
    });
    appRef.current = app;

    Live2DModel.from(MODEL_PATH)
      .then((model) => {
        if (cancelled || !app.stage) return;

        modelRef.current = model;
        app.stage.addChild(model);

        const scale =
          Math.min(app.screen.width / model.width, app.screen.height / model.height) * 0.9;
        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = app.screen.width / 2;
        model.y = app.screen.height / 2;

        // IMPORTANT: check your browser console for this log after the
        // model loads - it lists every real motion-group name your model
        // has (things like "Idle", "TapBody", "FlickLeft" etc). Send me
        // that exact list so we can target hand-gesture groups specifically
        // instead of picking randomly.
        const definitions = model.internalModel?.motionManager?.definitions || {};
        motionGroupsRef.current = Object.keys(definitions);
        console.log("Live2D available motion groups:", motionGroupsRef.current);
        console.log("Live2D full motion definitions:", definitions);

        idleTimerRef.current = setInterval(playRandomMotion, IDLE_MOTION_INTERVAL);
      })
      .catch((err) => console.error("Live2D model load failed:", err));

    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      modelRef.current = null;
      app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    if (!audioUrl || !modelRef.current) return;
    isSpeakingRef.current = true;
    onSpeakingChange?.(true);

    modelRef.current.speak(audioUrl, {
      volume: 1,
      onFinish: () => {
        isSpeakingRef.current = false;
        onSpeakingChange?.(false);
      },
      onError: (err) => {
        console.error("Live2D speak() failed:", err);
        isSpeakingRef.current = false;
        onSpeakingChange?.(false);
      },
    });
  }, [audioUrl]);

  useEffect(() => {
    if (stopSignal === 0 || !modelRef.current) return;
    modelRef.current.stopSpeaking();
    isSpeakingRef.current = false;
    onSpeakingChange?.(false);
  }, [stopSignal]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}

export default Live2DAvatar;