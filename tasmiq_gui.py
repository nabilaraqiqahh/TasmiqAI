import os
import json
import threading
import queue
import time
import difflib
import logging
import traceback
import numpy as np
import librosa
import soundfile as sf
import sounddevice as sd
import torch
import pygame
import customtkinter as ctk
from pathlib import Path
from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC

# ── LOGGING ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── PATHS ──────────────────────────────────────────────────────────────────────
BASE_DIR = Path(r"C:\Users\nabil\.gemini\antigravity\scratch\quranjson\source")
AUDIO_DIR = BASE_DIR / "audio"
SURAH_DIR = BASE_DIR / "surah"
TEMP_REC = Path("user_rec.wav")

# ── MAKHRAJ DATA ─────────────────────────────────────────────────────────────
MAKHRAJ_MAP = {
    'q': {'char': 'ق', 'desc': 'Deep Throat / Uvula (Aqsa al-Lisan)', 'rule': 'Qalqalah Echo'},
    'gh': {'char': 'غ', 'desc': 'Upper Throat (Adna al-Halq)', 'rule': 'Heavy sound'},
    'kh': {'char': 'خ', 'desc': 'Upper Throat (Adna al-Halq)', 'rule': 'Heavy sound'},
    'h': {'char': 'ح', 'desc': 'Middle Throat (Wasat al-Halq)', 'rule': 'Sharp clear H'},
    'H': {'char': 'ه', 'desc': 'Bottom of Throat (Aqsa al-Halq)', 'rule': 'Deep breathy H'},
    'S': {'char': 'ص', 'desc': 'Tip of tongue + Front teeth', 'rule': 'Heavy whistle'},
    'D': {'char': 'ض', 'desc': 'Side of tongue + Molars', 'rule': 'Heaviest Arabic sound'},
    'T': {'char': 'ط', 'desc': 'Tip of tongue + Upper Gums', 'rule': 'Strong heavy sound'},
    'Z': {'char': 'ظ', 'desc': 'Tip of tongue + Teeth edges', 'rule': 'Heavy V/Z'},
}

# ── APP CORE ───────────────────────────────────────────────────────────────────
class TasmiqExpertApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("📖 TasmiqAI — Quran Expert System")
        self.geometry("900x850")
        self.configure(fg_color="#FAFAF7")
        ctk.set_appearance_mode("Light")
        ctk.set_default_color_theme("green")

        # State
        self.quran_data = {}
        self.processor = None
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.is_recording = False
        self.recording_data = []
        pygame.mixer.init()

        # UI
        self.setup_ui()
        
        # Load Data in Background
        threading.Thread(target=self.initialize_system, daemon=True).start()

    def setup_ui(self):
        # Greeting Header
        self.greeting = ctk.CTkLabel(self, text="Assalamualaikum, Ahmad 👋", 
                                     font=ctk.CTkFont(family="Segoe UI", size=28, weight="bold"),
                                     text_color="#2D3748")
        self.greeting.pack(pady=(30, 5), anchor="w", padx=40)
        
        self.header = ctk.CTkLabel(self, text="Today's Practice: Expert Recitation", 
                                   font=ctk.CTkFont(family="Segoe UI", size=16),
                                   text_color="#7FAF9A")
        self.header.pack(anchor="w", padx=40, pady=(0, 10))

        self.status_lbl = ctk.CTkLabel(self, text="⏳ System Initializing...", text_color="#C8B6E2", font=ctk.CTkFont(weight="bold"))
        self.status_lbl.pack(pady=(0, 10))

        # Selection Card
        self.sel_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=15, border_width=0)
        self.sel_frame.pack(fill="x", padx=40, pady=10)
        
        self.surah_var = ctk.StringVar(value="Waiting for dataset...")
        self.surah_dd = ctk.CTkOptionMenu(self.sel_frame, variable=self.surah_var, 
                                          command=self.on_selection_change, width=350,
                                          fg_color="#F6E8A6", text_color="#2D3748", button_color="#E5D695", button_hover_color="#D4C584")
        self.surah_dd.pack(side="left", padx=15, pady=20)
        
        ctk.CTkLabel(self.sel_frame, text="Ayah:", text_color="#2D3748", font=ctk.CTkFont(weight="bold")).pack(side="left", padx=(20, 5))
        self.ayah_spin = ctk.CTkOptionMenu(self.sel_frame, values=["1"], width=100, 
                                           command=self.on_selection_change,
                                           fg_color="#F6E8A6", text_color="#2D3748", button_color="#E5D695", button_hover_color="#D4C584")
        self.ayah_spin.pack(side="left", padx=15)

        # Content (Arabic) Card
        self.content_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=15)
        self.content_frame.pack(fill="both", expand=True, padx=40, pady=10)
        
        self.arabic_box = ctk.CTkTextbox(self.content_frame, font=ctk.CTkFont(family="Amiri", size=42),
                                         wrap="word", height=200, fg_color="#FFFFFF", text_color="#2D3748")
        self.arabic_box.pack(fill="both", expand=True, padx=20, pady=20)

        # Controls Card
        self.ctrl_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=15)
        self.ctrl_frame.pack(fill="x", padx=40, pady=10)
        
        self.play_btn = ctk.CTkButton(self.ctrl_frame, text="🔊 Listen to Qari", 
                                       command=self.play_reference, state="disabled",
                                       fg_color="#C8B6E2", hover_color="#B7A5D1", text_color="#2D3748", corner_radius=20, height=45)
        self.play_btn.pack(side="left", padx=15, pady=20)
        
        self.record_btn = ctk.CTkButton(self.ctrl_frame, text="🎤 Start Recording", 
                                         fg_color="#7FAF9A", hover_color="#6B9E88", text_color="#FFFFFF",
                                         command=self.toggle_recording, state="disabled", corner_radius=20, height=45)
        self.record_btn.pack(side="left", padx=15)
        
        self.assess_btn = ctk.CTkButton(self.ctrl_frame, text="✅ Submit to Teacher", 
                                        command=self.run_assessment, state="disabled",
                                        fg_color="#7FAF9A", hover_color="#6B9E88", text_color="#FFFFFF", corner_radius=20, height=45)
        self.assess_btn.pack(side="right", padx=15)

        # Analysis Result Card
        self.res_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=15)
        self.res_frame.pack(fill="both", expand=True, padx=40, pady=(10, 30))

        self.res_title = ctk.CTkLabel(self.res_frame, text="📊 Progress & Feedback", font=ctk.CTkFont(family="Segoe UI", size=18, weight="bold"), text_color="#2D3748")
        self.res_title.pack(pady=(15, 5))
        
        self.res_box = ctk.CTkTextbox(self.res_frame, height=120, fg_color="#FAFAF7", text_color="#2D3748", corner_radius=10)
        self.res_box.pack(fill="both", expand=True, padx=20, pady=(5, 20))

    def initialize_system(self):
        try:
            # Load Dataset
            files = sorted(SURAH_DIR.glob("surah_*.json"), key=lambda p: int(p.stem.split('_')[1]))
            for fpath in files:
                with open(fpath, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                    self.quran_data[int(d['index'])] = d
            
            s_options = [f"{i:03d}. {self.quran_data[i].get('name')}" for i in range(1, 115)]
            self.surah_dd.configure(values=s_options)
            self.surah_var.set(s_options[0])

            # Load Model
            self.processor = Wav2Vec2Processor.from_pretrained("TBOGamer22/wav2vec2-quran-phonetics")
            self.model = Wav2Vec2ForCTC.from_pretrained("TBOGamer22/wav2vec2-quran-phonetics")
            self.model.eval().to(self.device)
            
            self.status_lbl.configure(text="✅ System Ready to Practice", text_color="#7FAF9A")
            self.play_btn.configure(state="normal")
            self.record_btn.configure(state="normal")
            self.assess_btn.configure(state="normal")
            self.on_selection_change()
        except Exception:
            self.status_lbl.configure(text="❌ Error during initialization", text_color="#E57373")
            logger.error(traceback.format_exc())

    def on_selection_change(self, _=None):
        try:
            s_idx = int(self.surah_var.get().split('.')[0])
            count = self.quran_data[s_idx].get('count', 0)
            self.ayah_spin.configure(values=[str(i) for i in range(1, count + 1)])
            
            a_idx = int(self.ayah_spin.get())
            text = self.quran_data[s_idx]['verse'].get(f'verse_{a_idx}', "")
            self.arabic_box.delete("1.0", "end")
            self.arabic_box.insert("1.0", f"\n{text}")
        except Exception: pass

    def play_reference(self):
        s_idx = int(self.surah_var.get().split('.')[0])
        a_idx = int(self.ayah_spin.get())
        p = AUDIO_DIR / f"{s_idx:03d}" / f"{a_idx:03d}.mp3"
        if p.exists():
            pygame.mixer.music.load(str(p))
            pygame.mixer.music.play()

    def toggle_recording(self):
        if not self.is_recording:
            self.is_recording = True
            self.record_btn.configure(text="🛑 Stop Recording", fg_color="#E57373", hover_color="#D32F2F")
            self.recording_data = []
            threading.Thread(target=self.record_loop).start()
        else:
            self.is_recording = False
            self.record_btn.configure(text="🎤 Start Recording", fg_color="#7FAF9A", hover_color="#6B9E88")

    def record_loop(self):
        try:
            with sd.InputStream(samplerate=16000, channels=1, dtype='float32') as stream:
                while self.is_recording:
                    data, _ = stream.read(1024)
                    self.recording_data.append(data)
            if self.recording_data:
                audio = np.concatenate(self.recording_data, axis=0)
                sf.write(TEMP_REC, audio, 16000)
        except Exception as e:
            self.is_recording = False
            self.record_btn.configure(text="🎤 Start Recording", fg_color="#7FAF9A", hover_color="#6B9E88")
            self.status_lbl.configure(text=f"❌ Mic Error: {str(e)[:40]}", text_color="#E57373")
            logger.error(f"Microphone recording failed: {traceback.format_exc()}")

    def run_assessment(self):
        if not TEMP_REC.exists():
            self.status_lbl.configure(text="⚠️ No recording found. Record voice first.", text_color="#E57373")
            return
        self.status_lbl.configure(text="⏳ Running Expert Analysis...", text_color="#C8B6E2")
        self.assess_btn.configure(state="disabled", text="⏳ Analyzing...")
        threading.Thread(target=self.analyze).start()

    def analyze(self):
        try:
            # User
            u_arr, _ = librosa.load(TEMP_REC, sr=16000)
            u_arr, _ = librosa.effects.trim(u_arr, top_db=25)
            u_arr = librosa.util.normalize(u_arr)
            u_ph = self.infer(u_arr)

            # Ref
            s_idx = int(self.surah_var.get().split('.')[0])
            a_idx = int(self.ayah_spin.get())
            ref_p = AUDIO_DIR / f"{s_idx:03d}" / f"{a_idx:03d}.mp3"
            r_ph = ""
            if ref_p.exists():
                r_arr, _ = librosa.load(ref_p, sr=16000)
                r_arr, _ = librosa.effects.trim(r_arr, top_db=25)
                r_arr = librosa.util.normalize(r_arr)
                r_ph = self.infer(r_arr)

            # Compare
            ratio = difflib.SequenceMatcher(None, r_ph, u_ph).ratio()
            self.display_results(ratio, r_ph, u_ph)
        except Exception:
            logger.error(traceback.format_exc())
        finally:
            self.assess_btn.configure(state="normal", text="✅ Run Expert Analysis")

    def infer(self, arr):
        inp = self.processor(arr, sampling_rate=16000, return_tensors="pt", padding=True).to(self.device).input_values
        with torch.no_grad():
            logits = self.model(inp).logits
        ids = torch.argmax(logits, dim=-1)
        return self.processor.batch_decode(ids, skip_special_tokens=True)[0].strip()

    def display_results(self, ratio, r_ph, u_ph):
        res = f"🏆 Score: {ratio*100:.1f}%\n"
        res += f"----------------------------------------\n"
        res += f"🎯 Target (Ref): {r_ph}\n"
        res += f"🎙️ Heard (You):  {u_ph}\n\n"
        
        errors = [c for c in r_ph.split() if c not in u_ph and c in MAKHRAJ_MAP]
        if errors:
            res += "💡 Expert Makhraj Guidance:\n"
            for e in set(errors):
                m = MAKHRAJ_MAP[e]
                res += f"- '{e}' ({m['char']}): {m['desc']}. Rule: {m['rule']}\n"
        elif ratio > 0.85:
            res += "🟢 MashAllah! Excellent pronunciation."
        else:
            res += "🟡 Good attempt. Practice the specific sounds above."
            
        self.res_box.delete("1.0", "end")
        self.res_box.insert("1.0", res)

if __name__ == "__main__":
    app = TasmiqExpertApp()
    app.mainloop()
