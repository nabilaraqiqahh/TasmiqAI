import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkUserRole(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        checkUserRole(session.user);
      } else {
        setTeacher(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const getRoleFromEmail = (email) => {
    const e = email.toLowerCase();
    if (e.endsWith('@staff.tahfiz.my') || e.endsWith('@ustaz.tasmiq.ai') || e.includes('admin')) return 'staff';
    if (e.endsWith('@student.tahfiz.my')) return 'student';
    return null;
  };

  const checkUserRole = async (user) => {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role, displayName')
        .eq('uid', user.id)
        .single();

      if (profile && (profile.role === 'teacher' || profile.role === 'staff' || profile.role === 'admin')) {
        setTeacher({ ...user, profile });
      } else {
        // If it's a student, we set teacher to null but keep the user session 
        // We handle the "Access Denied" message in the UI
        setTeacher(null);
      }
    } catch (err) {
      console.error("Role check error:", err);
      setTeacher(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  };

  const register = async (email, password, displayName, selectedRole) => {
    // 1. Sign up in Supabase Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { displayName } }
    });

    if (authError) throw authError;
    const user = data.user;
    if (!user) throw new Error("Registration failed");

    // 2. Auto-detect role
    const finalRole = getRoleFromEmail(email) || selectedRole || 'student';

    // 3. Create profile in 'users' table
    const { error: dbError } = await supabase
      .from('users')
      .insert([{
        uid: user.id,
        displayName,
        email: email.toLowerCase(),
        role: finalRole,
        avgScore: finalRole === 'student' ? 0 : null
      }]);

    if (dbError) console.error("Profile creation error:", dbError);
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setTeacher(null);
  };

  return (
    <AuthContext.Provider value={{ teacher, login, register, logout, loading, getRoleFromEmail }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
