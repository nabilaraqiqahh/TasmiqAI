## CHAPTER 6. TESTING

### 6.1 Introduction
Testing ensures the reliability of the audio processing pipeline and the accuracy of the phonetic assessments provided by the AI model.

### 6.2 Test Plan

#### 6.2.1 Test Organization
Testing was conducted primarily by the developer using a mix of automated scripts (`test_post.py`, `test_cpu.py`) and manual functional testing via the Gradio interface.

#### 6.2.2 Test Environment
Testing was carried out on a Windows environment utilizing an NVIDIA GPU for fast inference. Mobile endpoints were tested using Postman and the Expo Go client.

#### 6.2.3 Test Schedule
Testing occurred continuously alongside development, with a specific focus on API payload testing after the transition from Gradio to FastAPI.

### 6.3 Test Strategy
A bottom-up approach was utilized. First, unit tests verified the `process_audio` function could handle different formats. Then, the `get_phonetics` inference was tested. Finally, the FastAPI endpoint was tested as a black box.

#### 6.3.1 Classes of tests
* **Functionality Test:** Ensuring the correct reference audio is fetched based on Surah/Ayah inputs.
* **Accuracy Test:** Comparing the ASR output against known good recitations.
* **Integration Test:** Sending a `.wav` file via a `multipart/form-data` POST request (`test_post.py`) to ensure the FastAPI server processes it and returns JSON without crashing.

### 6.4 Test Design

#### 6.4.1 Test Description
A standard test case involves uploading `test_user.mp3` or `user_rec.wav` with a specific Surah and Ayah index. The expected result is a JSON response containing a numeric score, HTML feedback, and Makhraj tips.

#### 6.4.2 Test Data
Synthetic test files and actual user recordings (`test.wav`, `test_user.mp3`) were placed in the root directory to validate pipeline robustness against varying bitrates and noise levels.

### 6.5 Test Results and Analysis
The FastAPI backend successfully handled requests. The use of Whisper models proved highly accurate for clear audio, though performance degrades if the microphone is too far or ambient noise is high. The differential algorithm successfully highlighted errors and triggered appropriate Makhraj tips.

### 6.6 Conclusion
Testing validated the core functionality and API integration, proving the system is robust enough for deployment and frontend integration.
