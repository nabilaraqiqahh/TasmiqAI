import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL      = 'https://mrxgwwhbcskcjkgtnrtd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeGd3d2hiY3NrY2prZ3RucnRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzUyMzUsImV4cCI6MjA5Mjk1MTIzNX0.qPF1qQ28L7kitH_zSt3hdjADrd-Xy7Ah6JSfL3aneVU';

// Storage: localStorage on web, AsyncStorage on native — no recursion
const storage = Platform.OS === 'web'
  ? {
      getItem:    (key) => Promise.resolve(localStorage.getItem(key)),
      setItem:    (key, val) => Promise.resolve(localStorage.setItem(key, val)),
      removeItem: (key) => Promise.resolve(localStorage.removeItem(key)),
    }
  : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
