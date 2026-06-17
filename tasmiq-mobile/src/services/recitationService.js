import { supabase } from './supabaseClient';
import { updateUserStreak, getCurrentUser } from './authService';

// ── SAVE RECITATION RESULT ────────────────────────────────────────────────────
// Maps our app fields to the ACTUAL DB column names
export const saveRecitationResult = async (studentId, dataObj) => {
  let studentName = dataObj.studentName || '';
  if (!studentName) {
    try {
      const session = await getCurrentUser();
      studentName = session?.full_name
        || session?.displayName
        || session?.email?.split('@')[0]
        || 'Student';
    } catch (_) { studentName = 'Student'; }
  }

  // Parse surah/ayah — dataObj.surah may be a name like "Al-Baqarah"
  // dataObj.ayah may be "1-5" or just "1"
  const ayahStr = String(dataObj.ayah || '1');
  const ayahParts = ayahStr.split('-');
  const startVerse = parseInt(ayahParts[0]) || 1;
  const endVerse   = parseInt(ayahParts[1] || ayahParts[0]) || startVerse;

  let finalAudioUrl = '';
  if (dataObj.audioUri) {
    try {
      const fileName = `${studentId}/${Date.now()}.m4a`;
      const response = await fetch(dataObj.audioUri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('recitations')
        .upload(fileName, blob, { contentType: 'audio/m4a', upsert: true });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('recitations').getPublicUrl(fileName);
        finalAudioUrl = urlData.publicUrl;
      }
    } catch (storageErr) {
      console.warn('Storage upload failed:', storageErr);
      finalAudioUrl = dataObj.audioUri;
    }
  }

  // Insert using ACTUAL DB column names
  const { data, error } = await supabase
    .from('recitations')
    .insert([{
      user_id:             studentId,      // actual PK ref column
      student_name:        studentName,
      surah_number:        dataObj.surahNumber || 1,
      start_verse:         startVerse,
      end_verse:           endVerse,
      audio_url:           finalAudioUrl,
      submitted_at:        new Date().toISOString(),
      // Extended columns (added by our schema fix)
      surah:               dataObj.surah   || '',
      ayah:                ayahStr,
      score:               dataObj.score   || 0,
      transcription:       dataObj.transcription || '',
      memorization_score:  dataObj.memorization_score  ?? null,
      pronunciation_score: dataObj.pronunciation_score ?? null,
      tajwid_score:        dataObj.tajwid  ?? null,
      fluency_score:       dataObj.fluency_score ?? null,
      makhraj_score:       dataObj.makhraj ?? null,
      errors:              JSON.stringify({
        memorization:  dataObj.memorization_score,
        pronunciation: dataObj.pronunciation_score,
        tajwid:        dataObj.tajwid,
        fluency:       dataObj.fluency_score,
        makhraj:       dataObj.makhraj,
      }),
      feedback:    dataObj.feedback || '',
      reviewed:    false,
      teacher_grade: 0,
      recorded_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) {
    console.error('Error saving recitation:', error);
    throw error;
  }

  // Save to assessments table
  if (data?.id) {
    await supabase.from('assessments').insert([{
      recitation_id:       data.id,
      student_id:          studentId,
      overall_score:       dataObj.score ?? 0,
      memorization_score:  dataObj.memorization_score ?? 0,
      pronunciation_score: dataObj.pronunciation_score ?? 0,
      tajwid_score:        dataObj.tajwid ?? 0,
      fluency_score:       dataObj.fluency_score ?? 0,
      transcript:          dataObj.transcription || '',
      errors_json:         dataObj.word_alignments || [],
      feedback_text:       dataObj.feedback || '',
      score:               dataObj.score ?? 0,
      assessed_at:         new Date().toISOString(),
    }]).then(() => {}).catch(e => console.warn('Assessment insert failed (non-fatal):', e?.message));
  }

  // Update streak and progress
  await updateUserStreak(studentId);
  // Update user progress — fire and forget
  supabase.from('users')
    .update({ progress_percentage: dataObj.memorization_score ?? 0 })
    .eq('id', studentId)
    .then(() => {})
    .catch(e => console.warn('Progress update failed:', e?.message));

  return data;
};

// ── GET RECITATION HISTORY ────────────────────────────────────────────────────
export const getRecitationHistory = async (studentId) => {
  const { data, error } = await supabase
    .from('recitations')
    .select('*')
    .eq('user_id', studentId)             // actual column name
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  // Normalise for UI — map DB columns → app field names
  return (data || []).map(d => ({
    ...d,
    // UI-friendly aliases
    studentName:    d.student_name,
    audioUrl:       d.audio_url,
    teacherFeedback: d.feedback,
    teacherGrade:   d.teacher_grade,
    recordedAt:     d.recorded_at || d.submitted_at,
    // surah/ayah display
    surah: d.surah || `Surah ${d.surah_number}`,
    ayah:  d.ayah  || `${d.start_verse}–${d.end_verse}`,
    type:  'Recitation',
  }));
};

// ── GET PENDING RECITATIONS (teacher) ────────────────────────────────────────
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
