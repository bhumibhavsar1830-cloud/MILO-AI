
import os
import tempfile
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from groq import Groq

load_dotenv()

# ==================================================
# MILO AI - FastAPI Backend
# ==================================================

app = FastAPI(title="MILO AI Assistant")

# ==================================================
# CORS
# ==================================================

DEFAULT_FRONTEND_URL = "https://milo-ai-lilac.vercel.app"

FRONTEND_URL = os.getenv(
    "FRONTEND_URL", DEFAULT_FRONTEND_URL
).strip().rstrip("/")

allowed_origins = [
    DEFAULT_FRONTEND_URL,
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

# ==================================================
# ENVIRONMENT VARIABLES
# ==================================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()

AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_SPEECH_REGION = os.getenv(
    "AZURE_SPEECH_REGION", ""
).strip()

groq_client = (
    Groq(api_key=GROQ_API_KEY)
    if GROQ_API_KEY
    else None
)

# ==================================================
# REQUEST MODELS
# ==================================================

class ChatRequest(BaseModel):
    message: str
    history: list[dict[str, str]] = Field(default_factory=list)


class ActionRequest(BaseModel):
    action: Optional[str] = None
    app: Optional[str] = None


class YouTubeRequest(BaseModel):
    query: str


class TTSRequest(BaseModel):
    text: str


class WeatherRequest(BaseModel):
    city: str


class ContactRequest(BaseModel):
    name: str
    number: str


class WhatsAppRequest(BaseModel):
    contact: str
    message: str


# ==================================================
# ROOT / HEALTH
# ==================================================

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
        "service": "MILO AI Backend",
        "groq_configured": groq_client is not None
    }


# ==================================================
# CHAT - GROQ AI
# ==================================================

@app.post("/chat")
def chat(request: ChatRequest):
    if groq_client is None:
        raise HTTPException(
            status_code=503,
            detail="Groq API key is not configured on the backend."
        )

    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Please enter a message."
        )

    messages = [
        {
            "role": "system",
            "content": (
                "You are MILO, a personal AI assistant created by "
                "Bhumi Bhavsar. Your name is Milo. If asked your name, "
                "introduce yourself as Milo. If asked who created you, "
                "say Bhumi Bhavsar created you.\n\n"
                "PERSONALITY:\n"
                "- Be friendly, natural, helpful, and conversational.\n"
                "- Answer the actual question instead of giving generic "
                "greetings or fallback messages.\n"
                "- Support Hindi, Hinglish, Marathi, Gujarati, and English.\n"
                "- Respond in the language the user uses whenever possible.\n"
                "- Explain difficult topics in simple language when useful.\n"
                "- Use previous conversation messages for context.\n"
                "- Never claim an action succeeded unless it really did.\n"
                "- Be honest about your tools and capabilities."
            )
        }
    ]

    # Include only valid recent conversation messages.
    for item in request.history[-10:]:
        role = item.get("role")
        content = item.get("content", "")

        if (
            role in ("user", "assistant")
            and isinstance(content, str)
            and content.strip()
        ):
            messages.append({
                "role": role,
                "content": content[:6000]
            })

    # The frontend history contains previous messages only.
    messages.append({
        "role": "user",
        "content": message
    })

    try:
        completion = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            temperature=0.7,
            max_tokens=1024
        )

        answer = completion.choices[0].message.content

        if not answer or not answer.strip():
            answer = (
                "Mujhe abhi answer nahi mila. "
                "Please ek baar phir try karo."
            )

        return {"response": answer.strip()}

    except Exception as error:
        # Detailed error appears in Render logs, not in the UI.
        print("Chat error:", repr(error))

        raise HTTPException(
            status_code=502,
            detail="MILO could not generate a response. Check backend logs."
        )


# ==================================================
# SPEECH TRANSCRIPTION - GROQ WHISPER
# ==================================================

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if groq_client is None:
        raise HTTPException(
            status_code=503,
            detail="Groq API key is not configured."
        )

    temp_path = None

    try:
        audio_bytes = await file.read()

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="No audio received."
            )

        suffix = os.path.splitext(
            file.filename or "recording.webm"
        )[1] or ".webm"

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        with open(temp_path, "rb") as audio_file:
            transcription = groq_client.audio.transcriptions.create(
                file=(
                    os.path.basename(temp_path),
                    audio_file.read()
                ),
                model="whisper-large-v3-turbo",
                response_format="text"
            )

        if isinstance(transcription, str):
            text_result = transcription.strip()
        else:
            text_result = getattr(
                transcription, "text", ""
            ).strip()

        return {"text": text_result}

    except HTTPException:
        raise

    except Exception as error:
        print("Transcription error:", repr(error))
        raise HTTPException(
            status_code=502,
            detail="Audio transcription failed. Check backend logs."
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


# ==================================================
# ACTIONS
# ==================================================

@app.post("/action")
def perform_action(request: ActionRequest):
    action = (request.action or request.app or "").strip().lower()

    if not action:
        raise HTTPException(
            status_code=400,
            detail="No action provided."
        )

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

    if action in website_actions:
        service_name = action.replace("open ", "").title()

        return {
            "success": True,
            "type": "website",
            "url": website_actions[action],
            "message": f"Opening {service_name}."
        }

    return {
        "success": False,
        "message": (
            "This action is not supported by the cloud backend. "
            "Opening local desktop applications requires a local agent."
        )
    }


# ==================================================
# YOUTUBE SEARCH
# ==================================================

@app.post("/youtube")
def youtube_search(request: YouTubeRequest):
    query = request.query.strip()

    if not query:
        raise HTTPException(
            status_code=400,
            detail="Please enter a search query."
        )

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
            thumbnail = (
                snippet.get("thumbnails", {})
                .get("high", {})
                .get("url", "")
            )

            results.append({
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "thumbnail": thumbnail,
                "url": f"https://www.youtube.com/watch?v={video_id}"
            })

        return {
            "results": results,
            "message": (
                "YouTube results found."
                if results
                else "No YouTube results found."
            )
        }

    except Exception as error:
        print("YouTube search error:", repr(error))
        raise HTTPException(
            status_code=502,
            detail="YouTube search failed. Check backend logs."
        )


# ==================================================
# WEATHER - NOT CONFIGURED
# ==================================================

@app.post("/weather")
def weather(request: WeatherRequest):
    # Add a weather provider/API here before enabling this feature.
    return {
        "success": False,
        "message": (
            "Weather service is not configured yet. "
            "A weather API integration is required."
        )
    }


# ==================================================
# CONTACT / WHATSAPP - NOT CONFIGURED
# ==================================================

@app.post("/add_contact")
def add_contact(request: ContactRequest):
    # Cloud servers cannot directly add contacts to your phone.
    return {
        "success": False,
        "message": (
            "Adding contacts requires an authorized device-side integration."
        )
    }


@app.post("/whatsapp")
def whatsapp(request: WhatsAppRequest):
    # This endpoint does not send WhatsApp messages.
    # Use an authorized WhatsApp integration or a click-to-chat link.
    return {
        "success": False,
        "message": (
            "WhatsApp sending is not configured. "
            "An authorized WhatsApp integration is required."
        )
    }


# ==================================================
# TEXT-TO-SPEECH - NOT IMPLEMENTED
# ==================================================

@app.post("/tts")
def text_to_speech(request: TTSRequest):
    if not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="No text provided."
        )

    # Azure credentials alone do not implement speech synthesis.
    # Integrate Azure Speech SDK/API before returning audio.
    raise HTTPException(
        status_code=501,
        detail="Text-to-speech is not implemented yet."
    )


# ==================================================
# RUN LOCALLY
# ==================================================
# Local:
# uvicorn main:app --reload --host 127.0.0.1 --port 8000
#
# Render:
# uvicorn main:app --host 0.0.0.0 --port $PORT
