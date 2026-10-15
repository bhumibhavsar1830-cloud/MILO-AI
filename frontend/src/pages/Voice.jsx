
import "./Voice.css";
import Live2DAvatar from "../components/layout/Live2DAvatar";

function Voice({ voiceAssistant }) {
  const {
    recording,
    status,
    transcript,
    reply,
    audioUrl,
    stopSignal,
    setIsSpeaking,
    startRecording,
    stopRecording,
    youtubeVideoId,
    youtubeTitle,
    isProcessing,
    isSpeaking,
  } = voiceAssistant;

  const handleMicClick = () => {
    if (recording || isProcessing || isSpeaking) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="voice-page">
      {/* MILO AVATAR */}
      <div
        style={{
          width: 420,
          height: 420,
          maxWidth: "90vw",
        }}
      >
        <Live2DAvatar
          audioUrl={audioUrl}
          stopSignal={stopSignal}
          onSpeakingChange={setIsSpeaking}
        />
      </div>

      {/* YOUTUBE PLAYER */}
      {youtubeVideoId && (
        <div
          style={{
            width: "min(900px, 90vw)",
            margin: "20px auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              paddingBottom: "56.25%",
              height: 0,
              overflow: "hidden",
              borderRadius: "18px",
              background: "#000",
              boxShadow: "0 0 30px rgba(0,0,0,0.35)",
            }}
          >
            <iframe
              title={youtubeTitle || "MILO YouTube Player"}
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&rel=0`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: "none",
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {youtubeTitle && (
            <p
              style={{
                marginTop: "10px",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              🎵 {youtubeTitle}
            </p>
          )}
        </div>
      )}

      {/* MICROPHONE BUTTON */}
      <button
        type="button"
        className={`mic-orb ${recording ? "listening" : ""} ${
          isProcessing ? "processing" : ""
        } ${isSpeaking ? "speaking" : ""}`}
        onClick={handleMicClick}
        aria-label={
          recording || isProcessing || isSpeaking
            ? "Stop conversation"
            : "Talk to MILO"
        }
        title={
          recording || isProcessing || isSpeaking
            ? "Stop conversation"
            : "Talk to MILO"
        }
      >
        <span className="mic-icon">
          {isProcessing ? "🧠" : isSpeaking ? "🔊" : "🎤"}
        </span>
      </button>

      {/* STATUS */}
      <p className="voice-status">{status}</p>

      {/* USER TRANSCRIPT */}
      {transcript && (
        <div className="voice-result">
          <p className="voice-label">You said</p>
          <p className="voice-text">{transcript}</p>
        </div>
      )}

      {/* MILO RESPONSE */}
      {reply && (
        <div className="voice-result">
          <p className="voice-label">MILO</p>
          <p className="voice-text milo">{reply}</p>
        </div>
      )}
    </div>
  );
}

export default Voice;
