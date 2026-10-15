import os
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

# --------------------------------------------------
# MILO AI - FastAPI Backend
# --------------------------------------------------

app = FastAPI(title="MILO AI Assistant")

# --------------------------------------------------
# CORS CONFIGURATION - Vercel + Local Development
# --------------------------------------------------

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://milo-ai-lilac.vercel.app"
).strip().rstrip("/")

allowed_origins = [
    "https://milo-ai-lilac.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

if FRONTEND_URL and FRONTEND_URL not in allowed_origins:
    allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# ENVIRONMENT VARIABLES
# --------------------------------------------------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "").strip()

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class ChatRequest(BaseModel):
    message: str


class ActionRequest(BaseModel):
    action: str


class YouTubeRequest(BaseModel):
    query: str


class TTSRequest(BaseModel):
    text: str


# --------------------------------------------------
# ROOT AND HEALTH CHECK
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "status": "online",
        "message": "MILO AI Backend is running 🚀"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "MILO AI Backend"
    }


# --------------------------------------------------
# CHAT - GROQ AI
# --------------------------------------------------

@app.post("/chat")
def chat(request: ChatRequest):
    if not GROQ_API_KEY or groq_client is None:
        return {"response": "MILO AI is not configured. Please check GROQ_API_KEY."}

    message = request.message.strip()

    if not message:
        return {"response": "Please enter a message."}

    try:
        completion = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are MILO, a friendly personal AI assistant. "
                        "Respond clearly and naturally. You may use simple "
                        "English or Hinglish according to the user's message. "
                        "Never claim that you performed an action unless it "
                        "actually happened."
                    )
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            temperature=0.7,
            max_tokens=1024
        )

        answer = completion.choices[0].message.content or ""

        return {"response": answer}

    except Exception as error:
        print("Chat error:", str(error))
        return {
            "response": "Sorry, MILO AI could not process that message right now."
        }


# --------------------------------------------------
# TRANSCRIBE - GROQ WHISPER
# --------------------------------------------------

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not GROQ_API_KEY or groq_client is None:
        return {"text": "", "error": "Speech recognition is not configured."}

    temp_path: Optional[str] = None

    try:
        audio_bytes = await file.read()

        if not audio_bytes:
            return {"text": "", "error": "No audio received."}

        suffix = os.path.splitext(file.filename or "recording.webm")[1]
        if not suffix:
            suffix = ".webm"

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        with open(temp_path, "rb") as audio_file:
            transcription = groq_client.audio.transcriptions.create(
                file=(os.path.basename(temp_path), audio_file.read()),
                model="whisper-large-v3-turbo",
                response_format="text"
            )

        if isinstance(transcription, str):
            text_result = transcription.strip()
        else:
            text_result = getattr(transcription, "text", "").strip()

        return {"text": text_result}

    except Exception as error:
        print("Transcription error:", str(error))
        return {
            "text": "",
            "error": "Audio transcription failed. Check the backend logs."
        }

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


# --------------------------------------------------
# ACTIONS
# --------------------------------------------------

@app.post("/action")
def perform_action(request: ActionRequest):
    action = request.action.strip().lower()

    if not action:
        return {
            "success": False,
            "message": "No action provided."
        }

    # Render is a cloud server. It cannot open applications
    # on the user's personal Windows computer.
    website_actions = {
        "open youtube": "https://www.youtube.com",
        "youtube": "https://www.youtube.com",
        "open google": "https://www.google.com",
        "google": "https://www.google.com",
        "open github": "https://github.com",
        "github": "https://github.com",
        "open gmail": "https://mail.google.com",
        "gmail": "https://mail.google.com",
    }

    for phrase, url in website_actions.items():
        if action == phrase:
            return {
                "success": True,
                "type": "website",
                "url": url,
                "message": f"Opening {phrase.replace('open ', '').title()}."
            }

    return {
        "success": False,
        "message": (
            "This action is not supported by the cloud backend. "
            "Opening local Windows applications requires a local agent "
            "running on your computer."
        )
    }


# --------------------------------------------------
# YOUTUBE SEARCH
# --------------------------------------------------

@app.post("/youtube")
def youtube_search(request: YouTubeRequest):
    query = request.query.strip()

    if not query:
        return {
            "results": [],
            "message": "Please enter a search query."
        }

    if not YOUTUBE_API_KEY:
        return {
            "results": [],
            "search_url": (
                "https://www.youtube.com/results?search_query="
                + requests.utils.quote(query)
            ),
            "message": "YouTube API key is not configured."
        }

    try:
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": 5,
                "key": YOUTUBE_API_KEY,
            },
            timeout=15
        )

        response.raise_for_status()
        data = response.json()

        results = []

        for item in data.get("items", []):
            video_id = item.get("id", {}).get("videoId")

            if not video_id:
                continue

            snippet = item.get("snippet", {})

            results.append({
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "thumbnail": (
                    snippet.get("thumbnails", {})
                    .get("high", {})
                    .get("url", "")
                ),
                "url": f"https://www.youtube.com/watch?v={video_id}"
            })

        return {"results": results}

    except Exception as error:
        print("YouTube search error:", str(error))
        return {
            "results": [],
            "message": "YouTube search failed. Check the backend logs."
        }


# --------------------------------------------------
# TEXT-TO-SPEECH PLACEHOLDER
# --------------------------------------------------

@app.post("/tts")
def text_to_speech(request: TTSRequest):
    text = request.text.strip()

    if not text:
        return {
            "success": False,
            "message": "No text provided."
        }

    # This endpoint does not generate audio yet.
    # Connect Azure Speech here before returning audio.
    return {
        "success": False,
        "message": (
            "Text-to-speech is not implemented in this endpoint yet. "
            "Configure Azure Speech synthesis to generate audio."
        )
    }


# --------------------------------------------------
# RUN LOCALLY
# --------------------------------------------------
# For local development, run:
# uvicorn main:app --reload --host 127.0.0.1 --port 8000
#
# Render uses its configured start command:
# uvicorn main:app --host 0.0.0.0 --port $POR