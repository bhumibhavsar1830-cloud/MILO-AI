import os
import re
import subprocess
from typing import Optional

import requests
import pywhatkit

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

load_dotenv()

app = FastAPI(title="MILO AI Assistant")

# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# ENVIRONMENT VARIABLES
# =========================================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

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
# BASIC ROUTE
# =========================================================

@app.get("/")
def root():
    return {
        "status": "online",
        "message": "MILO AI Backend is running 🚀"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


# =========================================================
# CHAT
# =========================================================

@app.post("/chat")
def chat(request: ChatRequest):

    if not client:
        return {
            "reply": "Groq API key is missing."
        }

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
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": request.message
                }
            ],
            temperature=0.7,
            max_tokens=500,
        )

        reply = response.choices[0].message.content.strip()

        return {
            "reply": reply
        }

    except Exception as e:

        print("❌ Chat error:", e)

        return {
            "reply": "Sorry, mujhe abhi response generate karne mein problem aa rahi hai."
        }


# =========================================================
# TRANSCRIPTION
# =========================================================

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):

    temp_file = "temp_audio.webm"

    try:

        # Read uploaded audio file
        audio_data = await file.read()

        print("📥 Received audio file:", file.filename)
        print("📦 Audio size:", len(audio_data), "bytes")

        if not audio_data:
            print("❌ Empty audio file")

            return {
                "text": "",
                "language": ""
            }

        # Save temporary audio file
        with open(temp_file, "wb") as f:
            f.write(audio_data)

        print("💾 Temporary audio file saved")

        # Check Groq client
        if not client:
            print("❌ Groq client is missing")

            return {
                "text": "",
                "language": ""
            }

        # Send audio to Groq Whisper
        with open(temp_file, "rb") as audio_file:

            transcription = client.audio.transcriptions.create(
                file=("audio.webm", audio_file),
                model="whisper-large-v3-turbo",
                response_format="verbose_json",
            )

        # Get transcription
        text = getattr(transcription, "text", "") or ""
        language = getattr(transcription, "language", "") or ""

        text = text.strip()

        print("🎤 Transcribed:", text)
        print("🌐 Language:", language)

        return {
            "text": text,
            "language": language
        }

    except Exception as e:

        print("❌ Transcription error:", repr(e))

        return {
            "text": "",
            "language": ""
        }

    finally:

        # Always delete temporary file
        try:

            if os.path.exists(temp_file):
                os.remove(temp_file)
                print("🗑️ Temporary audio file removed")

        except Exception as cleanup_error:

            print(
                "⚠️ Temporary file cleanup error:",
                cleanup_error
            )


# =========================================================
# APP COMMANDS
# =========================================================

APP_COMMANDS = {

    "chrome": [
        "chrome",
        "google chrome"
    ],

    "notepad": [
        "notepad"
    ],

    "calculator": [
        "calculator",
        "calc"
    ],

    "vscode": [
        "vs code",
        "visual studio code",
        "vscode"
    ],

    "files": [
        "file explorer",
        "files",
        "explorer"
    ],

    "instagram": [
        "instagram"
    ],

    "youtube": [
        "youtube",
        "yt"
    ],

    "maps": [
        "google maps",
        "maps"
    ],

    "whatsapp": [
        "whatsapp"
    ],
}


# =========================================================
# OPEN APPLICATION / WEBSITE
# =========================================================

@app.post("/action")
def action(request: ActionRequest):

    command = request.command.lower().strip()

    try:

        # Chrome
        if command in ["chrome", "google chrome"]:

            subprocess.Popen(
                ["cmd", "/c", "start", "", "chrome"],
                shell=False
            )

            return {
                "status": "success",
                "message": "Opening Chrome."
            }

        # Notepad
        if command == "notepad":

            subprocess.Popen(
                ["notepad.exe"]
            )

            return {
                "status": "success",
                "message": "Opening Notepad."
            }

        # Calculator
        if command in ["calculator", "calc"]:

            subprocess.Popen(
                ["calc.exe"]
            )

            return {
                "status": "success",
                "message": "Opening Calculator."
            }

        # VS Code
        if command in [
            "vs code",
            "visual studio code",
            "vscode"
        ]:

            subprocess.Popen(
                ["cmd", "/c", "code"],
                shell=False
            )

            return {
                "status": "success",
                "message": "Opening VS Code."
            }

        # File Explorer
        if command in [
            "files",
            "file explorer",
            "explorer"
        ]:

            subprocess.Popen(
                ["explorer.exe"]
            )

            return {
                "status": "success",
                "message": "Opening File Explorer."
            }

        # Websites
        website_urls = {

            "instagram":
                "https://www.instagram.com",

            "youtube":
                "https://www.youtube.com",

            "maps":
                "https://maps.google.com",

            "google maps":
                "https://maps.google.com",

            "whatsapp":
                "https://web.whatsapp.com",
        }

        if command in website_urls:

            url = website_urls[command]

            subprocess.Popen(
                ["cmd", "/c", "start", "", url],
                shell=False
            )

            return {
                "status": "success",
                "message": f"Opening {command}."
            }

        return {
            "status": "error",
            "message": f"I don't know how to open {command}."
        }

    except Exception as e:

        print("❌ Action error:", e)

        return {
            "status": "error",
            "message": "Unable to open the requested application."
        }


# =========================================================
# YOUTUBE SEARCH
# =========================================================

@app.post("/youtube", response_model=YoutubeResponse)
def play_youtube(request: YoutubeRequest):

    try:

        if not YOUTUBE_API_KEY:

            return YoutubeResponse(
                status="error",
                message="YouTube API key is missing."
            )

        query = request.query.strip()

        if not query:

            return YoutubeResponse(
                status="error",
                message="Please tell me which song you want to play."
            )

        print("🎵 YouTube search:", query)

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

        if "error" in data:

            error_message = data["error"].get(
                "message",
                "YouTube API error"
            )

            print("❌ YouTube API:", error_message)

            return YoutubeResponse(
                status="error",
                message=error_message
            )

        items = data.get("items", [])

        if not items:

            return YoutubeResponse(
                status="error",
                message=f"'{query}' ke liye koi video nahi mila."
            )

        first_item = items[0]

        video_id = (
            first_item
            .get("id", {})
            .get("videoId", "")
        )

        title = (
            first_item
            .get("snippet", {})
            .get("title", query)
        )

        if not video_id:

            return YoutubeResponse(
                status="error",
                message="YouTube video nahi mila."
            )

        print("✅ Video ID:", video_id)
        print("🎵 Title:", title)

        return YoutubeResponse(
            status="success",
            message=f"Playing {query} 🎵",
            video_id=video_id,
            title=title
        )

    except requests.exceptions.RequestException as e:

        print("❌ YouTube request error:", e)

        return YoutubeResponse(
            status="error",
            message="YouTube se connect nahi ho paya."
        )

    except Exception as e:

        print("❌ YouTube error:", e)

        return YoutubeResponse(
            status="error",
            message="YouTube command failed."
        )


# =========================================================
# OPTIONAL TTS ROUTE
# =========================================================

@app.post("/tts")
def text_to_speech(request: TTSRequest):

    try:

        text = request.text.strip()

        if not text:

            return {
                "status": "error",
                "message": "Text is empty."
            }

        return {
            "status": "success",
            "message": text
        }

    except Exception as e:

        print("❌ TTS error:", e)

        return {
            "status": "error",
            "message": "TTS failed."
        }


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )