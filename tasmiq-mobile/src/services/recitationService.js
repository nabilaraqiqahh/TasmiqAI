import { supabase } from './supabaseClient';
import { updateUserStreak, getCurrentUser } from './authService';

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
      const response = await fetch(dataObj.audioUri);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('recitations')
        .upload(fileName, blob, { contentType: 'audio/m4a', upsert: true });
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('recitations').getPublicUrl(fileName);
        finalAudioUrl = urlData?.publicUrl || '';
      }
    } catch (storageErr) {
      // Non-fatal — submission continues without audio URL
      console.warn('Audio upload skipped:', storageErr?.message || storageErr);
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
    errors:              JSON.stringify({
      memorization:  dataObj.memorization_score,
      pronunciation: dataObj.pronunciation_score,
      tajwid:        dataObj.tajwid,
      fluency:       dataObj.fluency_score,
    }),
    feedback:      dataObj.feedback      || '',
    reviewed:      false,
    teacher_grade: 0,
  };

  const { data, error } = await supabase
    .from('recitations')
    .insert([insertPayload])
    .select()
    .single();

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
