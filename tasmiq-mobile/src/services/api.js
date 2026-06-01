import axios from 'axios';

import { Platform } from 'react-native';

// Dynamically route based on platform to handle IP address changes and Web testing
export const API_URL = Platform.OS === 'web' 
  ? 'http://localhost:8001' 
  : 'http://192.168.240.232:8001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 180000, // Increased timeout to 3 minutes for multiple ayahs
});



export const analyzeRecitation = async (audioUri, surah = 1, ayah = 1) => {
  try {
    const formData = new FormData();
    
    if (Platform.OS === 'web') {
      // Web requires fetching the blob first
      const response = await fetch(audioUri);
      const blob = await response.blob();
      formData.append('audio', blob, 'recording.wav');
    } else {
      // React Native requires this specific object structure
      const filename = audioUri.split('/').pop() || 'recording.wav';
      formData.append('audio', {
        uri: audioUri,
        name: filename,
        type: 'audio/wav',
      });
    }
    
    formData.append('surah', surah.toString());
    formData.append('ayah', ayah.toString());

    const response = await api.post('/analyze', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response;
  } catch (error) {
    console.error("API Error in analyzeRecitation:", error);
    throw error;
  }
};

export const submitRecitation = async (audioUri) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ data: { status: 'success', message: 'Submitted to teacher' } });
    }, 1500);
  });
};

export default api;
