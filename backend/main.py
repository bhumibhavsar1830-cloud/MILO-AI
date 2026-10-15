import os
import re
import subprocess
import tempfile
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

load_dotenv()

app = FastAPI(title="MILO AI Assistant")

# =========================================================
# ENVIRONMENT VARIABLES
# =========================================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")

# Set FRONTEND_URL in Render after deploying the frontend.
# Example: https://your-project.vercel.app
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip().rstrip("/")

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if FRONTEND_URL and FRONTEND_URL not in allowed_origins:
    allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


# =========================================================
# MODELS
# =========================================================

class ChatRequest(BaseModel):
    message: str


class TranscribeResponse(BaseModel):
    text: str
    language: str = ""


class ActionRequest(BaseModel):
    command: str


class YoutubeRequest(BaseModel):
    query: str


class YoutubeResponse(BaseModel):
    status: str
    message: str
    video_id: str = ""
    title: str = ""


class TTSRequest(BaseModel):
    text: str


# =========================================================
# BASIC ROUTES
# =========================================================

@app.get("/")
def root():
    return {
        "status": "online",
        "message": "MILO AI Backend is running 🚀",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# =========================================================
# CHAT
# =========================================================

@app.post("/chat")
def chat(request: ChatRequest):
    if not client:
        return {"reply": "Groq API key is missing."}

    try:
        system_prompt = """
You are MILO, a smart AI voice assistant developed by Bhumi.

Your personality:
- Friendly
- Helpful
- Short and natural
- Conversational
- Intelligent
- Never unnecessarily verbose

You can understand:
- English
- Hindi
- Marathi
- Gujarati
- Hinglish

Reply in the same language/style used by the user whenever possible.

Important:
- Do not provide URLs unless explicitly asked.
- Do not use markdown unnecessarily.
- Do not say you are Alexa, Siri or Google Assistant.
- Your name is MILO.
- You were developed by Bhumi.
"""

        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message},
            ],
            temperature=0.7,
            max_tokens=500,
        )

        reply = (response.choices[0].message.content or "").strip()
        return {"reply": reply or "Sorry, mujhe abhi response nahi mila."}

    except Exception as e:
        print("Chat error:", repr(e))
        return {
            "reply": "Sorry, mujhe abhi response generate karne mein problem aa rahi hai."
        }


# =========================================================
# TRANSCRIPTION
# =========================================================

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)):
    temp_path = None

    try:
        audio_data = await file.read()
        print("Received audio file:", file.filename)
        print("Audio size:", len(audio_data), "bytes")

        if not audio_data:
            return TranscribeResponse(text="", language="")

        if not client:
            print("Groq client is missing")
            return TranscribeResponse(text="", language="")

        suffix = os.path.splitext(file.filename or "")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name

        with open(temp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=(file.filename or "audio.webm", audio_file),
                model="whisper-large-v3-turbo",
                response_format="verbose_json",
            )

        text = (getattr(transcription, "text", "") or "").strip()
        language = getattr(transcription, "language", "") or ""
        print("Transcribed language:", language)

        return TranscribeResponse(text=text, language=language)

    except Exception as e:
        print("Transcription error:", repr(e))
        return TranscribeResponse(text="", language="")

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError as cleanup_error:
                print("Temporary file cleanup error:", repr(cleanup_error))


# =========================================================
# APP COMMANDS
# =========================================================

APP_COMMANDS = {
    "chrome": ["chrome", "google chrome"],
    "notepad": ["notepad"],
    "calculator": ["calculator", "calc"],
    "vscode": ["vs code", "visual studio code", "vscode"],
    "files": ["file explorer", "files", "explorer"],
    "instagram": ["instagram"],
    "youtube": ["youtube", "yt"],
    "maps": ["google maps", "maps"],
    "whatsapp": ["whatsapp"],
}


# =========================================================
# OPEN APPLICATION / WEBSITE
# =========================================================

@app.post("/action")
def action(request: ActionRequest):
    command = request.command.lower().strip()

    # This API is hosted on Render (Linux), not on the user's PC.
    # It cannot launch desktop apps on the user's computer.
    if os.name != "nt":
        website_urls = {
            "instagram": "https://www.instagram.com",
            "youtube": "https://www.youtube.com",
            "maps": "https://maps.google.com",
            "google maps": "https://maps.google.com",
            "whatsapp": "https://web.whatsapp.com",
        }

        if command in website_urls:
            return {
                "status": "success",
                "message": f"Open this website in your browser: {website_urls[command]}",
                "url": website_urls[command],
            }

        return {
            "status": "error",
            "message": (
                "Desktop apps can only be opened by a local Windows agent. "
                "This hosted backend cannot open apps on your computer."
            ),
        }

    try:
        # Windows-only desktop actions, when running locally on Windows.
        if command in ["chrome", "google chrome"]:
            subprocess.Popen(["cmd", "/c", "start", "", "chrome"], shell=False)
            return {"status": "success", "message": "Opening Chrome."}

        if command == "notepad":
            subprocess.Popen(["notepad.exe"])
            return {"status": "success", "message": "Opening Notepad."}

        if command in ["calculator", "calc"]:
            subprocess.Popen(["calc.exe"])
            return {"status": "success", "message": "Opening Calculator."}

        if command in ["vs code", "visual studio code", "vscode"]:
            subprocess.Popen(["cmd", "/c", "code"], shell=False)
            return {"status": "success", "message": "Opening VS Code."}

        if command in ["files", "file explorer", "explorer"]:
            subprocess.Popen(["explorer.exe"])
            return {"status": "success", "message": "Opening File Explorer."}

        website_urls = {
            "instagram": "https://www.instagram.com",
            "youtube": "https://www.youtube.com",
            "maps": "https://maps.google.com",
            "google maps": "https://maps.google.com",
            "whatsapp": "https://web.whatsapp.com",
        }

        if command in website_urls:
            url = website_urls[command]
            subprocess.Popen(["cmd", "/c", "start", "", url], shell=False)
            return {"status": "success", "message": f"Opening {command}."}

        return {
            "status": "error",
            "message": f"I don't know how to open {command}.",
        }

    except Exception as e:
        print("Action error:", repr(e))
        return {
            "status": "error",
            "message": "Unable to open the requested application.",
        }


# =========================================================
# YOUTUBE SEARCH
# =========================================================

@app.post("/youtube", response_model=YoutubeResponse)
def play_youtube(request: YoutubeRequest):
    if not YOUTUBE_API_KEY:
        return YoutubeResponse(
            status="error",
            message="YouTube API key is missing.",
        )

    query = request.query.strip()
    if not query:
        return YoutubeResponse(
            status="error",
            message="Please tell me which song you want to play.",
        )

    try:
        print("YouTube search:", query)
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": 1,
                "key": YOUTUBE_API_KEY,
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        items = data.get("items", [])
        if not items:
            return YoutubeResponse(
                status="error",
                message=f"'{query}' ke liye koi video nahi mila.",
            )

        first_item = items[0]
        video_id = first_item.get("id", {}).get("videoId", "")
        title = first_item.get("snippet", {}).get("title", query)

        if not video_id:
            return YoutubeResponse(
                status="error",
                message="YouTube video nahi mila.",
            )

        print("YouTube video found:", title)
        return YoutubeResponse(
            status="success",
            message=f"Playing {query} 🎵",
            video_id=video_id,
            title=title,
        )

    except requests.exceptions.RequestException as e:
        print("YouTube request error:", repr(e))
        return YoutubeResponse(
            status="error",
            message="YouTube se connect nahi ho paya. API key/quota check karo.",
        )

    except Exception as e:
        print("YouTube error:", repr(e))
        return YoutubeResponse(
            status="error",
            message="YouTube command failed.",
        )


# =========================================================
# TEXT-TO-SPEECH
# =========================================================

@app.post("/tts")
def text_to_speech(request: TTSRequest):
    text = request.text.strip()
    if not text:
        return {"status": "error", "message": "Text is empty."}

    # This endpoint is still a placeholder. Azure credentials are read above,
    # but actual Azure audio generation has not been implemented here.
    return {
        "status": "success",
        "message": text,
        "tts_ready": bool(AZURE_SPEECH_KEY and AZURE_SPEECH_REGION),
        "note": "This endpoint does not generate an audio file yet.",
    }


# =========================================================
# RUN LOCALLY
# =========================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
