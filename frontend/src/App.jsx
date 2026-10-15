import { useState } from "react";
import "./App.css";

import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import Orb from "./components/Orb";
import Chat from "./pages/Chat";
import Voice from "./pages/Voice";
import WakeWordListener from "./components/WakeWordListener";
import useVoiceAssistant from "./hooks/useVoiceAssistant";

function App() {
  const [activePage, setActivePage] = useState("Home");
  const voiceAssistant = useVoiceAssistant();

  const handleWake = () => {
    if (voiceAssistant.recording) return;
    setActivePage("Voice");
    voiceAssistant.startRecording();
  };

  return (
    <div className="app">
      <WakeWordListener onWake={handleWake} paused={voiceAssistant.recording} />
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <main className="main">
        <Header />
        <section className="content">
          {activePage === "Home" && <Orb />}
          {activePage === "Chat" && <Chat />}
          {activePage === "Voice" && <Voice voiceAssistant={voiceAssistant} />}
        </section>
      </main>
    </div>
  );
}

export default App;