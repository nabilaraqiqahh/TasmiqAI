import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Pause, RefreshCw, Send, Sparkles, MicOff, AlertCircle } from 'lucide-react';
import { supabase } from '../supabase';
import { useNavigate, useLocation } from 'react-router-dom';

const C = {
  bg: '#F5F2E9',
  card: '#FFFFFF',
  primary: '#4A8C73',
  gold: '#C9A84C',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#10B981',
  dark: '#111827'
};

export default function RecitationReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submissions, setSubmissions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [grade, setGrade] = useState(4);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const loadSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('recitations')
        .select('*')
        .eq('reviewed', false)
        .order('recordedAt', { ascending: true });
        
      if (error) throw error;
      setSubmissions(data);
      if (data.length > 0 && !selected) {
        setSelected(data[0]);
      }
    } catch (error) {
      console.error("Load submissions error:", error);
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
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSubmit = async (isRedo = false) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('recitations')
        .update({
          reviewed: true,
          grade: isRedo ? 0 : grade,
          teacherFeedback: isRedo ? `REDO: ${feedback}` : feedback,
          reviewedAt: new Date().toISOString()
        })
        .eq('id', selected.id);

      if (error) throw error;
      
      alert("Evaluation Sent successfully!");
      setFeedback('');
      setSelected(null);
      loadSubmissions();
    } catch (error) {
      alert("Error: Could not submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', overflow: 'hidden' }}>
      
      {/* QUEUE SIDEBAR */}
      <div style={{ 
        width: '350px', 
        backgroundColor: 'white', 
        borderRight: '1px solid #E0E0E0', 
        display: 'flex', 
        flexDirection: 'column',
        padding: '32px 24px'
      }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', color: C.text, marginBottom: '24px' }}>Review Queue</h2>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {submissions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              style={{
                backgroundColor: selected?.id === s.id ? C.primary + '10' : 'transparent',
                borderRadius: '16px', 
                padding: '16px', 
                textAlign: 'left',
                border: '1px solid',
                borderColor: selected?.id === s.id ? C.primary : '#F0F0F0',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontWeight: '800', color: C.text }}>{s.studentName}</div>
              <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>{s.surah} • Ayah {s.ayah}</div>
            </button>
          ))}
          {submissions.length === 0 && <p style={{ color: C.muted, textAlign: 'center' }}>Queue is empty!</p>}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
            <button onClick={() => navigate(-1)} style={{ marginRight: '20px', width: '44px', height: '44px', borderRadius: '22px', backgroundColor: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
              <ArrowLeft size={24} color={C.text} />
            </button>
            <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Evaluation Studio</h1>
          </div>

          {!selected ? (
            <div style={{ textAlign: 'center', paddingTop: '100px' }}>
              <Sparkles size={80} color={C.lilac} style={{ margin: '0 auto' }} />
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: C.text, marginTop: '24px' }}>Select a student to begin</h2>
              <p style={{ color: C.muted, marginTop: '8px' }}>Your review queue is ready for action.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* STUDENT HEADER */}
              <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '24px', backgroundColor: C.lilac, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '32px', fontWeight: '900', color: 'white' }}>{(selected.studentName || 'S')[0]}</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '26px', fontWeight: '900', color: C.text, margin: 0 }}>{selected.studentName}</h2>
                    <p style={{ fontSize: '16px', color: C.muted, margin: '4px 0 0' }}>{selected.surah} • Ayah {selected.ayah}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: C.muted, fontWeight: '700', letterSpacing: '1px' }}>AI SCORE</div>
                  <div style={{ fontSize: '48px', fontWeight: '900', color: selected.score > 85 ? C.green : C.gold }}>{selected.score}%</div>
                </div>
              </div>

              {/* STUDIO PLAYER */}
              <div style={{ backgroundColor: C.dark, borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '800', marginBottom: '24px', letterSpacing: '2px', fontSize: '12px' }}>STUDIO AUDIO PLAYBACK</p>
                <button 
                  onClick={togglePlay}
                  style={{ width: '80px', height: '80px', borderRadius: '40px', backgroundColor: C.primary, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {isPlaying ? <Pause size={32} color="white" fill="white" /> : <Play size={32} color="white" fill="white" style={{ marginLeft: '4px' }} />}
                </button>
                <audio ref={audioRef} src={selected.audioUrl} onEnded={() => setIsPlaying(false)} hidden />
                <div style={{ width: '100%', height: '2px', backgroundColor: 'rgba(255,255,255,0.1)', marginTop: '32px' }} />
              </div>

              {/* ANALYSIS VIEW */}
              <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '900', color: C.text, marginBottom: '20px' }}>Refined AI Analysis</h3>
                <div style={{ backgroundColor: '#F9F8F4', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                  <p style={{ fontSize: '32px', textAlign: 'right', color: C.text, lineHeight: '1.8', direction: 'rtl', margin: 0, fontWeight: '500' }}>
                    {selected.transcription}
                  </p>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selected.errors?.map((err, i) => (
                    <div key={i} style={{ display: 'flex', gap: '16px', backgroundColor: C.red + '10', borderRadius: '16px', padding: '20px' }}>
                      <MicOff size={24} color={C.red} />
                      <div>
                        <div style={{ fontWeight: '900', color: C.red, fontSize: '18px' }}>{err.word}</div>
                        <div style={{ color: C.muted, fontSize: '15px', marginTop: '4px' }}>{err.tip}</div>
                      </div>
                    </div>
                  ))}
                  {(!selected.errors || selected.errors.length === 0) && (
                    <div style={{ display: 'flex', gap: '16px', backgroundColor: C.green + '10', borderRadius: '16px', padding: '20px' }}>
                      <Sparkles size={24} color={C.green} />
                      <p style={{ color: C.green, fontWeight: '800', margin: 0 }}>Excellent pronunciation! No phonetic errors detected.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* EVALUATION ACTION PANEL */}
              <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', marginBottom: '40px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '900', color: C.text, marginBottom: '24px' }}>Expert Evaluation</h3>
                
                <p style={{ fontWeight: '700', color: C.muted, marginBottom: '12px', fontSize: '14px' }}>Proficiency Grade (1-5)</p>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                  {[1,2,3,4,5].map(n => (
                    <button 
                      key={n} 
                      onClick={() => setGrade(n)}
                      style={{ 
                        flex: 1, height: '60px', borderRadius: '16px', 
                        backgroundColor: grade === n ? C.primary : C.bg, 
                        border: 'none', cursor: 'pointer',
                        fontSize: '20px', fontWeight: '900', color: grade === n ? 'white' : C.text,
                        transition: 'all 0.2s'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <textarea
                  placeholder="Leave professional feedback..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  style={{ 
                    width: '100%', backgroundColor: C.bg, borderRadius: '16px', 
                    padding: '20px', height: '120px', fontSize: '16px', 
                    border: 'none', outline: 'none', marginBottom: '24px', 
                    boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />

                <div style={{ display: 'flex', gap: '16px' }}>
                   <button 
                     onClick={() => handleSubmit(true)}
                     style={{ flex: 1, height: '64px', borderRadius: '20px', backgroundColor: C.red + '10', border: 'none', cursor: 'pointer', color: C.red, fontWeight: '800', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                   >
                     <RefreshCw size={20} />
                     Request Redo
                   </button>
                   <button 
                     onClick={() => handleSubmit(false)}
                     disabled={submitting}
                     style={{ flex: 2, height: '64px', borderRadius: '20px', backgroundColor: C.primary, border: 'none', cursor: 'pointer', color: 'white', fontWeight: '800', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: submitting ? 0.7 : 1 }}
                   >
                     {submitting ? 'Submitting...' : (
                       <>
                         <Send size={20} />
                         Finalize Review
                       </>
                     )}
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
