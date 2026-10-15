import { useState, useRef, useEffect } from "react";
import { parseCommand } from "../utils/commandParser";
import "./Chat.css";

function Chat() {
  const [messages, setMessages] = useState([
    { sender: "milo", text: "Hi! Main Milo hoon, Bhumi ne banaya hai mujhe. Hindi, Marathi, Gujarati aur English — sab mein baat kar sakta hoon. Kuch bhi pucho!" }
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
    const newMessages = [...messages, { sender: "user", text: trimmed }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const command = parseCommand(trimmed);

    try {
      let replyText;

      if (command.type === "add_contact") {
        const res = await fetch("http://localhost:8000/add_contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: command.payload.name, number: command.payload.number }),
        });
        replyText = (await res.json()).message;
      } else if (command.type === "whatsapp") {
        const res = await fetch("http://localhost:8000/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact: command.payload.contact, message: command.payload.message }),
        });
        replyText = (await res.json()).message;
      } else if (command.type === "youtube") {
        const res = await fetch("http://localhost:8000/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: command.payload }),
        });
        replyText = (await res.json()).message;
      } else if (command.type === "app") {
        const res = await fetch("http://localhost:8000/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: command.payload }),
        });
        replyText = (await res.json()).message;
      } else if (command.type === "weather") {
        const res = await fetch("http://localhost:8000/weather", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: command.payload }),
        });
        replyText = (await res.json()).message;
      } else if (command.type === "info") {
        replyText = command.payload;
      } else {
        const res = await fetch("http://localhost:8000/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history: historyForRequest }),
        });
        replyText = (await res.json()).reply;
      }

      setMessages([...newMessages, { sender: "milo", text: replyText }]);
    } catch (err) {
      setMessages([...newMessages, { sender: "milo", text: "Backend se connect nahi ho paya." }]);
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
            <span></span><span></span><span></span>
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
        <button onClick={sendMessage} disabled={loading}>➤</button>
      </div>
    </div>
  );
}

export default Chat;