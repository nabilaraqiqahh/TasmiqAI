import os
import json
import logging
import traceback
import difflib
import numpy as np
import librosa
import soundfile as sf
import torch
from pathlib import Path
from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC, pipeline

# ── LOGGING SETTINGS ──────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# ── DATASET PATHS ──────────────────────────────────────────────────────────────
BASE_DIR = Path(r"C:\Users\nabil\.gemini\antigravity\scratch\quranjson\source")
AUDIO_DIR = BASE_DIR / "audio"
SURAH_DIR = BASE_DIR / "surah"

# ── MAKHRAJ & PHONETIC KNOWLEDGE BASE ─────────────────────────────────────────
# Maps phonetic tokens from the model to their Arabic equivalents and Makhraj
MAKHRAJ_MAP = {
    'q': {'char': 'ق', 'desc': 'Deep Throat / Uvula. (Aqsa al-Lisan)', 'rule': 'Qalqalah (Echo) if Sakin'},
    'gh': {'char': 'غ', 'desc': 'Upper Throat. (Adna al-Halq)', 'rule': 'Heavy sound'},
    'kh': {'char': 'خ', 'desc': 'Upper Throat. (Adna al-Halq)', 'rule': 'Heavy sound'},
    'h': {'char': 'ح', 'desc': 'Middle Throat. (Wasat al-Halq)', 'rule': 'Sharp, clear H'},
    'H': {'char': 'ه', 'desc': 'Bottom of Throat. (Aqsa al-Halq)', 'rule': 'Deep breathy H'},
    'S': {'char': 'ص', 'desc': 'Tip of tongue + Front teeth. (Tarf al-Lisan)', 'rule': 'Heavy whistle'},
    'D': {'char': 'ض', 'desc': 'Side of tongue + Molars. (Haffat al-Lisan)', 'rule': 'Heaviest sound'},
    'T': {'char': 'ط', 'desc': 'Tip of tongue + Gums. (Tarf al-Lisan)', 'rule': 'Strong, heavy pick'},
    'Z': {'char': 'ظ', 'desc': 'Tip of tongue + Edges of teeth. (Tarf al-Lisan)', 'rule': 'Heavy V/Z'},
    'th': {'char': 'ث', 'desc': 'Tip of tongue + Edges of teeth.', 'rule': 'Soft "th" as in "Think"'},
    'dh': {'char': 'ذ', 'desc': 'Tip of tongue + Edges of teeth.', 'rule': 'Soft "dh" as in "This"'},
}

from transformers import WhisperProcessor, WhisperForConditionalGeneration

# ── GLOBAL STATE ──────────────────────────────────────────────────────────────
quran_data = {}
processor = None
model = None
asr_pipeline = None
device = "cuda" if torch.cuda.is_available() else "cpu"

# ── DATASET LOADING ──────────────────────────────────────────────────────────
def load_dataset():
    global quran_data
    if not SURAH_DIR.exists(): return False
    surah_files = sorted(SURAH_DIR.glob("surah_*.json"), key=lambda p: int(p.stem.split('_')[1]))
    for sf_path in surah_files:
        with open(sf_path, 'r', encoding='utf-8') as f:
            d = json.load(f)
            quran_data[int(d['index'])] = d
    return True

def load_model():
    global processor, model, asr_pipeline
    # Switching to Tarteel AI's Whisper model as requested
    model_id = "tarteel-ai/whisper-base-ar-quran"
    try:
        # Try local load first to prevent slow Hugging Face update checks from hanging startup
        try:
            logger.info("Attempting to load model from local cache...")
            processor = WhisperProcessor.from_pretrained(model_id, local_files_only=True)
            model = WhisperForConditionalGeneration.from_pretrained(model_id, local_files_only=True)
        except Exception as local_err:
            logger.warning(f"Local model load failed, falling back to online: {local_err}")
            processor = WhisperProcessor.from_pretrained(model_id)
            model = WhisperForConditionalGeneration.from_pretrained(model_id)
            
        model.eval()
        model.to(device)
        
        # Initialize pipeline to handle long audio with 30s chunks
        asr_pipeline = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            chunk_length_s=30,
            stride_length_s=5,
            device=0 if device == "cuda" else -1
        )
        return True
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False


# ── AUDIO PROCESSING ─────────────────────────────────────────────────────────
def process_audio(audio_source, sr=16000):
    try:
        if isinstance(audio_source, tuple):
            orig_sr, arr = audio_source
            arr = arr.astype(np.float32)
            if arr.ndim > 1: arr = arr.mean(axis=1)
            if arr.max() > 1.0: arr = arr / 32768.0
            if orig_sr != sr: arr = librosa.resample(arr, orig_sr=orig_sr, target_sr=sr)
        else:
            try:
                arr, s_rate = sf.read(str(audio_source), dtype='float32')
                if arr.ndim > 1: arr = arr.mean(axis=1)
                if s_rate != sr: arr = librosa.resample(arr, orig_sr=s_rate, target_sr=sr)
            except Exception: arr, _ = librosa.load(str(audio_source), sr=sr, mono=True)
        
        arr, _ = librosa.effects.trim(arr, top_db=25)
        if len(arr) > 0: arr = librosa.util.normalize(arr)
        return arr
    except Exception: return np.array([])

def get_phonetics(audio_arr):
    """
    Using Whisper to get the transcription via pipeline for long audio.
    """
    if len(audio_arr) == 0: return ""
    # Pipeline expects a dictionary with "raw" and "sampling_rate" or just numpy array depending on version, 
    # but providing raw np array is standard.
    result = asr_pipeline(audio_arr)
    return result["text"].strip()

# ── EXPERT DIFF LOGIC ────────────────────────────────────────────────────────
def generate_diff_html(ref, user):
    """
    Creates a side-by-side color-coded HTML diff of two phonetic strings.
    """
    s = difflib.SequenceMatcher(None, ref, user)
    html_ref = []
    html_user = []
    
    for tag, i1, i2, j1, j2 in s.get_opcodes():
        if tag == 'equal':
            html_ref.append(f"<span style='color:green;'>{ref[i1:i2]}</span>")
            html_user.append(f"<span style='color:green;'>{user[j1:j2]}</span>")
        elif tag == 'replace':
            html_ref.append(f"<span style='background:#ffcccc; color:red; text-decoration:line-through;'>{ref[i1:i2]}</span>")
            html_user.append(f"<span style='background:#ffe6e6; color:red; font-weight:bold;'>{user[j1:j2]}</span>")
        elif tag == 'delete':
            html_ref.append(f"<span style='background:#ffcccc; color:red; text-decoration:line-through;'>{ref[i1:i2]}</span>")
        elif tag == 'insert':
            html_user.append(f"<span style='background:#e6f3ff; color:blue; font-weight:bold;'>{user[j1:j2]}</span>")
            
    return "".join(html_ref), "".join(html_user)

def get_makhraj_tips(user_ph, ref_ph):
    tips = []
    errors = set()
    s = difflib.SequenceMatcher(None, ref_ph, user_ph)
    for tag, i1, i2, j1, j2 in s.get_opcodes():
        if tag in ('replace', 'delete'):
            # These are the phonemes the user missed or got wrong
            missing_chars = ref_ph[i1:i2].split()
            for c in missing_chars:
                if c.strip() in MAKHRAJ_MAP:
                    errors.add(c.strip())
    
    if errors:
        tips.append("<b>💡 Expert Makhraj Guidance:</b>")
        for e in errors:
            m = MAKHRAJ_MAP[e]
            tips.append(f"- <b>{m['char']} ({e})</b>: {m['desc']}. <i>Rule: {m['rule']}</i>")
    return "<br>".join(tips) if tips else "✨ Recitation phonetics were mostly aligned."

# ── UI LOGIC ──────────────────────────────────────────────────────────────────
def on_ayah_select(surah_label, ayah_num):
    try:
        s_idx = int(surah_label.split('.')[0])
        a_idx = int(float(ayah_num))
        surah_info = quran_data.get(s_idx, {})
        arabic_text = surah_info.get("verse", {}).get(f"verse_{a_idx}", "Ayah not found")
        audio_path = AUDIO_DIR / f"{s_idx:03d}" / f"{a_idx:03d}.mp3"
        
        # Copy to local directory within current workspace to bypass Gradio path security
        ref_audio = None
        if audio_path.exists():
            import shutil
            cache_dir = Path("./ref_cache")
            cache_dir.mkdir(exist_ok=True)
            local_path = cache_dir / f"{s_idx:03d}_{a_idx:03d}.mp3"
            if not local_path.exists():
                shutil.copy(str(audio_path), str(local_path))
            ref_audio = str(local_path)
            
        target_info = f"📖 {surah_info.get('name')} (Surah {s_idx}) — Ayah {a_idx}"
        return target_info, arabic_text, ref_audio, "✅ Ayah loaded. Listen then record."
    except Exception as e:
        return "Error", str(e), None, "❌ Select valid Surah/Ayah"

def assess_recitation(surah_label, ayah_num, user_audio):
    if user_audio is None: return "⚠️ Record voice first.", "", "", "", ""
    try:
        s_idx = int(surah_label.split('.')[0])
        
        # Handle single ayah or range (e.g., "1-5")
        if isinstance(ayah_num, str) and "-" in ayah_num:
            parts = ayah_num.split("-")
            start_a, end_a = int(parts[0]), int(parts[1])
        else:
            start_a = end_a = int(float(ayah_num))
            
        user_arr = process_audio(user_audio)
        user_ph = get_phonetics(user_arr)
        
        # Collect and concatenate reference audio
        ref_arrs = []
        for a_idx in range(start_a, end_a + 1):
            ref_path = AUDIO_DIR / f"{s_idx:03d}" / f"{a_idx:03d}.mp3"
            if ref_path.exists():
                ref_arrs.append(process_audio(ref_path))
                
        if not ref_arrs: return "⚠️ No reference audio.", "", user_ph, "0%", ""
        
        ref_arr = np.concatenate(ref_arrs) if len(ref_arrs) > 1 else ref_arrs[0]
        ref_ph = get_phonetics(ref_arr)
        
        # 1. Similarity
        ratio = difflib.SequenceMatcher(None, ref_ph, user_ph).ratio()
        score_pct = f"{ratio*100:.1f}%"
        
        # 2. Expert Diff
        diff_ref_html, diff_user_html = generate_diff_html(ref_ph, user_ph)
        
        # 3. Makhraj Tips
        tips_html = get_makhraj_tips(user_ph, ref_ph)
        
        feedback = "🟢 Excellent!" if ratio > 0.85 else "🟡 Good." if ratio > 0.65 else "🟠 Practice." if ratio > 0.4 else "🔴 Significant Diff."
        full_feedback = f"<b>{feedback} (Score: {score_pct})</b><br><br><b>🎯 Ref:</b> {diff_ref_html}<br><b>🎙️ You:</b> {diff_user_html}"
            
        return full_feedback, ref_ph, user_ph, score_pct, tips_html
        
    except Exception as e:
        return f"❌ Error: {e}", "", "", "", ""

# ── MAIN APPLICATION ──────────────────────────────────────────────────────────
def main():
    import gradio as gr
    if not load_dataset() or not load_model(): return

    surah_options = [f"{i:03d}. {quran_data[i].get('name')} ({quran_data[i].get('count')} ayahs)" for i in range(1, 115)]

    css = """
    #title-container { background: #1a472a; color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    #arabic-box textarea { font-size: 32px !important; direction: rtl !important; color: #1a472a !important; font-family: 'Amiri', serif !important; }
    .analysis-box { background: #fdfdfd; border: 1px solid #eee; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 16px; overflow-x: auto; white-space: pre-wrap; }
    .tips-box { background: #fffdf0; border-left: 5px solid #f1c40f; padding: 15px; border-radius: 8px; }
    """

    with gr.Blocks(title="TasmiqAI Expert", theme=gr.themes.Soft(), css=css) as demo:
        ref_ph_state = gr.State()
        user_ph_state = gr.State()
        
        gr.HTML("<div id='title-container'><h1 style='margin:0'>📖 TasmiqAI — Quran Expert System</h1><p style='margin:10px 0 0; opacity: 0.9;'>Differential Phonetic Assessment & Makhraj Analysis</p></div>")
        
        with gr.Row():
            surah_dd = gr.Dropdown(choices=surah_options, value=surah_options[0], label="📂 Surah", scale=3)
            ayah_nb = gr.Number(value=1, minimum=1, label="📜 Ayah #", precision=0, scale=1)
        
        with gr.Row():
            with gr.Column(scale=3):
                ayah_info = gr.Textbox(label="Target", interactive=False)
                arabic_display = gr.Textbox(label="📝 Read This", interactive=False, lines=5, elem_id="arabic-box")
            with gr.Column(scale=2):
                ref_player = gr.Audio(label="🔊 Qari Reference", type="filepath", interactive=False)
        
        gr.Markdown("---")
        
        with gr.Row():
            with gr.Column():
                gr.Markdown("### 🎤 Step 2: Record Recitation")
                user_recorder = gr.Audio(label="Mic", sources=["microphone"], type="numpy")
                assess_btn = gr.Button("✅ Run Expert Analysis", variant="primary", size="lg")
            
            with gr.Column():
                gr.Markdown("### 🔍 Step 3: Expert Analysis")
                # Using HTML for the color-coded diff
                result_html = gr.HTML(label="Visual Diff", elem_classes=["analysis-box"])
                tips_html = gr.HTML(label="Makhraj Tips", elem_classes=["tips-box"])
                score_box = gr.Textbox(label="Summary Score", interactive=False)

        surah_dd.change(on_ayah_select, [surah_dd, ayah_nb], [ayah_info, arabic_display, ref_player])
        ayah_nb.change(on_ayah_select, [surah_dd, ayah_nb], [ayah_info, arabic_display, ref_player])
        assess_btn.click(assess_recitation, [surah_dd, ayah_nb, user_recorder], [result_html, ref_ph_state, user_ph_state, score_box, tips_html])
        demo.load(on_ayah_select, [surah_dd, ayah_nb], [ayah_info, arabic_display, ref_player])

    logger.info("🚀 Launching...")
    demo.launch(inbrowser=True, share=False)

if __name__ == "__main__": main()
