import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, BookOpen, Bell, LogOut,
  Megaphone, Repeat, BarChart3, FileText, Settings, GraduationCap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import logoImg from '../assets/logo.png';

const SIDEBAR_WIDTH = '256px';

const D = {
  emerald:      '#0B6E4F',
  emeraldDark:  '#064E3B',
  emeraldLight: '#D1FAE5',
  gold:         '#D4AF37',
  goldLight:    '#F8E7A1',
  bg:           '#FEFCE8',
  card:         '#FFFFFF',
  textDark:     '#1F2937',
  textSec:      '#6B7280',
  red:          '#EF4444',
};

const NAV = [
  { path: '/dashboard',     label: 'Dashboard',           icon: LayoutDashboard },
  { path: '/tasmiq',        label: 'Tasmiq Review',       icon: BookOpen },
  { path: '/murajaah',      label: 'Murajaah Review',     icon: Repeat },
  { path: '/classes',       label: 'Class Management',    icon: GraduationCap },
  { path: '/reports',       label: 'Reports',             icon: FileText },
  { path: '/analytics',     label: 'Analytics',           icon: BarChart3 },
  { path: '/students',      label: 'Students',            icon: Users },
  { path: '/announcements', label: 'Announcements',       icon: Megaphone },
  { path: '/settings',      label: 'Settings',            icon: Settings },
];

export default function Layout() {
  const { teacher, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = teacher?.full_name || teacher?.email || 'Admin';
  const roleLabel   = teacher?.role === 'admin' ? 'Administrator' : 'Teacher / Staff';

  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif]         = useState(false);

  useEffect(() => {
    if (!teacher) return;
    const load = async () => {
      const list = [];
      const { data: pr } = await supabase.from('recitations').select('id').eq('reviewed', false).eq('is_exercise', false);
      if (pr?.length) list.push({ id: 'pr', title: `${pr.length} submission${pr.length > 1 ? 's' : ''} awaiting your review`, type: 'info', path: '/tasmiq' });
      setNotifications(list);
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [teacher]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: D.bg, fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <aside className="no-print" style={{
        width: SIDEBAR_WIDTH, flexShrink: 0,
        background: `linear-gradient(180deg, ${D.emeraldDark} 0%, #053D2E 100%)`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 10,
        boxShadow: '4px 0 20px rgba(0,0,0,0.18)',
      }}>
        <style>{`
          .nav-link {
            display:flex; align-items:center; gap:10px;
            padding:10px 14px; border-radius:10px; margin:1px 0;
            text-decoration:none; font-weight:600; font-size:13.5px;
            color:rgba(255,255,255,0.82);
            transition:all 0.18s ease;
          }
          .nav-link:hover {
            background:${D.goldLight} !important;
            color:${D.emeraldDark} !important;
          }
          .nav-link.active {
            background:${D.gold} !important;
            color:${D.emeraldDark} !important;
            font-weight:800;
            box-shadow:0 3px 10px rgba(212,175,55,0.35);
          }
        `}</style>

        {/* Logo */}
        <div style={{ padding:'22px 18px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width:40, height:40, borderRadius:10, backgroundColor:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <img src={logoImg} alt="TasmiqAI" style={{ width:'82%', height:'82%', objectFit:'contain' }} />
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:900, color:'white', letterSpacing:0.3 }}>TasmiqAI</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontWeight:500, letterSpacing:0.5 }}>EDUCATOR PORTAL</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 10px', overflowY:'auto', display:'flex', flexDirection:'column' }}>
          {NAV.map(item => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <item.icon size={16} style={{ minWidth:16, flexShrink:0 }} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div style={{ padding:'12px 10px 16px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <div
            onClick={() => navigate('/settings')}
            style={{ display:'flex', alignItems:'center', gap:10, backgroundColor:'rgba(255,255,255,0.07)', borderRadius:12, padding:'10px 12px', cursor:'pointer', marginBottom:8, transition:'background 0.15s' }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'}
          >
            <div style={{ width:32, height:32, borderRadius:8, backgroundColor:D.gold, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:D.emeraldDark, fontSize:14, flexShrink:0 }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{roleLabel}</div>
            </div>
          </div>
          <button onClick={logout} style={{
            width:'100%', padding:'9px 14px', borderRadius:10,
            border:'1px solid rgba(255,255,255,0.12)', backgroundColor:'transparent',
            color:'white', fontWeight:700, fontSize:12, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor='rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.4)'; }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor='transparent'; e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; }}
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="print-main" style={{ flex:1, marginLeft:SIDEBAR_WIDTH, minHeight:'100vh', display:'flex', flexDirection:'column', position:'relative' }}>

        {/* Top right bell */}
        <div className="no-print" style={{ position:'absolute', top:18, right:24, zIndex:20 }}>
          <button onClick={() => setShowNotif(!showNotif)} style={{
            background:D.card, border:`1px solid ${D.emeraldLight}`,
            borderRadius:10, padding:'8px 12px', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6, position:'relative',
            boxShadow:'0 2px 6px rgba(0,0,0,0.06)',
          }}>
            <Bell size={18} color={D.emerald} />
            {notifications.length > 0 && (
              <div style={{ position:'absolute', top:5, right:5, width:14, height:14, borderRadius:7, backgroundColor:D.red, color:'white', fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {notifications.length}
              </div>
            )}
          </button>

          {showNotif && (
            <div style={{ position:'absolute', right:0, top:46, width:280, backgroundColor:D.card, borderRadius:14, border:`1px solid ${D.emeraldLight}`, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', zIndex:100, padding:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontWeight:800, fontSize:13, color:D.textDark }}>Notifications</span>
                <button onClick={() => setShowNotif(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:D.emerald, fontWeight:700 }}>Close</button>
              </div>
              {notifications.map(n => (
                <div key={n.id} onClick={() => { setShowNotif(false); navigate(n.path); }} style={{
                  padding:'9px 10px', borderRadius:8, cursor:'pointer', marginBottom:6,
                  backgroundColor: n.type === 'warning' ? '#FFFBEB' : '#F0FDF4',
                  borderLeft:`3px solid ${n.type === 'warning' ? D.gold : D.emerald}`,
                }}>
                  <div style={{ fontSize:12, fontWeight:700, color:D.textDark }}>{n.title}</div>
                </div>
              ))}
              {notifications.length === 0 && <div style={{ fontSize:12, color:D.textSec, textAlign:'center', padding:'12px 0' }}>All caught up!</div>}
            </div>
          )}
        </div>

        <div style={{ flex:1, padding:'36px 40px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}


