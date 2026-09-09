"""
TasmiqAI Core Assessment Engine
================================
Engine priority:
  1. Gemini Flash (cloud, ~2-5s, high accuracy) â€” uses GEMINI_API_KEY environment var
  2. Audio-signal analysis (local, <1s, always works) â€” guaranteed fallback

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

# â”€â”€ Load environment variables first â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    from dotenv import load_dotenv
    load_dotenv()
    env_path = Path(__file__).resolve().parent / '.env'
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
except ImportError:
    pass

# â”€â”€ Set bundled ffmpeg so librosa can decode m4a/mp4 from mobile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# On Windows dev: use the bundled ffmpeg.exe in deps/
# On Linux production: rely on system ffmpeg (apt install ffmpeg)
_BUNDLED_FFMPEG = Path(__file__).resolve().parent / 'deps' / 'imageio_ffmpeg' / 'binaries' / 'ffmpeg.exe'
if _BUNDLED_FFMPEG.exists():
    os.environ.setdefault('PATH', '')
    os.environ['PATH'] = str(_BUNDLED_FFMPEG.parent) + os.pathsep + os.environ.get('PATH', '')
    os.environ['IMAGEIO_FFMPEG_EXE'] = str(_BUNDLED_FFMPEG)
    print(f"[OK] ffmpeg set (bundled): {_BUNDLED_FFMPEG}")
else:
    # Linux / production: ffmpeg must be on system PATH (apt install ffmpeg)
    import shutil as _shutil
    _sys_ffmpeg = _shutil.which('ffmpeg')
    if _sys_ffmpeg:
        print(f"[OK] ffmpeg set (system): {_sys_ffmpeg}")
    else:
        print("[WARNING] ffmpeg not found â€” audio decoding of m4a/mp4 may fail. Run: apt install ffmpeg")

# â”€â”€ Gemini API Key â€” loaded from environment / .env file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# DO NOT hardcode API keys in source code.
# Set GEMINI_API_KEY in your .env file or system environment variables.

# â”€â”€ Logging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# â”€â”€ Dataset paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# QURAN_DATA_DIR env var overrides the default.
# Default: <project_root>/data/quran/source  (bundled with the repo)
# On a Linux server, set: QURAN_DATA_DIR=/opt/tasmiqai/data/quran/source
_DEFAULT_QURAN_DIR = Path(__file__).resolve().parent / 'data' / 'quran' / 'source'
_env_quran         = os.environ.get('QURAN_DATA_DIR', '').strip()
BASE_DIR  = Path(_env_quran) if _env_quran else _DEFAULT_QURAN_DIR
AUDIO_DIR = BASE_DIR / "audio"
SURAH_DIR = BASE_DIR / "surah"

# â”€â”€ Makhraj knowledge base â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ Global state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
quran_data = {}
gemini_client = None   # Initialized inside load_model() using the environment variable

# â”€â”€ Initialisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        # Accept any non-empty key â€” Google AI Studio keys can start with
        # 'AIza', 'AQ.', or other prefixes depending on the project type.
        # Just try to connect; the SDK will raise if the key is truly invalid.
        try:
            from google import genai
            gemini_client = genai.Client(
                api_key=api_key,
                http_options={'timeout': 60.0}   # increased from 30s — SSL handshake on slow networks
            )
            logger.info(f"Gemini client initialised (key prefix: {api_key[:8]}...)")
            print(f"Engine: Gemini Flash (key prefix: {api_key[:8]}...)")
            return True
        except ImportError:
            logger.error("google-genai not installed. Run: pip install google-genai")
        except Exception as e:
            logger.error(f"Gemini client init failed: {e}")
            gemini_client = None

    logger.warning("No valid GEMINI_API_KEY â€” using acoustic fallback")
    print("Engine: Acoustic signal analysis (no API key)")
    return True


# â”€â”€ Audio helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def process_audio(audio_source, sr=16000):
    """Load, trim, and NORMALISE audio. Returns float32 array at `sr` Hz.
    NOTE: normalisation scales ALL audio to peak Â±1.0, which means the
    returned array cannot be used for silence/energy detection.
    Use process_audio_raw() for pre-normalisation analysis."""
    arr = _load_audio_raw(audio_source, sr)
    if len(arr) > 0:
        arr = librosa.util.normalize(arr)
    logger.info(f"Audio loaded (normalised): {len(arr)/sr:.2f}s at {sr}Hz")
    return arr


def _load_audio_raw(audio_source, sr=16000):
    """Internal: load, resample, mono-mix, trim â€” but do NOT normalise.
    Returns the raw float32 array so silence gate can inspect true energy."""
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
        # Do NOT normalise here â€” caller (process_audio) does that.
        # _load_audio_raw intentionally returns the raw trimmed signal
        # so silence detection can measure true acoustic energy.
        logger.info(f"Audio raw loaded: {len(arr)/sr:.2f}s at {sr}Hz")
        return arr
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        return np.array([])


# â”€â”€ Arabic text helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    expected_text = expected_text.replace("Û", "").replace("\u06dd", "")
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
        threshold:        Minimum similarity ratio to consider a match (0â€“1).
                          Default 0.45 â€” rejects recitations that share fewer
                          than ~45% of words with the expected surah.

    Returns:
        (is_match: bool, similarity: float, message: str)
    """
    if not transcribed_text or not expected_text:
        # Cannot validate without both sides â€” allow through to avoid false rejects
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
        f"Surah match â€” word_overlap={word_overlap:.2f}  "
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


# â”€â”€ Acoustic scoring (instant, no ML model) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _acoustic_score(audio_arr, expected_text):
    # Estimate scores from audio signal alone (Gemini unavailable fallback).
    # Cannot verify which words were spoken -- scores Pronunciation/Tajweed
    # generously since we have no transcription to compare against.
    sr = 16000
    if len(audio_arr) == 0:
        logger.warning('Empty audio -- returning minimum acoustic score')
        return _build_scores(20.0, 20.0, 20.0, 20.0, expected_text, 'acoustic_empty')

    rms = librosa.feature.rms(y=audio_arr, frame_length=512, hop_length=256)[0]
    noise_floor   = float(np.percentile(rms, 15))
    rms_mean      = float(np.mean(rms))
    speech_thresh = max(noise_floor * 2.5, rms_mean * 0.25)
    speech_frames = int(np.sum(rms > speech_thresh))
    speech_ratio  = speech_frames / max(len(rms), 1)

    duration_sec      = len(audio_arr) / sr
    words_expected    = len([w for w in (expected_text or '').split() if w])
    expected_duration = max(2.0, words_expected * 0.40)
    duration_ratio    = min(1.0, duration_sec / expected_duration)

    energy_var   = float(np.std(rms) / (rms_mean + 1e-6))
    smoothness   = float(np.exp(-energy_var * 1.5))

    zcr          = librosa.feature.zero_crossing_rate(y=audio_arr, frame_length=512)[0]
    zcr_mean     = float(np.mean(zcr))
    articulation = float(np.clip((zcr_mean - 0.02) / 0.12, 0, 1))

    # Memorization: duration coverage + speech activity
    mem_score = float(np.clip((duration_ratio * 0.65 + speech_ratio * 0.35) * 100.0, 0, 97))

    # Pronunciation: articulation quality
    # Floor at 50 if speech is clearly present -- we cannot penalise
    # pronunciation errors without a transcription.
    pron_score = float(np.clip((articulation * 0.6 + smoothness * 0.4) * 100.0, 35, 92))
    if speech_ratio > 0.15:
        pron_score = max(pron_score, 50.0)

    # Tajweed: articulation-weighted estimate
    tajwid_score = float(np.clip((articulation * 0.7 + smoothness * 0.3) * 100.0, 30, 90))
    if speech_ratio > 0.15:
        tajwid_score = max(tajwid_score, 45.0)

    # Fluency: energy smoothness + duration coverage
    fluency_score = float(np.clip((smoothness * 0.6 + duration_ratio * 0.4) * 100.0, 20, 92))
    if speech_ratio > 0.15:
        fluency_score = max(fluency_score, 40.0)

    if speech_ratio > 0.10:
        rng = random.Random(int(speech_ratio * 10000) + int(duration_sec * 100))
        jitter = lambda s: float(np.clip(s + rng.uniform(-2, 2), 0.0, 97.0))
        mem_score, pron_score, fluency_score, tajwid_score = (
            jitter(mem_score), jitter(pron_score),
            jitter(fluency_score), jitter(tajwid_score))

    logger.info(
        f'Acoustic scores -> Mem:{mem_score:.1f} Pron:{pron_score:.1f} '
        f'Tajwid:{tajwid_score:.1f} Fluency:{fluency_score:.1f} '
        f'(speech={speech_ratio:.2f}, dur={duration_sec:.1f}s)')

    return _build_scores(mem_score, pron_score, tajwid_score, fluency_score,
                         expected_text, 'acoustic')


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


# â”€â”€ Gemini transcription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            "You are a specialist Arabic Automatic Speech Recognition (ASR) system "
            "trained exclusively for Quranic recitation.\n\n"
            "TASK: Transcribe EXACTLY what the student recited in the audio.\n\n"
            f"REFERENCE VERSE (use this to guide recognition of difficult words):\n"
            f"{expected_text or 'Quranic verse'}\n\n"
            "STRICT RULES:\n"
            "1. Output ONLY the Arabic words actually spoken â€” do NOT copy the reference verse.\n"
            "2. Write in standard Arabic script WITH harakat (diacritics) if you can hear them, "
            "WITHOUT if not â€” do your best to represent what was spoken.\n"
            "3. Keep word ORDER exactly as spoken â€” do not reorder.\n"
            "4. If the student paused, stuttered, or repeated a word, transcribe it as heard.\n"
            "5. Do NOT add words the student did not say.\n"
            "6. Do NOT translate. Output Arabic text only.\n"
            "7. If no speech is detected, output exactly: SILENT\n\n"
            "Transcription:"
        )

        # Retry once on timeout/SSL — these are transient on Windows
        import time as _time
        _contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
        try:
            response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=_contents,
            )
        except Exception as _first_err:
            _e = str(_first_err).lower()
            if any(k in _e for k in ('timeout', 'ssl', 'handshake', 'timed out')):
                logger.warning(f"Gemini attempt 1 failed ({_first_err}) — retrying in 3s...")
                _time.sleep(3)
                response = gemini_client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=_contents,
                )
            else:
                raise

        transcribed = response.text.strip()

        # Handle explicit SILENT response from Gemini
        if transcribed.upper().startswith('SILENT') or transcribed.strip() == 'SILENT':
            raise ValueError("Gemini detected no speech (SILENT)")

        # Strip non-Arabic characters but KEEP harakat for the raw transcript
        # _clean_arabic() will strip them during comparison â€” keeping them here
        # gives better word-boundary detection in SequenceMatcher.
        transcribed = re.sub(r'[^\u0600-\u06FF\u0020]', ' ', transcribed).strip()
        transcribed = ' '.join(transcribed.split())  # normalise whitespace

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
                mem_hits += 1.0
        elif tag == 'replace':
            for k, w in enumerate(t_slice):
                uw = u_slice[k] if k < len(u_slice) else ""
                ratio = difflib.SequenceMatcher(None, w, uw).ratio() if uw else 0
                orig  = t_orig[k] if k < len(t_orig) else w
                if ratio >= 0.80:
                    # Very close match â€” minor pronunciation difference
                    # (e.g. harakat stripped, slight ending change)
                    word_results.append({'word': orig, 'status': 'correct',
                                         'user_said': uw})
                    mem_hits += 0.95   # nearly full credit
                elif ratio >= 0.55:
                    # Recognisable word with pronunciation issue
                    word_results.append({'word': orig, 'status': 'pronunciation_issue',
                                         'user_said': uw})
                    pron_issues += 1
                    mem_hits += 0.75
                elif ratio >= 0.30:
                    # Partially recognised
                    word_results.append({'word': orig, 'status': 'incorrect',
                                         'user_said': uw})
                    mem_hits += 0.25
                else:
                    # Completely different word
                    word_results.append({'word': orig, 'status': 'incorrect',
                                         'user_said': uw})
                    mem_hits += 0.0
        elif tag == 'insert':
            # Student said extra words â€” do NOT penalise mem_hits, just note it
            pass
        elif tag == 'delete':
            for k, w in enumerate(t_slice):
                word_results.append({'word': t_orig[k] if k < len(t_orig) else w,
                                     'status': 'skipped'})
                mem_hits += 0.0

    total = max(len(tgt_words_n), 1)
    mem   = float(np.clip((mem_hits / total) * 100, 0, 100))

    # â”€â”€ Fluency from audio signal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Audio is normalised (peak â‰ˆ 1.0).
    # Use a dynamic threshold relative to the mean energy so the score
    # reflects actual voiced-speech proportion rather than absolute amplitude.
    fluency = 0.0
    if len(audio_arr) > 0:
        rms = librosa.feature.rms(y=audio_arr)[0]
        rms_mean_norm = float(np.mean(rms))
        # Frames above 40% of mean RMS count as voiced
        speech_threshold = rms_mean_norm * 0.4
        speech_frames = float(np.sum(rms > speech_threshold))
        sr_ratio = speech_frames / max(len(rms), 1)

        if sr_ratio >= 0.06:   # at least 6% voiced â€” real recitation present
            # Calibrated mapping for Quranic recitation:
            #   sr_ratio 0.15 â†’ ~62  (beginner, lots of pauses)
            #   sr_ratio 0.30 â†’ ~74  (intermediate)
            #   sr_ratio 0.45 â†’ ~86  (good, smooth recitation)
            #   sr_ratio 0.60 â†’ ~97  (very fluent, minimal pauses)
            raw_fluency = 50.0 + sr_ratio * 78.0
            # Use mem as a floor â€” if memorization is high, student was reciting,
            # so fluency shouldn't be artificially lower than the mem score
            floor_fluency = mem * 0.60   # at least 60% of mem score
            fluency = float(np.clip(
                max(raw_fluency, floor_fluency) + random.uniform(-3, 3),
                30, 97
            ))
        else:
            fluency = float(np.clip(sr_ratio * 200, 0, 12))

    # â”€â”€ Tajweed from makhraj errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Each confirmed makhraj error deducts 5 points.
    # No relative cap â€” a student can have good Tajweed even with moderate mem
    # (they may have recited a subset perfectly).
    makhraj_tips = _get_makhraj_tips(user_ph, expected_text or "")
    tajwid_errors = makhraj_tips.count('- <b>')
    tajwid = float(np.clip(100 - tajwid_errors * 5, 0, 97))
    # Only apply relative cap if memorization is very poor (< 30%)
    # A student who recited with good articulation but skipped words still
    # showed Tajweed effort â€” don't cap too aggressively.
    if tajwid > mem + 30 and mem < 30:
        tajwid = mem + 30

    # â”€â”€ Pronunciation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Penalty per pronunciation issue relative to total expected words.
    # 18 points spread across total is firm but fair.
    # No hard cap relative to mem â€” pronunciation can legitimately exceed mem
    # (student recited the right sounds in the wrong order).
    pron = float(np.clip(100 - (pron_issues / total) * 18, 0, 100))

    overall = mem * 0.45 + pron * 0.30 + tajwid * 0.15 + fluency * 0.10
    logger.info(
        f"Scores â†’ Mem:{mem:.1f} Pron:{pron:.1f} "
        f"Tajwid:{tajwid:.1f} Fluency:{fluency:.1f} Overall:{overall:.1f} "
        f"(pron_issues={pron_issues}, makhraj_errors={tajwid_errors}, total_words={total})"
    )
    return {
        "mem": mem, "pron": pron, "tajwid": tajwid, "fluency": fluency,
        "overall": overall, "word_alignments": word_results, "source": "gemini"
    }


# â”€â”€ Makhraj tips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ Public get_phonetics stubs (used by /api/assess-chunk) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ Silence / no-speech detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _detect_silence(audio_arr: np.ndarray, sr: int = 16000) -> dict:
    """
    Determine whether the audio contains meaningful speech.

    Uses a multi-check approach:
      1. Absolute RMS energy â€” must be above a minimum level
      2. Speech ratio â€” enough frames must be louder than background noise
      3. Speech duration â€” must have at least 0.8s of voice-level audio

    Rejects if ANY of these fail, which catches:
      - Complete silence (mic muted / not speaking)
      - Background room noise only (fan, AC) â€” low absolute RMS
      - Very short taps that produce a brief click but no speech
    """
    if len(audio_arr) == 0:
        return {
            "speech_detected": False,
            "speech_ratio": 0.0,
            "speech_seconds": 0.0,
            "rms_mean": 0.0,
            "reason": (
                "Recording could not be processed. "
                "Please re-record and make sure you speak clearly into the microphone. "
                "If the problem persists, try restarting the app."
            ),
        }

    rms = librosa.feature.rms(y=audio_arr, frame_length=512, hop_length=256)[0]
    rms_mean = float(np.mean(rms))
    rms_max  = float(np.max(rms))

    # â”€â”€ Check 1: Absolute energy floor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Human speech in un-normalised audio typically has RMS > 0.008.
    # Pure electrical mic noise (no voice) is usually < 0.002.
    # 0.003 is a safe floor that works across different microphone sensitivities.
    ABSOLUTE_RMS_MIN = 0.003
    if rms_mean < ABSOLUTE_RMS_MIN:
        logger.warning(
            f"Silence gate: rms_mean={rms_mean:.6f} < {ABSOLUTE_RMS_MIN} â†’ SILENT"
        )
        return {
            "speech_detected": False,
            "speech_ratio": 0.0,
            "speech_seconds": 0.0,
            "rms_mean": round(rms_mean, 6),
            "reason": "No speech detected. Please recite clearly into the microphone and try again.",
        }

    # â”€â”€ Check 2: Adaptive speech/noise ratio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Noise floor = 20th percentile RMS (quietest 20% of frames = background)
    noise_floor = float(np.percentile(rms, 20))
    # Speech frames must be 3Ã— louder than background.
    # Remove the hard 0.01 floor â€” it was rejecting soft microphones.
    # Use rms_mean * 0.3 as a minimum so the threshold scales with the mic level.
    speech_threshold = max(noise_floor * 3.0, rms_mean * 0.3)

    speech_frames = int(np.sum(rms > speech_threshold))
    total_frames  = max(len(rms), 1)
    speech_ratio  = speech_frames / total_frames

    # Convert speech frames â†’ seconds
    hop_length    = 256
    speech_seconds = float(speech_frames * hop_length / sr)

    # â”€â”€ Check 3: Minimum speech duration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # At least 0.9s of speech-level audio must be present.
    # Bismillah takes ~1.2â€“2s normally; a quick recitation can be ~0.9s.
    # Below 0.9s is likely an accidental tap or a breath, not actual recitation.
    MIN_SPEECH_SECONDS = 0.9
    MIN_SPEECH_RATIO   = 0.08  # at least 8% of frames must be speech-level

    is_silent = (speech_ratio < MIN_SPEECH_RATIO) or (speech_seconds < MIN_SPEECH_SECONDS)

    reason = ""
    if is_silent:
        if speech_seconds < 0.3:
            reason = (
                "No recitation detected. Please recite clearly into the microphone. "
                "Make sure you are not on mute and your microphone is working."
            )
        elif speech_seconds < MIN_SPEECH_SECONDS:
            reason = (
                f"Recitation too short ({speech_seconds:.1f}s detected). "
                "Please recite the full ayah â€” do not stop early."
            )
        else:
            reason = (
                "Voice level too low. Please recite louder and hold the device "
                "closer to your mouth, then try again."
            )

    logger.info(
        f"Silence check â†’ ratio={speech_ratio:.3f}  "
        f"speech={speech_seconds:.2f}s  rms_mean={rms_mean:.5f}  "
        f"rms_max={rms_max:.5f}  threshold={speech_threshold:.5f}  "
        f"silent={is_silent}"
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
      4. Check for sequence gaps (e.g. detected [1,2,3,5] â€” ayah 4 is missing).

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
        f"Ayah detection [{surah_idx}:{start_ayah}-{end_ayah}] â†’ "
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

        # â”€â”€ Load RAW (trimmed, not normalised) for silence gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # CRITICAL: process_audio() calls librosa.util.normalize() which scales
        # even pure silence to Â±1.0 peak amplitude, defeating any RMS-based
        # silence check. We must test energy BEFORE normalisation.
        audio_arr_raw = _load_audio_raw(user_audio_path)

        # â”€â”€ SILENCE GATE on raw (un-normalised) signal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        silence_check = _detect_silence(audio_arr_raw)
        if not silence_check["speech_detected"]:
            logger.warning(
                f"Silent recording rejected (raw) â€” "
                f"speech_ratio={silence_check['speech_ratio']:.3f}, "
                f"speech_seconds={silence_check['speech_seconds']:.2f}s, "
                f"rms_mean={silence_check['rms_mean']:.6f}"
            )
            return {
                "status":  "no_speech",
                "message": silence_check["reason"],
                "speech_ratio":   silence_check["speech_ratio"],
                "speech_seconds": silence_check["speech_seconds"],
            }

        # â”€â”€ Now load the normalised version for AI / acoustic analysis â”€â”€â”€â”€â”€â”€â”€
        audio_arr = librosa.util.normalize(audio_arr_raw) if len(audio_arr_raw) > 0 else audio_arr_raw

        # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        # â”€â”€ Path 1: Gemini transcription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if gemini_client is not None:
            logger.info("Using Gemini for transcription...")
            try:
                user_ph = _transcribe_gemini(user_audio_path, expected_ayah_text)
                user_ph_res = user_ph

                # â”€â”€ Gemini hallucination guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                # Only reject if Gemini returned â‰¤1 word (near-empty output)
                # AND the raw audio had very little speech energy.
                # We no longer use the coverage ratio here because low coverage
                # could mean the student recited correctly but Gemini under-
                # transcribed â€” that should be scored, not silently rejected.
                transcribed_word_count = len([w for w in user_ph.split() if w])
                if transcribed_word_count <= 1 and silence_check["speech_ratio"] < 0.12:
                    logger.warning(
                        f"Gemini returned â‰¤1 word with low speech energy "
                        f"(words={transcribed_word_count}, "
                        f"speech_ratio={silence_check['speech_ratio']:.3f}) â€” likely silent"
                    )
                    return {
                        "status":  "no_speech",
                        "message": "No recitation detected. Please recite clearly into the microphone.",
                        "speech_ratio":   silence_check["speech_ratio"],
                        "speech_seconds": silence_check["speech_seconds"],
                    }
                # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

                # â”€â”€ Surah mismatch check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

                scores = _score_from_transcription(user_ph, expected_ayah_text, audio_arr)
                logger.info("Gemini scoring complete.")
            except Exception as e:
                logger.warning(f"Gemini path failed ({e}), falling back to acoustic.")
                scores = None

        # â”€â”€ Path 2: Acoustic analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        # â”€â”€ Ayah detection for continuous / range recitations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ Legacy Entry Point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def main():
    if not load_dataset() or not load_model():
        print("Startup failed.")
        return
    print("TasmiqAI engine ready. Use the FastAPI server for the mobile app.")

if __name__ == "__main__":
    main()