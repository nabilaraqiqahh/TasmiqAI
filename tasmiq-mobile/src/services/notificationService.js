/**
 * notificationService.js
 * ─────────────────────────────────────────────────────────────────
 * Handles all in-app notification logic for TasmiqAI students.
 *
 * Key responsibilities:
 *  - Fetch notifications for the authenticated student only
 *  - Mark individual / all notifications as read
 *  - Subscribe to real-time NEW notifications via Supabase channel
 *  - Typed helpers for TEACHER_TASMIQ_EVALUATION payloads
 * ─────────────────────────────────────────────────────────────────
 */
import { supabase } from './supabaseClient';

// ── FETCH ─────────────────────────────────────────────────────────

/**
 * Fetch all notifications for a student.
 * Always filters by the authenticated student's UUID — never by name / email.
 *
 * @param {string} studentId  - The student's users.id (UUID)
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Promise<Array>}
 */
export const getStudentNotifications = async (studentId, { limit = 50 } = {}) => {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id,
      user_id,
      title,
      body,
      type,
      is_read,
      created_at,
      teacher_id,
      recitation_id,
      meta
    `)
    .eq('user_id', studentId)          // SECURITY: only this student's notifications
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[notificationService] getStudentNotifications error:', error.message);
    return [];
  }

  return data || [];
};

/**
 * Fetch unread count only (lightweight — no full rows).
 *
 * @param {string} studentId
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (studentId) => {
  if (!studentId) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', studentId)
    .eq('is_read', false);

  if (error) {
    console.error('[notificationService] getUnreadCount error:', error.message);
    return 0;
  }

  return count || 0;
};

// ── MARK READ ─────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Verifies the notification belongs to studentId before updating.
 *
 * @param {string} notificationId
 * @param {string} studentId
 */
export const markAsRead = async (notificationId, studentId) => {
  if (!notificationId || !studentId) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', studentId);   // ownership check

  if (error) {
    console.error('[notificationService] markAsRead error:', error.message);
  }
};

/**
 * Mark all unread notifications for a student as read.
 *
 * @param {string} studentId
 */
export const markAllAsRead = async (studentId) => {
  if (!studentId) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', studentId)
    .eq('is_read', false);

  if (error) {
    console.error('[notificationService] markAllAsRead error:', error.message);
  }
};

// ── REAL-TIME SUBSCRIPTION ────────────────────────────────────────

/**
 * Subscribe to new notifications for a student via Supabase Realtime.
 * The student receives the notification immediately when the teacher submits —
 * no logout/login needed.
 *
 * @param {string}   studentId  - The student's UUID
 * @param {Function} onNew      - Called with the new notification row
 * @returns {Function}           cleanup() — call on component unmount
 *
 * Usage:
 *   const cleanup = subscribeToNotifications(session.id, (notif) => {
 *     setNotifications(prev => [notif, ...prev]);
 *     setUnreadCount(prev => prev + 1);
 *   });
 *   return () => cleanup();
 */
export const subscribeToNotifications = (studentId, onNew) => {
  if (!studentId || typeof onNew !== 'function') return () => {};

  const channel = supabase
    .channel(`notifications:${studentId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${studentId}`,   // only this student's rows
      },
      (payload) => {
        if (payload?.new) {
          onNew(payload.new);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[notificationService] Realtime subscribed for student ${studentId}`);
      }
    });

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
};

// ── EVALUATION HELPERS ────────────────────────────────────────────

/**
 * Returns true if the notification is a teacher Tasmiq evaluation.
 */
export const isEvaluationNotification = (notif) =>
  notif?.type === 'TEACHER_TASMIQ_EVALUATION';

/**
 * Returns true if the evaluation result was PASS.
 * Checks the notification title as the canonical signal.
 */
export const isPassEvaluation = (notif) =>
  notif?.title === 'Teacher Assessment Completed';

/**
 * Get the recitation_id from an evaluation notification for deep-link navigation.
 *
 * @param {object} notif
 * @returns {string|null}
 */
export const getEvaluationRecitationId = (notif) =>
  notif?.recitation_id || null;
