import axios from 'axios';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
//  Production API URL — https://api.tasmiqai.com
//
//  For local development (Expo Go on same WiFi):
//    Comment out the production line below and uncomment the local block.
//
//  Local dev example:
//    const MY_PC_IP = '192.168.x.x';  // your PC's IPv4 from ipconfig
//    export const API_URL = Platform.OS === 'web'
//      ? 'http://localhost:8001'
//      : `http://${MY_PC_IP}:8001`;
// ─────────────────────────────────────────────────────────────────────────────
export const API_URL = 'https://api.tasmiqai.com';

const api = axios.create({
  baseURL: API_URL,
  timeout: 90000, // 90s — Gemini can take up to ~15s, audio upload adds more
});

// ─────────────────────────────────────────────────────────────────────────────
//  analyzeRecitation — sends audio to backend AI for assessment
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeRecitation = async (audioUri, surah = 1, ayah = 1, expectedText = '') => {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const res = await fetch(audioUri);
    const blob = await res.blob();
    formData.append('audio', blob, 'recording.wav');
  } else {
    const filename = audioUri.split('/').pop() || 'recording.m4a';
    const ext = filename.split('.').pop().toLowerCase();
    const mimeMap = {
      m4a: 'audio/mp4', mp4: 'audio/mp4', caf: 'audio/x-caf',
      aac: 'audio/aac', wav: 'audio/wav', mp3: 'audio/mpeg',
    };
    formData.append('audio', {
      uri:  audioUri,
      name: filename,
      type: mimeMap[ext] || 'audio/mp4',
    });
  }

  formData.append('surah', String(surah));
  formData.append('ayah',  String(ayah));
  if (expectedText) formData.append('expected_ayah_text', expectedText);

  const response = await api.post('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  assessChunk — live word tracking (web only, native falls back silently)
// ─────────────────────────────────────────────────────────────────────────────
export const assessChunk = async (audioBlobOrUri, expectedText) => {
  try {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blob = audioBlobOrUri instanceof Blob
        ? audioBlobOrUri
        : await fetch(audioBlobOrUri).then(r => r.blob());
      formData.append('file', blob, 'chunk.webm');
    } else {
      const filename = (audioBlobOrUri || '').split('/').pop() || 'chunk.wav';
      formData.append('file', { uri: audioBlobOrUri, name: filename, type: 'audio/wav' });
    }
    formData.append('expected_text', expectedText);
    const res = await api.post('/api/assess-chunk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  } catch {
    return { matched_word_count: 0 };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  checkBackendConnection — call on app start to warn user if backend is down
// ─────────────────────────────────────────────────────────────────────────────
export const checkBackendConnection = async () => {
  try {
    const res = await axios.get(`${API_URL}/health`, { timeout: 5000 });
    return res.status === 200;
  } catch {
    return false;
  }
};

export const submitRecitation = async () => ({ status: 'success' });

export default api;
