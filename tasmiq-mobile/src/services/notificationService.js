/**
 * notificationService.js
 * -----------------------------------------------------------------
 * Handles all in-app notification logic for TasmiqAI students.
 *
 * Key responsibilities:
 *  - Create notifications (shared helper for all trigger sites)
 *  - Fetch notifications for the authenticated student only
 *  - Mark individual / all notifications as read
 *  - Delete individual notification or clear entire inbox
 *  - Subscribe to real-time NEW notifications via Supabase Realtime
 *  - Typed helpers for notification payloads
 *
 * Notification types (stored in notifications.type):
 *  TEACHER_TASMIQ_EVALUATION  — teacher marked PASS or REPEAT
 *  AI_PRACTICE_RESULT         — student completed AI practice session
 *  OFFICIAL_SUBMITTED         — student submitted official assessment
 *  MURAJAAH_COMPLETED         — student finished Murajaah session
 *  NUDGE_RECEIVED             — classmate sent a nudge reminder
 *  ANNOUNCEMENT               — teacher published a class announcement
 * -----------------------------------------------------------------
 */
import { supabase } from './supabaseClient';

// ── CREATE ─────────────────────────────────────────────────────────

/**
 * Insert a notification row.
 * All trigger sites (TasmiqModeScreen, MurajaahModeScreen,
 * NudgeScreen, RecitationReview, TasmiqWorkspace) should call this
 * instead of calling supabase.from('notifications').insert directly.
 *
 * Required fields: userId, title, body, type
 * Optional fields: teacherId, recitationId, meta
 *
 * Returns the inserted row, or null on error (non-fatal).
 */
export const createNotification = async ({
  userId,
  title,
  body,
  type = 'info',
  teacherId    = null,
  recitationId = null,
  meta         = {},
} = {}) => {
  if (!userId || !title) {
    console.warn('[notificationService] createNotification: missing userId or title');
    return null;
  }

  const payload = {
    user_id:       userId,
    title,
    body:          body || '',
    type,
    is_read:       false,
    created_at:    new Date().toISOString(),
    ...(teacherId    && { teacher_id:    teacherId }),
    ...(recitationId && { recitation_id: recitationId }),
    ...(Object.keys(meta).length > 0 && { meta }),
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[notificationService] createNotification error:', error.message);
    return null;
  }
  return data;
};

// ── FETCH ──────────────────────────────────────────────────────────

/**
 * Fetch all notifications for a student, newest first.
 * Always filters by the authenticated student's UUID — never by name.
 *
 * @param {string} studentId
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Promise<Array>}
 */
export const getStudentNotifications = async (studentId, { limit = 50 } = {}) => {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, user_id, title, body, type, is_read, created_at, teacher_id, recitation_id, meta'
    )
    .eq('user_id', studentId)
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

// ── MARK READ ──────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Verifies ownership (user_id) before updating.
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
 * Mark ALL unread notifications for a student as read.
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

// ── DELETE ─────────────────────────────────────────────────────────

/**
 * Delete a single notification.
 * Verifies ownership (user_id) so a student can only remove their own.
 *
 * @param {string} notificationId
 * @param {string} studentId
 * @returns {Promise<boolean>} true if deleted successfully
 */
export const deleteNotification = async (notificationId, studentId) => {
  if (!notificationId || !studentId) return false;

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', studentId);   // ownership check

  if (error) {
    console.error('[notificationService] deleteNotification error:', error.message);
    return false;
  }
  return true;
};

/**
 * Delete notifications for a student.
 *
 * @param {string}  studentId
 * @param {object}  [opts]
 * @param {boolean} [opts.readOnly=false]  If true, only deletes already-read rows.
 * @returns {Promise<boolean>}
 */
export const clearAllNotifications = async (studentId, { readOnly = false } = {}) => {
  if (!studentId) return false;

  let query = supabase
    .from('notifications')
    .delete()
    .eq('user_id', studentId);

  if (readOnly) query = query.eq('is_read', true);

  const { error } = await query;

  if (error) {
    console.error('[notificationService] clearAllNotifications error:', error.message);
    return false;
  }
  return true;
};

// ── REAL-TIME SUBSCRIPTION ─────────────────────────────────────────

/**
 * Subscribe to new notifications via Supabase Realtime.
 * Fires immediately when any row is INSERTed for this student —
 * works for ALL notification types (teacher eval, AI result,
 * Murajaah done, nudge, etc.) without polling.
 *
 * Prerequisites:
 *   The notifications table must be added to the supabase_realtime
 *   Postgres publication. Run ENABLE_NOTIFICATIONS_COMPLETE.sql once.
 *
 * @param {string}   studentId
 * @param {Function} onNew      Called with the new notification row
 * @returns {Function}          cleanup() — call on component unmount
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
        filter: `user_id=eq.${studentId}`,
      },
      (payload) => {
        if (payload?.new) onNew(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[notificationService] Realtime subscribed for ${studentId}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[notificationService] Realtime subscription error — notifications will still work on next app open.');
      }
    });

  return () => { supabase.removeChannel(channel); };
};

// ── TYPE HELPERS ───────────────────────────────────────────────────

/** Returns true if this is a teacher Tasmiq evaluation notification. */
export const isEvaluationNotification = (notif) =>
  notif?.type === 'TEACHER_TASMIQ_EVALUATION';

/** Returns true if the teacher marked PASS (vs REPEAT). */
export const isPassEvaluation = (notif) =>
  notif?.title === 'Teacher Assessment Completed';

/** Returns the recitation_id for deep-link navigation, or null. */
export const getEvaluationRecitationId = (notif) =>
  notif?.recitation_id || null;

/**
 * Human-readable label for a notification type.
 * Used for screen-reader accessibility and filter UIs.
 */
export const notificationTypeLabel = (type) => {
  const labels = {
    TEACHER_TASMIQ_EVALUATION: 'Teacher Evaluation',
    AI_PRACTICE_RESULT:        'AI Practice',
    OFFICIAL_SUBMITTED:        'Official Assessment',
    MURAJAAH_COMPLETED:        'Murajaah',
    NUDGE_RECEIVED:            'Nudge',
    ANNOUNCEMENT:              'Announcement',
    info:                      'Notification',
  };
  return labels[type] || 'Notification';
};
