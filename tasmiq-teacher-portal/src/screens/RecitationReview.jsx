import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, RotateCcw, RotateCw, Send, CheckCircle, XCircle,
         ChevronDown, Clock, BookOpen, Star, Filter, Volume2 } from 'lucide-react';
import { supabase } from '../supabase';
import { useLocation } from 'react-router-dom';
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

// ── Auto-approval logic ──────────────────────────────────────
function getAutoStatus(r) {
  const score   = r.score || 0;
  const tajwid  = r.tajwid_score || score;
  // Count tajwid errors from errors JSON if available
  let tajwidErrors = 0;
  if (r.errors) {
    try {
      const e = typeof r.errors === 'string' ? JSON.parse(r.errors) : r.errors;
      if (Array.isArray(e)) tajwidErrors = e.length;
    } catch { tajwidErrors = 0; }
  }
  if (score >= 70 && tajwid >= 65 && tajwidErrors <= 5) return 'approved';
  if (score < 50) return 'flagged';
  return 'needs_review';
}

const STATUS_CONFIG = {
  approved:     { label: 'AI Approved',   bg: '#D1FAE5', color: '#065F46', dot: '#0B6E4F' },
  needs_review: { label: 'Needs Review',  bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  flagged:      { label: 'Flagged',       bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
};

// ── Score card component ─────────────────────────────────────
function ScoreCard({ label, value, color }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  return (
    <div style={{ backgroundColor: D.bg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${D.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: D.textSec }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 900, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function RecitationReview() {
  const location = useLocation();
  const audioRef = useRef(null);
  const { teacher } = useAuth(); // authenticated teacher session

  const [submissions, setSubmissions] = useState([]);
  const [history,     setHistory]     = useState([]);
  const [activeTab,   setActiveTab]   = useState('queue'); // 'queue' | 'history'
  const [selected,    setSelected]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [audioError,  setAudioError]  = useState(false);
  const [sortBy,      setSortBy]      = useState('newest');
  const [filterStatus, setFilterStatus] = useState('all');
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'approved' | 'redo'
  const [feedback,    setFeedback]    = useState('');
  const [grade,       setGrade]       = useState('Good');
  const [saved,       setSaved]       = useState(false);

  const loadSubmissions = async (refresh = false) => {
    if (!refresh) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recitations')
        .select('*, student:user_id(id, full_name, email)')
        .eq('reviewed', false)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      const list = (data || []).map(r => ({
        ...r,
        student_name: r.student_name || r.student?.full_name || r.student?.email?.split('@')[0] || 'Student',
        surahDisplay: r.surah || `Surah ${r.surah_number}`,
        ayahDisplay:  r.ayah  || `${r.start_verse}–${r.end_verse}`,
        autoStatus:   getAutoStatus(r),
      }));
      setSubmissions(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('recitations')
        .select('*, student:user_id(id, full_name, email)')
        .eq('reviewed', true)
        .order('reviewed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setHistory((data || []).map(r => ({
        ...r,
        student_name:  r.student_name || r.student?.full_name || r.student?.email?.split('@')[0] || 'Student',
        surahDisplay:  r.surah || `Surah ${r.surah_number}`,
        ayahDisplay:   r.ayah  || `${r.start_verse}–${r.end_verse}`,
        isRedo:        (r.feedback || '').toLowerCase().includes('re-record') || (r.teacher_grade || 0) <= 1,
      })));
    } catch (err) {
      console.error('History load error:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { loadSubmissions(); }, []);
  useEffect(() => { if (location.state?.recitation) setSelected(location.state.recitation); }, [location.state]);
  useEffect(() => { if (activeTab === 'history' && history.length === 0) loadHistory(); }, [activeTab]);

  // ── Stop & reset audio whenever selected submission changes ──────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError(false);
    if (selected?.audio_url) {
      audio.load(); // force reload the new source
    }
  }, [selected?.id]); // only fire when the selected record changes

  // Sort + filter
  const displayed = submissions
    .filter(s => filterStatus === 'all' || s.autoStatus === filterStatus)
    .sort((a, b) => {
      if (sortBy === 'lowest') return (a.score || 0) - (b.score || 0);
      if (sortBy === 'flagged') return a.autoStatus === 'flagged' ? -1 : 1;
      return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
    });

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || audioError) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setAudioError(true));
    }
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio || audioError) return;
    audio.currentTime = 0;
    audio.play()
      .then(() => setIsPlaying(true))
      .catch(() => setAudioError(true));
  };

  const handleSkip = (seconds) => {
    const audio = audioRef.current;
    if (!audio || audioError) return;
    audio.currentTime = Math.min(audio.duration || 0, Math.max(0, audio.currentTime + seconds));
  };

  // Seek when clicking on the waveform
  const waveformRef = useRef(null);
  const handleWaveformClick = useCallback((e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || audioError) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
    if (!isPlaying) {
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setAudioError(true));
    }
  }, [isPlaying, audioError]);

  // Format seconds → m:ss
  const fmt = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleAction = async (action) => {
    if (!selected) return;

    // Require feedback when requesting re-recording (REPEAT)
    if (action === 'redo' && (!feedback || !feedback.trim())) {
      alert('Please provide written feedback explaining what the student needs to improve before requesting a re-recording.');
      return;
    }

    // Resolve the authenticated teacher's UUID
    const teacherId = teacher?.id || teacher?.uid || null;

    setSubmitting(true);
    try {
      const isPassDecision  = action === 'approve';
      const teacherStatus   = isPassDecision ? 'PASS' : 'REPEAT';
      const statusValue     = isPassDecision ? 'approved' : 'repeat';
      const feedbackText    = isPassDecision
        ? (feedback.trim() ? `[PASS] ${feedback.trim()}` : 'Recitation approved.')
        : `[REPEAT REQUIRED] ${feedback.trim()}`;
      const gradeMap = { Excellent: 5, Good: 4, 'Needs Improvement': 3, 'Re-record Required': 1 };

      // ── 1. Update recitation with teacher decision ────────────────────────
      const { error: recErr } = await supabase
        .from('recitations')
        .update({
          reviewed:         true,
          status:           statusValue,
          teacher_grade:    isPassDecision ? (gradeMap[grade] || 5) : 1,
          feedback:         feedbackText,
          reviewed_at:      new Date().toISOString(),
          // explicit teacher evaluation columns
          teacher_id:       teacherId,
          teacher_status:   teacherStatus,
        })
        .eq('id', selected.id);

      if (recErr) throw recErr;

      // ── 2. Create notification for the student ────────────────────────────
      // student is identified via recitations.user_id — the authenticated student UUID
      if (selected.user_id) {
        const notifTitle = isPassDecision
          ? 'Teacher Assessment Completed'
          : 'Teacher Requested Re-recording';
        const notifBody = isPassDecision
          ? 'Your Tasmiq assessment has been approved by your teacher.'
          : 'Your teacher has requested you to re-record your Tasmiq assessment. Tap to view the feedback.';

        const { error: notifErr } = await supabase
          .from('notifications')
          .insert([{
            user_id:       selected.user_id,   // student UUID — looked up from the recitation record
            title:         notifTitle,
            body:          notifBody,           // correct column name (NOT message)
            type:          'TEACHER_TASMIQ_EVALUATION',
            teacher_id:    teacherId,           // the evaluating teacher's UUID
            recitation_id: selected.id,        // deep-link: navigate to this assessment
            is_read:       false,
            created_at:    new Date().toISOString(),
          }]);

        if (notifErr) {
          // Non-fatal: evaluation already saved — just log
          console.error('[RecitationReview] Notification insert failed:', notifErr.message);
        }

        // ── 3. Update student avg_score ───────────────────────────────────
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

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setFeedback('');
      setGrade('Good');
      setSelected(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAudioError(false);
      loadSubmissions(true);
      setHistory([]); // invalidate history cache so it reloads next time
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Parse score metrics from selected record
  const getMetrics = (r) => {
    if (!r) return { mem: 0, pron: 0, tajwid: 0, fluency: 0, overall: 0 };
    let e = {};
    if (r.errors) { try { e = typeof r.errors === 'string' ? JSON.parse(r.errors) : r.errors; } catch {} }
    const s = r.score || 0;
    return {
      mem:     r.memorization_score  ?? e.memorization  ?? s,
      pron:    r.pronunciation_score ?? e.pronunciation  ?? s,
      tajwid:  r.tajwid_score        ?? e.tajwid         ?? s,
      fluency: r.fluency_score       ?? e.fluency        ?? s,
      overall: s,
    };
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <div style={{ width:40, height:40, borderRadius:'50%', border:`3px solid ${D.emeraldLight}`, borderTop:`3px solid ${D.emerald}`, animation:'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  const m = getMetrics(selected);
  const st = selected ? STATUS_CONFIG[selected.autoStatus] : null;

  return (
    <div style={{ maxWidth:1300, margin:'0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, fontWeight:800, color:D.emerald, textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:6 }}>Recitation Assessment</div>
        <h1 style={{ fontSize:28, fontWeight:900, color:D.text, margin:'0 0 4px' }}>Tasmiq Review</h1>
        <p style={{ fontSize:14, color:D.textSec, margin:0 }}>
          {submissions.length} pending review · {history.length > 0 ? `${history.length} reviewed` : 'history not loaded'}
          {saved && <span style={{ marginLeft:12, color:D.emerald, fontWeight:700 }}>✓ Saved successfully</span>}
        </p>
      </div>

      {/* ── Tab Switcher ── */}
      <div style={{ display:'flex', gap:4, marginBottom:20, backgroundColor:D.bg, borderRadius:12, padding:4, width:'fit-content', border:`1px solid ${D.border}` }}>
        {[
          { key:'queue',   label:`Pending (${submissions.length})` },
          { key:'history', label:'History' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding:'8px 20px', borderRadius:9, border:'none', cursor:'pointer',
            fontWeight:700, fontSize:13,
            backgroundColor: activeTab === tab.key ? D.emerald : 'transparent',
            color: activeTab === tab.key ? 'white' : D.textSec,
            boxShadow: activeTab === tab.key ? `0 2px 8px ${D.emerald}40` : 'none',
            transition:'all 0.15s',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ HISTORY TAB ══ */}
      {activeTab === 'history' && (
        <div style={{ backgroundColor:D.card, borderRadius:16, border:`1px solid ${D.border}`, boxShadow:'0 2px 10px rgba(0,0,0,0.05)', overflow:'hidden' }}>
          {/* History header */}
          <div style={{ padding:'16px 20px', borderBottom:`1px solid ${D.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <span style={{ fontSize:14, fontWeight:800, color:D.text }}>Review History</span>
              <span style={{ fontSize:12, color:D.textSec, marginLeft:8 }}>({history.length} records)</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {['all','approved','redo'].map(f => (
                <button key={f} onClick={() => setHistoryFilter(f)} style={{
                  padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                  backgroundColor: historyFilter === f ? D.emeraldDark : D.bg,
                  color: historyFilter === f ? 'white' : D.textSec,
                }}>
                  {f === 'all' ? 'All' : f === 'approved' ? '✅ Approved' : '🔄 Re-record'}
                </button>
              ))}
              <button onClick={loadHistory} style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${D.border}`, cursor:'pointer', fontSize:12, fontWeight:700, backgroundColor:'transparent', color:D.emerald }}>
                ↻ Refresh
              </button>
            </div>
          </div>

          {historyLoading ? (
            <div style={{ padding:40, textAlign:'center' }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:`3px solid ${D.emeraldLight}`, borderTop:`3px solid ${D.emerald}`, animation:'spin 1s linear infinite', margin:'0 auto' }} />
            </div>
          ) : history.filter(r => historyFilter === 'all' || (historyFilter === 'redo' ? r.isRedo : !r.isRedo)).length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:D.textSec }}>
              <CheckCircle size={40} color={D.emeraldLight} style={{ margin:'0 auto 12px', display:'block' }} />
              No history records found.
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 80px 100px 120px', gap:0, backgroundColor:D.bg, padding:'10px 20px', borderBottom:`1px solid ${D.border}` }}>
                {['Student','Surah / Ayah','Date','Score','Grade','Status'].map(h => (
                  <span key={h} style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
                ))}
              </div>
              <div style={{ maxHeight:'70vh', overflowY:'auto' }}>
                {history
                  .filter(r => historyFilter === 'all' || (historyFilter === 'redo' ? r.isRedo : !r.isRedo))
                  .map((r, i) => {
                    const gradeVal = r.teacher_grade || 0;
                    const gradeLabel = gradeVal >= 5 ? 'Excellent' : gradeVal >= 4 ? 'Good' : gradeVal >= 3 ? 'Needs Improvement' : gradeVal >= 1 ? 'Re-record' : '—';
                    const scoreColor = (r.score||0) >= 70 ? D.emerald : (r.score||0) >= 50 ? D.amber : D.red;
                    return (
                      <div key={r.id} style={{
                        display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 80px 100px 120px',
                        gap:0, padding:'14px 20px', alignItems:'center',
                        borderBottom:`1px solid ${D.border}`,
                        backgroundColor: i % 2 === 0 ? 'white' : D.bg,
                        transition:'background 0.1s',
                      }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = D.emeraldLight + '40'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'white' : D.bg}
                      >
                        {/* Student */}
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:8, backgroundColor:D.emeraldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:D.emeraldDark, flexShrink:0 }}>
                            {(r.student_name||'S')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:D.text }}>{r.student_name}</div>
                            <div style={{ fontSize:11, color:D.textSec }}>{r.student?.email || ''}</div>
                          </div>
                        </div>
                        {/* Surah */}
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:D.text }}>{r.surahDisplay}</div>
                          <div style={{ fontSize:11, color:D.textSec }}>Ayah {r.ayahDisplay}</div>
                        </div>
                        {/* Date */}
                        <div style={{ fontSize:12, color:D.textSec }}>
                          {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                        </div>
                        {/* Score */}
                        <div style={{ fontSize:15, fontWeight:900, color:scoreColor }}>{r.score || 0}%</div>
                        {/* Grade */}
                        <div style={{ fontSize:12, fontWeight:700, color:D.textSec }}>{gradeLabel}</div>
                        {/* Status */}
                        <div>
                          <span style={{
                            padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:800,
                            backgroundColor: r.isRedo ? '#FEE2E2' : '#D1FAE5',
                            color: r.isRedo ? '#991B1B' : '#065F46',
                          }}>
                            {r.isRedo ? '🔄 Re-record' : '✅ Approved'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ QUEUE TAB ══ */}
      {activeTab === 'queue' && (
      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20, alignItems:'start' }}>

        {/* ══ LEFT PANEL — Review Queue ══ */}
        <div style={{ backgroundColor:D.card, borderRadius:16, border:`1px solid ${D.border}`, boxShadow:'0 2px 10px rgba(0,0,0,0.05)', overflow:'hidden' }}>
          {/* Queue header */}
          <div style={{ padding:'16px 16px 12px', borderBottom:`1px solid ${D.border}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:800, color:D.text }}>Queue ({displayed.length})</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize:11, fontWeight:700, color:D.emerald, border:`1px solid ${D.emeraldLight}`, borderRadius:6, padding:'3px 6px', backgroundColor:D.card, cursor:'pointer', outline:'none' }}>
                <option value="newest">Newest</option>
                <option value="lowest">Lowest Score</option>
                <option value="flagged">Flagged First</option>
              </select>
            </div>
            {/* Filter chips */}
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {['all','approved','needs_review','flagged'].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)} style={{
                  padding:'3px 10px', borderRadius:20, border:'none', cursor:'pointer', fontSize:11, fontWeight:700,
                  backgroundColor: filterStatus === f ? D.emerald : D.bg,
                  color: filterStatus === f ? 'white' : D.textSec,
                }}>
                  {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label}
                </button>
              ))}
            </div>
          </div>

          {/* Queue items */}
          <div style={{ maxHeight:'68vh', overflowY:'auto' }}>
            {displayed.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:D.textSec }}>
                <BookOpen size={36} color={D.border} style={{ margin:'0 auto 12px', display:'block' }} />
                No submissions match the filter.
              </div>
            ) : displayed.map(s => {
              const cfg = STATUS_CONFIG[s.autoStatus];
              const isActive = selected?.id === s.id;
              return (
                <button key={s.id} onClick={() => { setSelected(s); setFeedback(''); setGrade('Good'); }} style={{
                  width:'100%', textAlign:'left', border:'none', cursor:'pointer',
                  padding:'13px 16px',
                  backgroundColor: isActive ? D.emeraldLight : 'transparent',
                  borderLeft: `3px solid ${isActive ? D.emerald : 'transparent'}`,
                  borderBottom:`1px solid ${D.border}`,
                  transition:'all 0.15s',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:800, color:D.text }}>{s.student_name}</span>
                    <span style={{ fontSize:11, fontWeight:800, color:cfg.color, backgroundColor:cfg.bg, padding:'2px 7px', borderRadius:20 }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize:12, color:D.textSec, marginBottom:3 }}>{s.surahDisplay} • {s.ayahDisplay}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:D.textSec }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-GB') : '—'}</span>
                    <span style={{ fontSize:12, fontWeight:800, color: (s.score||0) >= 70 ? D.green : (s.score||0) >= 50 ? D.amber : D.red }}>{s.score || 0}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ══ CENTER PANEL — Assessment ══ */}
        {!selected ? (
          <div style={{ backgroundColor:D.card, borderRadius:16, border:`1px solid ${D.border}`, padding:80, textAlign:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
            <BookOpen size={52} color={D.emeraldLight} style={{ margin:'0 auto 16px', display:'block' }} />
            <h3 style={{ fontSize:18, fontWeight:800, color:D.text, margin:'0 0 6px' }}>Select a submission</h3>
            <p style={{ color:D.textSec, margin:0, fontSize:14 }}>Choose a student from the queue to begin assessment.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Student Header Card */}
            <div style={{ backgroundColor:D.card, borderRadius:16, padding:'20px 24px', border:`1px solid ${D.border}`, boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:52, height:52, borderRadius:14, background:`linear-gradient(135deg, ${D.emerald}, ${D.emeraldDark})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'white', flexShrink:0 }}>
                    {(selected.student_name || 'S')[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 style={{ fontSize:20, fontWeight:900, color:D.text, margin:'0 0 2px' }}>{selected.student_name}</h2>
                    <div style={{ fontSize:13, color:D.textSec, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <BookOpen size={13} />
                      {selected.surahDisplay} • Ayah {selected.ayahDisplay}
                      <span>•</span>
                      {selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        backgroundColor: selected.recording_mode === 'advanced' ? '#EDE9FE' : D.emeraldLight,
                        color: selected.recording_mode === 'advanced' ? '#6D28D9' : D.emeraldDark,
                      }}>
                        {selected.recording_mode === 'advanced' ? 'Advanced Mode' : 'Beginner Mode'}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign:'center', backgroundColor: st?.bg, borderRadius:12, padding:'10px 20px', border:`1px solid ${st?.color}30` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:st?.color, letterSpacing:0.8, marginBottom:2 }}>AI STATUS</div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', backgroundColor:st?.dot }} />
                    <span style={{ fontSize:13, fontWeight:800, color:st?.color }}>{st?.label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Player */}
            <div style={{ background:`linear-gradient(135deg, ${D.emeraldDark} 0%, #032D20 100%)`, borderRadius:16, padding:'22px 24px', boxShadow:'0 4px 16px rgba(6,78,59,0.25)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.55)', letterSpacing:1.5, marginBottom:14 }}>AUDIO PLAYBACK</div>

              {/* Error or missing audio fallback */}
              {(!selected.audio_url || audioError) ? (
                <div style={{ backgroundColor:'rgba(239,68,68,0.12)', borderRadius:12, padding:'14px 18px', border:'1px solid rgba(239,68,68,0.25)', display:'flex', alignItems:'center', gap:10 }}>
                  <Volume2 size={18} color="#EF4444" />
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#FCA5A5' }}>
                      {audioError ? 'Unable to load audio recording.' : 'Audio recording unavailable.'}
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:3 }}>
                      {audioError
                        ? 'The audio file could not be played. It may be corrupted or inaccessible.'
                        : 'Student did not submit an audio file with this recitation.'}
                    </div>
                    {selected.audio_url && (
                      <a href={selected.audio_url} target="_blank" rel="noreferrer"
                        style={{ fontSize:10, color:'#FCA5A5', marginTop:4, display:'block', textDecoration:'underline' }}>
                        Try direct link ↗
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Controls row */}
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                    {/* Restart */}
                    <button onClick={handleRestart} title="Restart" style={{
                      width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.08)', border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.16)'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.08)'}
                    >
                      <RotateCcw size={16} color="white" />
                    </button>

                    {/* Play / Pause */}
                    <button onClick={togglePlay} style={{
                      width:52, height:52, borderRadius:26, backgroundColor:D.emerald, border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                      boxShadow:`0 0 18px ${D.emerald}60`, transition:'transform 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.transform='scale(1.08)'}
                    onMouseOut={e => e.currentTarget.style.transform='scale(1)'}
                    >
                      {isPlaying ? <Pause size={22} color="white" fill="white" /> : <Play size={22} color="white" fill="white" style={{ marginLeft:2 }} />}
                    </button>

                    {/* Skip +5s */}
                    <button onClick={() => handleSkip(5)} title="Forward 5s" style={{
                      width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.08)', border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.16)'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.08)'}
                    >
                      <RotateCw size={16} color="white" />
                    </button>

                    {/* Track info */}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'white', marginBottom:2 }}>
                        {selected.surahDisplay} — Ayah {selected.ayahDisplay}
                      </div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>
                        {fmt(currentTime)} / {fmt(duration)}
                      </div>
                    </div>

                    <Volume2 size={16} color="rgba(255,255,255,0.35)" />
                  </div>

                  {/* Seekable Waveform */}
                  <div
                    ref={waveformRef}
                    onClick={handleWaveformClick}
                    style={{ display:'flex', alignItems:'center', gap:2, height:36, cursor:'pointer', userSelect:'none' }}
                    title="Click to seek"
                  >
                    {Array.from({ length: 48 }, (_, i) => {
                      const barProgress = duration > 0 ? currentTime / duration : 0;
                      const barRatio = i / 47;
                      const isPast = barRatio <= barProgress;
                      return (
                        <div key={i} style={{
                          flex:1, borderRadius: 2,
                          height: `${22 + Math.sin(i * 0.75) * 10 + Math.sin(i * 0.28) * 7}px`,
                          backgroundColor: isPast ? D.gold : 'rgba(255,255,255,0.22)',
                          transition: 'background-color 0.08s',
                        }} />
                      );
                    })}
                  </div>
                </>
              )}

              {/* Hidden audio element with all event listeners */}
              <audio
                ref={audioRef}
                src={selected.audio_url || ''}
                onEnded={() => { setIsPlaying(false); setCurrentTime(duration); }}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.target.duration)}
                onError={() => { setAudioError(true); setIsPlaying(false); }}
                onPause={() => setIsPlaying(false)}
                preload="metadata"
                hidden
              />
            </div>

            {/* Official Assessment Notice (AI Percentage hidden to ensure independent teacher evaluation) */}
            <div style={{ backgroundColor:D.card, borderRadius:16, padding:'20px 24px', border:`1px solid ${D.border}`, boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ padding:'16px 20px', backgroundColor: '#F4F9F6', borderRadius:12, border:`1px solid ${D.emeraldLight}`, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, color:D.emeraldDark, marginBottom:4 }}>
                  📋 Official Teacher Assessment Mode
                </div>
                <div style={{ fontSize:12, color:D.textSec, lineHeight:1.6 }}>
                  AI score percentage is hidden to ensure an independent evaluation. Listen to the recording above and make your official decision: <b>PASS</b> or <b>REPEAT</b>.
                </div>
              </div>

              {/* Transcription (Arabic Text) */}
              {selected.transcription && (
                <div style={{ backgroundColor:'#F9F7F0', borderRadius:12, padding:'16px 18px', marginBottom:16, border:`1px solid #EDE8D0` }}>
                  <div style={{ fontSize:12, fontWeight:700, color:D.textSec, marginBottom:8, letterSpacing:0.5 }}>RECITED TEXT (TRANSCRIPTION)</div>
                  <p style={{ fontSize:22, textAlign:'right', color:D.text, lineHeight:1.9, direction:'rtl', margin:0, fontFamily:'serif', fontWeight:500 }}>
                    {selected.transcription}
                  </p>
                </div>
              )}
            </div>

              {/* AI Feedback structured */}
              <div style={{ backgroundColor:`${D.emeraldLight}60`, borderRadius:12, padding:'14px 16px', border:`1px solid ${D.emeraldLight}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <span style={{ fontSize:16 }}>🤖</span>
                  <span style={{ fontSize:13, fontWeight:800, color:D.emeraldDark }}>AI Feedback</span>
                </div>
                <p style={{ fontSize:13, color:D.text, lineHeight:1.7, margin:0 }}>
                  {selected.feedback || 'No AI feedback generated for this submission.'}
                </p>
              </div>
            </div>

            {/* Teacher Evaluation Panel */}
            <div style={{ backgroundColor:D.card, borderRadius:16, padding:'20px 24px', border:`1px solid ${D.border}`, boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:D.text, marginBottom:16 }}>Expert Evaluation</div>

              {/* Grade selector */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:D.textSec, marginBottom:8, letterSpacing:0.5 }}>TEACHER RECOMMENDATION</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {['Excellent', 'Good', 'Needs Improvement', 'Re-record Required'].map(g => (
                    <button key={g} onClick={() => setGrade(g)} style={{
                      padding:'8px 14px', borderRadius:20, border:`1.5px solid ${grade === g ? D.emerald : D.border}`,
                      backgroundColor: grade === g ? D.emeraldLight : 'transparent',
                      color: grade === g ? D.emeraldDark : D.textSec,
                      fontWeight: grade === g ? 800 : 600, fontSize:12, cursor:'pointer', transition:'all 0.15s',
                    }}>
                      {g === 'Excellent' ? '🌟' : g === 'Good' ? '👍' : g === 'Needs Improvement' ? '📖' : '🔄'} {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback textarea */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:D.textSec, marginBottom:8, letterSpacing:0.5 }}>WRITTEN FEEDBACK</div>
                <textarea
                  placeholder="Write your professional feedback for the student…"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  style={{
                    width:'100%', height:90, borderRadius:10, padding:'10px 12px',
                    border:`1px solid ${D.border}`, backgroundColor:D.bg,
                    fontSize:13, color:D.text, fontFamily:'inherit', resize:'vertical', outline:'none',
                    boxSizing:'border-box',
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => handleAction('redo')} disabled={submitting} style={{
                  flex:1, padding:'13px', borderRadius:12, border:`1.5px solid ${D.red}30`,
                  backgroundColor:`${D.red}10`, color:D.red, fontWeight:800, fontSize:13,
                  cursor:submitting ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                  opacity: submitting ? 0.6 : 1,
                }}>
                  <RefreshCw size={15} /> 🔄 REPEAT (Request Re-recording)
                </button>
                <button onClick={() => handleAction('approve')} disabled={submitting} style={{
                  flex:2, padding:'13px', borderRadius:12, border:'none',
                  background:`linear-gradient(135deg, ${D.emerald}, ${D.emeraldDark})`,
                  color:'white', fontWeight:800, fontSize:13,
                  cursor:submitting ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                  opacity: submitting ? 0.7 : 1,
                  boxShadow:`0 4px 14px ${D.emerald}40`,
                }}>
                  {submitting ? '...' : <><CheckCircle size={15} /> ✅ PASS (Approve Assessment)</>}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
      )} {/* end queue tab */}
    </div>
  );
}


