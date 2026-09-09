import axios from 'axios';
import { Platform } from 'react-native';

// -----------------------------------------------------------------------------
//  BACKEND URL CONFIGURATION
//
//  TUNNEL URL (active):  https://pizza-stuffed-collectibles-hotel.trycloudflare.com
//  This is a Cloudflare tunnel that exposes your local backend to any network.
//  Update this URL if you restart cloudflared and get a new tunnel URL.
//
//  To get a new tunnel URL, run on your laptop:
//    e:\TasmiqAI\cloudflared.exe tunnel --url http://localhost:8001
// -----------------------------------------------------------------------------
const TUNNEL_BACKEND = 'https://pizza-stuffed-collectibles-hotel.trycloudflare.com';
const LOCAL_BACKEND  = 'http://192.168.150.232:8001';

export const API_URL = (() => {
  if (Platform.OS === 'web') {
    // If running in browser locally on localhost / 127.0.0.1, always point to local backend
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:8001';
    }
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8001';
  }
  return TUNNEL_BACKEND;   // native APK — uses public Cloudflare tunnel (works on any network)
})();

const api = axios.create({
  baseURL: API_URL,
  timeout: 90000, // 90s — Gemini can take up to ~15s, audio upload adds more
});

// -----------------------------------------------------------------------------
//  analyzeRecitation — sends audio to backend AI for assessment
// -----------------------------------------------------------------------------
export const analyzeRecitation = async (audioUri, surah = 1, ayah = 1, expectedText = '') => {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    // Web: fetch the blob-URL directly
    const res = await fetch(audioUri);
    const blob = await res.blob();
    formData.append('audio', blob, 'recording.wav');
  } else {
    // Native Android/iOS: pre-read the file to base64 then convert to a Blob
    // before appending to FormData.
    // DO NOT hand a bare file:// URI object to FormData — the React Native
    // multipart bridge silently sends 0 bytes on many Android real devices,
    // causing the backend to receive an empty file.
    const filename = audioUri.split('/').pop() || 'recording.m4a';
    const ext      = filename.split('.').pop().toLowerCase();
    const mimeType = { m4a: 'audio/mp4', mp4: 'audio/mp4', caf: 'audio/x-caf',
                       aac: 'audio/aac', wav: 'audio/wav',  mp3: 'audio/mpeg' }[ext] || 'audio/mp4';

    let audioBlob = null;

    // Tier 1: expo-file-system base64 read (most reliable on Android real device)
    try {
      const FileSystem = require('expo-file-system');
      const b64 = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (b64 && b64.length > 0) {
        // Decode base64 → Uint8Array → Blob
        const byteChars  = atob(b64);
        const byteArrays = [];
        for (let i = 0; i < byteChars.length; i += 512) {
          const slice   = byteChars.slice(i, i + 512);
          const bytes   = new Uint8Array(slice.length);
          for (let j = 0; j < slice.length; j++) bytes[j] = slice.charCodeAt(j);
          byteArrays.push(bytes);
        }
        audioBlob = new Blob(byteArrays, { type: mimeType });
      }
    } catch (fsErr) {
      console.warn('[analyzeRecitation] expo-file-system tier failed:', fsErr?.message);
    }

    // Tier 2: XHR blob read (React Native standard)
    if (!audioBlob || audioBlob.size === 0) {
      try {
        audioBlob = await new Promise((resolve, reject) => {
          const xhr    = new XMLHttpRequest();
          xhr.onload   = () => resolve(xhr.response);
          xhr.onerror  = (e) => reject(new Error('XHR failed: ' + JSON.stringify(e)));
          xhr.responseType = 'blob';
          xhr.open('GET', audioUri, true);
          xhr.send(null);
        });
        console.log('[analyzeRecitation] XHR tier succeeded, size:', audioBlob?.size);
      } catch (xhrErr) {
        console.warn('[analyzeRecitation] XHR tier failed:', xhrErr?.message);
      }
    }

    // Tier 3: direct fetch (last resort, works on some setups)
    if (!audioBlob || audioBlob.size === 0) {
      try {
        const resp = await fetch(audioUri);
        if (resp.ok) {
          audioBlob = await resp.blob();
          console.log('[analyzeRecitation] fetch tier succeeded, size:', audioBlob?.size);
        }
      } catch (fetchErr) {
        console.warn('[analyzeRecitation] fetch tier failed:', fetchErr?.message);
      }
    }

    if (audioBlob && audioBlob.size > 0) {
      formData.append('audio', audioBlob, filename);
    } else {
      // Absolute fallback — bare URI object. May fail on some devices but
      // better than throwing before we even try.
      console.error('[analyzeRecitation] All read tiers failed — sending raw URI object (may produce empty upload)');
      formData.append('audio', { uri: audioUri, name: filename, type: mimeType });
    }
  }

  formData.append('surah', String(surah));
  formData.append('ayah',  String(ayah));
  if (expectedText) formData.append('expected_ayah_text', expectedText);

  const response = await api.post('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};

// -----------------------------------------------------------------------------
//  assessChunk — live word tracking (web only, native falls back silently)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
//  checkBackendConnection — call on app start to warn user if backend is down
// -----------------------------------------------------------------------------
export const checkBackendConnection = async () => {
  // Try up to 2 times with a gap — the first attempt can fail if the backend
  // just started or the browser tab loads before the server is fully ready.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await axios.get(`${API_URL}/health`, { timeout: 8000 });
      if (res.status === 200) return true;
    } catch {
      if (attempt < 2) {
        // Brief pause before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  return false;
};

export const submitRecitation = async () => ({ status: 'success' });

export default api;
