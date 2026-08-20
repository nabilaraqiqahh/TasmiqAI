import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Clock, Search, ChevronRight, RefreshCw, BookOpen } from 'lucide-react';

const D = {
  emerald:      '#0B6E4F',
  emeraldDark:  '#064E3B',
  emeraldLight: '#D1FAE5',
  gold:         '#D4AF37',
  bg:           '#FEFCE8',
  card:         '#FFFFFF',
  text:         '#1F2937',
  textSec:      '#6B7280',
  border:       '#E5E7EB',
  red:          '#EF4444',
  amber:        '#F59E0B',
};

export default function MurajaahMonitoring() {
  const navigate = useNavigate();
  const [loading,       setLoading]       = useState(true);
  const [sessions,      setSessions]      = useState([]);   // murajaah_sessions
  const [students,      setStudents]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [selectedClass, setSelectedClass] = useState('All');
  const [search,        setSearch]        = useState('');
  const [tab,           setTab]           = useState('sessions'); // 'sessions' | 'roster'

  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [classRes, memberRes, studentRes, sessionRes] = await Promise.all([
        supabase.from('classes').select('*'),
        supabase.from('class_members').select('*'),
        supabase.from('users').select('*').eq('role', 'student'),
        // Don't use FK join — fetch separately to avoid FK mismatch errors
        supabase.from('murajaah_sessions')
          .select('*')
          .order('session_date', { ascending: false })
          .limit(200),
      ]);

      if (sessionRes.error) {
        console.error('murajaah_sessions error:', sessionRes.error);
        setError(`Sessions table error: ${sessionRes.error.message}`);
      }

      const classesData  = classRes.data  || [];
      const membersData  = memberRes.data || [];
      const studentsData = studentRes.data || [];
      const sessionsData = sessionRes.data || [];

      // Build student lookup by id
      const studentById = {};
      studentsData.forEach(s => {
        studentById[s.id] = {
          ...s,
          name: s.full_name || s.email?.split('@')[0] || 'Student',
        };
      });

      // Build membership lookup
      const membersByStudent = {};
      membersData.forEach(m => {
        membersByStudent[m.student_id] = m.class_id;
      });

      const classById = {};
      classesData.forEach(c => { classById[c.id] = c; });

      setClasses(classesData);

      // Build student list with class info
      const studentList = studentsData.map(s => ({
        ...s,
        name:      s.full_name || s.email?.split('@')[0] || 'Student',
        classId:   membersByStudent[s.id] || null,
        className: classById[membersByStudent[s.id]]?.name || 'Unassigned',
      }));
      setStudents(studentList);

      // Enrich sessions
      const enriched = sessionsData.map(sess => {
        const stu = studentById[sess.student_id] || {};
        return {
          ...sess,
          studentName: stu.full_name || stu.email?.split('@')[0] || `Student`,
          classId:     membersByStudent[sess.student_id] || null,
          className:   classById[membersByStudent[sess.student_id]]?.name || '—',
        };
      });
      setSessions(enriched);

    } catch (err) {
      console.error('MurajaahMonitoring error:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ── Filters ──────────────────────────────────────────────────
  const filteredSessions = sessions.filter(s => {
    const matchClass  = selectedClass === 'All' || s.classId === selectedClass;
    const matchSearch = (s.studentName || '').toLowerCase().includes(search.toLowerCase());
    return matchClass && matchSearch;
  });

  const completedSessions = filteredSessions.filter(s => s.status === 'completed');
  const inProgressSessions = filteredSessions.filter(s => s.status === 'in_progress');

  const statusBadge = (status, pct) => {
    if (status === 'completed') return { bg: D.emeraldLight, color: D.emeraldDark, label: '✅ Completed' };
    if ((pct || 0) >= 50)       return { bg: '#FEF3C7',       color: '#92400E',     label: '⏳ In Progress' };
    return                              { bg: '#FEE2E2',       color: '#991B1B',     label: '⚠️ Low Progress' };
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <div style={{ width:40, height:40, borderRadius:'50%', border:`3px solid ${D.emeraldLight}`, borderTop:`3px solid ${D.emerald}`, animation:'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth:1200, margin:'0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, fontWeight:800, color:D.emerald, textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:6 }}>Revision Monitoring</div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:900, color:D.text, margin:'0 0 4px' }}>Murajaah Review</h1>
            <p style={{ fontSize:14, color:D.textSec, margin:0 }}>
              {completedSessions.length} completed · {inProgressSessions.length} in progress
            </p>
          </div>
          <button onClick={loadData} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10, border:`1px solid ${D.border}`, backgroundColor:D.card, color:D.emerald, fontWeight:700, fontSize:13, cursor:'pointer' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ backgroundColor:'#FEE2E2', borderRadius:12, padding:'12px 16px', marginBottom:16, color:'#991B1B', fontSize:13, fontWeight:600, border:'1px solid #FECACA' }}>
          ⚠️ {error} — Run ADD_MURAJAAH_PROGRESS.sql in Supabase if table is missing columns.
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {[
          { label:'Total Sessions',      value: filteredSessions.length,      color: D.emerald,     bg: D.emeraldLight },
          { label:'Completed',           value: completedSessions.length,     color: D.emeraldDark, bg: D.emeraldLight },
          { label:'In Progress',         value: inProgressSessions.length,    color: D.gold,        bg: '#FEF9C3' },
          { label:'Average Completion',  value: filteredSessions.length > 0
              ? Math.round(filteredSessions.reduce((s,r) => s + (r.progress_percentage||0), 0) / filteredSessions.length) + '%'
              : '—',                                                           color: '#4A90A4',     bg: '#EFF6FF' },
        ].map((card, i) => (
          <div key={i} style={{ backgroundColor:D.card, borderRadius:14, padding:'18px 20px', border:`1px solid ${D.border}`, borderTop:`3px solid ${card.color}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 }}>{card.label}</div>
            <div style={{ fontSize:28, fontWeight:900, color:card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:18, backgroundColor:D.bg, borderRadius:10, padding:4, width:'fit-content', border:`1px solid ${D.border}` }}>
        {[
          { key:'sessions', label:`Sessions (${filteredSessions.length})` },
          { key:'roster',   label:`Student Roster (${students.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'7px 18px', borderRadius:7, border:'none', cursor:'pointer',
            fontWeight:700, fontSize:13, transition:'all 0.15s',
            backgroundColor: tab === t.key ? D.emerald : 'transparent',
            color: tab === t.key ? 'white' : D.textSec,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:18, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', flex:1, backgroundColor:D.card, borderRadius:10, padding:'0 14px', border:`1px solid ${D.border}`, maxWidth:300 }}>
          <Search size={16} color={D.textSec} style={{ marginRight:8 }} />
          <input type="text" placeholder="Search student…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex:1, border:'none', outline:'none', padding:'11px 0', fontSize:13, color:D.text, background:'none' }} />
        </div>
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{
          padding:'10px 14px', borderRadius:10, border:`1px solid ${D.border}`,
          backgroundColor:D.card, color:D.text, fontSize:13, fontWeight:600, outline:'none', cursor:'pointer',
        }}>
          <option value="All">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* ── SESSIONS TAB ── */}
      {tab === 'sessions' && (
        <div style={{ backgroundColor:D.card, borderRadius:16, border:`1px solid ${D.border}`, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 80px 100px 110px 90px', padding:'10px 20px', backgroundColor:D.bg, borderBottom:`1px solid ${D.border}` }}>
            {['Student','Class','Surah','Ayahs','Reps','Progress','Status'].map(h => (
              <span key={h} style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
            ))}
          </div>

          {filteredSessions.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:D.textSec }}>
              <BookOpen size={36} color={D.emeraldLight} style={{ margin:'0 auto 14px', display:'block' }} />
              <div style={{ fontSize:15, fontWeight:700, color:D.text, marginBottom:6 }}>No Murajaah Sessions Yet</div>
              <div style={{ fontSize:13, color:D.textSec, maxWidth:340, margin:'0 auto' }}>
                Sessions will appear here once students complete Murajaah in the mobile app.
                {sessions.length === 0 && (
                  <div style={{ marginTop:10, padding:'10px 14px', backgroundColor:'#FEF3C7', borderRadius:8, fontSize:12, color:'#92400E' }}>
                    Make sure you ran <strong>ADD_MURAJAAH_PROGRESS.sql</strong> in Supabase to add the required columns.
                  </div>
                )}
              </div>
            </div>
          ) : filteredSessions.map((sess, i) => {
            const badge = statusBadge(sess.status, sess.progress_percentage);
            const pct = sess.progress_percentage || 0;
            const surahNum = sess.surah || '—';
            return (
              <div key={sess.id} style={{
                display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 80px 100px 110px 90px',
                padding:'14px 20px', alignItems:'center',
                borderBottom: i < filteredSessions.length - 1 ? `1px solid ${D.border}` : 'none',
                backgroundColor: i % 2 === 0 ? 'white' : D.bg,
                transition:'background 0.1s',
              }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = `${D.emeraldLight}50`}
              onMouseOut={e => e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'white' : D.bg}
              >
                {/* Student */}
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:8, backgroundColor:D.emeraldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:D.emeraldDark, flexShrink:0 }}>
                    {(sess.studentName||'S')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:D.text }}>{sess.studentName}</div>
                    <div style={{ fontSize:11, color:D.textSec }}>
                      {sess.session_date ? new Date(sess.session_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:13, color:D.text }}>{sess.className}</div>
                <div style={{ fontSize:13, fontWeight:600, color:D.text }}>Surah {surahNum}</div>
                <div style={{ fontSize:13, fontWeight:700, color:D.text }}>{sess.completed_ayahs || 0}</div>
                <div style={{ fontSize:13, fontWeight:700, color:D.emerald }}>{sess.total_reps || 0}</div>
                {/* Progress bar */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:D.textSec }}>{pct}%</span>
                  </div>
                  <div style={{ height:5, backgroundColor:D.emeraldLight, borderRadius:3 }}>
                    <div style={{ height:5, width:`${pct}%`, backgroundColor: pct >= 100 ? D.emerald : D.gold, borderRadius:3 }} />
                  </div>
                </div>
                <span style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, backgroundColor:badge.bg, color:badge.color }}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ROSTER TAB ── */}
      {tab === 'roster' && (
        <div style={{ backgroundColor:D.card, borderRadius:16, border:`1px solid ${D.border}`, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 80px 100px 80px 100px', padding:'10px 20px', backgroundColor:D.bg, borderBottom:`1px solid ${D.border}` }}>
            {['Student','Class','Sessions','Total Reps','Avg %','Status'].map(h => (
              <span key={h} style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
            ))}
          </div>
          {students.filter(s => (s.name||'').toLowerCase().includes(search.toLowerCase()) && (selectedClass === 'All' || s.classId === selectedClass)).map((stu, i) => {
            const stuSessions = sessions.filter(s => s.student_id === stu.id);
            const completed   = stuSessions.filter(s => s.status === 'completed').length;
            const totalReps   = stuSessions.reduce((s, r) => s + (r.total_reps||0), 0);
            const avgPct      = stuSessions.length > 0 ? Math.round(stuSessions.reduce((s,r) => s + (r.progress_percentage||0),0) / stuSessions.length) : 0;
            const badge = stuSessions.length === 0 ? { bg:'#F3F4F6', color:'#9CA3AF', label:'No Sessions' }
                        : completed > 0           ? { bg:D.emeraldLight, color:D.emeraldDark, label:'Active' }
                        : { bg:'#FEF3C7', color:'#92400E', label:'Started' };
            return (
              <div key={stu.id} style={{
                display:'grid', gridTemplateColumns:'2fr 1.5fr 80px 100px 80px 100px',
                padding:'13px 20px', alignItems:'center',
                borderBottom: i < students.length - 1 ? `1px solid ${D.border}` : 'none',
                backgroundColor: i % 2 === 0 ? 'white' : D.bg,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:8, backgroundColor:D.emeraldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:D.emeraldDark, flexShrink:0 }}>
                    {(stu.name||'S')[0].toUpperCase()}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:D.text }}>{stu.name}</div>
                </div>
                <div style={{ fontSize:13, color:D.text }}>{stu.className}</div>
                <div style={{ fontSize:13, fontWeight:700, color:D.emerald }}>{stuSessions.length}</div>
                <div style={{ fontSize:13, fontWeight:700, color:D.text }}>{totalReps}</div>
                <div style={{ fontSize:13, fontWeight:700, color: avgPct >= 80 ? D.emerald : avgPct >= 50 ? D.gold : D.red }}>{stuSessions.length > 0 ? avgPct + '%' : '—'}</div>
                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, backgroundColor:badge.bg, color:badge.color }}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

