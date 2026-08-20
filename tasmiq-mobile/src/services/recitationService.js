import { supabase } from './supabaseClient';
import { updateUserStreak, getCurrentUser } from './authService';

// A robust base64 to Uint8Array decoder for React Native where atob is not defined
const decodeBase64 = (base64) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  
  const cleaned = base64.replace(/=/g, '').replace(/\s/g, '');
  const len = cleaned.length;
  const bufferLength = Math.floor(len * 0.75);
  const bytes = new Uint8Array(bufferLength);
  
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const code1 = cleaned.charCodeAt(i);
    const code2 = cleaned.charCodeAt(i + 1);
    const code3 = cleaned.charCodeAt(i + 2);
    const code4 = cleaned.charCodeAt(i + 3);

    const encoded1 = lookup[code1] || 0;
    const encoded2 = lookup[code2] || 0;
    const encoded3 = isNaN(code3) ? 0 : (lookup[code3] || 0);
    const encoded4 = isNaN(code4) ? 0 : (lookup[code4] || 0);
    
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bufferLength) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (p < bufferLength) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }
  
  return bytes;
};

// ── SAVE RECITATION RESULT ────────────────────────────────────────────────────
export const saveRecitationResult = async (studentId, dataObj) => {
  // ── 1. Resolve student name ──────────────────────────────────────────────
  let studentName = dataObj.studentName || '';
  if (!studentName) {
    try {
      const session = await getCurrentUser();
      studentName = session?.full_name || session?.displayName
        || session?.email?.split('@')[0] || 'Student';
    } catch { studentName = 'Student'; }
  }

  // ── 2. Parse surah / ayah ────────────────────────────────────────────────
  const ayahStr    = String(dataObj.ayah || '1');
  const ayahParts  = ayahStr.split('-');
  const startVerse = parseInt(ayahParts[0]) || 1;
  const endVerse   = parseInt(ayahParts[1] || ayahParts[0]) || startVerse;

  // ── 3. Upload audio (best-effort — never blocks submission) ──────────────
  let finalAudioUrl = '';
  if (dataObj.audioUri) {
    try {
      const fileName = `${studentId}/${Date.now()}.m4a`;
      let uploadBlob = null;

      // Tier 1: Convert file URI to Blob using XMLHttpRequest (React Native standard)
      try {
        uploadBlob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function() {
            resolve(xhr.response);
          };
          xhr.onerror = function(e) {
            reject(new Error('XHR request failed: ' + JSON.stringify(e)));
          };
          xhr.responseType = 'blob';
          xhr.open('GET', dataObj.audioUri, true);
          xhr.send(null);
        });
        console.log('[Audio] XHR conversion successful');
      } catch (xhrErr) {
        console.warn('[Audio] XHR conversion failed, trying Tier 2 (fetch):', xhrErr?.message);
        
        // Tier 2: Direct fetch (works on Web)
        try {
          const resp = await fetch(dataObj.audioUri);
          if (resp.ok) {
            uploadBlob = await resp.blob();
            console.log('[Audio] Fetch conversion successful');
          }
        } catch (fetchErr) {
          console.warn('[Audio] Fetch conversion failed, trying Tier 3 (Expo FileSystem base64):', fetchErr?.message);

          // Tier 3: Expo FileSystem base64 (native fallback)
          try {
            const FileSystem = require('expo-file-system');
            const b64 = await FileSystem.readAsStringAsync(dataObj.audioUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const bytes = decodeBase64(b64);
            if (typeof Blob !== 'undefined') {
              uploadBlob = new Blob([bytes], { type: 'audio/m4a' });
              console.log('[Audio] Base64 + Blob conversion successful');
            } else {
              uploadBlob = bytes;
              console.log('[Audio] Base64 Uint8Array conversion successful');
            }
          } catch (fsErr) {
            console.warn('[Audio] Tier 3 conversion failed:', fsErr?.message);
          }
        }
      }

      const hasData = uploadBlob && (uploadBlob.size > 0 || uploadBlob.byteLength > 0 || uploadBlob.length > 0);
      if (hasData) {
        const { error: uploadErr } = await supabase.storage
          .from('recitations')
          .upload(fileName, uploadBlob, { contentType: 'audio/m4a', upsert: true });

        if (uploadErr) {
          console.error('[Audio] Storage upload error:', uploadErr.message, uploadErr);
        } else {
          const { data: urlData } = supabase.storage
            .from('recitations')
            .getPublicUrl(fileName);
          finalAudioUrl = urlData?.publicUrl || '';
          console.log('[Audio] uploaded successfully:', finalAudioUrl);
        }
      } else {
        console.warn('[Audio] converted blob empty or unavailable');
      }
    } catch (err) {
      console.error('[Audio] upload failed with exception:', err?.message, err);
    }
  }

  // ── 4. Insert recitation record ──────────────────────────────────────────
  const insertPayload = {
    user_id:             studentId,
    student_name:        studentName,
    surah_number:        dataObj.surahNumber || 1,
    start_verse:         startVerse,
    end_verse:           endVerse,
    audio_url:           finalAudioUrl,
    submitted_at:        new Date().toISOString(),
    recorded_at:         new Date().toISOString(),
    surah:               dataObj.surah   || '',
    ayah:                ayahStr,
    score:               Number(dataObj.score)               || 0,
    transcription:       dataObj.transcription               || '',
    memorization_score:  Number(dataObj.memorization_score)  || 0,
    pronunciation_score: Number(dataObj.pronunciation_score) || 0,
    tajwid_score:        Number(dataObj.tajwid)              || 0,
    fluency_score:       Number(dataObj.fluency_score)       || 0,
    makhraj_score:       Number(dataObj.makhraj)             || 0,
    errors:              {
      memorization:  dataObj.memorization_score,
      pronunciation: dataObj.pronunciation_score,
      tajwid:        dataObj.tajwid,
      fluency:       dataObj.fluency_score,
    },
    feedback:      dataObj.feedback      || '',
    reviewed:      dataObj.is_exercise ? true : false, // AI Exercises are auto-reviewed, official assessments need teacher review
    teacher_grade: 0,
    is_exercise:    dataObj.is_exercise    || false,
    status:         dataObj.status         || 'pending',
    session_id:     dataObj.session_id     || null,
    recording_mode: dataObj.recording_mode || 'beginner',
    attempt_number: dataObj.attempt_number || null,
  };

  let { data, error } = await supabase
    .from('recitations')
    .insert([insertPayload])
    .select()
    .single();

  // Fallback retry if newer columns (attempt_number / recording_mode) don't exist in Supabase DB schema yet
  if (error && (error.message?.includes('attempt_number') || error.message?.includes('recording_mode'))) {
    console.warn('[saveRecitationResult] Schema error detected, retrying without optional columns:', error.message);
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.attempt_number;
    delete fallbackPayload.recording_mode;

    const retryRes = await supabase
      .from('recitations')
      .insert([fallbackPayload])
      .select()
      .single();

    data = retryRes.data;
    error = retryRes.error;
  }

  if (error) {
    console.error('[saveRecitationResult] DB error:', error);
    throw new Error(error.message);
  }

  // ── 5. Save assessment (non-fatal) ───────────────────────────────────────
  if (data?.id) {
    supabase.from('assessments').insert([{
      recitation_id:       data.id,
      student_id:          studentId,
      overall_score:       Number(dataObj.score)               || 0,
      memorization_score:  Number(dataObj.memorization_score)  || 0,
      pronunciation_score: Number(dataObj.pronunciation_score) || 0,
      tajwid_score:        Number(dataObj.tajwid)              || 0,
      fluency_score:       Number(dataObj.fluency_score)       || 0,
      transcript:          dataObj.transcription || '',
      errors_json:         dataObj.word_alignments || [],
      feedback_text:       dataObj.feedback || '',
      score:               Number(dataObj.score) || 0,
      assessed_at:         new Date().toISOString(),
    }]).then(() => {}).catch(e =>
      console.warn('Assessment insert (non-fatal):', e?.message)
    );
  }

  // ── 6. Update streak & progress (fire-and-forget) ────────────────────────
  updateUserStreak(studentId).catch(() => {});
  supabase.from('users')
    .update({ progress_percentage: Number(dataObj.memorization_score) || 0 })
    .eq('id', studentId)
    .then(() => {}).catch(() => {});

  return data;
};

// ── GET RECITATION HISTORY ────────────────────────────────────────────────────
export const getRecitationHistory = async (studentId) => {
  const { data, error } = await supabase
    .from('recitations')
    .select('*')
    .eq('user_id', studentId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(d => ({
    ...d,
    studentName:     d.student_name || 'Student',
    audioUrl:        d.audio_url,
    teacherFeedback: d.feedback,
    teacherGrade:    d.teacher_grade,
    recordedAt:      d.recorded_at || d.submitted_at,
    surah:  d.surah || `Surah ${d.surah_number}`,
    ayah:   d.ayah  || `${d.start_verse}–${d.end_verse}`,
    type:   'Recitation',
  }));
};

// ── GET PENDING (teacher portal) ─────────────────────────────────────────────
export const getPendingRecitations = async () => {
  const { data, error } = await supabase
    .from('recitations')
    .select('*')
    .eq('reviewed', false)
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  return (data || []).map(d => ({
    ...d,
    student_name: d.student_name || 'Student',
    studentName:  d.student_name || 'Student',
    audioUrl:     d.audio_url,
    audio_url:    d.audio_url,
    recordedAt:   d.recorded_at || d.submitted_at,
    surah: d.surah || `Surah ${d.surah_number}`,
    ayah:  d.ayah  || `${d.start_verse}–${d.end_verse}`,
  }));
};

// ── SUBMIT TEACHER REVIEW ─────────────────────────────────────────────────────
export const submitReview = async (recitationId, grade, feedback) => {
  const { data, error } = await supabase
    .from('recitations')
    .update({
      reviewed:      true,
      teacher_grade: grade,
      feedback:      feedback,
      reviewed_at:   new Date().toISOString(),
    })
    .eq('id', recitationId)
    .select()
    .single();

  if (error) throw error;

  // Update student avg_score
  if (data?.user_id) {
    const { data: allRecs } = await supabase
      .from('recitations')
      .select('score')
      .eq('user_id', data.user_id)
      .eq('reviewed', true);

    if (allRecs?.length) {
      const avg = Math.round(
        allRecs.reduce((s, r) => s + (r.score || 0), 0) / allRecs.length
      );
      await supabase.from('users').update({ avg_score: avg }).eq('id', data.user_id);
    }
  }

  return data;
};

// ── UPLOAD RECITATION WRAPPER FOR RECITATION MODE ────────────────────────────
export const uploadRecitation = async (audioUri, surah, ayah, transcription, score, errors) => {
  const session = await getCurrentUser();
  const studentId = session?.id || session?.uid;
  if (!studentId) throw new Error('User not authenticated');

  // Resolve the surah number from the surah name
  let surahNumber = 1;
  try {
    const quranData = require('../data/quran_data.json');
    const normalized = surah.toLowerCase().replace(/[^a-z]/g, '');
    const found = quranData.find(s => s.name.toLowerCase().replace(/[^a-z]/g, '') === normalized);
    if (found) surahNumber = parseInt(found.index, 10);
  } catch (err) {
    console.warn('Could not resolve surah number from name:', err);
  }

  const confidence = Number(score) || 0;

  const dataObj = {
    audioUri,
    surah,
    surahNumber,
    ayah,
    score: confidence,
    transcription,
    memorization_score: confidence,
    pronunciation_score: confidence,
    tajwid: confidence,
    fluency_score: confidence,
    makhraj: confidence,
    feedback: '',
  };

  const data = await saveRecitationResult(studentId, dataObj);
  return data?.id;
};
