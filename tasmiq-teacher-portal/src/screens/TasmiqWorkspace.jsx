import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, Send, CheckCircle, XCircle, Search, Calendar, BookOpen, Clock, Filter, Sparkles, User, Award, ArrowUpRight, ChevronRight, X } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

const D = {
  emerald:      '#0B6E4F',
  emeraldDark:  '#064E3B',
  emeraldLight: '#D1FAE5',
  gold:         '#D4AF37',
  goldLight:    '#F8E7A1',
  bg:           '#FEFCE8',
  card:         '#FFFFFF',
  text:         '#1F2937',
  textSec:      '#6B7280',
  border:       '#E5E7EB',
  red:          '#EF4444',
  amber:        '#F59E0B',
  green:        '#0B6E4F',
};

export default function TasmiqWorkspace() {
  const { teacher } = useAuth(); // current authenticated teacher
  const [activeTab, setActiveTab] = useState('exercise'); // 'exercise' | 'assessment' | 'history'
  
  // Submissions data
  const [exerciseRecs, setExerciseRecs] = useState([]);
  const [assessmentRecs, setAssessmentRecs] = useState([]);
  const [historyRecs, setHistoryRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Selection & Feedback state
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  // Audio player state
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Instant Search by Student Name or Student ID
  const [searchQuery, setSearchQuery] = useState('');

  // History tab filters
  const [historySurahFilter, setHistorySurahFilter] = useState('all');
  const [historyDateFilter, setHistoryDateFilter] = useState('all');
  const [compareSelectedStudent, setCompareSelectedStudent] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all recitations with student info
      const { data, error } = await supabase
        .from('recitations')
        .select('*, student:user_id(id, full_name, email)')
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map(r => ({
        ...r,
        student_name: r.student_name || r.student?.full_name || r.student?.email?.split('@')[0] || 'Student',
        student_id: r.user_id || r.student?.id || '',
        surahDisplay: r.surah || `Surah ${r.surah_number}`,
        ayahDisplay:  r.ayah  || `${r.start_verse}–${r.end_verse}`,
      }));

      // Tab 1: Exercises (is_exercise = true)
      setExerciseRecs(formatted.filter(r => r.is_exercise));

      // Tab 2: Assessments (is_exercise = false, reviewed = false or status = pending)
      setAssessmentRecs(formatted.filter(r => !r.is_exercise && (!r.reviewed || r.status === 'pending')));

      // Tab 3: History (reviewed = true)
      setHistoryRecs(formatted.filter(r => r.reviewed || r.status === 'approved' || r.status === 'repeat'));

    } catch (err) {
      console.error('Load Tasmiq data error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Audio Player toggle
  const togglePlayAudio = (url) => {
    if (!url || !audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = url;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  // Teacher Assessment Action: PASS or REPEAT
  const handleTeacherDecision = async (decision) => {
    if (!selected) return;
    if (decision === 'repeat' && !feedback.trim()) {
      alert('Please provide feedback explaining why re-recording is required before submitting REPEAT.');
      return;
    }

    // Resolve the authenticated teacher's UUID
    const teacherId = teacher?.id || teacher?.uid || null;

    setSubmitting(true);
    try {
      const isApproved = decision === 'pass';
      const teacherStatus = isApproved ? 'PASS' : 'REPEAT';
      const newStatus     = isApproved ? 'approved' : 'repeat';
      const feedbackText  = isApproved
        ? (feedback.trim() || 'Assessment approved. Excellent recitation.')
        : feedback.trim();

      // ── 1. Update recitation: mark reviewed + store teacher decision ──────
      const { error: recErr } = await supabase
        .from('recitations')
        .update({
          reviewed:         true,
          status:           newStatus,
          teacher_grade:    isApproved ? 5 : 1,
          feedback:         feedbackText,
          reviewed_at:      new Date().toISOString(),
          // explicit teacher evaluation columns
          teacher_id:       teacherId,
          teacher_status:   teacherStatus,
        })
        .eq('id', selected.id);

      if (recErr) throw recErr;

      // ── 2. Create notification linked to the student's account ────────────
      // student_id  = selected.user_id  (recitations.user_id is the student UUID)
      // teacher_id  = authenticated teacher UUID
      // recitation_id = selected.id  (for deep-link on mobile)
      if (selected.user_id) {
        const notifTitle = isApproved
          ? 'Teacher Assessment Completed'
          : 'Teacher Requested Re-recording';
        const notifBody = isApproved
          ? 'Your Tasmiq assessment has been approved by your teacher.'
          : 'Your teacher has requested you to re-record your Tasmiq assessment. Tap to view the feedback.';

        const { error: notifErr } = await supabase
          .from('notifications')
          .insert([{
            user_id:       selected.user_id,   // student UUID — NOT teacher
            title:         notifTitle,
            body:          notifBody,
            type:          'TEACHER_TASMIQ_EVALUATION',
            teacher_id:    teacherId,
            recitation_id: selected.id,
            is_read:       false,
            created_at:    new Date().toISOString(),
          }]);

        if (notifErr) {
          // Non-fatal: log but don't block the evaluation save
          console.error('[TasmiqWorkspace] Notification insert failed:', notifErr.message);
        }
      }

      // ── 3. Update student's avg_score ─────────────────────────────────────
      if (selected.user_id) {
        const { data: recs } = await supabase
          .from('recitations')
          .select('score')
          .eq('user_id', selected.user_id)
          .eq('reviewed', true);

        if (recs?.length) {
          const avg = Math.round(
            recs.reduce((s, r) => s + (r.score || 0), 0) / recs.length
          );
          await supabase.from('users').update({ avg_score: avg }).eq('id', selected.user_id);
        }
      }

      setActionSuccess(
        `Assessment ${isApproved ? 'APPROVED (PASS)' : 'marked REPEAT'} — notification sent to student.`
      );
      setTimeout(() => setActionSuccess(''), 4000);

      setFeedback('');
      setSelected(null);
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
      loadData();

    } catch (err) {
      alert('Error saving evaluation: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter items by instant search (Student Name or Student ID)
  const filterBySearch = (list) => {
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase().trim();
    return list.filter(item => 
      (item.student_name || '').toLowerCase().includes(query) ||
      (item.student_id || '').toLowerCase().includes(query) ||
      (item.surahDisplay || '').toLowerCase().includes(query)
    );
  };

  const activeList = activeTab === 'exercise' 
    ? filterBySearch(exerciseRecs) 
    : activeTab === 'assessment' 
    ? filterBySearch(assessmentRecs)
    : filterBySearch(historyRecs);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${D.emeraldLight}`, borderTop: `3px solid ${D.emerald}`, animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', paddingBottom: 60 }}>
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: D.emerald, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
          Tasmiq Workspace
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: D.text, margin: '0 0 4px' }}>Tasmiq Management</h1>
        <p style={{ fontSize: 14, color: D.textSec, margin: 0 }}>
          Evaluate student AI practice exercises, perform official assessments, and track progress history.
        </p>
      </div>

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div style={{
          backgroundColor: D.emeraldLight, color: D.emeraldDark, borderRadius: 12, padding: '14px 20px',
          marginBottom: 20, fontWeight: 700, fontSize: 14, borderLeft: `4px solid ${D.emerald}`,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <CheckCircle size={18} /> {actionSuccess}
        </div>
      )}

      {/* Tabs & Search Bar Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        
        {/* Main Tabs */}
        <div style={{ display: 'flex', gap: 6, backgroundColor: D.card, borderRadius: 14, padding: 4, border: `1px solid ${D.border}` }}>
          <button
            onClick={() => { setActiveTab('exercise'); setSelected(null); }}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: activeTab === 'exercise' ? D.emerald : 'transparent',
              color: activeTab === 'exercise' ? 'white' : D.textSec,
              boxShadow: activeTab === 'exercise' ? `0 2px 8px ${D.emerald}30` : 'none',
            }}
          >
            <Sparkles size={16} /> Tasmiq Exercise (AI) ({exerciseRecs.length})
          </button>

          <button
            onClick={() => { setActiveTab('assessment'); setSelected(null); }}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: activeTab === 'assessment' ? D.emerald : 'transparent',
              color: activeTab === 'assessment' ? 'white' : D.textSec,
              boxShadow: activeTab === 'assessment' ? `0 2px 8px ${D.emerald}30` : 'none',
            }}
          >
            <BookOpen size={16} /> Tasmiq Assessment (Teacher) ({assessmentRecs.length})
          </button>

          <button
            onClick={() => { setActiveTab('history'); setSelected(null); }}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: activeTab === 'history' ? D.emerald : 'transparent',
              color: activeTab === 'history' ? 'white' : D.textSec,
              boxShadow: activeTab === 'history' ? `0 2px 8px ${D.emerald}30` : 'none',
            }}
          >
            <Clock size={16} /> History &amp; Comparisons
          </button>
        </div>

        {/* Instant Search Bar (Name or Student ID) */}
        <div style={{
          display: 'flex', alignItems: 'center', backgroundColor: D.card,
          borderRadius: 14, padding: '6px 16px', border: `1px solid ${D.border}`,
          width: '320px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <Search size={16} color={D.textSec} style={{ marginRight: 8 }} />
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: D.text, background: 'none' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
              <X size={14} color={D.textSec} />
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* TAB 1: TASMIQ EXERCISE (AI PRACTICE)                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'exercise' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: 24 }}>
          {/* List of exercises */}
          <div style={{ backgroundColor: D.card, borderRadius: 18, padding: 20, border: `1px solid ${D.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: D.text, marginBottom: 16 }}>AI Practice Sessions</h3>
            
            {activeList.length === 0 ? (
              <p style={{ color: D.textSec, textAlign: 'center', padding: '40px 0', fontSize: 14 }}>No AI exercise records found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => { setSelected(item); setIsPlaying(false); }}
                    style={{
                      padding: 16, borderRadius: 14, border: `1px solid ${selected?.id === item.id ? D.emerald : D.border}`,
                      backgroundColor: selected?.id === item.id ? '#F0FDF4' : D.card,
                      cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: D.text }}>{item.student_name}</span>
                      <span style={{ fontWeight: 900, fontSize: 14, color: D.emerald }}>{item.score || 0}%</span>
                    </div>
                    <div style={{ fontSize: 12, color: D.textSec, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.surahDisplay} · Ayah {item.ayahDisplay}</span>
                      <span>{new Date(item.submitted_at || item.recorded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details Card for selected practice session */}
          {selected && (
            <div style={{ backgroundColor: D.card, borderRadius: 18, padding: 24, border: `1px solid ${D.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: D.emerald, textTransform: 'uppercase', letterSpacing: 1 }}>PRACTICE EXERCISE DETAILS</span>
                  <h2 style={{ fontSize: 22, fontWeight: 900, color: D.text, margin: '4px 0 2px' }}>{selected.student_name}</h2>
                  <p style={{ fontSize: 12, color: D.textSec, margin: 0 }}>ID: {selected.student_id}</p>
                </div>

                <div style={{ backgroundColor: D.emeraldLight, padding: '10px 18px', borderRadius: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: D.emerald }}>{selected.score || 0}%</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: D.emeraldDark, textTransform: 'uppercase' }}>AI Overall Score</div>
                </div>
              </div>

              {/* Surah & Ayah */}
              <div style={{ backgroundColor: D.bg, padding: 16, borderRadius: 14, marginBottom: 20, border: `1px solid ${D.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>{selected.surahDisplay}</div>
                <div style={{ fontSize: 12, color: D.textSec }}>Ayah {selected.ayahDisplay}</div>
              </div>

              {/* Playback Button */}
              {selected.audio_url ? (
                <div style={{ marginBottom: 20 }}>
                  <button
                    onClick={() => togglePlayAudio(selected.audio_url)}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 14, border: `1.5px solid ${D.emerald}`,
                      backgroundColor: isPlaying ? '#FFFBEB' : '#F0FDF4', color: D.emerald,
                      fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    {isPlaying ? 'Pause Audio Recording' : 'Listen to Student Audio Recording'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: D.textSec, fontStyle: 'italic', marginBottom: 20 }}>No audio recording file available.</p>
              )}

              {/* AI Feedback */}
              <div style={{ backgroundColor: '#FFFBEB', padding: 18, borderRadius: 14, border: '1px solid #FDE68A' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>AI Feedback &amp; Diagnostics</div>
                <p style={{ fontSize: 13, color: '#92400E', margin: 0, lineHeight: '20px' }}>
                  {selected.feedback || 'The student performed well on this practice exercise.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* TAB 2: TASMIQ ASSESSMENT (TEACHER PASS / REPEAT)             */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'assessment' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: 24 }}>
          {/* List of pending official assessments */}
          <div style={{ backgroundColor: D.card, borderRadius: 18, padding: 20, border: `1px solid ${D.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: D.text, marginBottom: 16 }}>Pending Official Assessments</h3>
            
            {activeList.length === 0 ? (
              <p style={{ color: D.textSec, textAlign: 'center', padding: '40px 0', fontSize: 14 }}>All official assessments reviewed! No pending queue.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => { setSelected(item); setIsPlaying(false); setFeedback(''); }}
                    style={{
                      padding: 16, borderRadius: 14, border: `1px solid ${selected?.id === item.id ? D.emerald : D.border}`,
                      backgroundColor: selected?.id === item.id ? '#F0FDF4' : D.card,
                      cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: D.text }}>{item.student_name}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: D.amber, backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: 6 }}>Needs Review</span>
                    </div>
                    <div style={{ fontSize: 12, color: D.textSec, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.surahDisplay} · Ayah {item.ayahDisplay}</span>
                      <span>{new Date(item.submitted_at || item.recorded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assessment Workspace Card */}
          {selected && (
            <div style={{ backgroundColor: D.card, borderRadius: 18, padding: 24, border: `1px solid ${D.border}` }}>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: D.emerald, textTransform: 'uppercase', letterSpacing: 1 }}>OFFICIAL TEACHER EVALUATION</span>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: D.text, margin: '4px 0 2px' }}>{selected.student_name}</h2>
                <p style={{ fontSize: 12, color: D.textSec, margin: 0 }}>Student ID: {selected.student_id}</p>
              </div>

              {/* Note: Teacher does NOT see AI percentage */}
              <div style={{ backgroundColor: D.bg, padding: 16, borderRadius: 14, marginBottom: 20, border: `1px solid ${D.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: D.text }}>{selected.surahDisplay}</div>
                <div style={{ fontSize: 13, color: D.textSec }}>Ayah {selected.ayahDisplay}</div>
              </div>

              {/* Playback Audio */}
              {selected.audio_url ? (
                <div style={{ marginBottom: 24 }}>
                  <button
                    onClick={() => togglePlayAudio(selected.audio_url)}
                    style={{
                      width: '100%', padding: '16px', borderRadius: 14, border: `2px solid ${D.emerald}`,
                      backgroundColor: isPlaying ? '#FFFBEB' : '#F0FDF4', color: D.emerald,
                      fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    {isPlaying ? 'Pause Student Recitation' : 'Play Student Recitation Audio'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: D.textSec, fontStyle: 'italic', marginBottom: 24 }}>No audio recording file available for this assessment.</p>
              )}

              {/* Feedback Textbox */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 800, color: D.text, display: 'block', marginBottom: 8 }}>
                  Teacher Feedback / Re-recording Instructions:
                </label>
                <textarea
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Enter comments or specific instructions for re-recording..."
                  style={{
                    width: '100%', padding: 14, borderRadius: 12, border: `1px solid ${D.border}`,
                    fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Teacher Actions: PASS or REPEAT */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <button
                  onClick={() => handleTeacherDecision('repeat')}
                  disabled={submitting}
                  style={{
                    padding: '16px', borderRadius: 14, border: 'none',
                    backgroundColor: D.red, color: 'white', fontWeight: 800, fontSize: 15,
                    cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 12px rgba(239,68,68,0.2)'
                  }}
                >
                  <XCircle size={18} /> REPEAT (Request Re-recording)
                </button>

                <button
                  onClick={() => handleTeacherDecision('pass')}
                  disabled={submitting}
                  style={{
                    padding: '16px', borderRadius: 14, border: 'none',
                    backgroundColor: D.emerald, color: 'white', fontWeight: 800, fontSize: 15,
                    cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: `0 4px 12px ${D.emerald}30`
                  }}
                >
                  <CheckCircle size={18} /> PASS (Approve Assessment)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* TAB 3: HISTORY & COMPARISONS                                  */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div>
          {/* History list with comparison timeline */}
          <div style={{ backgroundColor: D.card, borderRadius: 18, padding: 24, border: `1px solid ${D.border}` }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: D.text, marginBottom: 16 }}>Reviewed History &amp; Recording Comparisons</h3>

            {activeList.length === 0 ? (
              <p style={{ color: D.textSec, textAlign: 'center', padding: '40px 0', fontSize: 14 }}>No history records found matching your filters.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activeList.map((item) => (
                  <div key={item.id} style={{
                    padding: 18, borderRadius: 14, border: `1px solid ${D.border}`,
                    backgroundColor: D.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: D.text }}>{item.student_name}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 6,
                          backgroundColor: item.status === 'approved' ? '#D1FAE5' : item.status === 'repeat' ? '#FEE2E2' : '#FEF3C7',
                          color: item.status === 'approved' ? '#065F46' : item.status === 'repeat' ? '#B91C1C' : '#92400E'
                        }}>
                          {item.status === 'approved' ? 'PASS' : item.status === 'repeat' ? 'REPEAT' : 'REVIEWED'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: D.textSec }}>
                        {item.surahDisplay} · Ayah {item.ayahDisplay} · {new Date(item.reviewed_at || item.submitted_at).toLocaleDateString()}
                      </div>
                      {item.feedback && (
                        <div style={{ fontSize: 12, color: D.muted, marginTop: 4, fontStyle: 'italic' }}>
                          "{item.feedback}"
                        </div>
                      )}
                    </div>

                    {item.audio_url && (
                      <button
                        onClick={() => togglePlayAudio(item.audio_url)}
                        style={{
                          padding: '10px 16px', borderRadius: 10, border: `1px solid ${D.emerald}`,
                          backgroundColor: '#F0FDF4', color: D.emerald, fontWeight: 800, fontSize: 13,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <Play size={14} /> Play Audio
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
