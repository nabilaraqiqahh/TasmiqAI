"""
Rebuilds quran_expert_system_ui.ipynb using ipywidgets.interact
which works reliably without needing nbextension enabled manually.
"""
import json
from pathlib import Path

NB_PATH = Path(__file__).parent / "quran_expert_system_ui.ipynb"

def code_cell(lines):
    return {"cell_type": "code", "execution_count": None,
            "metadata": {}, "outputs": [], "source": lines}

def md_cell(lines):
    return {"cell_type": "markdown", "metadata": {}, "source": lines}

# ── Cell 1: enable widgets + install ─────────────────────────────────────────
SETUP = code_cell([
    "import sys, subprocess\n",
    "subprocess.run([sys.executable, '-m', 'pip', 'install',\n",
    "    'ipywidgets', 'soundfile', 'librosa', 'transformers', 'torch', '--quiet'])\n",
    "subprocess.run([sys.executable, '-m', 'jupyter', 'nbextension',\n",
    "    'enable', '--py', 'widgetsnbextension', '--sys-prefix'])\n",
    "print('✅ Ready. Now run Cell 2.')\n",
    "print('⚠️  If this is your first time, RESTART THE KERNEL then run Cell 2.')"
])

# ── Cell 2: full self-contained app ──────────────────────────────────────────
APP = code_cell([
    "# TasmiqAI — Quran Expert System\n",
    "import json, logging\n",
    "import numpy as np\n",
    "from pathlib import Path\n",
    "import librosa, torch\n",
    "import ipywidgets as widgets\n",
    "from ipywidgets import interact, fixed\n",
    "from IPython.display import display, Audio, HTML, clear_output\n",
    "from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC\n",
    "\n",
    "logging.basicConfig(level=logging.WARNING)\n",
    "\n",
    "# ── Load dataset ─────────────────────────────────────────────────────────\n",
    "DATASET_ROOT = Path(r'C:\\Users\\nabil\\.gemini\\antigravity\\scratch\\quranjson\\source')\n",
    "AUDIO_ROOT   = DATASET_ROOT / 'audio'\n",
    "\n",
    "print('📂 Loading dataset...')\n",
    "quran = {}\n",
    "for _sf in sorted((DATASET_ROOT/'surah').glob('surah_*.json'),\n",
    "                   key=lambda p: int(p.stem.split('_')[1])):\n",
    "    with open(_sf, 'r', encoding='utf-8') as _f:\n",
    "        _d = json.load(_f)\n",
    "    quran[int(_d['index'])] = _d\n",
    "\n",
    "def get_ayah(s, a):       return quran.get(s,{}).get('verse',{}).get(f'verse_{a}','[not found]')\n",
    "def get_name(s):          return quran.get(s,{}).get('name','Unknown')\n",
    "def get_count(s):         return quran.get(s,{}).get('count',0)\n",
    "def audio_path(s, a):     return AUDIO_ROOT / f'{s:03d}' / f'{a:03d}.mp3'\n",
    "\n",
    "print(f'✅ {len(quran)} surahs loaded.')\n",
    "\n",
    "# ── Load model ────────────────────────────────────────────────────────────\n",
    "print('⏳ Loading Wav2Vec2 model...')\n",
    "_proc  = Wav2Vec2Processor.from_pretrained('TBOGamer22/wav2vec2-quran-phonetics')\n",
    "_model = Wav2Vec2ForCTC.from_pretrained('TBOGamer22/wav2vec2-quran-phonetics')\n",
    "_model.eval()\n",
    "_dev = 'cuda' if torch.cuda.is_available() else 'cpu'\n",
    "_model.to(_dev)\n",
    "print(f'✅ Model on: {_dev}')\n",
    "\n",
    "# ── Surah selection ───────────────────────────────────────────────────────\n",
    "surah_opts = {f'{i:03d}. {get_name(i)} ({get_count(i)} ayahs)': i\n",
    "              for i in range(1, 115)}\n",
    "\n",
    "# ── Output areas ─────────────────────────────────────────────────────────\n",
    "out_audio  = widgets.Output()\n",
    "out_result = widgets.Output()\n",
    "\n",
    "# ── Surah dropdown ────────────────────────────────────────────────────────\n",
    "w_surah = widgets.Dropdown(\n",
    "    options=surah_opts, value=1,\n",
    "    description='Surah:',\n",
    "    layout=widgets.Layout(width='380px'))\n",
    "\n",
    "w_ayah = widgets.BoundedIntText(\n",
    "    value=1, min=1, max=7,\n",
    "    description='Ayah #:',\n",
    "    layout=widgets.Layout(width='160px'))\n",
    "\n",
    "w_btn = widgets.Button(\n",
    "    description='▶ Run Assessment',\n",
    "    button_style='success',\n",
    "    layout=widgets.Layout(width='180px', height='36px'))\n",
    "\n",
    "w_info = widgets.HTML('')\n",
    "\n",
    "def update_max(change):\n",
    "    w_ayah.max = get_count(change['new'])\n",
    "    w_ayah.value = 1\n",
    "    with out_audio:  clear_output()\n",
    "    with out_result: clear_output()\n",
    "\n",
    "w_surah.observe(update_max, names='value')\n",
    "\n",
    "def run(_):\n",
    "    s, a = w_surah.value, w_ayah.value\n",
    "    w_info.value = \"<i style='color:gray'>⏳ Processing...</i>\"\n",
    "\n",
    "    ap = audio_path(s, a)\n",
    "    arabic = get_ayah(s, a)\n",
    "    name   = get_name(s)\n",
    "\n",
    "    with out_audio:\n",
    "        clear_output(wait=True)\n",
    "        if ap.exists():\n",
    "            print('🔊 Dataset audio:')\n",
    "            display(Audio(str(ap)))\n",
    "        else:\n",
    "            print('⚠️  No audio file for this ayah.')\n",
    "\n",
    "    with out_result:\n",
    "        clear_output(wait=True)\n",
    "        if not ap.exists():\n",
    "            w_info.value = ''\n",
    "            return\n",
    "\n",
    "        arr, _ = librosa.load(str(ap), sr=16000, mono=True)\n",
    "        inp = _proc(arr, sampling_rate=16000, return_tensors='pt', padding=True)\n",
    "        inp = {k: v.to(_dev) for k, v in inp.items()}\n",
    "        with torch.inference_mode():\n",
    "            logits = _model(**inp).logits\n",
    "        ph = _proc.batch_decode(torch.argmax(logits,-1),\n",
    "                                skip_special_tokens=True)[0]\n",
    "\n",
    "        display(HTML(\n",
    "            f\"<div style='margin:8px 0;padding:12px;background:#f0f7f4;\"\n",
    "            f\"border-left:4px solid #2d6a4f;border-radius:0 8px 8px 0'>\"\n",
    "            f\"<small>📖 Surah {s} — {name} | Ayah {a}</small><br>\"\n",
    "            f\"<span style='font-size:24px;direction:rtl;display:block;\"\n",
    "            f\"color:#1a472a;line-height:2'>{arabic}</span></div>\"\n",
    "            f\"<div style='padding:12px;background:#e8f5e9;\"\n",
    "            f\"border-left:4px solid #43a047;border-radius:0 8px 8px 0;margin-bottom:8px'>\"\n",
    "            f\"<small>🎙️ Phonetics Detected</small><br>\"\n",
    "            f\"<code style='font-size:15px;color:#1b5e20'>{ph or 'no output'}</code></div>\"\n",
    "        ))\n",
    "    w_info.value = '✅ Done'\n",
    "\n",
    "w_btn.on_click(run)\n",
    "\n",
    "# ── Assemble UI ───────────────────────────────────────────────────────────\n",
    "header = widgets.HTML(\n",
    "    \"<div style='background:linear-gradient(135deg,#1a472a,#2d6a4f);\"\n",
    "    \"color:white;padding:14px 20px;border-radius:10px;margin-bottom:8px'>\"\n",
    "    \"<b style='font-size:18px'>📖 TasmiqAI — Quran Expert System</b><br>\"\n",
    "    \"<small>30 Juz · 114 Surahs · 6236 Verses · Wav2Vec2 Phonetics</small></div>\")\n",
    "\n",
    "row = widgets.HBox([w_surah, w_ayah, w_btn],\n",
    "                    layout=widgets.Layout(gap='8px', align_items='center'))\n",
    "\n",
    "app = widgets.VBox([\n",
    "    header, row, w_info,\n",
    "    widgets.HTML('<hr>'),\n",
    "    out_audio,\n",
    "    widgets.HTML('<b>📊 Result</b>'),\n",
    "    out_result\n",
    "], layout=widgets.Layout(width='700px', padding='8px'))\n",
    "\n",
    "display(app)"
])

nb = {
    "cells": [
        md_cell([
            "# 📖 TasmiqAI — Quran Expert System\n\n",
            "1. **Run Cell 1** once (installs packages + enables widgets). ",
            "**Restart kernel** after.\n",
            "2. **Run Cell 2** — UI appears at the bottom of the cell."
        ]),
        md_cell(["## Cell 1 — Setup (run once, then restart kernel)"]),
        SETUP,
        md_cell(["## Cell 2 — Expert System UI"]),
        APP,
    ],
    "metadata": {
        "kernelspec": {"display_name": "Python (tf211)", "language": "python", "name": "tf211"},
        "language_info": {
            "codemirror_mode": {"name": "ipython", "version": 3},
            "file_extension": ".py", "mimetype": "text/x-python",
            "name": "python", "pygments_lexer": "ipython3", "version": "3.10.18"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 4
}

with open(NB_PATH, "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print(f"✅ Rebuilt: {NB_PATH}")
