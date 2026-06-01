## CHAPTER 3. ANALYSIS

### 3.1 Introduction
This chapter delves into the specific requirements of the TasmiqAI system, analyzing the data, functional, and non-functional aspects necessary for successful implementation.

### 3.2 Problem Analysis
Currently, a student listens to an audio track, attempts to replicate it, and has no way to objectively measure their accuracy. The system must intake the user's audio, dynamically load the corresponding expert audio based on the Surah and Ayah selected, process both through the ASR pipeline, and return a quantifiable comparison. The challenge lies in ensuring the transcription is fast enough for real-time feedback and accurate enough to be trusted.

### 3.3 Requirement analysis

#### 3.3.1 Data Requirement
* **Input Data:** User's recorded audio (WAV/WebM formats), target Surah index, and target Ayah number.
* **Internal Storage/Reference Data:** A structured repository of Quranic data extracted from previous research on GitHub, including metadata (surah.json) and segmented expert audio files (e.g., `audio/001/001.mp3`).
* **Output Data:** A calculated percentage score, color-coded phonetic difference strings, and text-based Makhraj correction tips.

#### 3.3.2 Functional Requirement
* The system shall allow users to select specific Surahs and Ayahs.
* The system shall play reference audio for the selected Ayah.
* The system shall record user audio via the device microphone.
* The backend shall process the audio, trim silence, and normalize volume.
* The backend shall perform speech-to-text to generate phonetics.
* The system shall generate a comparative visual diff highlighting insertions, deletions, and replacements.

#### 3.3.3 Non-functional Requirement
* **Performance:** The API response time for audio assessment should ideally be under 5 seconds to maintain user engagement.
* **Accuracy:** The ASR transcription should be highly resilient to background noise.
* **Usability:** The UI must be intuitive, particularly the mobile app designed for students of varying ages.

#### 3.3.4 Others Requirement
* Requires FFmpeg binaries installed on the server environment to decode various web audio formats from mobile clients.

### 3.4 Conclusion
The analysis phase defines clear boundaries for data flow and system capabilities, ensuring that the development phase focuses on processing audio efficiently and delivering accurate phonetic comparisons.
