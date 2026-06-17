import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, Send, Sparkles, MicOff, ChevronRight, Clock, BookOpen, Star } from 'lucide-react';
import { supabase } from '../supabase';
import { useLocation } from 'react-router-dom';

const C = {
  bg: '#F5F2E9',
  card: '#FFFFFF',
  primary: '#10B981',
  gold: '#D4AF37',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#10B981',
  dark: '#111827',
  border: '#EAE3D5',
};

export default function RecitationReview() {
  const location = useLocation();
  const [submissions, setSubmissions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [grade, setGrade] = useState(4);
  const [recommendation, setRecommendation] = useState('Excellent');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const loadSubmissions = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      // Join with users to get real student name
      const { data, error } = await supabase
        .from('recitations')
        .select(`
          *,
          student:user_id (
            id,
            full_name,
            email
          )
        `)
        .eq('reviewed', false)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Normalise: ensure student_name field is always populated
      const list = (data || []).map(r => ({
        ...r,
        student_name:
          r.student_name                        // stored at submission time
          || r.student?.full_name               // joined from users table
          || r.student?.email?.split('@')[0]    // email prefix fallback
          || 'Unknown Student',
        studentName:
          r.student_name
          || r.student?.full_name
          || r.student?.email?.split('@')[0]
          || 'Unknown Student',
        // normalise surah/ayah for display
        surahDisplay: r.surah || `Surah ${r.surah_number}`,
        ayahDisplay:  r.ayah  || `${r.start_verse}–${r.end_verse}`,
        audio_url:    r.audio_url || null,
      }));

      setSubmissions(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch (err) {
      console.error('Load submissions error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    if (location.state?.recitation) setSelected(location.state.recitation);
  }, [location.state]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleSubmit = async (isRedo = false) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const finalFeedback = isRedo
        ? `REDO: [Recommendation: Needs Revision] ${feedback}`
        : `[Recommendation: ${recommendation}] ${feedback}`;

      const { error } = await supabase
        .from('recitations')
        .update({
          reviewed:      true,
          teacher_grade: isRedo ? 0 : grade,
          feedback:      finalFeedback,
          reviewed_at:   new Date().toISOString(),
        })
        .eq('id', selected.id);

      if (error) throw error;

      // Update student avg_score after review
      if (selected.user_id) {
        const { data: allRecs } = await supabase
          .from('recitations')
          .select('score')
          .eq('user_id', selected.user_id)
          .eq('reviewed', true);

        if (allRecs?.length) {
          const avg = Math.round(
            allRecs.reduce((s, r) => s + (r.score || 0), 0) / allRecs.length
          );
          await supabase
            .from('users')
            .update({ avg_score: avg })
            .eq('id', selected.user_id);
        }
      }

      const studentName = selected.student_name || selected.studentName || 'Student';
      const surahName   = selected.surahDisplay || selected.surah || `Surah ${selected.surah_number}`;
      const action      = isRedo ? 'Redo requested' : 'Review submitted';

      alert(`✅ ${action}!\n\n${studentName} — ${surahName}\nGrade: ${isRedo ? 'Redo' : `${grade}/5`}\nFeedback sent successfully.`);

      setFeedback('');
      setGrade(4);
      setRecommendation('Excellent');
      setSelected(null);
      setIsPlaying(false);
      loadSubmissions(true);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Error: Could not submit review. Please try again.\n' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          border: `4px solid ${C.primary}22`,
          borderTop: `4px solid ${C.primary}`,
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

      {/* PAGE HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '12px', fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px 0' }}>
          Review Studio
        </p>
        <h1 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: '0 0 6px 0' }}>
          Recitation Review
        </h1>
        <p style={{ fontSize: '15px', color: C.muted, margin: 0 }}>
          {submissions.length > 0
            ? `${submissions.length} submission${submissions.length > 1 ? 's' : ''} pending your review`
            : 'All submissions have been reviewed — great work!'}
        </p>
      </div>

      {/* TWO-COLUMN LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* LEFT: QUEUE LIST */}
        <div style={{ backgroundColor: C.card, borderRadius: '20px', padding: '20px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={14} /> Review Queue ({submissions.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
            {submissions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelected(s);
                  setFeedback('');
                  setGrade(4);
                  setRecommendation('Excellent');
                  setIsPlaying(false);
                }}
                style={{
                  backgroundColor: selected?.id === s.id ? `${C.primary}10` : 'transparent',
                  border: `1px solid ${selected?.id === s.id ? C.primary : C.border}`,
                  borderRadius: '14px',
                  padding: '14px 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: '800', fontSize: '14px', color: C.text, marginBottom: '3px' }}>
                    {s.student_name || s.studentName || 'Unknown Student'}
                  </div>
                  <div style={{ fontSize: '12px', color: C.muted }}>
                    {s.surahDisplay || s.surah || `Surah ${s.surah_number}`} • Ayah {s.ayahDisplay || s.ayah || `${s.start_verse}–${s.end_verse}`}
                  </div>
                  <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>
                    Score: <span style={{ color: s.score >= 85 ? C.green : s.score >= 70 ? C.gold : C.red, fontWeight: '800' }}>{s.score}%</span>
                  </div>
                </div>
                <ChevronRight size={16} color={selected?.id === s.id ? C.primary : C.muted} />
              </button>
            ))}
            {submissions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: C.muted }}>
                <Sparkles size={32} color={C.gold} style={{ margin: '0 auto 12px', display: 'block' }} />
                <div style={{ fontWeight: '700', fontSize: '14px' }}>All caught up!</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>No pending reviews.</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: EVALUATION PANEL */}
        <div>
          {!selected ? (
            <div style={{
              backgroundColor: C.card, borderRadius: '20px', border: `1px solid ${C.border}`,
              padding: '80px 40px', textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
            }}>
              <Sparkles size={56} color={C.lilac} style={{ margin: '0 auto 20px', display: 'block' }} />
              <h2 style={{ fontSize: '22px', fontWeight: '900', color: C.text, margin: '0 0 8px 0' }}>
                Select a Student to Begin
              </h2>
              <p style={{ color: C.muted, fontSize: '15px', margin: 0 }}>
                Click any submission from the queue on the left to start your review.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* STUDENT HEADER */}
              <div style={{
                backgroundColor: C.card, borderRadius: '20px', padding: '24px 28px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                  <div style={{
                    width: '60px', height: '60px', borderRadius: '18px',
                    background: `linear-gradient(135deg, ${C.primary}, #22c55e)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '26px', fontWeight: '900', color: 'white' }}>
                      {(selected.student_name || selected.studentName || 'S')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '22px', fontWeight: '900', color: C.text, margin: '0 0 4px 0' }}>
                      {selected.student_name || selected.studentName || 'Unknown Student'}
                    </h2>
                    <p style={{ fontSize: '14px', color: C.muted, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BookOpen size={13} />
                      {selected.surahDisplay || selected.surah || `Surah ${selected.surah_number}`} • Ayah {selected.ayahDisplay || selected.ayah || `${selected.start_verse}–${selected.end_verse}`}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: C.muted, fontWeight: '700', letterSpacing: '1px', marginBottom: '4px' }}>
                    AI SCORE
                  </div>
                  <div style={{
                    fontSize: '42px', fontWeight: '900',
                    color: selected.score >= 85 ? C.green : selected.score >= 70 ? C.gold : C.red
                  }}>
                    {selected.score}%
                  </div>
                </div>
              </div>

              {/* AUDIO PLAYER */}
              <div style={{
                background: `linear-gradient(135deg, #0F1723, #1a2940)`,
                borderRadius: '20px', padding: '28px 32px',
                display: 'flex', alignItems: 'center', gap: '24px',
                border: `1px solid rgba(255,255,255,0.05)`,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
              }}>
                <button
                  onClick={togglePlay}
                  style={{
                    width: '64px', height: '64px', borderRadius: '32px',
                    backgroundColor: C.primary, border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                    boxShadow: `0 0 20px ${C.primary}55`,
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {isPlaying
                    ? <Pause size={26} color="white" fill="white" />
                    : <Play size={26} color="white" fill="white" style={{ marginLeft: '3px' }} />
                  }
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
                    {selected.surahDisplay || selected.surah || `Surah ${selected.surah_number}`} — Ayah {selected.ayahDisplay || selected.ayah || `${selected.start_verse}–${selected.end_verse}`}
                  </div>
                  <div style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                    <div style={{ width: isPlaying ? '35%' : '0%', height: '100%', backgroundColor: C.primary, borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  {!selected.audio_url && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>
                      No audio file attached to this submission.
                    </div>
                  )}
                </div>
                <audio ref={audioRef} src={selected.audio_url} onEnded={() => setIsPlaying(false)} hidden />
              </div>

              {/* AI TRANSCRIPTION & ERRORS */}
              <div style={{
                backgroundColor: C.card, borderRadius: '20px', padding: '24px 28px',
                border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '900', color: C.text, margin: '0 0 16px 0' }}>
                  AI Analysis & Transcription
                </h3>

                {selected.transcription && (
                  <div style={{ backgroundColor: C.bg, borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
                    <p style={{
                      fontSize: '28px', textAlign: 'right', color: C.text,
                      lineHeight: '2', direction: 'rtl', margin: 0, fontWeight: '500',
                      fontFamily: 'serif'
                    }}>
                      {selected.transcription}
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  {[{ label: 'Memorization', val: selected.errors?.memorization ?? selected.score },
                    { label: 'Pronunciation', val: selected.errors?.pronunciation ?? selected.score },
                    { label: 'Tajwid Rules', val: selected.errors?.tajwid ?? selected.score },
                    { label: 'Fluency & Flow', val: selected.errors?.fluency ?? selected.score }
                  ].map((metric, i) => (
                    <div key={i} style={{
                      backgroundColor: C.bg, borderRadius: '12px', padding: '16px',
                      border: `1px solid ${C.border}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: C.muted }}>{metric.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: '900', color: metric.val >= 85 ? C.green : metric.val >= 70 ? C.gold : C.red }}>{Math.round(metric.val)}%</span>
                      </div>
                      <div style={{ height: '6px', backgroundColor: '#EAE3D5', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ 
                          height: '100%', 
                          width: `${metric.val}%`, 
                          backgroundColor: metric.val >= 85 ? C.green : metric.val >= 70 ? C.gold : C.red,
                          borderRadius: '3px'
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  backgroundColor: `${C.primary}08`, borderRadius: '12px', padding: '16px',
                  border: `1px solid ${C.primary}15`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Sparkles size={16} color={C.primary} />
                    <span style={{ fontWeight: '800', color: C.primary, fontSize: '14px' }}>AI Feedback</span>
                  </div>
                  <p style={{ color: C.text, fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                    {selected.feedback || 'No feedback generated.'}
                  </p>
                </div>
              </div>

              {/* EVALUATION PANEL */}
              <div style={{
                backgroundColor: C.card, borderRadius: '20px', padding: '24px 28px',
                border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '900', color: C.text, margin: '0 0 20px 0' }}>
                  Expert Evaluation
                </h3>

                {/* Grade Buttons */}
                <label style={{ fontSize: '12px', fontWeight: '800', color: C.muted, display: 'block', marginBottom: '10px', letterSpacing: '0.5px' }}>
                  PROFICIENCY GRADE (1–5)
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setGrade(n)}
                      style={{
                        flex: 1, height: '52px', borderRadius: '14px',
                        backgroundColor: grade === n ? C.primary : C.bg,
                        border: `2px solid ${grade === n ? C.primary : C.border}`,
                        cursor: 'pointer', fontSize: '18px', fontWeight: '900',
                        color: grade === n ? 'white' : C.text,
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                      }}
                    >
                      <Star size={12} fill={grade === n ? 'white' : 'none'} color={grade === n ? 'white' : C.muted} />
                      {n}
                    </button>
                  ))}
                </div>

                {/* Recommendation */}
                <label style={{ fontSize: '12px', fontWeight: '800', color: C.muted, display: 'block', marginBottom: '10px', letterSpacing: '0.5px' }}>
                  TEACHER RECOMMENDATION
                </label>
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <select
                    value={recommendation}
                    onChange={e => setRecommendation(e.target.value)}
                    style={{
                      width: '100%', backgroundColor: C.bg, borderRadius: '14px',
                      padding: '14px 16px', fontSize: '15px', fontWeight: '600', color: C.text,
                      border: `1px solid ${C.border}`, outline: 'none',
                      boxSizing: 'border-box', fontFamily: 'inherit',
                      appearance: 'none', cursor: 'pointer'
                    }}
                  >
                    <option value="Excellent">🌟 Excellent — Ready to progress</option>
                    <option value="Good">👍 Good — Minor corrections needed</option>
                    <option value="Needs Revision">🔄 Needs Revision — Practice before re-submitting</option>
                    <option value="Practice Tajweed">📖 Practice Tajweed Rules</option>
                    <option value="Focus on Makhraj">🗣️ Focus on Makhraj Articulation</option>
                  </select>
                  <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.muted }}>▼</div>
                </div>

                {/* Feedback Text */}
                <label style={{ fontSize: '12px', fontWeight: '800', color: C.muted, display: 'block', marginBottom: '10px', letterSpacing: '0.5px' }}>
                  WRITTEN FEEDBACK
                </label>
                <textarea
                  placeholder="Write detailed, professional feedback for this student..."
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  style={{
                    width: '100%', backgroundColor: C.bg, borderRadius: '14px',
                    padding: '16px', height: '110px', fontSize: '15px',
                    border: `1px solid ${C.border}`, outline: 'none',
                    marginBottom: '20px', boxSizing: 'border-box', fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleSubmit(true)}
                    disabled={submitting}
                    style={{
                      flex: 1, height: '56px', borderRadius: '16px',
                      backgroundColor: `${C.red}12`, border: `1px solid ${C.red}30`,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      color: C.red, fontWeight: '800', fontSize: '15px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      transition: 'all 0.2s', opacity: submitting ? 0.6 : 1
                    }}
                  >
                    <RefreshCw size={17} /> Request Redo
                  </button>
                  <button
                    onClick={() => handleSubmit(false)}
                    disabled={submitting}
                    style={{
                      flex: 2, height: '56px', borderRadius: '16px',
                      backgroundColor: C.primary, border: 'none',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      color: 'white', fontWeight: '800', fontSize: '15px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: `0 4px 14px ${C.primary}40`,
                      transition: 'all 0.2s', opacity: submitting ? 0.7 : 1
                    }}
                  >
                    {submitting
                      ? 'Submitting...'
                      : <><Send size={17} /> Finalize Review</>
                    }
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}


