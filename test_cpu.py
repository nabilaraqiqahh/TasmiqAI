import torch
import time

print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("Device name:", torch.cuda.get_device_name(0))

# Try loading the model directly on CPU
import sys
sys.path.append(r'E:\TasmiqAI')
import tasmiq_app

print("Forcing CPU device in tasmiq_app...")
tasmiq_app.device = "cpu"
tasmiq_app.load_model()

# Process a small reference audio
ref_path = tasmiq_app.AUDIO_DIR / "001" / "001.mp3"
arr = tasmiq_app.process_audio(ref_path)

print("Starting inference on CPU...")
start = time.time()
ph = tasmiq_app.get_phonetics(arr)
end = time.time()
print(f"ASR result: '{ph}' in {end-start:.2f} seconds")
