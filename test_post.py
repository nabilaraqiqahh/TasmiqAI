import requests
import shutil
import os
import sys

# Force UTF-8 output on Windows to avoid cp1252 encoding errors
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Copy a real reference audio file to simulate a real user recording
real_audio_source = r"C:\Users\nabil\.gemini\antigravity\scratch\quranjson\source\audio\001\001.mp3"
if os.path.exists(real_audio_source):
    shutil.copy(real_audio_source, 'test_user.mp3')
    print("Copied real audio to test_user.mp3")
else:
    print("Error: real audio source not found!")
    exit(1)

url = "http://127.0.0.1:8001/analyze"
files = {
    'audio': ('test_user.mp3', open('test_user.mp3', 'rb'), 'audio/mp3')
}
data = {
    'surah': '1',
    'ayah': '1-2'
}

print("Sending POST request to /analyze with real audio...")
try:
    r = requests.post(url, files=files, data=data, timeout=180)
    print("Status code:", r.status_code)
    print("Response JSON:", r.json())
except Exception as e:
    print("Error:", e)
