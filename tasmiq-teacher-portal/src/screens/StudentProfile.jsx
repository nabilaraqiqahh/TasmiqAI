import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { ArrowLeft, User, Mail, Calendar, Award, BookOpen, Star, TrendingUp, Play, Pause, AlertTriangle, Lightbulb } from 'lucide-react';

const C = {
  bg: '#F5F2E9',
  card: '#FFFFFF',
  primary: '#10B981',
  gold: '#C9A84C',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#10B981',
  border: '#EAE3D5',
  dark: '#1E293B'
};

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [recitations, setRecitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'weaknesses' | 'notes'
  const [isPlaying, setIsPlaying] = useState(null); // recitation id
  const [notes, setNotes] = useState('');
  const audioRef = useRef(null);

  useEffect(() => {
    loadStudentData();
  }, [id]);

  const loadStudentData = async () => {
    try {
      setLoading(true);
      // Fetch student info
      const { data: studentData, error: studentError } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (studentError) throw studentError;
      setStudent(studentData);

      // Fetch recitations — actual column is user_id, order by submitted_at
      const { data: recs, error: recsError } = await supabase
        .from('recitations')
        .select('*')
        .eq('user_id', id)
        .order('submitted_at', { ascending: false });

      if (recsError) throw recsError;
      setRecitations(recs || []);

      const savedNotes = localStorage.getItem(`student_notes_${id}`);
      if (savedNotes) setNotes(savedNotes);
    } catch (err) {
      console.error("Error loading student profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = () => {
    localStorage.setItem(`student_notes_${id}`, notes);
    alert("Academic notes saved successfully!");
  };

  const handlePlayAudio = (url, id) => {
    if (!audioRef.current) return;
    if (isPlaying === id) {
      audioRef.current.pause();
      setIsPlaying(null);
    } else {
      audioRef.current.src = url;
      audioRef.current.play();
      setIsPlaying(id);
    }
  };

  // Process makhraj/pronunciation errors
  const getWeaknesses = () => {
    const errorCounts = {};
    recitations.forEach(r => {
      if (Array.isArray(r.errors)) {
        r.errors.forEach(e => {
          if (e.word) {
            errorCounts[e.word] = (errorCounts[e.word] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(errorCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!student) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2 style={{ color: C.red }}>Student Not Found</h2>
        <button onClick={() => navigate('/students')} style={{ backgroundColor: C.primary, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', marginTop: '16px' }}>
          Back to Students
        </button>
      </div>
    );
  }

  const weaknesses = getWeaknesses();

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* HEADER / BACK */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
        <button onClick={() => navigate('/students')} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '20px' }}>
          <ArrowLeft size={28} color={C.text} />
        </button>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Student Profile</h1>
          <p style={{ fontSize: '15px', color: C.muted }}>Detailed academic progress and performance breakdown</p>
        </div>
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: INFO CARD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: C.card, borderRadius: '24px', padding: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', border: '1px solid #F0F0F0', textAlign: 'center' }}>
            <div style={{ width: '96px', height: '96px', borderRadius: '32px', backgroundColor: C.primary + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span style={{ fontSize: '40px', fontWeight: '900', color: C.primary }}>{(student.full_name || student.display_name || 'S')[0]}</span>
            </div>
            
            <h2 style={{ fontSize: '22px', fontWeight: '900', color: C.text, margin: '0 0 6px 0' }}>{student.full_name || student.display_name}</h2>
            <p style={{ fontSize: '14px', color: C.muted, margin: '0 0 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Mail size={14} /> {student.email}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: `1px solid ${C.border}`, paddingTop: '20px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: C.muted, fontWeight: '600' }}>Joined At:</span>
                <span style={{ color: C.text, fontWeight: '700' }}>{student.created_at ? new Date(student.created_at).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: C.muted, fontWeight: '600' }}>Streak:</span>
                <span style={{ color: C.gold, fontWeight: '800' }}>🔥 {student.streak_days || 0} Days</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: C.muted, fontWeight: '600' }}>Total Sessions:</span>
                <span style={{ color: C.text, fontWeight: '700' }}>{student.total_sessions || 0} Recitations</span>
              </div>
            </div>
          </div>

          {/* KEY METRICS CARD */}
          <div style={{ backgroundColor: C.card, borderRadius: '24px', padding: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', border: '1px solid #F0F0F0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: C.primary, margin: '0 0 20px 0' }}>Performance Stats</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: C.muted }}>Average Accuracy</span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: C.primary }}>{student.avg_score || 0}%</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#F0F0F0', borderRadius: '4px' }}>
                  <div style={{ width: `${student.avg_score || 0}%`, height: '100%', backgroundColor: C.primary, borderRadius: '4px' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: C.muted }}>Syllabus Progress</span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: C.gold }}>{student.progress_percentage || 0}%</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#F0F0F0', borderRadius: '4px' }}>
                  <div style={{ width: `${student.progress_percentage || 0}%`, height: '100%', backgroundColor: C.gold, borderRadius: '4px' }} />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TABS & DETAILS */}
        <div style={{ backgroundColor: C.card, borderRadius: '24px', padding: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', border: '1px solid #F0F0F0', minHeight: '500px' }}>
          {/* Tabs Nav */}
          <div style={{ display: 'flex', gap: '16px', borderBottom: `2px solid ${C.border}`, paddingBottom: '16px', marginBottom: '24px' }}>
            <button 
              onClick={() => setActiveTab('history')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: '800',
                color: activeTab === 'history' ? C.primary : C.muted,
                borderBottom: activeTab === 'history' ? `3px solid ${C.primary}` : 'none',
                paddingBottom: '14px', marginBottom: '-19px'
              }}
            >
              Recitation History
            </button>
            <button 
              onClick={() => setActiveTab('weaknesses')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: '800',
                color: activeTab === 'weaknesses' ? C.primary : C.muted,
                borderBottom: activeTab === 'weaknesses' ? `3px solid ${C.primary}` : 'none',
                paddingBottom: '14px', marginBottom: '-19px'
              }}
            >
              Makhraj Weaknesses
            </button>
            <button 
              onClick={() => setActiveTab('notes')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: '800',
                color: activeTab === 'notes' ? C.primary : C.muted,
                borderBottom: activeTab === 'notes' ? `3px solid ${C.primary}` : 'none',
                paddingBottom: '14px', marginBottom: '-19px'
              }}
            >
              Teacher Recommendations
            </button>
          </div>

          <audio ref={audioRef} onEnded={() => setIsPlaying(null)} hidden />

          {/* TAB 1: RECITATION HISTORY */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {recitations.length > 0 ? recitations.map((item) => (
                <div key={item.id} style={{ border: `1px solid ${C.border}`, borderRadius: '16px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '800', color: C.text, margin: '0 0 4px 0' }}>
                      {item.surah || `Surah ${item.surah_number}`}
                    </h4>
                    <p style={{ fontSize: '13px', color: C.muted, margin: '0 0 12px 0' }}>
                      Ayah {item.ayah || `${item.start_verse}–${item.end_verse}`} · Recorded {
                        new Date(item.submitted_at || item.recorded_at).toLocaleDateString()
                      }
                    </p>
                    
                    {(item.audio_url || item.audioUrl) && (
                      <button 
                        onClick={() => handlePlayAudio(item.audio_url || item.audioUrl, item.id)}
                        style={{
                          backgroundColor: isPlaying === item.id ? C.gold : C.primary,
                          color: 'white', border: 'none', borderRadius: '12px', padding: '8px 16px',
                          display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                          fontWeight: '700', fontSize: '13px'
                        }}
                      >
                        {isPlaying === item.id ? <Pause size={14} /> : <Play size={14} />}
                        {isPlaying === item.id ? 'Pause Recitation' : 'Play Recitation'}
                      </button>
                    )}
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: item.score >= 85 ? C.green : item.score >= 70 ? C.gold : C.red }}>{item.score}%</div>
                    <span style={{ 
                      backgroundColor: item.reviewed ? '#10B98115' : '#D4AF3715', 
                      color: item.reviewed ? C.green : C.gold, 
                      padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                      display: 'inline-block', marginTop: '6px'
                    }}>
                      {item.reviewed ? 'Reviewed' : 'Pending'}
                    </span>
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '40px', color: C.muted }}>No recitations recorded yet.</div>
              )}
            </div>
          )}

          {/* TAB 2: WEAKNESSES */}
          {activeTab === 'weaknesses' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: C.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color={C.red} /> Phonetic & Makhraj Error Analysis
              </h3>
              <p style={{ fontSize: '14px', color: C.muted, marginBottom: '24px' }}>
                The AI system tracks recurring spelling/pronunciation errors across student submissions. Review the words causing the most difficulties below.
              </p>

              {weaknesses.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {weaknesses.map((w, index) => (
                    <div key={index} style={{ border: `1px solid ${C.border}`, borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFDF9' }}>
                      <span style={{ fontSize: '22px', fontWeight: '500', color: C.text, fontFamily: 'serif' }}>{w.word}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ backgroundColor: C.red + '15', color: C.red, padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '800' }}>
                          Failed {w.count} times
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', backgroundColor: C.green + '10', borderRadius: '16px', padding: '20px', color: C.green }}>
                  <Award size={24} />
                  <p style={{ margin: 0, fontWeight: '700' }}>Excellent performance! No phonetic or Makhraj errors are frequently repeated.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECOMMENDATIONS */}
          {activeTab === 'notes' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: C.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lightbulb size={18} color={C.gold} /> Academic Recommendations & Guidelines
              </h3>
              <p style={{ fontSize: '14px', color: C.muted, marginBottom: '20px' }}>
                Provide personalized tips, Surahs to practice next, or specific Makhraj exercises. This guidance helps the student focus their efforts.
              </p>

              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Write study instructions and teacher guidelines..."
                style={{
                  width: '100%', height: '200px', borderRadius: '16px', padding: '16px',
                  backgroundColor: C.bg, border: 'none', fontSize: '15px', color: C.text,
                  fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', marginBottom: '20px'
                }}
              />

              <button 
                onClick={saveNotes}
                style={{
                  backgroundColor: C.primary, color: 'white', border: 'none', borderRadius: '12px',
                  padding: '12px 24px', fontWeight: '800', cursor: 'pointer', fontSize: '14px'
                }}
              >
                Save Recommendations
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}


