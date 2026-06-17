import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, BookOpen, Bell, LogOut,
  Megaphone, Repeat, BarChart3, FileText, Settings, GraduationCap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import logoImg from '../assets/logo.png';

const SIDEBAR_WIDTH = '260px';

// Emerald Green Design System — sidebar uses dark emerald, main app uses warm nude
const T = {
  primary:      '#10B981',   // emerald for buttons/icons
  primaryDark:  '#047857',   // dark emerald for sidebar
  primaryLight: '#F5F2E9',   // warm nude (NOT neon green)
  gold:         '#D4AF37',
  bg:           '#F5F2E9',   // warm nude background
  card:         '#FFFFFF',
  text:         '#1E2A22',
  muted:        '#5C6E65',
  red:          '#EF4444',
  border:       '#EAE3D5',   // warm beige border
};

const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',            icon: LayoutDashboard },
  { path: '/students',       label: 'Students Roster',      icon: Users },
  { path: '/review',         label: 'Review Recitations',   icon: BookOpen },
  { path: '/classes',        label: 'Classes',              icon: GraduationCap },
  { path: '/requests',       label: 'Enrollment Requests',  icon: UserCheck },
  { path: '/murajaah',       label: 'Murajaah Monitoring',  icon: Repeat },
  { path: '/analytics',      label: 'Analytics',            icon: BarChart3 },
  { path: '/reports',        label: 'Reports',              icon: FileText },
  { path: '/announcements',  label: 'Announcements',        icon: Megaphone },
  { path: '/settings',       label: 'Settings',             icon: Settings },
];

export default function Layout() {
  const { teacher, logout } = useAuth();
  const navigate = useNavigate();

  const displayName = teacher?.full_name || teacher?.email || 'Admin User';
  const roleDisplay = teacher?.role === 'admin' ? 'Administrator' : 'Teacher / Staff';

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications]         = useState([]);

  const loadNotifications = async () => {
    try {
      const list = [];

      const { data: joinReqs } = await supabase
        .from('join_requests')
        .select('*')
        .eq('status', 'pending');
      if (joinReqs?.length > 0) {
        list.push({
          id: 'req-pending',
          title: 'Join Requests Pending',
          desc: `${joinReqs.length} student(s) requested to join class`,
          time: 'Action Required',
          type: 'warning',
          path: '/requests',
        });
      }

      const { data: pendingRecs } = await supabase
        .from('recitations')
        .select('id')
        .eq('reviewed', false);
      if (pendingRecs?.length > 0) {
        list.push({
          id: 'recs-pending',
          title: 'New Tasmiq Recitations',
          desc: `${pendingRecs.length} submission(s) pending review`,
          time: 'Today',
          type: 'info',
          path: '/review',
        });
      }

      setNotifications(list);
    } catch (err) {
      console.error('Notifications error:', err);
    }
  };

  useEffect(() => {
    if (teacher) {
      loadNotifications();
      const t = setInterval(loadNotifications, 30000);
      return () => clearInterval(t);
    }
  }, [teacher]);

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      backgroundColor: T.bg,
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      {/* ── SIDEBAR ── */}
      <aside className="no-print" style={{
        width: SIDEBAR_WIDTH,
        background: `linear-gradient(180deg, ${T.primaryDark} 0%, #065F46 100%)`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 10,
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
      }}>
        <style>{`
          .sidebar-link {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 16px; border-radius: 12px;
            text-decoration: none;
            color: rgba(255,255,255,0.80);
            font-weight: 600; font-size: 14px;
            transition: all 0.2s ease;
            margin: 2px 0;
          }
          .sidebar-link:hover {
            background-color: rgba(255,255,255,0.12) !important;
            color: white !important;
          }
          .sidebar-link.active {
            background-color: ${T.gold} !important;
            color: white !important;
            font-weight: 800;
            box-shadow: 0 4px 12px rgba(212,175,55,0.35);
          }
        `}</style>

        {/* Logo */}
        <div style={{
          padding: '28px 20px 20px',
          display: 'flex', alignItems: 'center', gap: '14px',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <img src={logoImg} alt="TasmiqAI" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', color: 'white', lineHeight: 1.2 }}>
              TasmiqAI
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>
              Educator Portal
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <item.icon size={18} style={{ minWidth: '18px' }} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          <div
            onClick={() => navigate('/profile')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '14px',
              padding: '12px 14px', cursor: 'pointer', marginBottom: '10px',
              transition: 'background 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.14)'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
          >
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              backgroundColor: T.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: '800', fontSize: '15px', flexShrink: 0,
            }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{roleDisplay}</div>
            </div>
          </div>

          <button
            onClick={logout}
            style={{
              width: '100%', padding: '11px 16px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent', color: 'white',
              fontWeight: '700', fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)';
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            <LogOut size={16} />
            Logout Securely
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="print-main" style={{
        flex: 1, marginLeft: SIDEBAR_WIDTH,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}>
        {/* Notification Bell */}
        <div className="no-print" style={{ position: 'absolute', top: '20px', right: '28px', zIndex: 20 }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: '12px', padding: '10px 14px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              position: 'relative',
            }}
          >
            <Bell size={20} color={T.primaryDark} />
            {notifications.length > 0 && (
              <div style={{
                position: 'absolute', top: '6px', right: '6px',
                width: '16px', height: '16px', borderRadius: '8px',
                backgroundColor: T.red, color: 'white',
                fontSize: '10px', fontWeight: '900',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {notifications.length}
              </div>
            )}
          </button>

          {showNotifications && (
            <div style={{
              position: 'absolute', right: 0, top: '52px', width: '300px',
              backgroundColor: T.card, borderRadius: '16px',
              border: `1px solid ${T.border}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 100, padding: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: '800', fontSize: '14px', color: T.text }}>
                  Notifications ({notifications.length})
                </span>
                <button onClick={() => setShowNotifications(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: T.primary, fontWeight: '700' }}>
                  Close
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                {notifications.map(n => (
                  <div key={n.id} onClick={() => { setShowNotifications(false); navigate(n.path); }}
                    style={{
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                      backgroundColor: n.type === 'warning' ? '#FFFBEB' : '#F5F2E9',
                      borderLeft: `4px solid ${n.type === 'warning' ? T.gold : T.primary}`,
                    }}>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: T.text }}>{n.title}</div>
                    <div style={{ fontSize: '12px', color: T.muted, marginTop: '2px' }}>{n.desc}</div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: T.muted, fontSize: '13px' }}>
                    All caught up! No new alerts.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '40px 44px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

