import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── ROLE LOGIC ──────────────────────────────────────────────────────────────
export const getRoleFromEmail = (email) => {
  if (email.toLowerCase().endsWith('@staff.tahfiz.my')) return 'staff';
  if (email.toLowerCase().endsWith('@student.tahfiz.my')) return 'student';
  return null;
};

// ── AUTH ──────────────────────────────────────────────────────────────────────

export const registerUser = async (email, password, displayName, selectedRole) => {
  // 1. Create the user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email.trim(),
    password: password,
    options: {
      data: {
        displayName: displayName,
      }
    }
  });

  if (authError) throw authError;
  const user = authData.user;
  if (!user) throw new Error("Registration failed, no user returned");

  // 2. Determine Role
  const autoRole = getRoleFromEmail(email);
  const finalRole = autoRole || selectedRole || 'student';

  // 3. Insert into public.users table
  const { error: dbError } = await supabase
    .from('users')
    .insert([
      {
        uid: user.id,
        displayName: displayName,
        email: email.toLowerCase(),
        role: finalRole,
        streakDays: finalRole === 'student' ? 0 : null,
        totalSessions: finalRole === 'student' ? 0 : null,
        avgScore: finalRole === 'student' ? 0 : null
      }
    ]);

  if (dbError) {
    console.error("Error creating user profile:", dbError);
    // Note: If this fails, the auth user still exists. In a production app, we'd handle this.
  }

  return user;
};

export const registerStudent = (e, p, n) => registerUser(e, p, n, 'student');
export const registerTeacher = (e, p, n) => registerUser(e, p, n, 'staff');

export const loginUser = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password,
  });

  if (error) throw error;
  const user = data.user;

  // SANITY CHECK: Auto-correct role based on email domain
  const autoRole = getRoleFromEmail(email);
  if (autoRole) {
    const { data: userDoc } = await supabase
      .from('users')
      .select('role')
      .eq('uid', user.id)
      .single();

    if (userDoc && userDoc.role !== autoRole) {
      console.log(`Auto-correcting role for ${email} to ${autoRole}`);
      await supabase
        .from('users')
        .update({ role: autoRole })
        .eq('uid', user.id);
    }
  }

  return user;
};

export const logoutUser = async () => {
  await supabase.auth.signOut();
  await AsyncStorage.removeItem('user_role');
  await AsyncStorage.removeItem('supabase.auth.token');
};

export const subscribeToAuthState = (callback) => {
  const { data: authListener } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(session?.user || null);
    }
  );
  
  // Return an unsubscribe function
  return () => {
    authListener.subscription.unsubscribe();
  };
};

// ── DATABASE ─────────────────────────────────────────────────────────────────

export const getUserProfile = async (uid) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('uid', uid)
    .single();
    
  if (error || !data) return null;
  return data;
};

export const getCurrentUser = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
};

// ── STREAK LOGIC ─────────────────────────────────────────────────────────────

export const updateUserStreak = async (uid) => {
  try {
    const profile = await getUserProfile(uid);
    if (!profile || profile.role !== 'student') return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let lastDate = null;
    if (profile.lastPracticeDate) {
      const ld = new Date(profile.lastPracticeDate);
      lastDate = new Date(ld.getFullYear(), ld.getMonth(), ld.getDate()).getTime();
    }

    const oneDay = 24 * 60 * 60 * 1000;
    let newStreak = profile.streakDays || 0;
    let newSessions = (profile.totalSessions || 0) + 1;

    if (!lastDate) {
      // First time practicing
      newStreak = 1;
    } else if (today === lastDate) {
      // Already practiced today, just increment sessions
      newStreak = profile.streakDays;
    } else if (today === lastDate + oneDay) {
      // Yesterday was the last practice, increment streak
      newStreak += 1;
    } else {
      // Missed a day or more, reset streak to 1
      newStreak = 1;
    }

    const { error } = await supabase
      .from('users')
      .update({
        streakDays: newStreak,
        totalSessions: newSessions
      })
      .eq('uid', uid);

    if (error) throw error;
    return { streak: newStreak, sessions: newSessions };
  } catch (err) {
    console.error("Failed to update streak:", err);
    return null;
  }
};

// ── PROFILE UPDATES ──────────────────────────────────────────────────────────

export const updateUserProfile = async (uid, updates) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('uid', uid)
    .select()
    .single();

  if (error) throw error;

  // If displayName is updated, update it in Auth metadata as well
  if (updates.displayName) {
    await supabase.auth.updateUser({
      data: { displayName: updates.displayName }
    });
  }

  return data;
};

export const changePassword = async (newPassword) => {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;
  return data;
};
