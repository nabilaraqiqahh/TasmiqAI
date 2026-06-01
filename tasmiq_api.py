import os
import shutil

# Add local FFmpeg binary to PATH so librosa can decode Expo WebM audio
ffmpeg_path = r'E:\TasmiqAI\deps\imageio_ffmpeg\binaries'
if ffmpeg_path not in os.environ['PATH']:
    os.environ['PATH'] = ffmpeg_path + os.pathsep + os.environ['PATH']

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tempfile

from fastapi.staticfiles import StaticFiles

# Import the existing expert system logic!
import tasmiq_app

app = FastAPI(title="TasmiqAI Expert API")

# Mount the audio directory to serve reference recitations
# Path: C:\Users\nabil\.gemini\antigravity\scratch\quranjson\source\audio
if os.path.exists(tasmiq_app.AUDIO_DIR):
    app.mount("/audio", StaticFiles(directory=str(tasmiq_app.AUDIO_DIR)), name="audio")

# Add CORS so mobile app can talk to it
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    print("Loading dataset...")
    if not tasmiq_app.load_dataset():
        print("WARNING: Dataset failed to load.")
    print("Loading AI model (Wav2Vec2)...")
    if not tasmiq_app.load_model():
        print("WARNING: Model failed to load.")
    print("Startup complete.")

@app.get("/")
async def root():
    return {"message": "TasmiqAI API is running!"}

@app.post("/analyze")
async def analyze_recitation(
    surah: int = Form(...),
    ayah: str = Form(...),
    audio: UploadFile = File(...)
):
    try:
        # Save uploaded audio to a temporary file
        temp_dir = tempfile.gettempdir()
        temp_audio_path = os.path.join(temp_dir, audio.filename or "temp_audio.wav")
        
        with open(temp_audio_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
            
        # Format the surah label exactly as tasmiq_app expects it: "001. Al-Fatihah"
        # Since we just need the number for it to parse (e.g. s_idx = int(surah_label.split('.')[0]))
        # We can just pass the number as a string like "1."
        surah_label = f"{surah}."
        
        # Run the existing expert assessment!
        full_feedback, ref_ph, user_ph, score_pct, tips_html = tasmiq_app.assess_recitation(
            surah_label, 
            ayah, 
            temp_audio_path
        )
        
        # Parse the score percentage to a number
        try:
            score = float(score_pct.replace('%', ''))
        except ValueError:
            score = 0
            
        # Clean up temp file
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
            
        # Clean up HTML and special tokens for the mobile app
        import re
        clean_feedback = full_feedback.split('</b>')[0].replace('<b>', '')
        # Remove emojis if desired, or keep them. Let's keep them.
        
        # Remove Whisper special tokens
        tokens_to_remove = ['<|ar|>', '<|transcribe|>', '<|notimestamps|>']
        clean_ref_ph = ref_ph
        clean_user_ph = user_ph
        for t in tokens_to_remove:
            clean_ref_ph = clean_ref_ph.replace(t, '')
            clean_user_ph = clean_user_ph.replace(t, '')
            
        return {
            "status": "success",
            "score": score,
            "tajwid": score, # using total score as fallback
            "makhraj": score,
            "feedback": clean_feedback.strip(),
            "makhraj_tips": tips_html,
            "ref_phonetics": clean_ref_ph.strip(),
            "user_phonetics": clean_user_ph.strip()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
