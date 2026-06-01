## CHAPTER 4. DESIGN

### 4.1 Introduction
This chapter outlines the high-level architecture, user interface considerations, and the detailed algorithmic design of the TasmiqAI backend.

### 4.2 High-Level Design

#### 4.2.1 System Architecture
TasmiqAI utilizes a **Three-Tier Client-Server Architecture**:
1. **Presentation Tier:** Comprises the React Native Mobile App (Student) and React Web Portal (Teacher).
2. **Application Tier:** The FastAPI server that handles HTTP requests, CORS, audio file temp storage, and orchestrates the inference.
3. **Data/AI Tier:** The PyTorch/Transformers engine running Whisper models, alongside the local filesystem serving the Quran JSON dataset and reference MP3s.

#### 4.2.2 User Interface Design
* **Navigation Design:** 
  - *Mobile:* Dashboard -> Surah Selection -> Recitation Interface -> Results Modal.
  - *Web:* Teacher Login -> Class Overview -> Student Detail -> Audio Playback & Assessment History.
* **Input Design:** Use of native recording APIs to capture audio; dropdowns and numeric inputs for Surah/Ayah selection.

#### 4.2.3 Database Design
Currently, the system uses a flat-file database approach for Quranic content extracted from GitHub, utilizing a structured folder hierarchy (`source/audio/SURAH/AYAH.mp3` and `source/surah/surah_N.json`). Supabase is implemented as the primary database tool to store `UserProfiles`, `RecitationSessions`, `AssessmentScores`, and teacher feedback.

### 4.3 Detailed Design

#### 4.3.1 Software Design
The core assessment algorithm (`assess_recitation`) follows this logic flow:
1. **Input:** `surah_id`, `ayah_id`, `user_audio_file`.
2. **Audio Processing (`process_audio`):** Reads the file, resamples to 16kHz, trims leading/trailing silence (top_db=25), and normalizes the waveform array.
3. **Inference (`get_phonetics`):** Passes the array through the Hugging Face pipeline.
4. **Reference Retrieval:** Loads and processes the corresponding expert MP3.
5. **Comparison (`generate_diff_html`):** Uses `difflib.SequenceMatcher` to find matching blocks. Generates HTML spans with green for matches and red for errors.
6. **Makhraj Mapping (`get_makhraj_tips`):** Extracts missing characters from the diff, looks them up in the `MAKHRAJ_MAP` dictionary, and appends rule-based tips.

#### 4.3.2 Physical Database Design
* File system organization: The Quran JSON dataset is strictly organized into `audio`, `surah`, `tajweed`, and `translation` directories to allow dynamic, index-based querying in Python.

### 4.4 Conclusion
The modular architecture ensures that the heavy AI processing is decoupled from the frontend clients, allowing for scalable deployment and a responsive user experience.
