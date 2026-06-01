import { supabase } from './supabaseClient';
import { updateUserStreak } from './authService';

export const uploadRecitation = async (audioUri, surah, ayah, transcription, score, errors) => {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) throw new Error("User not authenticated");

  let finalAudioUrl = audioUri;

  // ── UPLOAD TO SUPABASE STORAGE ──────────────────────────────────────────────
  try {
    const fileName = `${user.id}/${Date.now()}.m4a`;
    
    // Convert URI to Blob for upload
    const response = await fetch(audioUri);
    const blob = await response.blob();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recitations')
      .upload(fileName, blob, {
        contentType: 'audio/m4a',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Get Public URL
    const { data: urlData } = supabase.storage
      .from('recitations')
      .getPublicUrl(fileName);
    
    finalAudioUrl = urlData.publicUrl;
  } catch (storageErr) {
    console.error('Storage upload failed, falling back to URI:', storageErr);
    // Continue with URI if upload fails (though it won't be playable by teacher)
  }

  const { data, error } = await supabase
    .from('recitations')
    .insert([
      {
        studentId: user.id,
        studentName: user.user_metadata?.displayName || 'Student',
        surah,
        ayah,
        transcription,
        score,
        errors,
        audioUrl: finalAudioUrl,
        reviewed: false,
        feedback: '',
        teacherGrade: 0,
      }
    ])
    .select();

  if (error) throw error;
  
  // Update Streak
  await updateUserStreak(user.id);

  return data[0].id;
};

export const getPendingRecitations = async () => {
  const { data, error } = await supabase
    .from('recitations')
    .select('*')
    .eq('reviewed', false)
    .order('recordedAt', { ascending: false });
    
  if (error) throw error;
  return data;
};

export const submitReview = async (recitationId, grade, feedback) => {
  const { data: updateData, error } = await supabase
    .from('recitations')
    .update({
      reviewed: true,
      teacherGrade: grade,
      feedback: feedback,
      reviewedAt: new Date().toISOString(),
    })
    .eq('id', recitationId)
    .select()
    .single();

  if (error) throw error;

  // Additional logic to update student progress could go here
  if (updateData) {
    const studentId = updateData.studentId;
    // e.g. update users table avgScore
  }
};

export const getRecitationHistory = async (studentId) => {
  const { data, error } = await supabase
    .from('recitations')
    .select('*')
    .eq('studentId', studentId)
    .order('recordedAt', { ascending: false });
    
  if (error) throw error;
  
  // Transform data to include 'type' attribute missing from original supabase migration
  // Added null check for data to prevent crashes
  return (data || []).map(d => ({
    ...d,
    type: d?.type || 'Recitation' // fallback since type wasn't in original schema
  }));
};

export const saveRecitationResult = async (studentId, dataObj) => {
  const { data, error } = await supabase
    .from('recitations')
    .insert([
      {
        studentId: studentId,
        studentName: 'Student', // Ideally fetched from profile
        surah: dataObj.surah,
        ayah: parseInt(dataObj.ayah, 10) || 1,
        score: dataObj.score,
        errors: { tajwid: dataObj.tajwid, makhraj: dataObj.makhraj },
        feedback: dataObj.feedback,
        reviewed: false,
      }
    ]);
    
  if (error) {
    console.error("Error in saveRecitationResult:", error);
    throw error;
  }

  // Update Streak
  await updateUserStreak(studentId);
};
