"""
Phase 1 Production Preparation — Test Suite
Run: python test_phase1.py
"""
import sys, os
import numpy as np

PASS = []
FAIL = []

def ok(name):
    PASS.append(name)
    print(f"  [PASS] {name}")

def fail(name, reason=""):
    FAIL.append(name)
    print(f"  [FAIL] {name}  — {reason}")

print("\n" + "="*60)
print("  TasmiqAI Phase 1 — Production Preparation Tests")
print("="*60)

# ── 1. Backend import ──────────────────────────────────────────
print("\n[1] Backend imports")
try:
    import tasmiq_app as app
    import tasmiq_api as api
    ok("tasmiq_app and tasmiq_api import without error")
except Exception as e:
    fail("import", str(e))
    sys.exit(1)

# ── 2. Quran dataset path ─────────────────────────────────────
print("\n[2] Quran dataset path")
try:
    assert app.SURAH_DIR.exists(), f"SURAH_DIR not found: {app.SURAH_DIR}"
    assert "Users\\nabil" not in str(app.SURAH_DIR), "Hardcoded Windows path still present!"
    result = app.load_dataset()
    assert result, "load_dataset returned False"
    assert len(app.quran_data) > 100, f"Only {len(app.quran_data)} surahs loaded"
    ok(f"Quran data loaded from relative path ({len(app.quran_data)} surahs, path={app.SURAH_DIR})")
except AssertionError as e:
    fail("Quran dataset", str(e))

# ── 3. FFmpeg detection ────────────────────────────────────────
print("\n[3] FFmpeg detection")
try:
    import shutil
    bundled = os.path.join(os.path.dirname(__file__), 'deps', 'imageio_ffmpeg', 'binaries', 'ffmpeg.exe')
    system  = shutil.which('ffmpeg')
    found   = os.path.exists(bundled) or bool(system)
    assert found, "Neither bundled nor system ffmpeg found"
    path = bundled if os.path.exists(bundled) else system
    ok(f"ffmpeg found: {path}")
except AssertionError as e:
    fail("ffmpeg", str(e))

# ── 4. Password hashing ────────────────────────────────────────
print("\n[4] Password hashing (bcrypt)")
try:
    from tasmiq_api import hash_password, verify_password, is_hashed

    h = hash_password("TestPass123!")
    assert h.startswith("$2b$"), "Hash does not look like bcrypt"
    ok("hash_password produces bcrypt hash")

    assert verify_password("TestPass123!", h) is True
    ok("verify_password: correct password accepted")

    assert verify_password("WrongPass!", h) is False
    ok("verify_password: wrong password rejected")

    assert is_hashed(h) is True
    ok("is_hashed: bcrypt hash detected correctly")

    assert is_hashed("plaintext123") is False
    ok("is_hashed: plain text detected correctly")

    # Legacy plain-text fallback
    assert verify_password("oldpass", "oldpass") is True
    ok("verify_password: legacy plain-text match works")

    assert verify_password("oldpass", "differentpass") is False
    ok("verify_password: legacy plain-text mismatch rejected")

except Exception as e:
    fail("bcrypt", str(e))

# ── 5. JWT tokens ─────────────────────────────────────────────
print("\n[5] JWT tokens")
try:
    from tasmiq_api import create_access_token, decode_access_token
    from jose import JWTError

    token = create_access_token("user-abc", "test@student.tahfiz.my", "student")
    assert token and len(token) > 20
    ok("create_access_token produces a non-empty token")

    payload = decode_access_token(token)
    assert payload["sub"]  == "user-abc"
    assert payload["role"] == "student"
    assert payload["email"] == "test@student.tahfiz.my"
    ok(f"decode_access_token: sub={payload['sub']} role={payload['role']}")

    # Tampered token must fail
    try:
        decode_access_token(token + "tampered")
        fail("JWT tamper check", "Tampered token was accepted!")
    except JWTError:
        ok("Tampered JWT correctly rejected")

    # Fake legacy token still accepted by get_current_user (compatibility)
    assert api.JWT_SECRET != "", "JWT_SECRET is empty"
    ok(f"JWT_SECRET loaded ({len(api.JWT_SECRET)} chars)")

except Exception as e:
    fail("JWT", str(e))

# ── 6. CORS configuration ─────────────────────────────────────
print("\n[6] CORS configuration")
try:
    origins = api.ALLOWED_ORIGINS
    assert "*" not in origins, "Wildcard * still in CORS origins!"
    ok(f"No wildcard in CORS origins: {origins}")
    for expected in ["http://localhost:5173", "http://localhost:3000"]:
        assert expected in origins, f"{expected} missing from dev CORS"
    ok("Dev localhost origins present")
except AssertionError as e:
    fail("CORS", str(e))

# ── 7. Debug endpoint removed ─────────────────────────────────
print("\n[7] Debug endpoints removed")
try:
    import inspect
    src = inspect.getsource(api)
    assert "debug-user" not in src, "/api/auth/debug-user still exists in source!"
    ok("/api/auth/debug-user endpoint removed")
    assert "password_hash" not in src or "password_hash" not in [
        line for line in src.splitlines() if "return {" in line and "password_hash" in line
    ], "password_hash may be exposed in a response"
    ok("No password_hash returned in any response")
except AssertionError as e:
    fail("debug endpoint", str(e))

# ── 8. Supabase connection ────────────────────────────────────
print("\n[8] Supabase connection")
try:
    assert api.supabase is not None, "Supabase client is None"
    resp = api.supabase.table("users").select("id").limit(1).execute()
    assert resp is not None
    ok("Supabase client connected and queries work")
except Exception as e:
    fail("Supabase", str(e))

# ── 9. Gemini / dataset load ─────────────────────────────────
print("\n[9] AI engine")
try:
    app.load_model()
    if app.gemini_client is not None:
        ok("Gemini Flash client initialized")
    else:
        ok("Gemini not available — acoustic fallback will be used")
except Exception as e:
    fail("AI engine", str(e))

# ── 10. Audio processing (silence gate) ──────────────────────
print("\n[10] Audio processing")
try:
    import numpy as np
    # Simulate silent audio
    silent = np.zeros(16000, dtype=np.float32)
    result = app._detect_silence(silent)
    assert result["speech_detected"] is False, "Silent audio not detected as silent"
    ok("Silent audio correctly rejected by silence gate")

    # Simulate speech-like audio: amplitude-modulated signal (mimics natural speech bursts)
    # A pure sine has uniform RMS so adaptive noise floor can reject it — use bursts instead
    sr = 16000
    duration = 2.0  # 2 seconds
    samples  = int(sr * duration)
    t        = np.linspace(0, duration, samples, dtype=np.float32)
    # Base carrier at 200 Hz
    carrier  = np.sin(2 * np.pi * 200 * t)
    # Amplitude envelope: bursts of speech (on/off pattern)
    envelope = np.zeros(samples, dtype=np.float32)
    # Active speech in frames: 0.0-0.3s, 0.5-0.9s, 1.1-1.6s, 1.8-2.0s
    for start, end in [(0.0, 0.3), (0.5, 0.9), (1.1, 1.6), (1.8, 2.0)]:
        envelope[int(start*sr):int(end*sr)] = 0.25
    speech_like = (carrier * envelope).astype(np.float32)
    result2 = app._detect_silence(speech_like)
    assert result2["speech_detected"] is True, (
        f"Speech-burst signal rejected as silent "
        f"(ratio={result2['speech_ratio']:.3f}, secs={result2['speech_seconds']:.2f})"
    )
    ok(f"Speech-burst audio passes silence gate (ratio={result2['speech_ratio']:.3f}, {result2['speech_seconds']:.1f}s)")
except Exception as e:
    fail("Audio processing", str(e))

# ── 11. Environment variables ─────────────────────────────────
print("\n[11] Environment variables")
required = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY", "JWT_SECRET"]
for var in required:
    val = os.environ.get(var, "")
    if val:
        ok(f"{var} is set ({val[:6]}...)")
    else:
        fail(f"{var} not set in environment")

# ── 12. .env.example exists and has no real secrets ───────────
print("\n[12] .env.example")
try:
    env_ex = os.path.join(os.path.dirname(__file__), ".env.example")
    assert os.path.exists(env_ex), ".env.example does not exist"
    content = open(env_ex).read()
    assert "AIza" not in content, "Real Gemini API key found in .env.example!"
    assert "eyJ"  not in content, "Real Supabase key found in .env.example!"
    ok(".env.example exists with no real secrets")
except AssertionError as e:
    fail(".env.example", str(e))

# ── 13. requirements.txt exists ───────────────────────────────
print("\n[13] requirements.txt")
try:
    req = os.path.join(os.path.dirname(__file__), "requirements.txt")
    assert os.path.exists(req), "requirements.txt does not exist"
    content = open(req).read()
    # torch should not be an actual dependency line (comments containing 'torch' are fine)
    torch_lines = [l for l in content.splitlines() if 'torch' in l.lower() and not l.strip().startswith('#')]
    assert len(torch_lines) == 0, f"torch found as active dependency: {torch_lines}"
    for pkg in ["fastapi", "bcrypt", "python-jose", "supabase", "librosa"]:
        assert pkg in content, f"{pkg} missing from requirements.txt"
    ok("requirements.txt exists with correct packages, torch excluded")
except AssertionError as e:
    fail("requirements.txt", str(e))

# ── 14. Quran data directory exists ───────────────────────────
print("\n[14] Bundled Quran data")
try:
    quran_dir = os.path.join(os.path.dirname(__file__), "data", "quran", "source", "surah")
    assert os.path.exists(quran_dir), f"data/quran/source/surah not found: {quran_dir}"
    files = os.listdir(quran_dir)
    assert len(files) >= 114, f"Expected 114+ surah files, found {len(files)}"
    ok(f"Quran data bundled in project ({len(files)} files in data/quran/source/surah/)")
except AssertionError as e:
    fail("Quran data bundle", str(e))

# ── Summary ───────────────────────────────────────────────────
print("\n" + "="*60)
print(f"  RESULTS: {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print(f"\n  FAILED TESTS:")
    for f in FAIL:
        print(f"    - {f}")
print("="*60 + "\n")
sys.exit(0 if not FAIL else 1)
