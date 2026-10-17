import "./Voice.css";
import Avatar from "../components/layout/Avatar";

function Voice({ voiceAssistant }) {
  const {
    recording,
    status,
    transcript,
    reply,
    actionUrl,
    mouthLevel,
    isSpeaking,
    startRecording,
    stopRecording,
  } = voiceAssistant;

  const handleMicClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <div className="voice-page">
      <Avatar mouthLevel={mouthLevel} speaking={isSpeaking} />

      <div
        className={`mic-orb ${recording ? "listening" : ""}`}
        onClick={handleMicClick}
        role="button"
        aria-label="Microphone"
      >
        <span className="mic-icon">🎤</span>
      </div>
      <p className="voice-status">{status}</p>

      {transcript && (
        <div className="voice-result">
          <p className="voice-label">You said</p>
          <p className="voice-text">{transcript}</p>
        </div>
      )}
      {reply && (
        <div className="voice-result">
          <p className="voice-label">Milo</p>
          <p className="voice-text milo">{reply}</p>
          {actionUrl && (
            <a
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "8px 16px",
                borderRadius: 10,
                border: "1px solid rgba(0, 217, 255, 0.4)",
                color: "#7fdfff",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Open ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default Voice;