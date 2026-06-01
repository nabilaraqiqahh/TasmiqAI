import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://mrxgwwhbcskcjkgtnrtd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeGd3d2hiY3NrY2prZ3RucnRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzUyMzUsImV4cCI6MjA5Mjk1MTIzNX0.qPF1qQ28L7kitH_zSt3hdjADrd-Xy7Ah6JSfL3aneVU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
