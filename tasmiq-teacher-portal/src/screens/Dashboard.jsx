import React, { useState, useEffect } from 'react';
import { Users, Clock, CheckCircle, AlertCircle, LogOut, Bell, Mic, ArrowRight, TrendingUp, Building, User } from 'lucide-react';
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

const PremiumCard = ({ children, style, color = C.primary }) => (
  <div style={{
    backgroundColor: C.card,
    borderRadius: '24px',
    padding: '24px',
    boxShadow: `0 10px 30px ${color}15`,
    border: '1px solid rgba(255,255,255,0.8)',
    ...style
  }}>
    {children}
  </div>
);

const StatWidget = ({ icon: Icon, label, value, trend, color }) => (
  <div style={{ flex: 1, minWidth: '240px' }}>
    <PremiumCard color={color}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '16px',
        backgroundColor: color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px',
      }}>
        <Icon size={24} color={color} />
      </div>
      <div style={{ fontSize: '32px', fontWeight: '900', color: C.text }}>{value}</div>
      <div style={{ fontSize: '13px', fontWeight: '700', color: C.muted, marginTop: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px', gap: '4px' }}>
        <TrendingUp size={14} color={C.green} />
        <span style={{ fontSize: '11px', fontWeight: '800', color: C.green }}>{trend}</span>
      </div>
    </PremiumCard>
  </div>
);

export default function Dashboard() {
  const { teacher, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ students: 0, pending: 0, completed: 0, atRisk: 0 });
  
  const displayName = teacher?.user_metadata?.displayName || '';
  let welcomeTitle = 'Principal';
  if (/\bbinti\b/i.test(displayName)) {
    welcomeTitle = 'Ustazah';
  } else if (/\bbin\b/i.test(displayName)) {
    welcomeTitle = 'Ustaz';
  }
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const { count: studentCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student');

      const { count: pendingCount } = await supabase
        .from('recitations')
        .select('*', { count: 'exact', head: true })
        .eq('reviewed', false);

      const { count: completedCount } = await supabase
        .from('recitations')
        .select('*', { count: 'exact', head: true })
        .eq('reviewed', true);

      const { data: recentData } = await supabase
        .from('recitations')
        .select('*')
        .order('recordedAt', { ascending: false })
        .limit(5);

      if (recentData) {
        setRecent(recentData.map(d => ({
          ...d,
          time: d.recordedAt ? new Date(d.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'
        })));
      }

      setStats({
        students: studentCount || 0,
        pending: pendingCount || 0,
        completed: completedCount || 0,
        atRisk: Math.floor((studentCount || 0) * 0.12)
      });
    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ backgroundColor: C.primary, width: '8px', height: '32px', borderRadius: '4px' }} />
              <h1 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: 0 }}>Tasmiq Staff</h1>
            </div>
            <p style={{ fontSize: '15px', color: C.muted, marginTop: '4px', marginLeft: '20px' }}>Academic Management Portal</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              onClick={() => navigate('/profile')}
              style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }}
            >
              <User size={24} color={C.text} />
            </button>
            <button style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
              <Bell size={24} color={C.text} />
            </button>
            <button 
              onClick={logout}
              style={{ padding: '12px 20px', borderRadius: '14px', backgroundColor: C.red + '10', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: C.red, fontWeight: '800' }}
            >
              Logout
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* HERO & QUICK ACTIONS */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '40px' }}>
          <PremiumCard style={{ backgroundColor: C.primary, height: '240px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px', position: 'relative', overflow: 'hidden' }}>
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', fontWeight: '600', margin: 0 }}>Welcome back, {welcomeTitle}</p>
            <h2 style={{ fontSize: '36px', color: 'white', fontWeight: '900', marginTop: '12px', lineHeight: '1.2' }}>Ready to review<br />today's recitations?</h2>
            <button 
              onClick={() => navigate('/review')}
              style={{ backgroundColor: C.gold, padding: '14px 28px', borderRadius: '16px', border: 'none', color: 'white', fontWeight: '800', fontSize: '16px', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', width: 'fit-content' }}
            >
              Start Reviewing
              <ArrowRight size={18} />
            </button>
            <Mic size={200} color="white" style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1 }} />
          </PremiumCard>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button onClick={() => navigate('/classes')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <PremiumCard style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', backgroundColor: C.primary + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building size={28} color={C.primary} />
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: C.text }}>Classes</div>
                  <div style={{ fontSize: '13px', color: C.muted }}>Manage classes & codes</div>
                </div>
              </PremiumCard>
            </button>
            <button onClick={() => navigate('/requests')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <PremiumCard style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', backgroundColor: C.gold + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={28} color={C.gold} />
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: C.text }}>Enrollment Requests</div>
                  <div style={{ fontSize: '13px', color: C.muted }}>Approve new students</div>
                </div>
              </PremiumCard>
            </button>
            <button onClick={() => navigate('/students')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <PremiumCard style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', backgroundColor: C.lilac + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={28} color={C.lilac} />
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: C.text }}>Student Roster</div>
                  <div style={{ fontSize: '13px', color: C.muted }}>Manage all enrollments</div>
                </div>
              </PremiumCard>
            </button>
          </div>
        </div>

        {/* STATS GRID */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
          <StatWidget icon={Users} label="Active Students" value={stats.students} trend="+12% this month" color={C.primary} />
          <StatWidget icon={Clock} label="Pending Review" value={stats.pending} trend="Action required" color={C.red} />
          <StatWidget icon={CheckCircle} label="Total Reviews" value={stats.completed} trend="+42 today" color={C.lilac} />
          <StatWidget icon={AlertCircle} label="At-Risk Students" value={stats.atRisk} trend="Review flagged" color={C.gold} />
        </div>

        {/* RECENT ACTIVITY */}
        <PremiumCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '900', color: C.text, margin: 0 }}>Recent Activity</h3>
            <button onClick={() => navigate('/review')} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: '800', cursor: 'pointer' }}>
              View All Submissions →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.length > 0 ? recent.map((item, i) => (
              <div
                key={item.id}
                onClick={() => navigate('/review', { state: { recitation: item } })}
                style={{
                  display: 'flex', alignItems: 'center', padding: '18px 0',
                  borderBottom: i < recent.length - 1 ? '1px solid #F0F0F0' : 'none',
                  cursor: 'pointer'
                }}
              >
                <div style={{ width: '52px', height: '52px', borderRadius: '18px', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '18px' }}>
                  <span style={{ fontSize: '22px', fontWeight: '900', color: C.primary }}>{(item.studentName || 'S')[0]}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '17px', fontWeight: '800', color: C.text }}>{item.studentName || 'Student'}</div>
                  <div style={{ fontSize: '13px', color: C.muted, marginTop: '2px' }}>{item.surah} • Ayah {item.ayah}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: item.score >= 85 ? C.green : item.score >= 70 ? C.gold : C.red }}>{item.score}%</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>{item.time}</div>
                </div>
                <ArrowRight size={20} color="#DDD" style={{ marginLeft: '16px' }} />
              </div>
            )) : (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Mic size={48} color="#DDD" />
                <p style={{ color: C.muted, marginTop: '12px' }}>All submissions reviewed!</p>
              </div>
            )}
          </div>
        </PremiumCard>

      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
