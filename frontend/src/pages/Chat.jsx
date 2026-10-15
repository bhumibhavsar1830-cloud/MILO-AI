
import { useState, useRef, useEffect } from "react";
import { parseCommand } from "../utils/commandParser";
import API_BASE_URL from "../config";
import "./Chat.css";

function Chat() {
  const [messages, setMessages] = useState([
    {
      sender: "milo",
      text: "Hi! Main Milo hoon, Bhumi ne banaya hai mujhe. Hindi, Marathi, Gujarati aur English — sab mein baat kar sakta hoon. Kuch bhi pucho!",
    },
  ]);

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

    const historyForRequest = buildHistory(messages);

    const newMessages = [
      ...messages,
      { sender: "user", text: trimmed },
    ];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const command = parseCommand(trimmed);
      let replyText = "";

      if (command.type === "add_contact") {
        const res = await fetch(`${API_BASE_URL}/add_contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: command.payload.name,
            number: command.payload.number,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.detail || data.message || "Contact request failed"
          );
        }

        replyText = data.message || "Contact request completed.";

      } else if (command.type === "whatsapp") {
        const res = await fetch(`${API_BASE_URL}/whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact: command.payload.contact,
            message: command.payload.message,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.detail || data.message || "WhatsApp request failed"
          );
        }

        replyText = data.message || "WhatsApp request completed.";

      } else if (command.type === "youtube") {
        const res = await fetch(`${API_BASE_URL}/youtube`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: command.payload }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.detail || data.message || "YouTube request failed"
          );
        }

        replyText =
          data.message ||
          (data.results?.length
            ? data.results
                .map((video) => `${video.title}\n${video.url}`)
                .join("\n\n")
            : "YouTube search mein koi result nahi mila.");

      } else if (command.type === "app") {
        const res = await fetch(`${API_BASE_URL}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: command.payload }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.detail || data.message || "Action request failed"
          );
        }

        replyText = data.message || "Action request completed.";

      } else if (command.type === "weather") {
        const res = await fetch(`${API_BASE_URL}/weather`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: command.payload }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.detail || data.message || "Weather request failed"
          );
        }

        replyText = data.message || "Weather request completed.";

      } else if (command.type === "info") {
        replyText = command.payload;

      } else {
        // Normal questions go to the Groq-powered backend.
        const res = await fetch(`${API_BASE_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: historyForRequest,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.detail || data.message || "Chat request failed"
          );
        }

        // Support both response formats used by backends.
        replyText =
          data.response ||
          data.reply ||
          data.message ||
          "Mujhe abhi response nahi mila.";
      }

      setMessages([
        ...newMessages,
        { sender: "milo", text: String(replyText) },
      ]);

    } catch (err) {
      console.error("MILO chat error:", err);

      setMessages([
        ...newMessages,
        {
          sender: "milo",
          text: "MILO se response nahi mil paya. Please backend logs check karo aur dobara try karo.",
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
          disabled={loading}
        />

        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
}

export default Chat;
