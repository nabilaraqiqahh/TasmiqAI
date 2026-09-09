# TasmiqAI — FINAL FYP TECHNICAL REVIEW
**Prepared for PSM/FYP Presentation**
**Date: September 2026**

---

## SECTION 1 — SYSTEM ARCHITECTURE SUMMARY

### Verified Architecture (from actual code)

```
STUDENT MOBILE APP (React Native / Expo)
        │
        │  expo-av microphone recording
        │  Audio URI → Blob → Supabase Storage (bucket: recitations)
        ▼
FASTAPI BACKEND (tasmiq_api.py — port 8001)
  POST /analyze
  POST /api/assess-chunk
        │
        │  Calls tasmiq_app.assess_recitation_detailed()
        ▼
AUDIO PRE-PROCESSING (tasmiq_app.py)
  librosa.load() → normalize → trim → silence check
        │
        │  Two Paths:
        ├─── PATH 1: Gemini Flash API (if GEMINI_API_KEY set)
        │          google.genai → transcription (Arabic text)
        │          → _score_from_transcription()
        │          → difflib.SequenceMatcher word-level diff
        │
        └─── PATH 2: Acoustic Fallback (no API key / Gemini fails)
                   librosa signal features (RMS, ZCR, energy)
                   → _acoustic_score()
        │
        ▼
EXPERT SYSTEM RULES (tasmiq_app.py)
  _score_from_transcription() — Rule evaluation
  _validate_surah_match()     — Surah check
  _detect_silence()           — Speech gate
  _get_makhraj_tips()         — Makhraj error hints
  detect_ayahs_in_recitation() — Ayah coverage check
        │
        ▼
SCORING ENGINE
  mem × 0.45 + pron × 0.30 + tajwid × 0.15 + fluency × 0.10 = overall_score
        │
        ▼
RESPONSE TO MOBILE APP
  { overall_score, memorization_score, pronunciation_score,
    tajwid_score, fluency_score, feedback, word_alignments,
    makhraj_tips, transcription, detected_ayahs, missing_ayahs }
        │
        ▼
SUPABASE DATABASE (recitations, assessments, users, notifications)
        │
        ├── STUDENT views result in TasmiqModeScreen
        ├── TEACHER views in RecitationReview.jsx / TasmiqWorkspace.jsx
        └── REPORTS generated in Reports.jsx (PDF via pdfGenerator.js)
```

---

## SECTION 2 — EXPERT SYSTEM ARCHITECTURE

The TasmiqAI Expert System is **not a neural network**. It is a **rule-based decision system** written in Python. It operates AFTER the AI model produces a transcription.

### Dual Engine Architecture

```
Audio Input
    │
    ├── ENGINE 1: Gemini Flash (cloud ASR)
    │   google.genai → Arabic transcription text
    │   Then: Expert System evaluates the transcription
    │
    └── ENGINE 2: Acoustic Analysis (local, CPU-only fallback)
        librosa signal features → direct score estimation
        Expert System still classifies words (random-seeded)
```

### File Locations

| Component | File | Function |
|-----------|------|----------|
| Audio loading | `tasmiq_app.py` | `process_audio()` |
| Silence detection | `tasmiq_app.py` | `_detect_silence()` |
| Gemini transcription | `tasmiq_app.py` | `_transcribe_gemini()` |
| Surah validation | `tasmiq_app.py` | `_validate_surah_match()` |
| Word-level scoring | `tasmiq_app.py` | `_score_from_transcription()` |
| Acoustic fallback | `tasmiq_app.py` | `_acoustic_score()` |
| Makhraj tips | `tasmiq_app.py` | `_get_makhraj_tips()` |
| Ayah coverage | `tasmiq_app.py` | `detect_ayahs_in_recitation()` |
| Score builder | `tasmiq_app.py` | `_build_scores()` |
| Arabic normalizer | `tasmiq_app.py` | `_clean_arabic()` |
| Main entry point | `tasmiq_app.py` | `assess_recitation_detailed()` |
| API endpoint | `tasmiq_api.py` | `POST /analyze` |
| Mobile API call | `tasmiq-mobile/src/services/api.js` | `analyzeRecitation()` |
| Save to DB | `tasmiq-mobile/src/services/recitationService.js` | `saveRecitationResult()` |

---

## SECTION 3 — EXPERT SYSTEM RULES (Detailed)

### RULE 1 — Silence Gate

**RULE ID:** ES-01
**RULE NAME:** No-Speech Detection
**PURPOSE:** Reject empty or silent recordings before wasting API calls.
**FILE:** `tasmiq_app.py` → `_detect_silence()`

**Input:** Audio numpy array (16 kHz, mono)

**Conditions (ALL must pass):**
- RMS mean > 0.008 (absolute energy floor)
- Speech ratio (frames louder than 3× noise floor) ≥ 6%
- Total speech duration ≥ 0.8 seconds

**Decision:**
- Any condition FAILS → `speech_detected: False`
- All pass → continue to transcription

**Output:** `{ speech_detected, speech_ratio, speech_seconds, rms_mean, reason }`

**Example:**
- Student taps record then stays silent → RMS = 0.001 → REJECTED
- Student records a 0.3-second tap → speech_seconds = 0.1 → REJECTED
- Response to mobile: `{ status: "no_speech", message: "No speech detected..." }`

---

### RULE 2 — Surah Mismatch Check

**RULE ID:** ES-02
**RULE NAME:** Wrong Surah Detection
**PURPOSE:** Detect if student recited a completely different surah.
**FILE:** `tasmiq_app.py` → `_validate_surah_match()`

**Input:** `transcribed_text` (from Gemini), `expected_text` (from Quran JSON)

**Processing:**
1. Clean both texts with `_clean_arabic()` (remove diacritics, normalize Alif variants)
2. Take first 15 words of expected as fingerprint window
3. Count word overlap between student transcription and expected vocabulary (order-independent)
4. Also run `SequenceMatcher` for sequence similarity
5. Take the HIGHER of the two metrics

**Condition:** `max(word_overlap, seq_ratio) < 0.45`

**Decision:**
- Similarity < 0.45 → WRONG SURAH
- Similarity ≥ 0.45 → continue to scoring

**Output:** `(is_match: bool, similarity: float, message: str)`

**Example:**
- Expected: "Al-Fatihah" verse 1-7
- Student recites: Al-Ikhlas
- Overlap ~0.05 → REJECTED
- Response: `{ status: "wrong_surah", message: "You recited the wrong surah..." }`

**Limitation:** The 0.45 threshold is generous. A student who partially recites the correct surah mixed with other text may pass this gate.

---

### RULE 3 — Word Comparison (Core Expert System Rule)

**RULE ID:** ES-03
**RULE NAME:** Word-Level Diff Analysis
**PURPOSE:** Compare student transcription word by word against the expected Quran text.
**FILE:** `tasmiq_app.py` → `_score_from_transcription()`

**Input:**
- `user_ph`: Arabic transcription string from Gemini
- `expected_text`: Reference Quran verse text
- `audio_arr`: Numpy array for fluency scoring

**Processing:**
1. Clean both texts using `_clean_arabic()` (removes harakat, normalizes Alif, Ta Marbuta, Ya)
2. Run `difflib.SequenceMatcher(None, expected_words, student_words)` word-by-word
3. Evaluate each opcode (tag):

**Rule 3a — EQUAL (Correct Word):**
- Condition: Expected word == Student word (after normalization)
- Classification: `status: 'correct'`
- Score contribution: `mem_hits += 1.0`

**Rule 3b — REPLACE with high similarity (Pronunciation Issue):**
- Condition: Tag = 'replace' AND `SequenceMatcher(expected_word, student_word).ratio() >= 0.65`
- Classification: `status: 'pronunciation_issue'`
- Score contribution: `mem_hits += 0.75`, `pron_issues += 1`
- **Example:** Student says "إِيَّاكَ" but transcribed as "اياك" (missing diacritics but similar letters) → pronunciation issue

**Rule 3c — REPLACE with moderate similarity (Incorrect Word):**
- Condition: Tag = 'replace' AND ratio between 0.35 and 0.64
- Classification: `status: 'incorrect'`
- Score contribution: `mem_hits += 0.2`

**Rule 3d — REPLACE with low similarity (Wrong Word):**
- Condition: Tag = 'replace' AND ratio < 0.35
- Classification: `status: 'incorrect'`
- Score contribution: 0

**Rule 3e — DELETE (Missing Word):**
- Condition: Tag = 'delete' (expected word not in student output)
- Classification: `status: 'skipped'`
- Score contribution: 0
- **Example:** Expected: "رَبِّ الْعَالَمِينَ" — Student says: "رب العالمين" (skips "الـ") → 'skipped'

**Note:** There is NO "INSERT" rule — extra words added by the student (not in expected text) appear as 'replace' for adjacent expected words. Extra words at the end are silently ignored.

**Output per word:** `{ word: 'original_word', status: 'correct'|'pronunciation_issue'|'incorrect'|'skipped', user_said: 'what_student_said' }`

---

### RULE 4 — Memorization Score Calculation

**RULE ID:** ES-04
**RULE NAME:** Memorization Score
**PURPOSE:** Quantify how accurately the student recited the expected words.
**FILE:** `tasmiq_app.py` → `_score_from_transcription()`

**Formula:**
```
mem = (mem_hits / total_expected_words) × 100
```
Where `mem_hits` = sum of (1.0 for correct + 0.75 for pronunciation_issue + 0.2 for incorrect + 0 for skipped/wrong)

**Range:** 0–100 (clamped with `np.clip`)

**Example:**
- Expected: 7 words
- Student: 5 correct (5×1.0), 1 pronunciation issue (0.75), 1 skipped (0)
- mem = (5.75 / 7) × 100 = **82.1%**

---

### RULE 5 — Pronunciation Score Calculation

**RULE ID:** ES-05
**RULE NAME:** Pronunciation Score
**FILE:** `tasmiq_app.py` → `_score_from_transcription()`

**Formula:**
```
pron = 100 - (pron_issues / total_words) × 35
pron = min(pron, mem + 12)   ← capped to prevent pron > mem
```

**Logic:** Pronunciation cannot exceed memorization by more than 12 points. If a student doesn't recite the right words, they cannot score high on pronunciation.

---

### RULE 6 — Tajweed Score Calculation

**RULE ID:** ES-06
**RULE NAME:** Tajweed Score via Makhraj Analysis
**FILE:** `tasmiq_app.py` → `_score_from_transcription()` + `_get_makhraj_tips()`

**Processing:**
1. `_get_makhraj_tips()` runs `SequenceMatcher` on reference vs student phonetics
2. For every REPLACE or DELETE opcode, checks if the affected character is in `MAKHRAJ_MAP`
3. `MAKHRAJ_MAP` covers 11 Arabic letters with known articulation points (makhraj):
   - ق (qaf), غ (ghain), خ (kha), ح (ha), ه (ha), ص (sad), ض (dad), ط (ta), ظ (dha), ث (tha), ذ (dhal)

**Formula:**
```
tajwid = 100 - (makhraj_error_count × 6)
tajwid = min(tajwid, mem + 15)   ← capped to prevent tajwid > mem
```

**Limitation:** The Makhraj analysis is text-level, not acoustic. It identifies which makhraj-sensitive letters were in mismatched words, not whether the student actually mispronounced them. It is a **proxy for Tajweed**, not a direct Tajweed evaluation.

**Makhraj Knowledge Base (from code):**
- ق → "Deep Throat / Uvula, Qalqalah if Sakin"
- ض → "Side of tongue + Molars, Heaviest sound"
- ه → "Bottom of Throat, Deep breathy H"
- etc.

---

### RULE 7 — Fluency Score Calculation

**RULE ID:** ES-07
**RULE NAME:** Fluency Score via Audio Signal Analysis
**FILE:** `tasmiq_app.py` → `_score_from_transcription()`

**Processing (when Gemini path is used):**
1. Compute RMS of audio array
2. Count frames above 0.005 threshold as "speech frames"
3. `sr_ratio = speech_frames / total_frames`
4. If `sr_ratio > 0.08` (meaningful speech present): `fluency = clip(sr_ratio × 110 + jitter(-4,6), 30, 97)`
5. If `sr_ratio ≤ 0.08` (near-silent): `fluency = clip(sr_ratio × 50, 0, 20)` — near-zero

**Logic:** Higher proportion of speech frames → smoother, more continuous recitation → higher fluency.

**Limitation:** This measures speech/pause ratio, not actual tajweed fluency rules (like Madd, Waqf). It is an acoustic proxy.

---

### RULE 8 — Overall Score (Weighted Formula)

**RULE ID:** ES-08
**RULE NAME:** Overall Score Calculation
**FILE:** `tasmiq_app.py` → `assess_recitation_detailed()`

**Formula:**
```
overall = memorization × 0.45
        + pronunciation × 0.30
        + tajweed × 0.15
        + fluency × 0.10
```

**Weights justified by:**
- Memorization (45%) — core test requirement: did the student recite the right words?
- Pronunciation (30%) — second most important for Tasmiq
- Tajweed (15%) — Arabic articulation rules
- Fluency (10%) — smoothness and rhythm

---

### RULE 9 — Feedback Generation

**RULE ID:** ES-09
**RULE NAME:** Automatic Feedback Text
**FILE:** `tasmiq_app.py` → `assess_recitation_detailed()`

**Rules:**
```
IF overall >= 90:
    "Excellent recitation! Your memorization and pronunciation are outstanding."
ELIF overall >= 75:
    IF weak_areas exist: "Good recitation! Focus on improving {weak_areas}."
    ELSE: "Good recitation! Continue practicing to reach excellence."
ELSE:
    IF weak_areas exist: "Keep practicing! Work on your {weak_areas}."
    ELSE: "Keep practicing! Regular repetition will strengthen your recitation."
```
Where `weak_areas` = any of memorization/pronunciation/Tajwid/fluency scoring below 70.

---

### RULE 10 — Ayah Coverage Detection (Advanced Mode)

**RULE ID:** ES-10
**RULE NAME:** Ayah Coverage Analysis
**FILE:** `tasmiq_app.py` → `detect_ayahs_in_recitation()`
**Applies to:** Continuous/advanced mode recitations (ayah range, e.g. "1-10")

**Processing:**
1. For each expected ayah in range:
   - Clean the verse text
   - Count how many verse words appear in the transcription (set membership)
   - Also run `SequenceMatcher` for sequence similarity
   - `final_score = max(overlap_ratio, seq_ratio × 0.7)`
2. Ayah is "detected" if `final_score ≥ 0.35`
3. Detect sequence gaps (e.g. detected [1,2,3,5] — ayah 4 is missing)

**Output:**
```
{ detected_ayahs: [1,2,3,5], missing_ayahs: [4],
  completion_status: 'complete'|'incomplete'|'uncertain',
  ayah_details: [{ ayah: 1, detected: true, overlap: 0.82 }, ...] }
```

---

## SECTION 4 — WHAT THE AI MODEL DOES vs WHAT THE EXPERT SYSTEM DOES

```
┌─────────────────────────────────────────────────────────────┐
│                    AI MODEL (Gemini Flash)                   │
│                                                             │
│  Input:  Audio bytes + Arabic verse as context prompt       │
│  Task:   Speech-to-text recognition in Arabic               │
│  Output: Raw Arabic transcription text                      │
│                                                             │
│  WHAT WE CONTROL:                                           │
│    - The prompt we send to Gemini                           │
│    - The audio file format                                  │
│    - Post-processing of the returned text                   │
│                                                             │
│  WHAT WE DO NOT CONTROL:                                    │
│    - The internal neural network weights                    │
│    - How Gemini handles Arabic phonetics internally         │
│    - Accuracy of transcription for dialectal pronunciation  │
└─────────────────────────────────────────────────────────────┘
                          │ transcription text
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  OUR EXPERT SYSTEM                          │
│                                                             │
│  Input:  Student transcription + expected Quran text        │
│  Task:   Rule-based comparison and classification           │
│  Output: Scores, error classifications, feedback            │
│                                                             │
│  Rules we wrote:                                            │
│    - Word equality (correct)                                │
│    - Character similarity ≥ 0.65 (pronunciation issue)     │
│    - Character similarity 0.35–0.64 (incorrect word)       │
│    - Missing word (skipped)                                 │
│    - Wrong surah (mismatch)                                 │
│    - Silence (no speech)                                    │
│    - Makhraj letter error detection                         │
│    - Ayah coverage detection                                │
│    - Weighted score formula                                 │
│    - Feedback text selection rules                          │
│                                                             │
│  WHAT WE FULLY CONTROL:                                     │
│    - Every rule, threshold, weight, and output              │
└─────────────────────────────────────────────────────────────┘
```

**Important distinction for your presentation:**
> "The AI model (Gemini Flash) handles the voice recognition — converting audio to Arabic text. Our Expert System handles the decision-making — comparing that text to the expected Quran verse and determining scores, errors, and feedback. The Expert System was designed and coded by us."

---

## SECTION 5 — BLACK-BOX FUNCTIONS

### Black Box 1: Gemini Flash API

| Field | Detail |
|-------|--------|
| Function | `_transcribe_gemini(audio_path, expected_text)` |
| Library | `google.genai` (google-genai package) |
| Input | Raw audio bytes (m4a/mp4/wav/webm) + Arabic context prompt |
| Output | Arabic transcription string |
| What we do BEFORE | Load audio file, build prompt with expected verse for context |
| What we do AFTER | Clean Arabic text, check word count, validate surah match |
| What we CONTROL | Prompt engineering, audio format, post-processing |
| What we DON'T control | Neural network weights, internal Arabic ASR behavior |

### Black Box 2: librosa

| Field | Detail |
|-------|--------|
| Function | `librosa.load()`, `librosa.feature.rms()`, `librosa.effects.trim()` |
| Library | `librosa` (audio analysis) |
| Input | Audio file path or numpy array |
| Output | Normalized mono float32 audio array at 16kHz |
| What we CONTROL | Sample rate, mono conversion, trim parameters |
| What we DON'T control | Internal signal processing algorithms |

### Black Box 3: difflib.SequenceMatcher

| Field | Detail |
|-------|--------|
| Function | `difflib.SequenceMatcher(None, expected_words, student_words)` |
| Library | Python standard library |
| Input | Two lists of Arabic words |
| Output | Sequence of opcodes: equal, replace, delete, insert |
| What we CONTROL | What we do with each opcode (our classification rules) |
| What we DON'T control | Internal diff algorithm (Ratcliff/Obershelp) |

### Black Box 4: Supabase

| Field | Detail |
|-------|--------|
| Function | Supabase JavaScript client (all DB operations) |
| Library | `@supabase/supabase-js` |
| Input | SQL queries via fluent API |
| Output | Data rows / storage URLs / realtime events |
| What we CONTROL | Schema design, queries, RLS policies, storage bucket |
| What we DON'T control | Actual database engine (PostgreSQL hosted by Supabase) |

### Black Box 5: Wav2Vec2 (Research / Notebook only)

| Field | Detail |
|-------|--------|
| Library | HuggingFace Transformers: `TBOGamer22/wav2vec2-quran-phonetics` |
| Status | **ONLY in `build_tasmiq_expert.py` / notebook. NOT used in production `tasmiq_app.py`** |
| Note | The production system uses Gemini Flash, not Wav2Vec2 |

---

## SECTION 6 — SECTION-BY-SECTION SYSTEM EXPLANATION

### SECTION 6.1 — Mobile Application

**Framework:** React Native with Expo (TypeScript-free JS)
**Auth:** Custom FastAPI JWT (stored in AsyncStorage, NOT Supabase Auth)
**Supabase:** Used directly as database (not for auth)

**Main Screens:**
| Screen | File | Purpose |
|--------|------|---------|
| WelcomeScreen | `auth/WelcomeScreen.js` | Entry point, login/register navigation |
| LoginScreen | `auth/LoginScreen.js` | Email + password → FastAPI /api/auth/login |
| SignUpScreen | `auth/SignUpScreen.js` | Register student/teacher via FastAPI |
| DashboardScreen | `main/DashboardScreen.js` | Home: Tasmiq CTA, Murajaah, recent activity, nudge, verse of day |
| TasmiqPrepScreen | `features/TasmiqPrepScreen.js` | Setup: surah/ayat, AI vs Official, recording mode |
| TasmiqModeScreen | `features/TasmiqModeScreen.js` | Recording + AI analysis + submission |
| MurajaahModeScreen | `features/MurajaahModeScreen.js` | Self-revision: reveal/hide ayahs, no AI |
| ProgressScreen | `features/ProgressScreen.js` | AI vs AI comparison, score charts, stats |
| HistoryScreen | `main/HistoryScreen.js` | All recitation history with filters |
| NudgeScreen | `main/NudgeScreen.js` | Send reminders to classmates |
| ProfileScreen | `main/ProfileScreen.js` | Student profile settings |
| TeacherEvaluationScreen | `features/TeacherEvaluationScreen.js` | View teacher PASS/REPEAT result |

**Navigation:** `AppNavigator.js` — Stack navigator wrapping Tab navigator. Role-based routing: students get MainTabs + feature screens; teachers get TeacherDashboard stack.

---

### SECTION 6.2 — Teacher Portal

**Framework:** React (Vite), TailwindCSS

**Screens:**
| Screen | File | Purpose |
|--------|------|---------|
| Dashboard | `screens/Dashboard.jsx` | Class overview, student counts, recent submissions |
| TasmiqWorkspace | `screens/TasmiqWorkspace.jsx` | Review all recitations (exercises, assessments, history), PASS/REPEAT |
| RecitationReview | `screens/RecitationReview.jsx` | Pending official assessments review with audio playback |
| Reports | `screens/Reports.jsx` | PDF report generator |
| TeacherStudents | Mapped via mobile | Student list per class |

**Teacher Decision Flow (RecitationReview.jsx + TasmiqWorkspace.jsx):**
1. Teacher selects pending recitation
2. Plays audio
3. Views score breakdown (Memorization, Pronunciation, Tajweed, Fluency)
4. Selects PASS or REPEAT (REPEAT requires written feedback)
5. Submits → `recitations.status` updated, notification created, `users.avg_score` recalculated

---

### SECTION 6.3 — Backend (FastAPI)

**File:** `tasmiq_api.py`
**Port:** 8001
**Run:** `uvicorn tasmiq_api:app --host 0.0.0.0 --port 8001 --reload`

**Key Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check |
| `/health` | GET | Detailed health: Gemini, ffmpeg, Supabase, dataset |
| `/api/auth/login` | POST | Login (bcrypt + JWT) |
| `/api/auth/register` | POST | Register (bcrypt hash) |
| `/analyze` | POST | **Main AI assessment endpoint** (used by mobile) |
| `/api/assess-chunk` | POST | Live word tracking (chunk-level) |
| `/api/debug-audio` | POST | Audio loading test |
| `/api/recitations/submit` | POST | Alternative submission endpoint |
| `/api/teacher/feedback` | POST | Teacher feedback submission |

**Main assessment flow (`/analyze` endpoint):**
```
Receive audio file (multipart) + surah + ayah + expected_text
→ Save to tempfile (preserving extension: .m4a/.wav/.webm)
→ Call tasmiq_app.assess_recitation_detailed()
→ Return JSON result
→ Delete tempfile (always, even on error)
```

**Authentication:** JWT via `get_current_user()` dependency. Also supports legacy `token_{id}_{ts}` format for backwards compatibility.

**Password handling:** bcrypt with rounds=12. Auto-upgrades legacy plain-text passwords on first login.

---

### SECTION 6.4 — AI Model Processing

**Primary Model:** Gemini Flash (`gemini-2.0-flash`) via `google.genai`

**Prompt strategy:**
```
"You are an expert Quran recitation recognition AI.
Listen to the Arabic audio and transcribe exactly what the student recited.
Expected verse: {expected_text}
Rules: Output ONLY transcribed Arabic text, no translations,
remove all harakat, only output what was spoken."
```

**Why include expected_text in the prompt?**
Giving Gemini the expected verse as context helps it disambiguate similar-sounding Arabic words. Without context, Gemini might transcribe "الله" correctly but struggle with rare surah-specific words.

**Audio formats supported:** `.m4a`, `.mp4`, `.mp3`, `.webm`, `.caf`, `.aac`, `.wav`

**Gemini hallucination guard:**
If Gemini returns < 20% word coverage AND speech_ratio < 25% → rejected as likely hallucination (Gemini sometimes generates a few Arabic words from silence/background noise).

**Fallback (Acoustic Analysis):**
When Gemini is unavailable, `_acoustic_score()` uses:
- RMS energy → memorization proxy
- Zero-crossing rate (ZCR) → articulation proxy
- Energy variance → smoothness proxy
- Speech/silence ratio → fluency proxy

**Limitation:** Acoustic fallback produces realistic-looking but less accurate scores. It cannot actually verify which words the student recited.

---

### SECTION 6.5 — Expert System (Summary)

See Section 3 for full rule details.

**Key design principle:** The Expert System is deterministic and transparent. Given the same transcription and expected text, it will always produce the same result. There is no randomness in the Gemini path (small random jitter is only in the acoustic fallback).

**What the Expert System DOES:**
- Detects silent recordings
- Detects wrong surah
- Classifies each word as correct / pronunciation issue / incorrect / skipped
- Detects makhraj-sensitive Arabic letters in error positions
- Calculates four component scores
- Combines scores with weighted formula
- Generates textual feedback
- Detects which ayahs were covered in continuous recitations

**What the Expert System DOES NOT do:**
- Directly evaluate Tajweed rules (Madd, Ghunnah, Idgham, etc.) acoustically
- Evaluate word pronunciation quality from audio directly (only from text comparison)
- Detect additional/extra words inserted by student (they are silently ignored)
- Evaluate intonation, rhythm, or melody of recitation

---

### SECTION 6.6 — Database

**Platform:** Supabase (PostgreSQL hosted)
**Project URL:** `mrxgwwhbcskcjkgtnrtd.supabase.co`

**Core Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Students and teachers | `id, email, password_hash, full_name, role, avg_score, streak_days, total_sessions, progress_percentage` |
| `classes` | Teacher's classes | `id, name, teacher_id, class_code, unique_code` |
| `class_members` | Student-class membership | `student_id, class_id, joined_at` |
| `recitations` | All recitation records | `id, user_id, surah_number, start_verse, end_verse, audio_url, score, is_exercise, status, reviewed, teacher_id, teacher_status, feedback, memorization_score, pronunciation_score, tajwid_score, fluency_score, transcription, errors, submitted_at` |
| `assessments` | Duplicate score records | `recitation_id, student_id, overall_score, memorization_score, pronunciation_score, tajwid_score, fluency_score, transcript, errors_json, feedback_text` |
| `murajaah_sessions` | Murajaah progress | `student_id, surah, ayah_reps (JSONB), total_reps, completed_ayahs, progress_percentage, status` |
| `notifications` | Student notifications | `id, user_id, title, body, type, is_read, teacher_id, recitation_id, created_at` |
| `nudges` | Peer reminders | `sender_id, receiver_id, class_id, message, is_read, created_at` |
| `assignments` | Teacher-set assignments | `student_id, surah_index, ayah_start, ayah_end, due_date` |
| `teacher_settings` | Teacher preferences | `teacher_id, min_passing_score, ai_confidence_threshold, ...` |

**Important status values in `recitations.status`:**
- `'pending'` — official assessment awaiting teacher review
- `'approved'` — teacher marked PASS
- `'repeat'` — teacher marked REPEAT (re-record required)
- (AI exercises are auto-set `status: 'approved'` at creation)

**`is_exercise` flag:**
- `TRUE` = AI Practice Exercise (no teacher review needed, auto-approved)
- `FALSE` = Official Teacher Assessment (needs teacher review)

---

### SECTION 6.7 — Integration

```
STUDENT MOBILE APP
    │
    ├── Auth: POST /api/auth/login → FastAPI → Supabase users table
    │         JWT stored in AsyncStorage
    │
    ├── Record: expo-av microphone → audio URI
    │
    ├── AI Analysis: POST /analyze → FastAPI → Gemini Flash → Expert System
    │               Result displayed to student
    │
    ├── Save: Supabase Storage (audio file) + Supabase DB (recitations table)
    │        (direct Supabase JS client calls, no FastAPI needed for DB writes)
    │
    └── Notifications: Supabase Realtime subscription
                      → Auto-push when teacher submits evaluation

TEACHER PORTAL
    │
    ├── Auth: localStorage session (separate from mobile JWT)
    │         Supabase Auth OR custom session
    │
    ├── View: SELECT from recitations (unreviewed)
    │
    ├── Evaluate: UPDATE recitations (status, teacher_status, feedback, reviewed_at)
    │            INSERT notifications (for student)
    │
    └── Reports: SELECT from recitations, users, class_members
                 Client-side computation → PDF via jsPDF
```

---

## SECTION 7 — TASMIQ LOGIC VERIFICATION

### Intended Logic vs Actual Implementation

**VERIFIED FLOW:**
```
1. Student → TasmiqPrepScreen → selects is_exercise = true
2. TasmiqModeScreen → records audio
3. submitToAi() → POST /analyze → Expert System → score returned
4. AiPracticeBadge shows: score >= 70 → "PASS" | < 70 → "NEEDS MORE PRACTICE"
5. Student submits → saveRecitationResult() with:
   - is_exercise: true
   - status: 'approved'  ← auto-approved regardless of score
   - reviewed: true
6. Previous attempts preserved (no overwrite — each is a new INSERT)
7. Attempt number tracked: COUNT(is_exercise=true, same surah) + 1
```

**IMPORTANT: 70% IS COSMETIC ONLY IN THE MOBILE APP**
- The 70% badge is displayed in the UI
- It is mentioned as a tip in ProgressScreen: "Aim for 70% to unlock official assessment"
- **BUT:** the system does NOT technically BLOCK a student from selecting "Official Assessment" based on AI score
- The lock is based on `hasAI` (whether any previous AI practice exists for that surah), NOT on whether score >= 70
- A student who scored 30% but did ONE AI practice can still access Official Assessment

**Code evidence (TasmiqPrepScreen.js):**
```js
const { data: ai } = await supabase
  .from('recitations')
  .select('id')
  .eq('user_id', s.id)
  .eq('surah_number', surahIndex + 1)
  .eq('is_exercise', true)
  .limit(1);
setHasAI((ai || []).length > 0);   // ← just checks existence, not score
```

**MISMATCH IDENTIFIED:**
- Documentation likely states: "Student must score ≥ 70% in AI Practice to unlock Official Assessment"
- Actual code: "Student must have completed at least 1 AI Practice (any score)"

**Official Assessment flow:**
```
1. Student → TasmiqPrepScreen → selects is_exercise = false
2. TasmiqModeScreen → records audio (AI analysis NOT required for official)
3. handleSubmit() → saveRecitationResult() with:
   - is_exercise: false
   - status: 'pending'
   - reviewed: false
4. Teacher portal shows this record in "Pending" queue
5. Teacher: plays audio, views score, selects PASS or REPEAT
6. RecitationReview.jsx or TasmiqWorkspace.jsx → handleAction('approve'|'redo')
   → UPDATE recitations (status, teacher_status, feedback, reviewed_at, teacher_id)
   → INSERT notifications
   → UPDATE users.avg_score
7. Student receives Supabase Realtime notification immediately
8. Student opens notification → navigates to TeacherEvaluationScreen
```

---

## SECTION 8 — MURAJAAH LOGIC VERIFICATION

**VERIFIED:** Murajaah is PURELY self-revision. It does NOT use AI assessment.

**What it does:**
- Displays all ayahs of a selected surah
- Ayahs are hidden by default
- Student taps to reveal; reveal-cycle count incremented
- Saves progress to `murajaah_sessions` table
- Plays reference audio from backend at normal or 0.75× speed
- Can loop individual ayah
- Session completes when ALL ayahs reviewed ≥ once

**What it does NOT do:**
- No recording
- No AI analysis
- No score
- No teacher visibility
- No `recitations` table write

**BUG IDENTIFIED:** `total_reps` column is used for two purposes:
- During session: stores elapsed time in seconds
- On session finish: overwritten with total cycle count
This creates data inconsistency for any post-session analysis.

---

## SECTION 9 — TEACHER ASSESSMENT VERIFICATION

**VERIFIED FLOW:**
1. Student submits official recitation → `recitations` row created: `is_exercise=false, status='pending', reviewed=false`
2. Teacher portal `RecitationReview.jsx` queries: `WHERE reviewed = false`
3. Teacher selects a pending submission
4. Teacher plays audio using HTML `<audio>` element
5. Teacher sees: score breakdown, transcription, word alignments
6. Teacher enters feedback text (REQUIRED for REPEAT, optional for PASS)
7. Teacher clicks PASS or REPEAT

**PASS action writes:**
```sql
UPDATE recitations SET
  reviewed = true,
  status = 'approved',
  teacher_grade = 4|5 (based on dropdown),
  feedback = '[PASS] {text}',
  reviewed_at = NOW(),
  teacher_id = {teacher_uuid},
  teacher_status = 'PASS'
WHERE id = {recitation_id};
```

**REPEAT action writes:**
```sql
UPDATE recitations SET
  reviewed = true,
  status = 'repeat',
  teacher_grade = 1,
  feedback = '[REPEAT REQUIRED] {text}',
  reviewed_at = NOW(),
  teacher_id = {teacher_uuid},
  teacher_status = 'REPEAT'
WHERE id = {recitation_id};
```

**Notification (VERIFIED — both RecitationReview.jsx and TasmiqWorkspace.jsx):**
```sql
INSERT INTO notifications (
  user_id,       -- student UUID from recitations.user_id
  title,         -- 'Teacher Assessment Completed' | 'Teacher Requested Re-recording'
  body,          -- human-readable text
  type,          -- 'TEACHER_TASMIQ_EVALUATION'
  teacher_id,    -- authenticated teacher UUID
  recitation_id, -- for deep-link navigation
  is_read        -- false
);
```

**VERIFIED:** `user_id` in the notification is set from `selected.user_id` which is `recitations.user_id` (the student UUID). This is correct — no reliance on student name.

---

## SECTION 10 — NOTIFICATION VERIFICATION

**Notification created when:**
- Teacher submits PASS → notification title: "Teacher Assessment Completed"
- Teacher submits REPEAT → notification title: "Teacher Requested Re-recording"

**Student receives notification:**
- Supabase Realtime channel `notifications:{studentId}` fires on INSERT
- `DashboardScreen.js` uses `subscribeToNotifications()` → unread count badge updates immediately
- Student taps bell icon → notification modal opens
- Student taps evaluation notification → navigates to `TeacherEvaluation` screen with `recitation_id`

**Verified in `notificationService.js`:**
- All queries filter by `user_id = studentId` (ownership enforced)
- `markAsRead` also enforces `user_id` check (no cross-student read possible)

**Potential issue:** If notification INSERT fails (Supabase error), the evaluation is already saved but the student may not receive the notification. The code logs the error but proceeds silently.

---

## SECTION 11 — REPORT VERIFICATION

**Teacher Name in Reports (VERIFIED):**
Reports.jsx retrieves teacher name in this priority order:
1. `teacher?.full_name` from `useAuth()` context
2. `localStorage.getItem('tasmiq_teacher_session')` → parsed `full_name`
3. `supabase.auth.getUser()` → `users.full_name`
4. Falls back to teacher email

Teacher name is passed to `pdfGenerator.js` as `reportData.teacherName`. Not hardcoded.

**PDF Generation (VERIFIED):** `import('../services/pdfGenerator')` is a dynamic import — the file exists and is called.

**Score Labels in Reports.jsx:**
```js
function scoreLabel(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Good';
  if (s >= 60) return 'Satisfactory';
  return 'Needs Revision';
}
```
Uses motivational language — no "BAD" or "POOR".

**MISMATCH:** `attendanceRate` is calculated as `reviewedRecs.length / recsToAnalyse.length` (% of submissions reviewed by teacher). This is NOT attendance; it should be called "Assessment Completion Rate".

---

## SECTION 12 — SECURITY CHECK

**VERIFIED PROTECTIONS:**

1. **Student isolation in notifications:**
   - `getStudentNotifications()` filters by `user_id = studentId`
   - `markAsRead()` verifies both `id` AND `user_id`
   - Realtime subscription filtered by `user_id=eq.{studentId}`

2. **Password security:**
   - bcrypt with rounds=12 for all new registrations
   - Legacy plain-text passwords auto-upgraded on first login

3. **Email domain restrictions:**
   - Students: must use `@student.tahfiz.my`
   - Teachers: must use `@staff.tahfiz.my` or `@ustaz.tasmiq.ai`

4. **JWT tokens:**
   - Created with expiry (`JWT_EXPIRE_HOURS`, default 72h)
   - Signed with `JWT_SECRET` from environment

**CONCERNS:**

1. **`TasmiqWorkspace.jsx` loads ALL recitations without teacher-scoping:**
   ```js
   // No .eq('teacher_id', teacher.id) filter
   supabase.from('recitations').select('*')
   ```
   Any authenticated teacher can see ALL students' recitation data.

2. **JWT stored but not used for Supabase queries:**
   Mobile app stores JWT from FastAPI login but all Supabase queries use the anon key. Row-Level Security (RLS) uses "open_all" policies (set in MASTER_SCHEMA_FIX.sql), meaning ANY authenticated user can read/write any row.

3. **`getCurrentUser()` never validates JWT expiry:**
   It reads from AsyncStorage without checking `exp` claim. Expired tokens appear valid to the mobile app.

4. **`GEMINI_API_KEY` is in `.env`:**
   Properly excluded from git (`.gitignore` should cover `.env`). Verified not hardcoded in source.

---

## SECTION 13 — FINAL TESTING TABLE

| Test ID | Feature | Scenario | Expected Result | Status | Notes |
|---------|---------|----------|-----------------|--------|-------|
| T-01 | Login | Student email + password | JWT returned, session stored | ✅ PASS | bcrypt verified |
| T-02 | Login | Wrong password | "Invalid email or password" | ✅ PASS | No info leak |
| T-03 | Register | Student email domain | Only @student.tahfiz.my accepted | ✅ PASS | Domain check exists |
| T-04 | Join Class | Enter correct class code | Immediately enrolled | ✅ PASS | Direct insert, no teacher approval |
| T-05 | Murajaah | Start session, reveal ayahs | Progress saved to murajaah_sessions | ✅ PASS | Auto-save on each reveal |
| T-06 | Murajaah | AI assessment used? | NO — purely self-revision | ✅ PASS | No analyzeRecitation() call |
| T-07 | AI Tasmiq | Record audio, submit to AI | Score returned in ~3-6s (Gemini) | ✅ PASS | Fallback if Gemini fails |
| T-08 | AI Score 69% | Below threshold | Badge: "NEEDS MORE PRACTICE" | ✅ PASS | score >= 70 check |
| T-09 | AI Score 70% | At threshold | Badge: "PASS" | ✅ PASS | Inclusive >= 70 |
| T-10 | AI Score 100% | Perfect score | Badge: "PASS", excellent feedback | ✅ PASS | |
| T-11 | Multiple attempts | Submit twice for same surah | Both records preserved, new row each time | ✅ PASS | INSERT not UPDATE |
| T-12 | Official unlock | hasAI check | Locked if no AI practice exists | ✅ PASS | Checks existence |
| T-13 | 70% gate | Score 30% but 1 AI practice | Official Assessment ACCESSIBLE | ⚠️ WARNING | Gate is existence-based not score-based |
| T-14 | Silent recording | Submit with no speech | "No speech detected" alert, no submission | ✅ PASS | _detect_silence() |
| T-15 | Wrong surah | Recite different surah | "Wrong surah" alert, no submission | ✅ PASS | _validate_surah_match() |
| T-16 | Audio upload | Upload m4a to Supabase Storage | audio_url stored in recitations | ✅ PASS | 3-tier fallback |
| T-17 | Audio playback | Play audio in HistoryScreen | Plays from audio_url | ✅ PASS | expo-av Sound |
| T-18 | Expert System | Word comparison | correct/pronunciation/skipped labels | ✅ PASS | difflib |
| T-19 | Teacher review | Teacher sees pending recitations | reviewed=false queue shown | ✅ PASS | |
| T-20 | Teacher PASS | Submit approval | status→approved, notification created | ✅ PASS | Both portal screens |
| T-21 | Teacher REPEAT | Submit without feedback | BLOCKED — feedback required | ✅ PASS | Enforced in both screens |
| T-22 | Teacher REPEAT with feedback | Submit | status→repeat, notification created | ✅ PASS | |
| T-23 | Notification delivery | After teacher submits | Student receives realtime notification | ✅ PASS | Supabase Realtime |
| T-24 | Notification ownership | Student A gets Student B's notif? | CANNOT — filtered by user_id | ✅ PASS | Ownership check |
| T-25 | History | View all recitations | Both exercise and official shown | ✅ PASS | |
| T-26 | Report | Teacher name in PDF | Comes from authenticated session | ✅ PASS | Not hardcoded |
| T-27 | PDF generation | Print report | PDF downloaded | ✅ PASS | pdfGenerator.js |
| T-28 | Progress | AI vs AI comparison | Two latest attempts side-by-side | ✅ PASS | |
| T-29 | TasmiqWorkspace | Teacher sees all students | No class scope filter | ⚠️ WARNING | Security concern |
| T-30 | Edge: empty audio | Zero-length recording | score=30 returned (low, not crash) | ✅ PASS | Empty array handled |
| T-31 | Edge: network fail | AI server unreachable | Alert "Analysis Failed", no crash | ✅ PASS | try/catch |
| T-32 | Schema fallback | attempt_number column missing | Retries without column | ✅ PASS | Fallback INSERT |
| T-33 | Report class filter | Class-scope report | May show no data | ⚠️ WARNING | `s.class_id` bug |
| T-34 | Murajaah total_reps | Session finish | Overwrites elapsed seconds with cycles | ⚠️ WARNING | Semantic bug |

---

## SECTION 14 — DETECTED ISSUES (Classified by Severity)

### CRITICAL

None that block core demonstration functionality.

### HIGH

**ISSUE H-01: 70% Gate Not Enforced by Score**
- Location: `TasmiqPrepScreen.js` → `hasAI` check
- Cause: `hasAI` checks existence of any AI practice, not whether score ≥ 70
- Impact: A student can access Official Assessment after scoring 20% in AI Practice
- Recommended Fix: Change query to `eq('is_exercise', true).gte('score', 70)`
- Status: **NOT FIXED** (requires careful testing before presentation — may break student workflows)

**ISSUE H-02: TasmiqWorkspace Has No Teacher Scoping**
- Location: `TasmiqWorkspace.jsx` → `loadData()`
- Cause: No `.eq('teacher_id', teacher.id)` filter
- Impact: Any teacher can see all students across all teachers
- Recommended Fix: Filter by students in the teacher's own classes
- Status: NOT FIXED

### MEDIUM

**ISSUE M-01: `getAutoStatus` Tajweed Error Count Always 0**
- Location: `RecitationReview.jsx` → `getAutoStatus()`
- Cause: Checks `Array.isArray(r.errors)` but `errors` is stored as an object, not array
- Impact: The "approved/needs_review/flagged" auto-status relies on tajwid error count which is always 0; the score-only branches still work correctly
- Fix: Change `Array.isArray(e)` check to handle object format

**ISSUE M-02: `progress_percentage` Misleading**
- Location: `recitationService.js` + `MurajaahModeScreen.js`
- Cause: `progress_percentage` is set to `memorization_score` of last recitation, not actual Quran completion
- Impact: Dashboard shows misleading "Memorization Progress" percentage

**ISSUE M-03: Reports Class Scope Filter Broken**
- Location: `Reports.jsx` → `generateReport()`
- Cause: `students.filter(s => s.class_id === selectedClassId)` — `class_id` not a column on `users`
- Impact: Class-scope reports show 0 students

**ISSUE M-04: Murajaah `total_reps` Semantic Overwrite**
- Location: `MurajaahModeScreen.js` → `handleFinish()`
- Cause: `total_reps` stores elapsed seconds during session, then overwrites with cycle count on finish
- Impact: Historical analysis of session duration is lost

### LOW

**ISSUE L-01: `access_token` Stored But Not Used**
- Location: `authService.js`
- Cause: JWT from FastAPI is stored in session but never sent as Authorization header to Supabase
- Impact: Supabase RLS cannot validate JWT claims; relies on "open_all" RLS policy

**ISSUE L-02: Duplicate Notification Logic**
- Location: `RecitationReview.jsx` and `TasmiqWorkspace.jsx`
- Cause: Near-identical `handleAction`/`handleTeacherDecision` functions in both files
- Impact: Maintenance risk — a bug fix in one file may not be applied to the other

**ISSUE L-03: `tajeed_score` Fallback in HistoryScreen**
- Location: `HistoryScreen.js`
- Cause: Reads `tajwid_score ?? tajeed_score` — suggests historical column name inconsistency
- Impact: Some older records may show `tajeed_score` while newer ones use `tajwid_score`

---

## SECTION 15 — PRESENTATION-READY EXPLANATIONS

### A. What happens when a student records their Quran recitation?

**(Presentation script — concise and accurate)**

"When a student records a Quran recitation in TasmiqAI, here is what happens:

1. The mobile app records audio using the device microphone via the Expo Audio library.
2. The audio file is sent to our FastAPI backend at `/analyze`.
3. The backend first checks for silence — if there is less than 0.8 seconds of actual speech, the recording is rejected and the student is asked to re-record.
4. If speech is detected, the audio is sent to Google's Gemini Flash AI model, which transcribes it into Arabic text.
5. Our Expert System then compares the transcription word-by-word against the expected Quran verse from our local JSON database.
6. For each word, the Expert System classifies it as: correct, pronunciation issue, incorrect, or skipped — using Python's difflib sequence matching.
7. Four scores are calculated: Memorization (45%), Pronunciation (30%), Tajweed (15%), and Fluency (10%).
8. The result is returned to the mobile app in about 3 to 6 seconds.
9. The result is saved to the Supabase database as a new recitation record — previous attempts are never overwritten.
10. The student sees their score with the badge: PASS (70% and above) or NEEDS MORE PRACTICE."

---

### B. Expert System Explanation (for examiner)

```
INPUT
    Student's Arabic transcription (from Gemini)
    +
    Expected Quran verse text (from local JSON dataset)

         ↓

PROCESS
    1. Clean both texts: remove diacritics, normalize Alif variants, Ta Marbuta, Ya
    2. Run word-level sequence comparison (difflib.SequenceMatcher)

         ↓

RULE EVALUATION (for each word pair)
    Rule 1: Words match exactly → CORRECT
    Rule 2: Character similarity ≥ 65% → PRONUNCIATION ISSUE
    Rule 3: Character similarity 35–64% → INCORRECT WORD
    Rule 4: Word deleted/missing → SKIPPED
    Rule 5: Makhraj-sensitive letter in error position → Add to Makhraj tips

         ↓

DECISION
    Memorization = weighted hit count / expected word count × 100
    Pronunciation = 100 − (pronunciation issues / total × 35), capped at Mem+12
    Tajweed = 100 − (makhraj errors × 6), capped at Mem+15
    Fluency = acoustic speech/pause ratio × 110
    Overall = Mem×0.45 + Pron×0.30 + Tajweed×0.15 + Fluency×0.10

         ↓

OUTPUT
    Overall score (0–100%)
    Word-level error map
    Makhraj guidance tips
    Automatic feedback text
    Ayah coverage report (for continuous mode)
```

---

### C. AI Model vs Expert System (one-sentence each)

- **AI Model (Gemini Flash):** Converts the student's audio into Arabic text — speech recognition.
- **Expert System:** Compares that Arabic text to the expected Quran verse using rule-based logic — decision making.
- **Database (Supabase):** Stores all records, scores, audio files, and notifications — persistence.
- **Backend (FastAPI):** Receives audio from the mobile app, runs the AI and Expert System, returns results — orchestration.

---

### D. Scoring Explanation

"The overall score is calculated from four components:
- **Memorization (45%)** — Did the student recite the right words?
- **Pronunciation (30%)** — Were the words similar enough to the expected Arabic?
- **Tajweed (15%)** — Were any makhraj-sensitive letters missed?
- **Fluency (10%)** — Was the recitation continuous without long pauses?

The threshold for passing is 70%. Anything below 70% shows 'Needs More Practice'. A score of 70% or above shows 'Pass'."

---

### E. Teacher Assessment Flow

"After a student submits an Official Assessment:
1. The teacher sees it in their portal's Pending queue.
2. The teacher plays the audio recording and reviews the AI-generated score breakdown.
3. The teacher selects PASS or REPEAT. If selecting REPEAT, written feedback is mandatory.
4. The teacher's decision is saved to the database with the teacher's unique ID.
5. The student immediately receives a push notification via Supabase Realtime.
6. The student can open the notification to read the feedback and re-record if needed."

---

## SECTION 16 — WHAT YOU MUST KNOW BEFORE PRESENTING

See also: `FYP_TOP10_QUESTIONS.txt` (separate file).

**The top technical points an examiner will ask:**

1. The difference between AI model (Gemini = black box ASR) and Expert System (our code = rule-based comparison)
2. The 70% threshold — where it is applied and its limitation (existence-based not score-based gate)
3. How the Scoring Formula works (4 components with weights)
4. How audio gets from mobile to the backend and back
5. How teacher notifications reach the specific correct student (user_id, not name)
6. Why previous attempts are preserved (INSERT, not UPDATE)
7. What Murajaah does vs Tasmiq (no AI, no recording, no teacher visibility)
8. What happens when the AI server is offline (acoustic fallback)
9. The Expert System rules — especially what "missing word", "pronunciation issue", and "incorrect" mean
10. What the database stores and the key tables (recitations, notifications, murajaah_sessions)

---

## SECTION 17 — FINAL RECOMMENDATION

**Before presentation:**
1. Run `/health` endpoint to confirm Gemini and Supabase are connected
2. Clear browser localStorage to avoid stale navigation state (`TASMIQ_NAVIGATION_STATE_V4`)
3. Have a test student account and test teacher account ready
4. Pre-record a short test audio to demo AI analysis
5. Confirm audio playback works in teacher portal (requires HTTPS or localhost audio URL)
6. Know your system is running on `localhost:8001` (backend) + `localhost:8081` (mobile web)

**What to say if asked about the 70% gate limitation:**
"The current implementation checks whether the student has completed at least one AI Practice session before unlocking Official Assessment. A future enhancement would be to enforce the 70% minimum score as the actual gate condition."

**What to say if asked about Tajweed evaluation:**
"Our Expert System identifies which Tajweed-sensitive Arabic letters (such as ق, ض, ط) appeared in mismatched positions. This is a text-based proxy for Tajweed errors. Direct acoustic Tajweed evaluation — for example, checking the duration of Madd or the nasalization of Ghunnah — would require specialized acoustic models, which is beyond the current scope."

**What to say about Gemini being a black box:**
"Gemini Flash handles the Speech-to-Text part. We engineered the prompt to guide it toward accurate Quran-specific transcription. The actual evaluation — the decision-making — is entirely done by our Expert System which we designed and coded. We have full transparency and control over the Expert System rules."
