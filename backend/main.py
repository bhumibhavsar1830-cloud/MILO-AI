from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from groq import Groq
from typing import List, Optional
from xml.sax.saxutils import escape
import os
import subprocess
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Milo AI Backend")

FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if FRONTEND_URL:
    allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = (
    "You are Milo, an AI assistant developed by Bhumi. "
    "You are multilingual and can speak Hindi, Marathi, Gujarati, and English. "
    "If someone asks who you are or introduces themselves to you for the first time, "
    "briefly introduce yourself as Milo, built by Bhumi, and mention you can speak "
    "Hindi, Marathi, Gujarati and English. Don't repeat this introduction in every reply. "
    "Always reply in plain, natural sentences without any markdown formatting "
    "(no asterisks, no bullet points, no numbered lists, no headers). "
    "Match your reply language to the user's input: if they wrote in English, reply in English. "
    "If they wrote in Hindi (Devanagari script) or Hinglish, reply in Hindi. "
    "If they wrote in Gujarati, reply in Gujarati. "
    "Never mix multiple languages within a single reply unless the user did so first. "
    "If the input language is unclear, default to English. "
    "Keep responses concise and conversational, suitable for being spoken aloud."
)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")

VOICE_MAP = {
    "hi": "hi-IN-SwaraNeural",
    "en": "en-IN-NeerjaNeural",
    "gu": "gu-IN-DhwaniNeural",
}

# Ye web apps user ke apne device pe khulte hain (frontend link kholta hai)
WEB_APPS = {
    "instagram": "https://instagram.com",
    "youtube": "https://youtube.com",
    "maps": "https://maps.google.com",
    "whatsapp": "https://web.whatsapp.com",
}

# Ye sirf tab chalte hain jab backend tumhare Windows laptop pe local chal raha ho
LOCAL_APPS = {
    "chrome": "chrome",
    "notepad": "notepad",
    "calculator": "calc",
    "vscode": "code",
    "files": "explorer",
}

IS_WINDOWS = os.name == "nt"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    reply: str


class ActionRequest(BaseModel):
    app: str


class ActionResponse(BaseModel):
    status: str
    message: str
    url: Optional[str] = None


class YoutubeRequest(BaseModel):
    query: str


class YoutubeResponse(BaseModel):
    status: str
    message: str
    url: Optional[str] = None


class SpeakRequest(BaseModel):
    text: str
    lang: str = "hi"


class WeatherRequest(BaseModel):
    city: str = "Pune"


class WeatherResponse(BaseModel):
    status: str
    message: str


@app.get("/")
def health_check():
    return {"status": "Milo backend is running"}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in request.history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": request.message})

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
    )
    return ChatResponse(reply=completion.choices[0].message.content)


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    transcription = client.audio.transcriptions.create(
        file=(file.filename or "voice.webm", audio_bytes),
        model="whisper-large-v3-turbo",
        temperature=0,
    )
    return {"transcript": transcription.text}


@app.post("/action", response_model=ActionResponse)
def open_app(request: ActionRequest):
    app_name = request.app.lower().strip()

    if app_name in WEB_APPS:
        return ActionResponse(
            status="success",
            message=f"{app_name} khol raha hoon ✅",
            url=WEB_APPS[app_name],
        )

    if app_name in LOCAL_APPS:
        if IS_WINDOWS:
            try:
                subprocess.Popen(f"start {LOCAL_APPS[app_name]}", shell=True)
                return ActionResponse(status="success", message=f"{app_name} khol diya ✅")
            except Exception as e:
                return ActionResponse(status="error", message=str(e))
        return ActionResponse(
            status="error",
            message=f"{app_name} sirf laptop pe local Milo backend ke saath khulta hai, cloud version se nahi.",
        )

    return ActionResponse(status="error", message=f"'{app_name}' abhi supported nahi hai")


@app.post("/youtube", response_model=YoutubeResponse)
def play_youtube(request: YoutubeRequest):
    if not YOUTUBE_API_KEY:
        return YoutubeResponse(status="error", message="YouTube API key set nahi hai")
    try:
        res = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": request.query,
                "type": "video",
                "maxResults": 1,
                "key": YOUTUBE_API_KEY,
            },
            timeout=15,
        )
        data = res.json()

        if not data.get("items"):
            return YoutubeResponse(status="error", message=f"'{request.query}' ke liye kuch nahi mila")

        video_id = data["items"][0]["id"]["videoId"]
        title = data["items"][0]["snippet"]["title"]
        video_url = f"https://www.youtube.com/watch?v={video_id}"

        return YoutubeResponse(status="success", message=f"Playing: {title} 🎵", url=video_url)
    except Exception as e:
        return YoutubeResponse(status="error", message=str(e))


@app.post("/speak")
def speak(request: SpeakRequest):
    if not AZURE_SPEECH_KEY or not AZURE_SPEECH_REGION:
        raise HTTPException(status_code=500, detail="Azure Speech keys set nahi hain")

    voice = VOICE_MAP.get(request.lang, VOICE_MAP["hi"])
    lang_tag = voice[:5]
    ssml = (
        f"<speak version='1.0' xml:lang='{lang_tag}'>"
        f"<voice name='{voice}'>{escape(request.text)}</voice>"
        f"</speak>"
    )

    res = requests.post(
        f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={
            "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
            "User-Agent": "milo-ai",
        },
        data=ssml.encode("utf-8"),
        timeout=30,
    )

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Azure TTS error {res.status_code}")

    return Response(content=res.content, media_type="audio/mpeg")


@app.post("/weather", response_model=WeatherResponse)
def get_weather(request: WeatherRequest):
    try:
        geo_res = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": request.city, "count": 1},
            timeout=15,
        )
        geo_data = geo_res.json()

        if not geo_data.get("results"):
            return WeatherResponse(status="error", message=f"'{request.city}' nahi mila")

        location = geo_data["results"][0]
        lat, lon = location["latitude"], location["longitude"]
        city_name = location["name"]

        weather_res = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": lat, "longitude": lon, "current_weather": True},
            timeout=15,
        )
        weather_data = weather_res.json()["current_weather"]
        temp = weather_data["temperature"]
        wind = weather_data["windspeed"]

        return WeatherResponse(
            status="success",
            message=f"{city_name} mein abhi temperature {temp}°C hai aur wind speed {wind} km/h hai",
        )
    except Exception as e:
        return WeatherResponse(status="error", message=str(e))