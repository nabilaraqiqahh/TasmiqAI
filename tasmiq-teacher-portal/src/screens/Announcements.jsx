import React, { useState, useEffect } from 'react';
import { Megaphone, Send, Clock, Trash2, Building } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

const C = {
  bg: '#F5F2E9',
  card: '#FFFFFF',
  primary: '#10B981',
  gold: '#C9A84C',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  border: '#EAE3D5'
};

export default function Announcements() {
  const { teacher } = useAuth();
  const [classes, setClasses] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  
  const [selectedClassId, setSelectedClassId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      // Load teacher's classes
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', teacher.id);
        
      if (!classError && classData) {
        setClasses(classData);
        if (classData.length > 0) {
          setSelectedClassId(classData[0].id);
        }
      }

      // Load past announcements
      const { data: annData, error: annError } = await supabase
        .from('announcements')
        .select('*, classes(name)')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });

      if (!annError && annData) {
        setAnnouncements(annData);
      }
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teacher?.uid) {
      loadData();
    }
  }, [teacher]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !selectedClassId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('announcements')
        .insert([{
          title: title.trim(),
          content: content.trim(),
          class_id: selectedClassId,
          teacher_id: teacher.id
        }]);

      if (error) throw error;
      
      alert('Announcement sent successfully!');
      setTitle('');
      setContent('');
      loadData();
    } catch (error) {
      alert('Error sending announcement: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      alert('Error deleting: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: '800', color: C.primary, margin: '0 0 8px 0' }}>Communication</h2>
        <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: '0 0 4px 0' }}>Class Announcements</h1>
        <p style={{ fontSize: '14px', color: C.muted, margin: 0 }}>Broadcast important messages and updates directly to your classes.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        
        {/* CREATE ANNOUNCEMENT FORM */}
        <div style={{ backgroundColor: C.card, borderRadius: '16px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: C.text, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Megaphone size={20} color={C.primary} />
            New Announcement
          </h3>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: C.muted, marginBottom: '8px' }}>Target Class</label>
              <div style={{ position: 'relative' }}>
                <Building size={18} color={C.muted} style={{ position: 'absolute', left: '16px', top: '16px' }} />
                <select 
                  value={selectedClassId} 
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', border: `1px solid ${C.border}`, backgroundColor: C.bg, fontSize: '15px', color: C.text, outline: 'none' }}
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {classes.length === 0 && <option value="">No classes found</option>}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: C.muted, marginBottom: '8px' }}>Announcement Title</label>
              <input 
                type="text"
                placeholder="e.g. Next Week's Surah Challenge"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${C.border}`, backgroundColor: C.bg, fontSize: '15px', color: C.text, outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: C.muted, marginBottom: '8px' }}>Message Content</label>
              <textarea 
                placeholder="Write your detailed message here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{ width: '100%', padding: '16px', borderRadius: '12px', border: `1px solid ${C.border}`, backgroundColor: C.bg, fontSize: '15px', color: C.text, outline: 'none', height: '140px', resize: 'vertical' }}
              />
            </div>

            <button 
              type="submit" 
              disabled={submitting || !title || !content || !selectedClassId}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', backgroundColor: (title && content) ? C.primary : C.muted, color: 'white', border: 'none', fontSize: '16px', fontWeight: '800', cursor: (title && content) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Send size={18} />
              {submitting ? 'Publishing...' : 'Publish Announcement'}
            </button>
          </form>
        </div>

        {/* PAST ANNOUNCEMENTS LIST */}
        <div style={{ backgroundColor: C.card, borderRadius: '16px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: C.text, marginBottom: '24px' }}>Past Broadcasts</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '500px', overflowY: 'auto' }}>
            {announcements.length > 0 ? announcements.map((ann) => (
              <div key={ann.id} style={{ padding: '20px', borderRadius: '12px', border: `1px solid ${C.border}`, backgroundColor: C.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: '800', color: C.text, margin: 0, flex: 1 }}>{ann.title}</h4>
                  <button onClick={() => handleDelete(ann.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, padding: '4px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <p style={{ fontSize: '14px', color: C.text, lineHeight: '1.5', margin: '0 0 12px 0', whiteSpace: 'pre-wrap' }}>
                  {ann.content}
                </p>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: C.muted }}>
                  <span style={{ backgroundColor: C.gold + '20', color: C.gold, padding: '4px 8px', borderRadius: '6px', fontWeight: '700' }}>
                    {ann.classes?.name || 'Unknown Class'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {new Date(ann.created_at).toLocaleDateString()} {new Date(ann.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                <Megaphone size={40} color={C.border} style={{ marginBottom: '12px' }} />
                <p>No announcements yet.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}



