const RAW_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const API_URL = RAW_URL.replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 60000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${path} failed (${res.status}) ${detail}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function postJSON(path, body) {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function postForm(path, formData) {
  const res = await request(path, { method: "POST", body: formData });
  return res.json();
}

export async function postForBlob(path, body) {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.blob();
}

// Render free tier so jata hai, pehle se jaga do
export function warmUp() {
  fetch(`${API_URL}/`).catch(() => {});
}

export function openExternal(url) {
  try {
    const w = window.open(url, "_blank");
    return !!w;
  } catch {
    return false;
  }
}

// ---------- Contacts (is device ke browser mein save hote hain) ----------
const CONTACTS_KEY = "milo_contacts";

function loadContacts() {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || {};
  } catch {
    return {};
  }
}

function normalizeNumber(raw) {
  let digits = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) digits = "91" + digits;
  return digits.length >= 11 ? digits : null;
}

function saveContact(name, number) {
  const normalized = normalizeNumber(number);
  if (!normalized) return false;
  const contacts = loadContacts();
  contacts[name.toLowerCase().trim()] = normalized;
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch {
    return false;
  }
  return true;
}

function findContact(name) {
  const contacts = loadContacts();
  const key = name.toLowerCase().trim();
  if (contacts[key]) return contacts[key];
  for (const [saved, number] of Object.entries(contacts)) {
    if (key.includes(saved) || saved.includes(key)) return number;
  }
  return null;
}

function cleanMessage(message) {
  return message
    .replace(/^(bolo|bol do|keh do|bhej do)\s+/i, "")
    .replace(/^(ki|that)\s+/i, "")
    .trim();
}

// ---------- Ek command chalao, reply (aur optional link) wapas do ----------
export async function runCommand(command, text, history = []) {
  switch (command.type) {
    case "add_contact": {
      const { name, number } = command.payload;
      const ok = saveContact(name, number);
      return {
        reply: ok ? `${name} ka number save kar diya ✅` : "Number sahi nahi laga, dobara bolo",
        isChat: false,
      };
    }

    case "whatsapp": {
      const { contact, message } = command.payload;
      const number = findContact(contact);
      if (!number) {
        return {
          reply: `'${contact}' ka number save nahi hai. Pehle bolo: ${contact} ka number save karo 98XXXXXXXX`,
          isChat: false,
        };
      }
      const url = `https://wa.me/${number}?text=${encodeURIComponent(cleanMessage(message))}`;
      return {
        reply: `${contact} ke liye WhatsApp message ready hai. Open dabake send kar do ✅`,
        url,
        isChat: false,
      };
    }

    case "youtube": {
      const data = await postJSON("/youtube", { query: command.payload });
      return { reply: data.message, url: data.url || null, isChat: false };
    }

    case "app": {
      const data = await postJSON("/action", { app: command.payload });
      return { reply: data.message, url: data.url || null, isChat: false };
    }

    case "weather": {
      const data = await postJSON("/weather", { city: command.payload });
      return { reply: data.message, isChat: false };
    }

    case "info":
      return { reply: command.payload, isChat: false };

    default: {
      const data = await postJSON("/chat", { message: text, history });
      return { reply: data.reply, isChat: true };
    }
  }
}