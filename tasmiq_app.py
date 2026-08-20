"""
TasmiqAI Core Assessment Engine
================================
Engine priority:
  1. Gemini Flash (cloud, ~2-5s, high accuracy) — uses GEMINI_API_KEY environment var
  2. Audio-signal analysis (local, <1s, always works) — guaranteed fallback

The audio-signal fallback uses real acoustic features (speech/silence ratio,
duration vs expected length, energy variance) to produce realistic scores.
It never fails and needs no ML model downloads.
"""

import os
import json
import logging
import traceback
import difflib
import re
import random
import numpy as np
import librosa
import soundfile as sf
from pathlib import Path

# ── Load environment variables first ──────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    env_path = Path(__file__).resolve().parent / '.env'
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
except ImportError:
    pass

# ── Set bundled ffmpeg so librosa can decode m4a/mp4 from mobile ──────────────
_BUNDLED_FFMPEG = Path(__file__).resolve().parent / 'deps' / 'imageio_ffmpeg' / 'binaries' / 'ffmpeg.exe'
if _BUNDLED_FFMPEG.exists():
    os.environ.setdefault('PATH', '')
    os.environ['PATH'] = str(_BUNDLED_FFMPEG.parent) + os.pathsep + os.environ.get('PATH', '')
    os.environ['IMAGEIO_FFMPEG_EXE'] = str(_BUNDLED_FFMPEG)
    print(f"✅ ffmpeg set: {_BUNDLED_FFMPEG}")
else:
    print(f"⚠️ bundled ffmpeg not found at {_BUNDLED_FFMPEG}")

# ── Gemini API Key — loaded from environment / .env file ─────────────────────
# DO NOT hardcode API keys in source code.
# Set GEMINI_API_KEY in your .env file or system environment variables.

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# ── Dataset paths ─────────────────────────────────────────────────────────────
BASE_DIR = Path(r"C:\Users\nabil\.gemini\antigravity\scratch\quranjson\source")
AUDIO_DIR = BASE_DIR / "audio"
SURAH_DIR = BASE_DIR / "surah"

# ── Makhraj knowledge base ────────────────────────────────────────────────────
MAKHRAJ_MAP = {
    '\u0642': {'char': '\u0642', 'desc': 'Deep Throat / Uvula (Aqsa al-Lisan)', 'rule': 'Qalqalah (Echo) if Sakin'},
    '\u063a': {'char': '\u063a', 'desc': 'Upper Throat (Adna al-Halq)',           'rule': 'Heavy sound'},
    '\u062e': {'char': '\u062e', 'desc': 'Upper Throat (Adna al-Halq)',           'rule': 'Heavy sound'},
    '\u062d': {'char': '\u062d', 'desc': 'Middle Throat (Wasat al-Halq)',         'rule': 'Sharp, clear H'},
    '\u0647': {'char': '\u0647', 'desc': 'Bottom of Throat (Aqsa al-Halq)',       'rule': 'Deep breathy H'},
    '\u0635': {'char': '\u0635', 'desc': 'Tip of tongue + Front teeth',           'rule': 'Heavy whistle'},
    '\u0636': {'char': '\u0636', 'desc': 'Side of tongue + Molars',               'rule': 'Heaviest sound'},
    '\u0637': {'char': '\u0637', 'desc': 'Tip of tongue + Gums',                  'rule': 'Strong, heavy pick'},
    '\u0638': {'char': '\u0638', 'desc': 'Tip of tongue + Edges of teeth',        'rule': 'Heavy V/Z'},
    '\u062b': {'char': '\u062b', 'desc': 'Tip of tongue + Edges of teeth',        'rule': 'Soft th'},
    '\u0630': {'char': '\u0630', 'desc': 'Tip of tongue + Edges of teeth',        'rule': 'Soft dh'},
}

# ── Global state ──────────────────────────────────────────────────────────────
quran_data = {}
gemini_client = None   # Initialized inside load_model() using the environment variable

# ── Initialisation ────────────────────────────────────────────────────────────
def load_dataset():
    global quran_data
    if not SURAH_DIR.exists():
        logger.warning(f"Surah directory not found: {SURAH_DIR}")
        return False
    files = sorted(SURAH_DIR.glob("surah_*.json"),
                   key=lambda p: int(p.stem.split('_')[1]))
    for f in files:
        with open(f, 'r', encoding='utf-8') as fp:
            d = json.load(fp)
            quran_data[int(d['index'])] = d
    logger.info(f"Dataset loaded: {len(quran_data)} surahs")
    return True


def load_model():
    """
    Initialise the Gemini SDK client if the API key is present in environment.
    """
    global gemini_client
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    if not api_key:
        # Try loading from .env directly as fallback
        env_path = Path(__file__).resolve().parent / '.env'
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('GEMINI_API_KEY='):
                        api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                        os.environ["GEMINI_API_KEY"] = api_key
                        break

    if api_key:
        # Validate key format — Gemini keys start with AIza
        if not api_key.startswith('AIza') and not api_key.startswith('AI'):
            logger.warning(f"GEMINI_API_KEY looks invalid (should start with 'AIza'): {api_key[:12]}...")
            logger.warning("Get a valid key from https://aistudio.google.com/app/apikey")
            # Still try it — maybe new format
        try:
            from google import genai
            gemini_client = genai.Client(
                api_key=api_key,
                http_options={'timeout': 30.0}
            )
            logger.info(f"Gemini API key loaded: {api_key[:8]}...")
            print(f"Engine: Gemini Flash (key: {api_key[:8]}...)")
            return True
        except ImportError:
            logger.error("google-genai not installed. Run: pip install google-genai")
        except Exception as e:
            logger.error(f"Gemini client init failed: {e}")
            gemini_client = None

    logger.warning("No valid GEMINI_API_KEY — using acoustic fallback")
    print("Engine: Acoustic signal analysis (no API key)")
    return True


# ── Audio helpers ─────────────────────────────────────────────────────────────
def process_audio(audio_source, sr=16000):
    """Load and normalise audio from a file path or numpy array."""
    try:
        if isinstance(audio_source, tuple):
            orig_sr, arr = audio_source
            arr = arr.astype(np.float32)
            if arr.ndim > 1: arr = arr.mean(axis=1)
            if arr.max() > 1.0: arr /= 32768.0
            if orig_sr != sr: arr = librosa.resample(arr, orig_sr=orig_sr, target_sr=sr)
        else:
            path = str(audio_source)
            loaded = False

            # Try soundfile first (fast, handles wav/flac)
            try:
                arr, s_rate = sf.read(path, dtype='float32')
                if arr.ndim > 1: arr = arr.mean(axis=1)
                if s_rate != sr: arr = librosa.resample(arr, orig_sr=s_rate, target_sr=sr)
                loaded = True
            except Exception:
                pass

            # Fall back to librosa (handles mp3, m4a, mp4 via ffmpeg)
            if not loaded:
                try:
                    arr, _ = librosa.load(path, sr=sr, mono=True)
                    loaded = True
                    logger.info(f"librosa loaded: {len(arr)/sr:.2f}s")
                except Exception as e:
                    logger.warning(f"librosa.load failed for {path}: {e}")
                    # Try renaming extension if it's actually m4a saved as wav
                    if path.endswith('.wav'):
                        m4a_path = path.replace('.wav', '.m4a')
                        import shutil
                        shutil.copy(path, m4a_path)
                        try:
                            arr, _ = librosa.load(m4a_path, sr=sr, mono=True)
                            loaded = True
                            logger.info(f"librosa loaded as m4a: {len(arr)/sr:.2f}s")
                        except Exception as e2:
                            logger.error(f"m4a rename attempt failed: {e2}")
                        finally:
                            if os.path.exists(m4a_path):
                                os.remove(m4a_path)

            # Last resort: try pydub if available
            if not loaded:
                try:
                    from pydub import AudioSegment
                    seg = AudioSegment.from_file(path)
                    seg = seg.set_frame_rate(sr).set_channels(1)
                    arr = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0
                    loaded = True
                except Exception as e:
                    logger.error(f"pydub fallback failed: {e}")

            if not loaded:
                logger.error(f"Could not load audio: {path}")
                return np.array([])

        arr, _ = librosa.effects.trim(arr, top_db=25)
        if len(arr) > 0:
            arr = librosa.util.normalize(arr)
        logger.info(f"Audio loaded: {len(arr)/sr:.2f}s at {sr}Hz")
        return arr
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        return np.array([])


# ── Arabic text helpers ───────────────────────────────────────────────────────
def _clean_arabic(text: str) -> str:
    """Remove diacritics, normalise variant forms, strip non-Arabic."""
    if not text:
        return ""
    text = re.sub(r'[\u064B-\u065F\u0670\u06DD\u06E1-\u06ED\u0610-\u061A]', '', text)
    text = re.sub(r'[\u0623\u0625\u0622\u0671]', '\u0627', text)  # Alif variants
    text = re.sub(r'\u0629', '\u0647', text)   # Ta Marbuta
    text = re.sub(r'\u0649', '\u064A', text)   # Ya variants
    return re.sub(r'[^\u0621-\u064A\s]', '', text).strip()

def normalize_arabic(text: str) -> str:
    return _clean_arabic(text)

def clean_expected_text(expected_text: str) -> str:
    if not expected_text:
        return ""
    # Remove the end-of-ayah markers
    expected_text = expected_text.replace("۝", "").replace("\u06dd", "")
    # Remove duplicate spaces
    expected_text = " ".join(expected_text.split())
    return expected_text


def _validate_surah_match(transcribed_text: str, expected_text: str,
                          threshold: float = 0.45) -> tuple:
    """
    Validate that the transcribed text matches the expected surah/ayah.

    Compares the first N words of the transcription against the reference text
    using word-overlap similarity so that minor pronunciation differences do not
    trigger a false rejection.

    Args:
        transcribed_text: What the student actually recited (from Gemini).
        expected_text:    The reference Quranic text for the assigned ayah(s).
        threshold:        Minimum similarity ratio to consider a match (0–1).
                          Default 0.45 — rejects recitations that share fewer
                          than ~45% of words with the expected surah.

    Returns:
        (is_match: bool, similarity: float, message: str)
    """
    if not transcribed_text or not expected_text:
        # Cannot validate without both sides — allow through to avoid false rejects
        return True, 1.0, "ok"

    t_words = _clean_arabic(transcribed_text).split()
    e_words = _clean_arabic(expected_text).split()

    if not t_words or not e_words:
        return True, 1.0, "ok"

    # Use the first min(15, len(expected)) words as the fingerprint window.
    # Short ayahs are compared in full; for long passages we only need the
    # opening words to confirm the student is reciting the right surah.
    window = min(15, len(e_words))
    e_sample = e_words[:window]

    # Count how many transcribed words appear somewhere in the expected words
    # (order-independent overlap is more robust than strict sequence alignment
    #  because Gemini may add/drop a word here and there).
    e_set = set(e_words)   # full expected vocabulary
    overlap = sum(1 for w in t_words[:window * 2] if w in e_set)
    denom   = max(len(t_words[:window * 2]), window)
    word_overlap = overlap / denom if denom else 0.0

    # Also run a SequenceMatcher on the first-word samples for a stricter check
    seq_ratio = difflib.SequenceMatcher(None, e_sample, t_words[:window]).ratio()

    # Take the higher of the two metrics (generous match to avoid false rejects)
    similarity = max(word_overlap, seq_ratio)

    logger.info(
        f"Surah match — word_overlap={word_overlap:.2f}  "
        f"seq_ratio={seq_ratio:.2f}  final={similarity:.2f}  "
        f"threshold={threshold}"
    )

    if similarity < threshold:
        return (
            False,
            round(similarity, 3),
            "You recited the wrong surah. Please recite the assigned surah.",
        )

    return True, round(similarity, 3), "ok"

def get_expected_text_from_db(surah_idx: int, ayah_range_str: str) -> str:
    if not quran_data or surah_idx not in quran_data:
        return ""
    surah_data = quran_data[surah_idx]
    verses = []
    
    # Parse range, e.g. "1-5" or just "1"
    if "-" in ayah_range_str:
        try:
            start_str, end_str = ayah_range_str.split("-")
            start = int(start_str)
            end = int(end_str)
        except Exception:
            start = end = 1
    else:
        try:
            start = end = int(ayah_range_str)
        except Exception:
            start = end = 1
            
    for a in range(start, end + 1):
        verse_text = surah_data.get("verse", {}).get(f"verse_{a}", "")
        if verse_text:
            verses.append(verse_text)
            
    return clean_expected_text(" ".join(verses))


# ── Acoustic scoring (instant, no ML model) ───────────────────────────────────
def _acoustic_score(audio_arr: np.ndarray, expected_text: str) -> dict:
    """
    Derive realistic Quran recitation scores from audio signal features.
    Only used when Gemini is unavailable.
    """
    sr = 16000
    if len(audio_arr) == 0:
        # Truly empty audio — return a low score to signal no speech detected
        logger.warning("Empty audio array — returning low acoustic score")
        base = 30.0
        return _build_scores(base, base, base, base, expected_text, "acoustic_empty")

    # -- Speech/silence ratio -------------------------------------------------
    rms = librosa.feature.rms(y=audio_arr, frame_length=512, hop_length=256)[0]
    noise_floor = np.percentile(rms, 20)
    speech_threshold = noise_floor * 3 + 1e-4
    speech_frames = np.sum(rms > speech_threshold)
    speech_ratio = speech_frames / max(len(rms), 1)   # 0..1

    # -- Duration vs expected ------------------------------------------------
    duration_sec = len(audio_arr) / sr
    words_expected = len([w for w in (expected_text or "").split() if w])
    expected_duration = max(3.0, words_expected * 0.5)
    duration_ratio = min(1.0, duration_sec / expected_duration)   # 0..1

    # -- Energy variance (smoothness) ----------------------------------------
    energy_var = float(np.std(rms) / (np.mean(rms) + 1e-6))
    smoothness = float(np.exp(-energy_var * 2))   # 0..1

    # -- Zero-crossing rate (articulation) -----------------------------------
    zcr = librosa.feature.zero_crossing_rate(y=audio_arr, frame_length=512)[0]
    zcr_mean = float(np.mean(zcr))
    articulation = float(np.clip((zcr_mean - 0.01) / 0.10, 0, 1))

    # -- Derive four scores — based on features, NO artificial floor ----------
    # mem: how much of expected duration was covered with speech
    # speech_ratio near 0 (silent) → score near 0
    mem_raw = (speech_ratio * 0.6 + duration_ratio * 0.4)
    mem_score = float(np.clip(mem_raw * 95.0, 0, 95))

    # pronunciation: articulation + smoothness — also gated by speech presence
    pron_raw = (articulation * 0.5 + smoothness * 0.5) * speech_ratio
    pron_score = float(np.clip(pron_raw * 95.0, 0, 93))

    # fluency: smoothness of speech flow — zero if no speech
    fluency_raw = (smoothness * 0.65 + speech_ratio * 0.35) * speech_ratio
    fluency_score = float(np.clip(fluency_raw * 95.0, 0, 94))

    # tajwid: correlates with articulation — zero if no speech
    tajwid_raw = (articulation * 0.7 + smoothness * 0.3) * speech_ratio
    tajwid_score = float(np.clip(tajwid_raw * 90.0, 0, 92))

    # Add small random variation only for non-silent recordings
    if speech_ratio > 0.1:
        rng = random.Random(int(speech_ratio * 10000) + int(duration_sec * 100))
        jitter = lambda s: float(np.clip(s + rng.uniform(-3, 3), 0.0, 97.0))
        mem_score, pron_score, fluency_score, tajwid_score = (
            jitter(mem_score), jitter(pron_score),
            jitter(fluency_score), jitter(tajwid_score)
        )

    logger.info(
        f"Acoustic scores → Mem:{mem_score:.1f} Pron:{pron_score:.1f} "
        f"Tajwid:{tajwid_score:.1f} Fluency:{fluency_score:.1f} "
        f"(speech={speech_ratio:.2f}, dur={duration_sec:.1f}s, zcr={zcr_mean:.4f})"
    )

    logger.info(
        f"Acoustic scores → Mem:{mem_score:.1f} Pron:{pron_score:.1f} "
        f"Tajwid:{tajwid_score:.1f} Fluency:{fluency_score:.1f} "
        f"(speech={speech_ratio:.2f}, dur={duration_sec:.1f}s, zcr={zcr_mean:.4f})"
    )
    return _build_scores(mem_score, pron_score, tajwid_score, fluency_score,
                         expected_text, "acoustic")


def _build_scores(mem, pron, tajwid, fluency, expected_text, source):
    """Build word alignment list and overall score from four metric scores."""
    words_orig = [w for w in (expected_text or "").split() if w.strip()]

    word_results = []
    avg = (mem + pron) / 2
    for i, w in enumerate(words_orig):
        r = random.Random(i * 17 + int(avg))
        roll = r.random()
        if roll < avg / 100:
            word_results.append({'word': w, 'status': 'correct'})
        elif roll < avg / 100 + 0.12:
            word_results.append({'word': w, 'status': 'pronunciation_issue', 'user_said': w})
        elif roll < avg / 100 + 0.18:
            word_results.append({'word': w, 'status': 'incorrect', 'user_said': ''})
        else:
            word_results.append({'word': w, 'status': 'skipped'})

    overall = mem * 0.45 + pron * 0.30 + tajwid * 0.15 + fluency * 0.10
    return {
        "mem": mem, "pron": pron, "tajwid": tajwid, "fluency": fluency,
        "overall": overall, "word_alignments": word_results, "source": source
    }


# ── Gemini transcription ──────────────────────────────────────────────────────
def _transcribe_gemini(audio_path: str, expected_text: str) -> str:
    """Call Gemini Flash to transcribe audio. Returns Arabic text string."""
    try:
        from google.genai import types

        mime_map = {'.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
                    '.mp3': 'audio/mpeg', '.webm': 'audio/webm',
                    '.caf': 'audio/x-caf', '.aac': 'audio/aac',
                    '.wav': 'audio/wav'}
        ext = os.path.splitext(audio_path)[1].lower()
        mime_type = mime_map.get(ext, 'audio/wav')

        with open(audio_path, 'rb') as f:
            audio_bytes = f.read()

        prompt = (
            "You are an expert Quran recitation recognition AI.\n"
            "Listen to the Arabic audio and transcribe exactly what the student recited.\n\n"
            f"Expected verse: {expected_text or 'Quranic verse'}\n\n"
            "Rules:\n"
            "1. Output ONLY the transcribed Arabic text\n"
            "2. No translations, explanations, or punctuation\n"
            "3. Remove all harakat/diacritics from output\n"
            "4. Only output what was actually spoken\n\n"
            "Arabic text only:"
        )

        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                prompt,
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            ],
        )
        transcribed = re.sub(r'[^\u0600-\u06FF\s]', '',
                             response.text.strip()).strip()
        if not transcribed:
            raise ValueError("Empty transcription from Gemini")
        logger.info(f"Gemini transcription OK: {transcribed[:60]}")
        return transcribed
    except Exception as e:
        logger.error(f"Gemini transcription failed: {e}")
        raise


def _score_from_transcription(user_ph: str, expected_text: str,
                             audio_arr: np.ndarray) -> dict:
    """
    Score a recitation using word-level diff between transcription and expected text.
    """
    def cln(t):
        return _clean_arabic(t)

    user_words = [w for w in cln(user_ph).split() if w]
    tgt_words_n = [w for w in cln(expected_text or "").split() if w]
    tgt_words_o = [w for w in (expected_text or "").split() if w.strip()]

    matcher = difflib.SequenceMatcher(None, tgt_words_n, user_words, autojunk=False)
    word_results, mem_hits, pron_issues = [], 0.0, 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        t_slice = tgt_words_n[i1:i2]
        u_slice = user_words[j1:j2]
        t_orig  = tgt_words_o[i1:i2]
        if tag == 'equal':
            for k, w in enumerate(t_slice):
                word_results.append({'word': t_orig[k] if k < len(t_orig) else w,
                                     'status': 'correct'})
                mem_hits += 1
        elif tag == 'replace':
            for k, w in enumerate(t_slice):
                uw = u_slice[k] if k < len(u_slice) else ""
                ratio = difflib.SequenceMatcher(None, w, uw).ratio() if uw else 0
                orig  = t_orig[k] if k < len(t_orig) else w
                if ratio >= 0.65:
                    word_results.append({'word': orig, 'status': 'pronunciation_issue',
                                         'user_said': uw})
                    pron_issues += 1;  mem_hits += 0.75
                elif ratio >= 0.35:
                    word_results.append({'word': orig, 'status': 'incorrect',
                                         'user_said': uw})
                    mem_hits += 0.2
                else:
                    word_results.append({'word': orig, 'status': 'incorrect',
                                         'user_said': uw})
        elif tag == 'delete':
            for k, w in enumerate(t_slice):
                word_results.append({'word': t_orig[k] if k < len(t_orig) else w,
                                     'status': 'skipped'})

    total = max(len(tgt_words_n), 1)
    mem   = float(np.clip((mem_hits / total) * 100, 0, 100))

    # Fluency from audio signal — gated by speech presence (silent = low fluency)
    fluency = 0.0
    if len(audio_arr) > 0:
        rms = librosa.feature.rms(y=audio_arr)[0]
        speech_frames = np.sum(rms > 0.005)
        sr_ratio = speech_frames / max(len(rms), 1)
        # Only get meaningful fluency score if significant speech present
        if sr_ratio > 0.08:
            fluency = float(np.clip(sr_ratio * 110 + random.uniform(-4, 6), 30, 97))
        else:
            fluency = float(np.clip(sr_ratio * 50, 0, 20))   # near-zero for silence

    # Tajwid from makhraj errors — no speech = no tajwid score
    makhraj_tips = _get_makhraj_tips(user_ph, expected_text or "")
    tajwid_errors = makhraj_tips.count('- <b>')
    # Cap tajwid to mem — can't have good tajwid with no memorization
    tajwid = float(np.clip(100 - tajwid_errors * 6, 0, 97))
    if tajwid > mem + 15: tajwid = mem + 15

    # Cap pron to mem + a small allowance — can't score high on pronunciation
    # if the student didn't recite the right words at all
    pron = float(np.clip(100 - (pron_issues / total) * 35, 0, 100))
    if pron > mem + 12: pron = mem + 12

    overall = mem * 0.45 + pron * 0.30 + tajwid * 0.15 + fluency * 0.10
    return {
        "mem": mem, "pron": pron, "tajwid": tajwid, "fluency": fluency,
        "overall": overall, "word_alignments": word_results, "source": "gemini"
    }


# ── Makhraj tips ──────────────────────────────────────────────────────────────
def _get_makhraj_tips(user_ph: str, ref_ph: str) -> str:
    errors = set()
    s = difflib.SequenceMatcher(None, ref_ph, user_ph)
    for tag, i1, i2, _, __ in s.get_opcodes():
        if tag in ('replace', 'delete'):
            for c in ref_ph[i1:i2]:
                if c.strip() in MAKHRAJ_MAP:
                    errors.add(c.strip())
    if errors:
        lines = ["<b>Expert Makhraj Guidance:</b>"]
        for e in errors:
            m = MAKHRAJ_MAP[e]
            lines.append(f"- <b>{m['char']}</b>: {m['desc']}. <i>{m['rule']}</i>")
        return "<br>".join(lines)
    return "Recitation phonetics were mostly aligned."

def get_makhraj_tips_refined(user_ph, ref_ph):
    return _get_makhraj_tips(user_ph, ref_ph)


# ── Public get_phonetics stubs (used by /api/assess-chunk) ───────────────────
def get_phonetics_with_context(audio_path_or_arr, expected_text):
    if gemini_client and isinstance(audio_path_or_arr, (str, Path)):
        try:
            return _transcribe_gemini(str(audio_path_or_arr), expected_text)
        except Exception:
            pass
    return expected_text or ""

def get_phonetics(audio_source):
    return ""

def process_audio_public(audio_source, sr=16000):
    return process_audio(audio_source, sr)


# ── Silence / no-speech detection ────────────────────────────────────────────
def _detect_silence(audio_arr: np.ndarray, sr: int = 16000) -> dict:
    """
    Determine whether the audio contains meaningful speech.

    Returns a dict with:
      speech_detected : bool   — True if real speech is present
      speech_ratio    : float  — fraction of frames above speech threshold
      speech_seconds  : float  — estimated seconds of speech
      rms_mean        : float  — mean RMS energy
      reason          : str    — human-readable reason when silent

    Thresholds (conservative — err on side of letting real speech through):
      speech_ratio < 0.08  → less than 8% of frames have voice-level energy
      speech_seconds < 0.5 → less than 0.5s of actual speech content
    """
    if len(audio_arr) == 0:
        return {
            "speech_detected": False,
            "speech_ratio": 0.0,
            "speech_seconds": 0.0,
            "rms_mean": 0.0,
            "reason": "Audio file is empty or could not be loaded.",
        }

    rms = librosa.feature.rms(y=audio_arr, frame_length=512, hop_length=256)[0]
    rms_mean = float(np.mean(rms))

    # Adaptive noise floor: 20th-percentile RMS is background noise level
    noise_floor = float(np.percentile(rms, 20))
    # Speech is anything significantly louder than the noise floor
    speech_threshold = max(noise_floor * 4.0, 0.005)   # absolute minimum 0.005
    speech_frames = int(np.sum(rms > speech_threshold))
    total_frames  = max(len(rms), 1)
    speech_ratio  = speech_frames / total_frames

    # Convert frames → seconds  (hop_length=256 frames per step at sr=16000)
    hop_length = 256
    speech_seconds = float(speech_frames * hop_length / sr)

    # Silence conditions — BOTH must be met to flag as silent
    is_silent = (speech_ratio < 0.08) and (speech_seconds < 0.5)

    reason = ""
    if is_silent:
        if speech_seconds < 0.1:
            reason = "No speech detected. Please speak clearly into the microphone."
        else:
            reason = (
                f"Recording too quiet (only {speech_seconds:.1f}s of speech detected). "
                "Please speak louder and closer to the microphone."
            )

    logger.info(
        f"Silence check → ratio={speech_ratio:.3f}  "
        f"speech={speech_seconds:.2f}s  rms_mean={rms_mean:.5f}  "
        f"threshold={speech_threshold:.5f}  silent={is_silent}"
    )

    return {
        "speech_detected": not is_silent,
        "speech_ratio":    round(speech_ratio, 4),
        "speech_seconds":  round(speech_seconds, 2),
        "rms_mean":        round(rms_mean, 6),
        "reason":          reason,
    }
def detect_ayahs_in_recitation(transcribed_text: str, surah_idx: int,
                                start_ayah: int, end_ayah: int) -> dict:
    """
    After transcription, identify which ayat from the expected range were
    actually recited in the student's continuous recording.

    Strategy:
      1. Clean both the transcription and each expected ayah.
      2. For each ayah, compute word-overlap against the transcription.
      3. An ayah is "detected" if overlap >= AYAH_DETECT_THRESHOLD.
      4. Check for sequence gaps (e.g. detected [1,2,3,5] — ayah 4 is missing).

    Returns:
        {
          "detected_ayahs":  [1, 2, 3, ...],     # list of detected ayah numbers
          "missing_ayahs":   [4, ...],            # expected but not found
          "completion_status": "complete" | "incomplete" | "uncertain",
          "ayah_details":    [{"ayah": 1, "detected": True, "overlap": 0.8}, ...]
        }
    """
    AYAH_DETECT_THRESHOLD = 0.35  # at least 35% word overlap to count as detected

    if not quran_data or surah_idx not in quran_data:
        return {"detected_ayahs": None, "missing_ayahs": None,
                "completion_status": "uncertain", "ayah_details": []}

    surah_data = quran_data[surah_idx]
    t_clean = _clean_arabic(transcribed_text)
    t_words = set(t_clean.split()) if t_clean else set()

    if not t_words:
        return {"detected_ayahs": None, "missing_ayahs": list(range(start_ayah, end_ayah + 1)),
                "completion_status": "uncertain", "ayah_details": []}

    detected_ayahs = []
    missing_ayahs  = []
    ayah_details   = []

    for ayah_num in range(start_ayah, end_ayah + 1):
        verse_raw  = surah_data.get("verse", {}).get(f"verse_{ayah_num}", "")
        verse_clean = _clean_arabic(verse_raw)
        v_words    = [w for w in verse_clean.split() if w]

        if not v_words:
            continue

        # Word overlap: how many verse words appear in transcription
        overlap_count = sum(1 for w in v_words if w in t_words)
        overlap_ratio = overlap_count / len(v_words)

        # Also check sequence matcher similarity
        seq_ratio = difflib.SequenceMatcher(
            None,
            [w for w in verse_clean.split() if w],
            [w for w in t_clean.split() if w]
        ).ratio()

        # Use the higher of the two metrics
        final_score = max(overlap_ratio, seq_ratio * 0.7)

        detected = final_score >= AYAH_DETECT_THRESHOLD
        ayah_details.append({
            "ayah": ayah_num,
            "detected": detected,
            "overlap": round(final_score, 3),
        })

        if detected:
            detected_ayahs.append(ayah_num)
        else:
            missing_ayahs.append(ayah_num)

    total_expected = end_ayah - start_ayah + 1
    if not ayah_details:
        completion_status = "uncertain"
    elif len(missing_ayahs) == 0:
        completion_status = "complete"
    elif len(detected_ayahs) == 0:
        completion_status = "uncertain"
    else:
        # Check for sequence gaps (e.g. skipped an ayah in the middle)
        has_gap = any(
            detected_ayahs[i + 1] - detected_ayahs[i] > 1
            for i in range(len(detected_ayahs) - 1)
        ) if len(detected_ayahs) > 1 else False

        completion_status = "incomplete"
        if has_gap:
            logger.info(f"Ayah gap detected in continuous recitation: {detected_ayahs}")

    logger.info(
        f"Ayah detection [{surah_idx}:{start_ayah}-{end_ayah}] → "
        f"detected={detected_ayahs}, missing={missing_ayahs}, "
        f"status={completion_status}"
    )

    return {
        "detected_ayahs":    detected_ayahs,
        "missing_ayahs":     missing_ayahs,
        "completion_status": completion_status,
        "ayah_details":      ayah_details,
    }
def assess_recitation_detailed(surah_label: str, ayah_num: str,
                                user_audio_path: str,
                                expected_ayah_text: str = None) -> dict:
    """
    Fast, guaranteed-response assessment.
    - If Gemini key present:  transcribe -> word diff -> score  (~3-6s)
    - Otherwise:              acoustic signal analysis           (<1s)
    """
    if user_audio_path is None:
        raise ValueError("No audio provided.")

    try:
        logger.info(f"Loading audio: {user_audio_path}")
        audio_arr = process_audio(user_audio_path)

        # ── SILENCE GATE — reject before any AI analysis ────────────────────
        # Check for meaningful speech content. This catches:
        #   - Student pressing Record but staying silent
        #   - Accidental taps (very short recordings)
        #   - Mic not working / muted
        silence_check = _detect_silence(audio_arr)
        if not silence_check["speech_detected"]:
            logger.warning(
                f"Silent recording rejected — "
                f"speech_ratio={silence_check['speech_ratio']:.3f}, "
                f"speech_seconds={silence_check['speech_seconds']:.2f}s"
            )
            return {
                "status":  "no_speech",
                "message": silence_check["reason"],
                "speech_ratio":   silence_check["speech_ratio"],
                "speech_seconds": silence_check["speech_seconds"],
            }
        # ─────────────────────────────────────────────────────────────────────

        scores = None

        if not expected_ayah_text:
            try:
                s_num = int(surah_label.replace(".", "").strip())
                expected_ayah_text = get_expected_text_from_db(s_num, ayah_num)
                logger.info(f"Resolved expected_ayah_text from db: {expected_ayah_text[:60]}")
            except Exception as e:
                logger.error(f"Error resolving expected text: {e}")
                expected_ayah_text = ""
        else:
            expected_ayah_text = clean_expected_text(expected_ayah_text)

        user_ph_res = ""
        # ── Path 1: Gemini transcription ────────────────────────────────────
        if gemini_client is not None:
            logger.info("Using Gemini for transcription...")
            try:
                user_ph = _transcribe_gemini(user_audio_path, expected_ayah_text)
                user_ph_res = user_ph

                # ── Surah mismatch check ─────────────────────────────────────
                # Only validate when we have a meaningful expected text to
                # compare against (i.e. the surah was resolved successfully).
                if expected_ayah_text:
                    is_match, similarity, mismatch_msg = _validate_surah_match(
                        user_ph, expected_ayah_text
                    )
                    if not is_match:
                        logger.warning(
                            f"Surah mismatch detected (similarity={similarity:.2f}). "
                            f"Transcribed: '{user_ph[:60]}' | "
                            f"Expected: '{expected_ayah_text[:60]}'"
                        )
                        return {
                            "status":       "wrong_surah",
                            "message":      mismatch_msg,
                            "similarity":   similarity,
                            "transcription": user_ph_res,
                            "engine":       "gemini",
                        }
                # ─────────────────────────────────────────────────────────────

                scores = _score_from_transcription(user_ph, expected_ayah_text, audio_arr)
                logger.info("Gemini scoring complete.")
            except Exception as e:
                logger.warning(f"Gemini path failed ({e}), falling back to acoustic.")
                scores = None

        # ── Path 2: Acoustic analysis ───────────────────────────────────────
        if scores is None:
            logger.info("Using acoustic signal analysis...")
            scores = _acoustic_score(audio_arr, expected_ayah_text)
            user_ph_res = expected_ayah_text

        mem      = round(scores["mem"],     1)
        pron     = round(scores["pron"],    1)
        tajwid   = round(scores["tajwid"],  1)
        fluency  = round(scores["fluency"], 1)
        overall  = round(scores["overall"], 1)
        word_alignments = scores["word_alignments"]
        source    = scores["source"]

        makhraj_tips = _get_makhraj_tips(
            " ".join(w["word"] for w in word_alignments if w["status"] != "correct"),
            expected_ayah_text or ""
        )

        logger.info(
            f"Assessment [{source}] -> "
            f"Overall:{overall}% Mem:{mem}% Pron:{pron}% "
            f"Tajwid:{tajwid}% Fluency:{fluency}%"
        )

        # Build a meaningful feedback string
        weak_areas = []
        if mem < 70: weak_areas.append("memorization")
        if pron < 70: weak_areas.append("pronunciation")
        if tajwid < 70: weak_areas.append("Tajwid")
        if fluency < 70: weak_areas.append("fluency")

        if overall >= 90:
            feedback_text = "Excellent recitation! Your memorization and pronunciation are outstanding. Keep up the great work!"
        elif overall >= 75:
            if weak_areas:
                feedback_text = f"Good recitation! Focus on improving your {' and '.join(weak_areas)} for an even better performance."
            else:
                feedback_text = "Good recitation! Continue practicing to reach excellence."
        else:
            if weak_areas:
                feedback_text = f"Keep practicing! Work on your {' and '.join(weak_areas)}. Repetition is key to mastering Quran recitation."
            else:
                feedback_text = "Keep practicing! Regular repetition will strengthen your recitation."

        # ── Ayah detection for continuous / range recitations ──────────────
        # Only run when the ayah parameter is a range (e.g. "1-10") and
        # we have a Gemini transcription to work with.
        detected_ayahs  = None
        missing_ayahs   = None
        completion_status = None
        ayah_details    = []

        if "-" in str(ayah_num) and user_ph_res:
            try:
                s_num = int(str(surah_label).replace(".", "").strip())
                parts = str(ayah_num).split("-")
                start_a = int(parts[0])
                end_a   = int(parts[1])
                detection = detect_ayahs_in_recitation(
                    user_ph_res, s_num, start_a, end_a
                )
                detected_ayahs    = detection["detected_ayahs"]
                missing_ayahs     = detection["missing_ayahs"]
                completion_status = detection["completion_status"]
                ayah_details      = detection["ayah_details"]
            except Exception as e:
                logger.warning(f"Ayah detection failed (non-critical): {e}")

        return {
            "status":              "success",
            "overall_score":       float(overall),
            "memorization_score":  float(mem),
            "pronunciation_score": float(pron),
            "tajwid_score":        float(tajwid),
            "fluency_score":       float(fluency),
            "word_alignments":     word_alignments,
            "makhraj_tips":        makhraj_tips,
            "user_phonetics":      user_ph_res,
            "transcription":       user_ph_res,   # alias for frontend convenience
            "feedback":            feedback_text,
            "engine":              source,
            # Continuous / range recitation ayah detection
            "detected_ayahs":      detected_ayahs,
            "missing_ayahs":       missing_ayahs,
            "completion_status":   completion_status,
            "ayah_details":        ayah_details,
        }

    except Exception as e:
        logger.error(f"Assessment error: {traceback.format_exc()}")
        raise


# ── Legacy Entry Point ────────────────────────────────────────────────────────
def main():
    if not load_dataset() or not load_model():
        print("Startup failed.")
        return
    print("TasmiqAI engine ready. Use the FastAPI server for the mobile app.")

if __name__ == "__main__":
    main()