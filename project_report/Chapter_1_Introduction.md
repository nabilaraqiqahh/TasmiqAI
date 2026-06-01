## CHAPTER 1. INTRODUCTION

### 1.1 Introduction
The preservation of the precise pronunciation of the Holy Quran is a fundamental practice in Islamic education. Tasmiq, the act of reciting the Quran from memory or text to a teacher, has traditionally required one-on-one sessions with expert Qaris (reciters). With the advancement of Artificial Intelligence, specifically in the domains of Automatic Speech Recognition (ASR) and expert systems, it is now possible to assist learners in their recitation practice. TasmiqAI is an AI-driven ecosystem designed to provide differential phonetic assessment and Makhraj (articulation point) analysis to assist students and teachers in the learning process.

### 1.2 Problem statement(s)
* **Subjectivity and Resource Constraints:** Traditional recitation assessment relies entirely on human experts, making it subjective and difficult to scale, especially in regions lacking qualified teachers.
* **Lack of Immediate Feedback:** Self-learners practicing at home often reinforce incorrect pronunciation because they do not have access to immediate, accurate phonetic correction.
* **Complex Makhraj Rules:** The subtle differences in Arabic articulation points (Makhraj) are difficult for non-native speakers to master without precise visual or differential guidance.

### 1.3 Objective
* To develop an intelligent backend system using transformer-based ASR models (e.g., Whisper, Wav2Vec2) to transcribe and analyze Arabic recitation phonetics.
* To create a sequence-matching algorithm that compares user recitation against expert reference audio to highlight phonetic differences.
* To design and implement user-friendly interfaces (Mobile App and Teacher Portal) that present the differential assessment and provide actionable Makhraj tips.

### 1.4 Scope
* **Target Users:** Quran students (both beginners and intermediate) and Quranic school educators.
* **Domain:** Arabic phonetic analysis, specifically focusing on Tajweed and Makhraj articulation accuracy.
* **Platform:** A FastAPI Python backend hosted on a server, a React Native (Expo) mobile application for students, and a React (Vite) web portal for teachers.
* **Limitations:** The system evaluates pronunciation and phonetics but does not dynamically assess melodic rules (Maqamat) or complex advanced Tajweed rules that require contextual grammatical understanding.

### 1.5 Project Significance
TasmiqAI significantly reduces the burden on human teachers by automating the preliminary phonetic assessment of students. It allows students to practice independently with immediate, actionable feedback, thereby accelerating their learning curve and improving their confidence before formal assessment.

### 1.6 Expected Output
The expected output is a fully functional software ecosystem encompassing:
1. A robust API capable of processing audio files and returning phonetic difference scores.
2. A cross-platform mobile app for students to select Surahs, listen to reference audio, record their recitation, and view visual feedback.
3. A web dashboard for teachers to monitor student progress and view automated assessments.

### 1.7 Conclusion
This chapter introduced the TasmiqAI project, outlining the core problems in traditional recitation learning and how an AI expert system can provide a scalable, immediate feedback solution. The objectives, scope, and significance set the foundation for the system's development.
