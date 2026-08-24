import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);
const SESSION_KEY = 'tasmiq_teacher_session';

// Backend API URL — reads from Vite env var, falls back to localhost for dev
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

async function callAuthApi(endpoint, body) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!response.ok) {
    let msg = `Server error ${response.status}`;
    try { const j = await response.json(); msg = j.detail || j.error || msg; } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export function AuthProvider({ children }) {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.uid || parsed?.id) setTeacher(parsed);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const getRoleFromEmail = (email) => {
    if (!email) return null;
    const e = email.toLowerCase();
    if (e.endsWith('@staff.tahfiz.my') || e.endsWith('@ustaz.tasmiq.ai') || e.includes('admin')) return 'teacher';
    if (e.endsWith('@student.tahfiz.my')) return 'student';
    return null;
  };

  const login = async (email, password) => {
    const trimmed = email.trim().toLowerCase();

    // Route through FastAPI backend — handles bcrypt verification + JWT issuance
    const data = await callAuthApi('/api/auth/login', { email: trimmed, password });
    if (!data.success) throw new Error(data.error || 'Login failed.');

    const role = (data.role || '').toLowerCase();
    if (role === 'student') throw new Error('Access denied. Students must use the mobile app.');

    const session = {
      uid:          data.user_id,
      id:           data.user_id,
      email:        data.email,
      full_name:    data.full_name || data.email,
      display_name: data.full_name || data.email,
      role:         data.role || 'teacher',
      access_token: data.access_token,  // real JWT
      avg_score:    null,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setTeacher(session);
    return session;
  };

  const register = async (email, password, displayName) => {
    const trimmed = email.trim().toLowerCase();
    let role = getRoleFromEmail(trimmed) || 'teacher';
    if (role === 'staff') role = 'teacher';

    // Route through FastAPI backend — password hashed server-side
    const data = await callAuthApi('/api/auth/register', {
      email:     trimmed,
      password,
      full_name: displayName,
      role,
    });

    if (!data.success) throw new Error(data.error || 'Registration failed.');
    return data;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setTeacher(null);
  };

  const updateTeacher = (updatedFields) => {
    setTeacher(prev => {
      if (!prev) return null;
      const next = { ...prev, ...updatedFields };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ teacher, login, register, logout, updateTeacher, loading, getRoleFromEmail }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export default AuthContext;

export const useAuth = () => useContext(AuthContext);
