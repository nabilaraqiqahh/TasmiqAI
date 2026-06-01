import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Users, Clock } from 'lucide-react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
};

export default function PendingRequests() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'history'

  useEffect(() => {
    loadRequests();
  }, [teacher]);

  const loadRequests = async () => {
    if (!teacher) return;
    try {
      // Get classes owned by teacher
      const { data: teacherClasses } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', teacher.id);
        
      if (!teacherClasses || teacherClasses.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }
      
      const classIds = teacherClasses.map(c => c.id);
      const classMap = teacherClasses.reduce((acc, c) => ({...acc, [c.id]: c.name}), {});

      // Get pending requests for these classes
      const { data, error } = await supabase
        .from('join_requests')
        .select(`
          id,
          class_id,
          student_id,
          status,
          created_at,
          users (
            uid,
            displayName,
            email
          )
        `)
        .in('class_id', classIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formatted = (data || []).map(req => ({
        ...req,
        class_name: classMap[req.class_id],
        student: req.users
      }));
      
      setRequests(formatted);
    } catch (err) {
      console.error("Error loading requests", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId, classId, studentId, action) => {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update request status
      await supabase
        .from('join_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (action === 'approve') {
        // Insert into class_members
        await supabase
          .from('class_members')
          .insert([{
            class_id: classId,
            student_id: studentId
          }]);
      }
      
      // Update local state instead of removing
      setRequests(requests.map(r => 
        r.id === requestId ? { ...r, status: newStatus } : r
      ));
      
    } catch (err) {
      console.error(`Error ${action} request`, err);
      alert(`Failed to ${action} request.`);
    }
  };

  const filteredRequests = requests.filter(req => 
    activeTab === 'pending' ? req.status === 'pending' : req.status !== 'pending'
  );

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '20px' }}>
            <ArrowLeft size={28} color={C.text} />
          </button>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Enrollment Requests</h1>
            <p style={{ fontSize: '15px', color: C.muted }}>Review and approve pending student join requests</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
          <button 
            onClick={() => setActiveTab('pending')}
            style={{ 
              padding: '12px 24px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontWeight: '800', fontSize: '15px',
              backgroundColor: activeTab === 'pending' ? C.primary : C.card,
              color: activeTab === 'pending' ? 'white' : C.muted,
              boxShadow: activeTab === 'pending' ? `0 8px 20px ${C.primary}40` : '0 4px 12px rgba(0,0,0,0.03)'
            }}
          >
            Pending ({requests.filter(r => r.status === 'pending').length})
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            style={{ 
              padding: '12px 24px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontWeight: '800', fontSize: '15px',
              backgroundColor: activeTab === 'history' ? C.primary : C.card,
              color: activeTab === 'history' ? 'white' : C.muted,
              boxShadow: activeTab === 'history' ? `0 8px 20px ${C.primary}40` : '0 4px 12px rgba(0,0,0,0.03)'
            }}
          >
            History
          </button>
        </div>

        {/* Requests List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredRequests.length > 0 ? filteredRequests.map((req) => (
            <div key={req.id} style={{ backgroundColor: C.card, borderRadius: '24px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', border: '1px solid #F8F8F8' }}>
              
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', backgroundColor: C.primary + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px' }}>
                  <span style={{ fontSize: '24px', fontWeight: '900', color: C.primary }}>
                    {req.student?.displayName ? req.student.displayName[0] : 'S'}
                  </span>
                </div>
                
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: C.text, marginBottom: '4px' }}>
                    {req.student?.displayName || 'Unknown Student'}
                  </div>
                  <div style={{ fontSize: '14px', color: C.muted, marginBottom: '8px' }}>
                    {req.student?.email}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: C.bg, padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: C.primary }}>
                    <Users size={14} /> Requested to join: {req.class_name}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                {activeTab === 'pending' ? (
                  <>
                    <button 
                      onClick={() => handleAction(req.id, req.class_id, req.student_id, 'reject')}
                      style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: C.red + '10', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.red }}
                      title="Reject Request"
                    >
                      <XCircle size={24} />
                    </button>
                    <button 
                      onClick={() => handleAction(req.id, req.class_id, req.student_id, 'approve')}
                      style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: C.green + '15', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.green }}
                      title="Approve Request"
                    >
                      <CheckCircle size={24} />
                    </button>
                  </>
                ) : (
                  <div style={{ 
                    padding: '8px 16px', borderRadius: '12px', fontWeight: '800', fontSize: '14px',
                    backgroundColor: req.status === 'approved' ? C.green + '15' : C.red + '15',
                    color: req.status === 'approved' ? C.green : C.red,
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    {req.status === 'approved' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    {req.status === 'approved' ? 'Approved' : 'Rejected'}
                  </div>
                )}
              </div>

            </div>
          )) : (
            <div style={{ padding: '60px', textAlign: 'center', backgroundColor: C.card, borderRadius: '24px' }}>
              <Clock size={48} color="#DDD" style={{ marginBottom: '16px' }} />
              <h3 style={{ fontSize: '20px', color: C.text, fontWeight: '800', marginBottom: '8px' }}>
                {activeTab === 'pending' ? 'No Pending Requests' : 'No Request History'}
              </h3>
              <p style={{ color: C.muted, fontSize: '16px' }}>
                {activeTab === 'pending' ? 'All caught up! There are no new students waiting to join your classes.' : 'You have not approved or rejected any requests yet.'}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
