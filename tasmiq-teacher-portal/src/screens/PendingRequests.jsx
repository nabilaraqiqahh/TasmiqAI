import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Users, Mail, Calendar } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

const T = {
  primary: '#0B6E4F', primaryDark: '#047857', primaryLight: '#D1FAE5',
  gold: '#D4AF37', bg: '#FEFCE8', card: '#FFFFFF',
  text: '#064E3B', muted: '#6B7280', red: '#EF4444',
  green: '#0B6E4F', border: '#EAE3D5',
};

export default function PendingRequests() {
  const { teacher } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('pending');

  useEffect(() => { loadRequests(); }, [teacher]);

  const loadRequests = async () => {
    if (!teacher?.id) return;
    setLoading(true);
    try {
      // Get teacher's classes
      const { data: teacherClasses } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', teacher.id);

      if (!teacherClasses?.length) { setRequests([]); setLoading(false); return; }

      const classIds = teacherClasses.map(c => c.id);
      const classMap = Object.fromEntries(teacherClasses.map(c => [c.id, c.name]));

      // Get join requests
      const { data, error } = await supabase
        .from('join_requests')
        .select('id, class_id, student_id, status, created_at')
        .in('class_id', classIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load real student profiles
      const studentIds = [...new Set((data || []).map(r => r.student_id).filter(Boolean))];
      let studentMap = {};
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('users')
          .select('id, full_name, email, role, created_at')
          .in('id', studentIds);
        (students || []).forEach(s => { studentMap[s.id] = s; });
      }

      setRequests((data || []).map(req => ({
        ...req,
        class_name: classMap[req.class_id] || 'Unknown Class',
        student:    studentMap[req.student_id] || null,
      })));
    } catch (err) {
      console.error('Load requests error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId, classId, studentId, action) => {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await supabase.from('join_requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (action === 'approve') {
        // Add to class_members
        await supabase.from('class_members')
          .insert([{ class_id: classId, student_id: studentId }])
          .then(() => {}).catch(() => {});
      }

      setRequests(prev => prev.map(r =>
        r.id === requestId ? { ...r, status: newStatus } : r
      ));
    } catch (err) {
      alert(`Failed to ${action}: ${err.message}`);
    }
  };

  const filtered = requests.filter(r =>
    tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'
  );
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `4px solid ${T.primaryLight}`, borderTop: `4px solid ${T.primary}`, animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '12px', fontWeight: '800', color: T.primary, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px' }}>
          Class Management
        </p>
        <h1 style={{ fontSize: '28px', fontWeight: '900', color: T.text, margin: '0 0 4px' }}>
          Enrollment Requests
        </h1>
        <p style={{ fontSize: '14px', color: T.muted, margin: 0 }}>
          Review and approve student class join requests.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[
          { key: 'pending', label: `Pending (${pendingCount})` },
          { key: 'history', label: 'History' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            fontWeight: '800', fontSize: '14px',
            backgroundColor: tab === t.key ? T.primaryDark : T.card,
            color: tab === t.key ? 'white' : T.muted,
            boxShadow: tab === t.key ? `0 4px 12px ${T.primary}40` : '0 2px 6px rgba(0,0,0,0.04)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Request Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.length === 0 ? (
          <div style={{
            backgroundColor: T.card, borderRadius: '20px', padding: '60px',
            textAlign: 'center', border: `1px solid ${T.border}`,
          }}>
            <Clock size={40} color={T.border} style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ color: T.muted, fontSize: '15px', margin: 0 }}>
              {tab === 'pending' ? 'No pending requests. All caught up!' : 'No request history yet.'}
            </p>
          </div>
        ) : filtered.map(req => {
          const stu = req.student;
          const name  = stu?.full_name || stu?.email?.split('@')[0] || 'Unknown Student';
          const email = stu?.email || '—';
          const date  = new Date(req.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          return (
            <div key={req.id} style={{
              backgroundColor: T.card, borderRadius: '18px', padding: '22px 24px',
              border: `1px solid ${T.border}`,
              boxShadow: '0 2px 12px rgba(16,185,129,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              {/* Student Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  backgroundColor: T.primaryLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '22px', fontWeight: '900', color: T.primaryDark }}>
                    {name[0]?.toUpperCase()}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: T.text, marginBottom: '2px' }}>
                    {name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: T.muted, marginBottom: '6px' }}>
                    <Mail size={13} /> {email}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{
                      backgroundColor: T.primaryLight, color: T.primaryDark,
                      padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <Users size={12} /> {req.class_name}
                    </span>
                    <span style={{
                      backgroundColor: '#FEF9E7', color: T.gold,
                      padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <Calendar size={12} /> {date}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', flexShrink: 0, marginLeft: '20px' }}>
                {tab === 'pending' ? (
                  <>
                    <button onClick={() => handleAction(req.id, req.class_id, req.student_id, 'reject')} style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      backgroundColor: '#FEE2E2', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} title="Reject">
                      <XCircle size={22} color={T.red} />
                    </button>
                    <button onClick={() => handleAction(req.id, req.class_id, req.student_id, 'approve')} style={{
                      padding: '0 18px', height: '44px', borderRadius: '12px',
                      backgroundColor: T.primary, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      color: 'white', fontWeight: '800', fontSize: '13px',
                      boxShadow: `0 4px 12px ${T.primary}40`,
                    }} title="Approve">
                      <CheckCircle size={18} /> Approve
                    </button>
                  </>
                ) : (
                  <div style={{
                    padding: '6px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '800',
                    backgroundColor: req.status === 'approved' ? T.primaryLight : '#FEE2E2',
                    color: req.status === 'approved' ? T.primaryDark : T.red,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    {req.status === 'approved' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {req.status === 'approved' ? 'Approved' : 'Rejected'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



