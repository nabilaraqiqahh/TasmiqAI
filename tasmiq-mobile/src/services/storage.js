/**
 * PlatformStorage — works on both web and native (Expo Go / device)
 * Web: localStorage | Native: AsyncStorage
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PlatformStorage = {
  async getItem(key) {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.localStorage.getItem(key));
    }
    return AsyncStorage.getItem(key);
  },

  async setItem(key, value) {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(key, String(value));
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, String(value));
  },

  async removeItem(key) {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

export default PlatformStorage;
