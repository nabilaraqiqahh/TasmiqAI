import React, { useState, useEffect } from 'react';
import { Search, ArrowLeft, Users, X, ChevronRight, User } from 'lucide-react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

const C = {
  bg: '#FEFCE8',
  card: '#FFFFFF',
  primary: '#0B6E4F',
  gold: '#C9A84C',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#0B6E4F',
};

const STATUS_COLORS = {
  'On Track': { bg: '#10B98120', text: '#0B6E4F' },
  'At Risk': { bg: '#E0525220', text: '#E05252' },
  'Improving': { bg: '#4A8C7320', text: '#0B6E4F' },
  'Inactive': { bg: '#99999920', text: '#999999' },
};

export default function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'student')
        .order('full_name', { ascending: true });  // actual DB column
        
      if (error) throw error;
      
      const studentsData = data.map(item => ({
        id: item.id,
        ...item,
        display_name: item.full_name || item.display_name || item.email,
        status: (item.avg_score || 0) < 60 ? 'At Risk' : (item.avg_score || 0) > 85 ? 'On Track' : 'Improving',
        level: item.level || 'Intermediate',
        lastActive: item.last_login
          ? new Date(item.last_login).toLocaleDateString()
          : 'Recently'
      }));
      
      setStudents(studentsData);
    } catch (error) {
      console.error("Load students error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const filtered = students.filter(s =>
    (s.display_name || '').toLowerCase().includes(search.toLowerCase())
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
            <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Student Database</h1>
            <p style={{ fontSize: '15px', color: C.muted }}>{filtered.length} students enrolled</p>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '32px', 
          backgroundColor: C.card, 
          borderRadius: '18px', 
          padding: '4px 20px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
          border: '1px solid #F0F0F0'
        }}>
          <Search size={20} color={C.muted} />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              flex: 1, 
              padding: '16px 12px', 
              fontSize: '16px', 
              border: 'none', 
              outline: 'none', 
              background: 'none',
              color: C.text
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} color={C.muted} />
            </button>
          )}
        </div>

        {/* Student List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.length > 0 ? filtered.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/students/${s.id || s.id}`)}
              style={{
                backgroundColor: C.card, 
                borderRadius: '24px', 
                padding: '24px',
                display: 'flex', 
                alignItems: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
                border: '1px solid #F8F8F8',
                transition: 'transform 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Avatar */}
              <div style={{ 
                width: '64px', height: '64px', borderRadius: '20px', 
                backgroundColor: C.lilac + '20', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                marginRight: '20px' 
              }}>
                <span style={{ fontSize: '24px', fontWeight: '900', color: C.lilac }}>{s.display_name?.[0] ?? 'S'}</span>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: '800', color: C.text, marginBottom: '4px' }}>{s.display_name || 'Unknown Student'}</div>
                <div style={{ fontSize: '14px', color: C.muted, marginBottom: '12px' }}>{s.level} • {s.lastActive}</div>
                {/* Progress bar */}
                <div style={{ height: '6px', backgroundColor: '#F0F0F0', borderRadius: '3px', width: '200px' }}>
                  <div style={{ width: `${s.progress || 0}%`, height: '100%', backgroundColor: C.primary, borderRadius: '3px' }} />
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ fontSize: '20px', fontWeight: '900', color: (s.avg_score || 0) >= 80 ? C.green : (s.avg_score || 0) >= 65 ? C.gold : C.red }}>
                  {s.avg_score || 0}%
                </div>
                <div style={{ 
                  backgroundColor: STATUS_COLORS[s.status]?.bg || '#99999920', 
                  padding: '6px 14px', 
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: STATUS_COLORS[s.status]?.text || '#999'
                }}>
                  {s.status}
                </div>
              </div>

              <ChevronRight size={24} color="#DDD" style={{ marginLeft: '24px' }} />
            </div>
          )) : (
            <div style={{ padding: '60px', textAlign: 'center', backgroundColor: C.card, borderRadius: '24px' }}>
              <Users size={48} color="#DDD" style={{ marginBottom: '16px' }} />
              <p style={{ color: C.muted, fontSize: '16px' }}>No students found in the database.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





