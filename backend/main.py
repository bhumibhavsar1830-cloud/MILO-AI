from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from groq import Groq
from typing import List, Optional
import os
import subprocess
import requests
import json
import azure.cognitiveservices.speech as speechsdk
import pywhatkit
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="Milo AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://milo-ai-lilac.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

SYSTEM_PROMPT = (
    "You are Milo, an AI assistant developed by Bhumi. "
    "You speak Hindi, Marathi, Gujarati, and English. "
    "Introduce yourself briefly when asked who you are. "
    "Match the language used by the user. "
    "Keep responses natural, concise, conversational, and suitable for speech. "
    "Avoid unnecessary markdown formatting."
)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")

VOICE_MAP = {
    "hi": "hi-IN-SwaraNeural",
    "en": "en-IN-NeerjaNeural",
    "gu": "gu-IN-DhwaniNeural",
    "mr": "mr-IN-AarohiNeural",
}

APP_COMMANDS = {
    "chrome": "chrome",
    "notepad": "notepad",
    "calculator": "calc",
    "vscode": "code",
    "files": "explorer",
    "instagram": "https://instagram.com",
    "youtube": "https://youtube.com",
    "maps": "https://maps.google.com",
    "whatsapp": "https://web.whatsapp.com",
}

CONTACTS_FILE = os.path.join(os.path.dirname(__file__), "contacts.json")


def load_contacts():
    if not os.path.exists(CONTACTS_FILE):
        return {}
    try:
        with open(CONTACTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_contacts(contacts):
    with open(CONTACTS_FILE, "w", encoding="utf-8") as f:
        json.dump(contacts, f, indent=2, ensure_ascii=False)


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


class YoutubeRequest(BaseModel):
    query: str


class YoutubeResponse(BaseModel):
    status: str
    message: str


class SpeakRequest(BaseModel):
    text: str
    lang: str = "hi"


class WeatherRequest(BaseModel):
    city: str = "Pune"


class WeatherResponse(BaseModel):
    status: str
    message: str


class WhatsappRequest(BaseModel):
    contact: str
    message: str


class WhatsappResponse(BaseModel):
    status: str
    message: str


class AddContactRequest(BaseModel):
    name: str
    number: str


class AddContactResponse(BaseModel):
    status: str
    message: str


@app.get("/")
def health_check():
    return {"status": "Milo backend is running"}


@app.get("/health")
def health():
    return {"status": "ok", "groq_configured": client is not None}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    if client is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is missing. Check backend/.env.",
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    for item in (request.history or [])[-12:]:
        if item.role in ("user", "assistant") and item.content.strip():
            messages.append({
                "role": item.role,
                "content": item.content,
            })

    messages.append({"role": "user", "content": request.message})

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
        )
        answer = completion.choices[0].message.content

        if not answer:
            answer = "Sorry, I couldn't generate an answer."

        return ChatResponse(reply=answer.strip())

    except Exception as e:
        print("Groq chat error:", repr(e))
        from fastapi import HTTPException
        raise HTTPException(
            status_code=502,
            detail="MILO could not get a response from Groq. Check the backend terminal.",
        )


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if client is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Groq API key is missing.")

    try:
        audio_bytes = await file.read()
        transcription = client.audio.transcriptions.create(
            file=(file.filename or "audio.wav", audio_bytes),
            model="whisper-large-v3-turbo",
        )
        return {"transcript": transcription.text}
    except Exception as e:
        print("Transcription error:", repr(e))
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail="Audio transcription failed.")


@app.post("/action", response_model=ActionResponse)
def open_app(request: ActionRequest):
    app_name = request.app.lower().strip()
    target = APP_COMMANDS.get(app_name)

    if not target:
        return ActionResponse(
            status="error",
            message=f"'{app_name}' abhi supported nahi hai",
        )

    try:
        if target.startswith("https://"):
            import webbrowser
            webbrowser.open(target)
        else:
            subprocess.Popen(target, shell=True)

        return ActionResponse(status="success", message=f"{app_name} khol diya")
    except Exception as e:
        print("Action error:", repr(e))
        return ActionResponse(status="error", message="App open nahi ho paya.")


@app.post("/youtube", response_model=YoutubeResponse)
def play_youtube(request: YoutubeRequest):
    if not YOUTUBE_API_KEY:
        return YoutubeResponse(
            status="error",
            message="YOUTUBE_API_KEY backend/.env mein configure nahi hai.",
        )

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
        res.raise_for_status()
        data = res.json()

        if not data.get("items"):
            return YoutubeResponse(
                status="error",
                message=f"'{request.query}' ke liye video nahi mila.",
            )

        video = data["items"][0]
        video_id = video["id"]["videoId"]
        title = video["snippet"]["title"]
        video_url = f"https://www.youtube.com/watch?v={video_id}"

        import webbrowser
        webbrowser.open(video_url)

        return YoutubeResponse(
            status="success",
            message=f"Playing: {title}",
        )
    except Exception as e:
        print("YouTube error:", repr(e))
        return YoutubeResponse(status="error", message="YouTube request failed.")


@app.post("/speak")
def speak(request: SpeakRequest):
    if not AZURE_SPEECH_KEY or not AZURE_SPEECH_REGION:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Azure Speech credentials are missing.",
        )

    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=AZURE_SPEECH_KEY,
            region=AZURE_SPEECH_REGION,
        )
        speech_config.speech_synthesis_voice_name = VOICE_MAP.get(
            request.lang, "en-IN-NeerjaNeural"
        )
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=None,
        )
        result = synthesizer.speak_text_async(request.text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return Response(content=result.audio_data, media_type="audio/mpeg")

        print("Azure speech error:", getattr(result, "reason", "unknown"))
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail="Speech synthesis failed.")

    except Exception as e:
        print("Speech error:", repr(e))
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail="Speech synthesis failed.")


@app.post("/weather", response_model=WeatherResponse)
def get_weather(request: WeatherRequest):
    try:
        geo_res = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": request.city, "count": 1},
            timeout=15,
        )
        geo_res.raise_for_status()
        geo_data = geo_res.json()

        if not geo_data.get("results"):
            return WeatherResponse(
                status="error",
                message=f"'{request.city}' nahi mila.",
            )

        location = geo_data["results"][0]
        lat, lon = location["latitude"], location["longitude"]
        city_name = location["name"]

        weather_res = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current_weather": True,
            },
            timeout=15,
        )
        weather_res.raise_for_status()
        weather_data = weather_res.json().get("current_weather")

        if not weather_data:
            return WeatherResponse(status="error", message="Weather data unavailable.")

        temp = weather_data["temperature"]
        wind = weather_data["windspeed"]

        return WeatherResponse(
            status="success",
            message=f"{city_name} mein abhi temperature {temp}°C hai aur wind speed {wind} km/h hai.",
        )
    except Exception as e:
        print("Weather error:", repr(e))
        return WeatherResponse(status="error", message="Weather request failed.")


@app.post("/whatsapp", response_model=WhatsappResponse)
def send_whatsapp(request: WhatsappRequest):
    contacts = load_contacts()
    contact_key = request.contact.lower().strip()
    phone = contacts.get(contact_key)

    if not phone:
        for name, number in contacts.items():
            if contact_key in name or name in contact_key:
                phone = number
                break

    if not phone:
        return WhatsappResponse(
            status="error",
            message=f"'{request.contact}' ka number save nahi hai. Pehle contact save karo.",
        )

    try:
        pywhatkit.sendwhatmsg_instantly(
            phone,
            request.message,
            wait_time=15,
            tab_close=True,
        )
        return WhatsappResponse(
            status="success",
            message=f"{request.contact} ke liye WhatsApp message action start kiya.",
        )
    except Exception as e:
        print("WhatsApp error:", repr(e))
        return WhatsappResponse(
            status="error",
            message="WhatsApp message send nahi ho paya. WhatsApp Web login check karo.",
        )


@app.post("/add_contact", response_model=AddContactResponse)
def add_contact(request: AddContactRequest):
    contacts = load_contacts()
    name_key = request.name.lower().strip()
    number = request.number.strip().replace(" ", "").replace("-", "")

    if not name_key or not number:
        return AddContactResponse(
            status="error",
            message="Name aur number dono required hain.",
        )

    if not number.startswith("+"):
        number = "+91" + number

    contacts[name_key] = number
    save_contacts(contacts)

    return AddContactResponse(
        status="success",
        message=f"{request.name} ka number save kar diya.",
    )
