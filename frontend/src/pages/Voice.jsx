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
  } = voiceAssistant;

  const handleMicClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <div className="voice-page">
      <div style={{ width: 260, height: 260 }}>
        <Live2DAvatar audioUrl={audioUrl} stopSignal={stopSignal} onSpeakingChange={setIsSpeaking} />
      </div>

      <div className={`mic-orb ${recording ? "listening" : ""}`} onClick={handleMicClick}>
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
        </div>
      )}
    </div>
  );
}

export default Voice;