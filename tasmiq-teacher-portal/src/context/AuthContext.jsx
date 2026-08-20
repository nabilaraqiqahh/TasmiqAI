import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);
const SESSION_KEY = 'tasmiq_teacher_session';

function buildSession(row) {
  return {
    uid:          row.uid,
    id:           row.uid,
    email:        row.email,
    full_name:    row.full_name || row.display_name || row.email,
    display_name: row.full_name || row.display_name || row.email,
    role:         row.role || 'staff',
    avg_score:    row.avg_score ?? null,
  };
}

export function AuthProvider({ children }) {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.uid) setTeacher(parsed);
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

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', trimmed)
      .maybeSingle();

    if (error) throw new Error(`DB Error: ${error.message} (code: ${error.code})`);
    if (!data)  throw new Error(`No account found for "${trimmed}". Check your email or register first.`);

    const storedPwd = data.password_hash ?? data.password ?? null;
    if (storedPwd === null) throw new Error('This account has no password set. Contact admin.');
    if (storedPwd !== password) throw new Error('Incorrect password.');

    const role = (data.role || '').toLowerCase();
    if (role === 'student') throw new Error('Access denied. Students must use the mobile app.');

    // PK is "id" in your actual DB
    const session = {
      uid:          data.id,       // alias for legacy code
      id:           data.id,
      email:        data.email,
      full_name:    data.full_name || data.email,
      display_name: data.full_name || data.email,
      role:         data.role || 'staff',
      avg_score:    data.avg_score ?? null,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setTeacher(session);
    return session;
  };

  const register = async (email, password, displayName) => {
    const trimmed = email.trim().toLowerCase();

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', trimmed)
      .maybeSingle();

    if (existing) throw new Error('An account with this email already exists.');

    let role = getRoleFromEmail(trimmed) || 'teacher';
    if (role === 'staff') role = 'teacher';

    const { data, error } = await supabase
      .from('users')
      .insert([{
        email:         trimmed,
        full_name:     displayName,
        password_hash: password,
        role,
        progress_percentage: 0,
      }])
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
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

export const useAuth = () => useContext(AuthContext);
