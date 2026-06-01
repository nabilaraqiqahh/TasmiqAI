"""
Run this script ONCE to update Cell 7 of quran_expert_system.ipynb.
It replaces Cell 7 with a fully self-contained version that:
  - Uses audio from the dataset (MP3) instead of a custom WAV file
  - Re-loads everything it needs (fixes NameError if run standalone)
  - Handles MP3 loading via librosa
"""

import json
from pathlib import Path

NB_PATH = Path(__file__).parent / "quran_expert_system.ipynb"

NEW_CELL7_MARKDOWN = {
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "---\n",
        "## Cell 7 — 🎯 Run Assessment (Dataset Audio)\n",
        "\n",
        "This cell is **fully self-contained** — run it alone or after other cells.\n",
        "Set `TARGET_SURAH` and `TARGET_AYAH`; the audio is pulled automatically from the dataset MP3 files."
    ]
}

NEW_CELL7_CODE = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "# ============================================================\n",
        "#  ⚙️  CONFIGURE YOUR TEST — change these two values only\n",
        "# ============================================================\n",
        "TARGET_SURAH = 1   # 1–114\n",
        "TARGET_AYAH  = 1   # verse number inside that surah\n",
        "# ============================================================\n",
        "\n",
        "import json, os, logging\n",
        "import numpy as np\n",
        "from pathlib import Path\n",
        "import librosa\n",
        "import torch\n",
        "from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC\n",
        "\n",
        "logging.basicConfig(level=logging.WARNING)\n",
        "\n",
        "DATASET_ROOT = Path(r\"C:\\Users\\nabil\\.gemini\\antigravity\\scratch\\quranjson\\source\")\n",
        "AUDIO_ROOT   = DATASET_ROOT / \"audio\"\n",
        "SURAH_DIR    = DATASET_ROOT / \"surah\"\n",
        "\n",
        "# ── 1. Load dataset (if not already in memory) ───────────────\n",
        "_quran = {}\n",
        "for _sf in sorted(SURAH_DIR.glob(\"surah_*.json\"),\n",
        "                  key=lambda p: int(p.stem.split('_')[1])):\n",
        "    with open(_sf, 'r', encoding='utf-8') as _f:\n",
        "        _d = json.load(_f)\n",
        "    _quran[int(_d['index'])] = _d\n",
        "print(f\"✅  Dataset loaded: {len(_quran)} surahs.\")\n",
        "\n",
        "def _ayah(s, a): return _quran.get(s, {}).get('verse', {}).get(f'verse_{a}', '[not found]')\n",
        "def _name(s):    return _quran.get(s, {}).get('name', 'Unknown')\n",
        "\n",
        "# ── 2. Resolve audio path from dataset ───────────────────────\n",
        "audio_path    = AUDIO_ROOT / f\"{TARGET_SURAH:03d}\" / f\"{TARGET_AYAH:03d}.mp3\"\n",
        "expected_text = _ayah(TARGET_SURAH, TARGET_AYAH)\n",
        "surah_name    = _name(TARGET_SURAH)\n",
        "\n",
        "print(\"=\" * 62)\n",
        "print(f\"📖  Target      : Surah {TARGET_SURAH} ({surah_name}), Ayah {TARGET_AYAH}\")\n",
        "print(f\"📝  Arabic text : {expected_text}\")\n",
        "print(f\"🔊  Audio file  : {audio_path}\")\n",
        "print(\"=\" * 62)\n",
        "\n",
        "if not audio_path.exists():\n",
        "    print(f\"\\n⚠️  Audio file not found: {audio_path}\")\n",
        "    print(\"   Check that TARGET_SURAH and TARGET_AYAH are valid.\")\n",
        "else:\n",
        "    # ── 3. Load model ─────────────────────────────────────────\n",
        "    _MODEL = \"TBOGamer22/wav2vec2-quran-phonetics\"\n",
        "    print(\"\\n⏳ Loading Wav2Vec2 model (cached after first run)...\")\n",
        "    _processor = Wav2Vec2Processor.from_pretrained(_MODEL)\n",
        "    _model     = Wav2Vec2ForCTC.from_pretrained(_MODEL)\n",
        "    _model.eval()\n",
        "    _device = \"cuda\" if torch.cuda.is_available() else \"cpu\"\n",
        "    _model  = _model.to(_device)\n",
        "    print(f\"✅ Model ready on: {_device}\")\n",
        "\n",
        "    # ── 4. Load MP3 audio via librosa ────────────────────────\n",
        "    print(f\"\\n🎙️  Loading audio: {audio_path.name}\")\n",
        "    _audio, _sr = librosa.load(str(audio_path), sr=16000, mono=True)\n",
        "    print(f\"   Duration: {len(_audio)/16000:.2f}s  |  16000 Hz\")\n",
        "\n",
        "    # ── 5. Phonetic inference ─────────────────────────────────\n",
        "    print(\"🤖  Running phonetic inference...\")\n",
        "    _inputs = _processor(_audio, sampling_rate=16000, return_tensors=\"pt\", padding=True)\n",
        "    _inputs = {k: v.to(_device) for k, v in _inputs.items()}\n",
        "    with torch.inference_mode():\n",
        "        _logits = _model(**_inputs).logits\n",
        "    _ids       = torch.argmax(_logits, dim=-1)\n",
        "    _phonetics = _processor.batch_decode(_ids, skip_special_tokens=True)[0]\n",
        "\n",
        "    # ── 6. Result ─────────────────────────────────────────────\n",
        "    print()\n",
        "    print(\"=\" * 62)\n",
        "    print(\"📊  ASSESSMENT RESULT\")\n",
        "    print(\"=\" * 62)\n",
        "    print(f\"📝  Arabic (expected)  : {expected_text}\")\n",
        "    print(f\"🎙️  Phonetics detected : {_phonetics}\")\n",
        "    print(\"=\" * 62)\n",
        "    print(\"✅  Assessment complete!\")\n"
    ]
}

# ── Load the notebook ─────────────────────────────────────────
with open(NB_PATH, "r", encoding="utf-8") as f:
    nb = json.load(f)

# ── Find and replace Cell 7 (the old assessment cell) ─────────
# Strategy: locate the code cell with TARGET_SURAH that has the OLD AUDIO_FILE line
cells = nb["cells"]
replaced = False
for i, cell in enumerate(cells):
    src = "".join(cell.get("source", []))
    if cell["cell_type"] == "code" and "AUDIO_FILE" in src and "TARGET_SURAH" in src:
        # Replace the markdown header before it too
        if i > 0 and cells[i-1]["cell_type"] == "markdown":
            cells[i-1] = NEW_CELL7_MARKDOWN
        cells[i] = NEW_CELL7_CODE
        replaced = True
        print(f"✅  Replaced Cell 7 (index {i}) in the notebook.")
        break

if not replaced:
    print("⚠️  Could not find the old Cell 7. Appending new cell instead.")
    nb["cells"].append(NEW_CELL7_MARKDOWN)
    nb["cells"].append(NEW_CELL7_CODE)

# ── Save ──────────────────────────────────────────────────────
with open(NB_PATH, "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print(f"💾  Saved: {NB_PATH}")
print("🎉  Done! Reopen quran_expert_system.ipynb and run Cell 7.")
