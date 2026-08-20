/**
 * authService.js
 * ─────────────────────────────────────────────────────────────────
 * Uses public.users table directly (same as teacher portal).
 * DB schema: id(uuid PK), email, password_hash, full_name, role,
 *            progress_percentage, created_at, last_login
 *            + added: avg_score, streak_days, total_sessions,
 *                     last_practice_date, updated_at
 * ─────────────────────────────────────────────────────────────────
 */
import { supabase } from './supabaseClient';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'tasmiq_user_session';

// Platform-safe storage — uses localStorage on web, AsyncStorage on native
const storage = {
  async get(key) {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return AsyncStorage.getItem(key);
  },
  async set(key, value) {
    if (Platform.OS === 'web') { window.localStorage.setItem(key, value); return; }
    return AsyncStorage.setItem(key, value);
  },
  async remove(key) {
    if (Platform.OS === 'web') { window.localStorage.removeItem(key); return; }
    return AsyncStorage.removeItem(key);
  },
};

// ── HELPERS ──────────────────────────────────────────────────────
export const getRoleFromEmail = (email = '') => {
  const e = email.toLowerCase();
  if (e.endsWith('@staff.tahfiz.my') || e.endsWith('@ustaz.tasmiq.ai')) return 'teacher';
  if (e.endsWith('@student.tahfiz.my')) return 'student';
  return null;
};

function buildSession(row) {
  return {
    id:           row.id,
    uid:          row.id,          // alias
    email:        row.email,
    full_name:    row.full_name || row.email,
    displayName:  row.full_name || row.email,
    role:         (row.role || 'student').toLowerCase(),
    avg_score:    row.avg_score    ?? 0,
    streak_days:  row.streak_days  ?? 0,
    total_sessions: row.total_sessions ?? 0,
    progress_percentage: row.progress_percentage ?? 0,
  };
}

// ── REGISTER ─────────────────────────────────────────────────────
export const registerUser = async (email, password, displayName, selectedRole) => {
  const trimmed = email.trim().toLowerCase();
  let role    = getRoleFromEmail(trimmed) || selectedRole || 'student';
  if (role === 'staff') role = 'teacher';

  // Check duplicate
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', trimmed)
    .maybeSingle();

  if (existing) throw new Error('An account with this email already exists.');

  const { data, error } = await supabase
    .from('users')
    .insert([{
      email:               trimmed,
      full_name:           displayName || trimmed.split('@')[0],
      password_hash:       password,
      role,
      progress_percentage: 0,
      avg_score:           0,
      streak_days:         0,
      total_sessions:      0,
    }])
    .select()
    .single();

  if (error) {
    console.error('[Register] DB error:', error);
    throw new Error(error.message);
  }

  // Persist session
  const session = buildSession(data);
  await storage.set(SESSION_KEY, JSON.stringify(session));
  return data;
};

export const registerStudent = (e, p, n) => registerUser(e, p, n, 'student');
export const registerTeacher = (e, p, n) => registerUser(e, p, n, 'teacher');

// ── LOGIN ─────────────────────────────────────────────────────────
export const loginUser = async (email, password) => {
  const trimmed = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', trimmed)
    .maybeSingle();

  if (error) {
    console.error('[Login] DB error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
  if (!data) throw new Error('No account found with that email address.');

  const storedPwd = data.password_hash ?? data.password ?? null;
  if (storedPwd === null) throw new Error('Account has no password set. Contact admin.');
  if (storedPwd !== password) throw new Error('Incorrect password.');

  // Update last_login — fire and forget, non-fatal
  supabase
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {});

  const session = buildSession(data);
  await storage.set(SESSION_KEY, JSON.stringify(session));
  return session;     // return full session object (id, email, role, etc.)
};

// ── LOGOUT ───────────────────────────────────────────────────────
export const logoutUser = async () => {
  await storage.remove(SESSION_KEY);
  await storage.remove('user_role');
};

// ── GET CURRENT USER (from AsyncStorage) ─────────────────────────
export const getCurrentUser = async () => {
  try {
    const saved = await storage.get(SESSION_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
};

// ── GET USER PROFILE (from DB) ───────────────────────────────────
export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    displayName:    data.full_name || data.email,
    full_name:      data.full_name || data.email,
    streak_days:    data.streak_days    ?? 0,
    total_sessions: data.total_sessions ?? 0,
    avg_score:      data.avg_score      ?? 0,
    last_practice_date: data.last_practice_date ?? null,
  };
};

// ── UPDATE STREAK ─────────────────────────────────────────────────
export const updateUserStreak = async (userId) => {
  try {
    const profile = await getUserProfile(userId);
    if (!profile) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    let lastDateMs = null;
    if (profile.last_practice_date) {
      const ld = new Date(profile.last_practice_date);
      ld.setHours(0, 0, 0, 0);
      lastDateMs = ld.getTime();
    }

    const oneDay = 86400000;
    let newStreak   = profile.streak_days    || 0;
    let newSessions = (profile.total_sessions || 0) + 1;

    if (!lastDateMs)                      newStreak = 1;
    else if (todayMs === lastDateMs)      newStreak = profile.streak_days;
    else if (todayMs === lastDateMs + oneDay) newStreak += 1;
    else                                  newStreak = 1;

    await supabase.from('users').update({
      streak_days:        newStreak,
      total_sessions:     newSessions,
      last_practice_date: new Date().toISOString(),
    }).eq('id', userId);

    return { streak: newStreak, sessions: newSessions };
  } catch (err) {
    console.error('[updateUserStreak] error:', err);
    return null;
  }
};

// ── UPDATE PROFILE ────────────────────────────────────────────────
export const updateUserProfile = async (userId, updates) => {
  const normalized = { ...updates };
  if (normalized.displayName) {
    normalized.full_name = normalized.displayName;
    delete normalized.displayName;
  }

  const { data, error } = await supabase
    .from('users')
    .update(normalized)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update AsyncStorage session
  const saved = await storage.get(SESSION_KEY);
  if (saved) {
    const session = JSON.parse(saved);
    await storage.set(SESSION_KEY, JSON.stringify({
      ...session,
      full_name:   data.full_name || session.full_name,
      displayName: data.full_name || session.displayName,
    }));
  }

  return data;
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  // 1. Fetch current password hash from DB
  const { data: userRow, error: fetchErr } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', userId)
    .single();
  
  if (fetchErr || !userRow) {
    throw new Error('User account not found.');
  }
  
  if (userRow.password_hash !== currentPassword) {
    throw new Error('Current password is incorrect.');
  }
  
  // 2. Update to new password
  const { error: updateErr } = await supabase
    .from('users')
    .update({ password_hash: newPassword })
    .eq('id', userId);
    
  if (updateErr) {
    throw new Error(updateErr.message);
  }
};

// ── STUDENT SETTINGS (DB with AsyncStorage Fallback) ─────────────
export const getStudentSettings = async (studentId) => {
  const localKey = `tasmiq_student_settings_${studentId}`;
  
  // Load local fallbacks
  let localSettings = {
    notify_announcement: true,
    notify_feedback:     true,
    notify_nudge:        true,
    notify_tasmiq:       true,
    notify_murajaah:     true,
    language:            'en'
  };
  try {
    const savedLocal = await storage.get(localKey);
    if (savedLocal) localSettings = JSON.parse(savedLocal);
  } catch (e) {
    console.error('Error loading local settings:', e);
  }

  try {
    // Fetch from database
    const { data, error } = await supabase
      .from('student_settings')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        return { ...localSettings, source: 'local' };
      }
      throw error;
    }

    if (data) {
      await storage.set(localKey, JSON.stringify(data));
      return { ...data, source: 'db' };
    } else {
      try {
        const { data: inserted, error: insertErr } = await supabase
          .from('student_settings')
          .insert({
            student_id: studentId,
            notify_announcement: localSettings.notify_announcement,
            notify_feedback:     localSettings.notify_feedback,
            notify_nudge:        localSettings.notify_nudge,
            notify_tasmiq:       localSettings.notify_tasmiq,
            notify_murajaah:     localSettings.notify_murajaah,
            language:            localSettings.language
          })
          .select()
          .single();
        if (!insertErr && inserted) {
          await storage.set(localKey, JSON.stringify(inserted));
          return { ...inserted, source: 'db' };
        }
      } catch (e) {
        console.error('Failed to create student_settings row:', e);
      }
      return { ...localSettings, source: 'local' };
    }
  } catch (err) {
    console.error('Error fetching student settings from DB, using fallback:', err);
    return { ...localSettings, source: 'local' };
  }
};

export const updateStudentSettings = async (studentId, patch) => {
  const localKey = `tasmiq_student_settings_${studentId}`;
  
  let localSettings = {};
  try {
    const savedLocal = await storage.get(localKey);
    if (savedLocal) localSettings = JSON.parse(savedLocal);
  } catch (e) {}
  
  const merged = { ...localSettings, ...patch };
  await storage.set(localKey, JSON.stringify(merged));

  try {
    const dbPayload = {
      student_id: studentId,
      ...patch,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('student_settings')
      .upsert([dbPayload], { onConflict: 'student_id' });

    if (error) {
      console.warn('DB settings upsert failed (expected if table missing):', error.message);
    }
  } catch (err) {
    console.error('Error saving settings to database:', err);
  }
  
  return merged;
};

// ── SUBSCRIBE TO AUTH STATE ───────────────────────────────────────
// Kept for API compatibility — uses AsyncStorage polling
export const subscribeToAuthState = (callback) => {
  let active = true;
  getCurrentUser().then(user => { if (active) callback(user); });
  return () => { active = false; };
};

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────
export const getStudentAnnouncements = async (studentId) => {
  try {
    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id')
      .eq('student_id', studentId);

    if (!memberships?.length) return [];

    const classIds = memberships.map(m => m.class_id);

    // Fetch announcements without joins to avoid missing relationship cache error
    const { data: announcements, error: annError } = await supabase
      .from('announcements')
      .select('*')
      .in('class_id', classIds)
      .order('created_at', { ascending: false });

    if (annError) throw annError;
    if (!announcements || announcements.length === 0) return [];

    // Fetch classes corresponding to these classIds
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id, name, teacher_id')
      .in('id', classIds);

    if (classError) throw classError;

    // Fetch teachers corresponding to these classes from the users table
    const teacherIds = [...new Set(classes?.map(c => c.teacher_id).filter(Boolean) || [])];
    let teachers = [];
    if (teacherIds.length > 0) {
      const { data: teacherData, error: teacherError } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', teacherIds);
      if (!teacherError && teacherData) {
        teachers = teacherData;
      }
    }

    // Join them together in memory
    const joined = announcements.map(ann => {
      const cls = classes?.find(c => c.id === ann.class_id);
      const teacher = teachers?.find(t => t.id === cls?.teacher_id);
      return {
        ...ann,
        classes: cls ? {
          name: cls.name,
          teacher_id: cls.teacher_id,
          teacher_name: teacher?.full_name || 'Teacher'
        } : null
      };
    });

    return joined;
  } catch (err) {
    console.error('[getStudentAnnouncements] error:', err);
    return [];
  }
};

