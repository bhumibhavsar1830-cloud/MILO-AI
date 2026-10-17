import { useState, useRef, useEffect } from "react";
import { parseCommand } from "../utils/commandParser";
import { runCommand, openExternal } from "../services/api";
import "./Chat.css";

const GREETING =
  "Hi! Main Milo hoon, Bhumi ne banaya hai mujhe. Hindi, Marathi, Gujarati aur English — sab mein baat kar sakta hoon. Kuch bhi pucho!";

function Chat() {
  const [messages, setMessages] = useState([{ sender: "milo", text: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const buildHistory = (msgs) =>
    msgs.slice(-12).map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const history = buildHistory(messages);
    const withUser = [...messages, { sender: "user", text: trimmed }];
    setMessages(withUser);
    setInput("");
    setLoading(true);

    try {
      const command = parseCommand(trimmed);
      const { reply, url } = await runCommand(command, trimmed, history);
      setMessages([...withUser, { sender: "milo", text: reply, url }]);
      if (url) openExternal(url);
    } catch (err) {
      console.error(err);
      setMessages([
        ...withUser,
        {
          sender: "milo",
          text: "Backend se connect nahi ho paya. Thodi der baad try karo (server so raha ho sakta hai).",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-window">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.sender}`}>
            {msg.text}
            {msg.url && (
              <div style={{ marginTop: 8 }}>
                <a
                  href={msg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#7fdfff", fontWeight: 600 }}
                >
                  Open ↗
                </a>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble milo typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          placeholder="Milo se kuch pucho..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={sendMessage} disabled={loading}>
          ➤
        </button>
      </div>
    </div>
  );
}

export default Chat;