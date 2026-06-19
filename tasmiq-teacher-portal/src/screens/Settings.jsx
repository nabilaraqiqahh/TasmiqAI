import React, { useState, useEffect, useRef } from 'react';
import {
  User, Lock, Bell, Globe, Moon, Sun, CheckCircle,
  Eye, EyeOff, BookOpen, ChevronRight, Camera, Shield,
} from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

// ── Design Tokens ─────────────────────────────────────────────────
const T = {
  primary:    '#0B6E4F',
  primaryDark:'#064E3B',
  primaryLight:'#D1FAE5',
  gold:       '#D4AF37',
  goldLight:  '#F8E7A1',
  bg:         '#F8FAF8',
  card:       '#FFFFFF',
  text:       '#1F2937',
  muted:      '#6B7280',
  border:     '#E5E7EB',
  red:        '#EF4444',
  redLight:   '#FEE2E2',
  green:      '#059669',
  greenLight: '#D1FAE5',
};

// ── Reusable Sub-Components ────────────────────────────────────────
function SectionCard({ id, title, icon: Icon, accent = T.primary, children }) {
  return (
    <div
      id={id}
      style={{
        backgroundColor: T.card,
        borderRadius: '20px',
        padding: '32px',
        border: `1px solid ${T.border}`,
        marginBottom: '24px',
        boxShadow: '0 2px 16px rgba(11,110,79,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          backgroundColor: accent + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={20} color={accent} />
        </div>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: T.text }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, sublabel, checked, onChange }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>{label}</div>
        {sublabel && <div style={{ fontSize: '12px', color: T.muted, marginTop: '3px' }}>{sublabel}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        style={{
          width: '50px', height: '28px', borderRadius: '14px',
          backgroundColor: checked ? T.primary : '#D1D5DB',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background-color 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          width: '22px', height: '22px', borderRadius: '11px', backgroundColor: 'white',
          position: 'absolute', top: '3px',
          left: checked ? '25px' : '3px',
          transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  );
}

function FieldRow({ label, value, readOnly = false, type = 'text', onChange, placeholder }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: T.muted, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: '12px',
          border: `1.5px solid ${readOnly ? T.border : T.primary + '60'}`,
          backgroundColor: readOnly ? T.bg : '#fff',
          color: readOnly ? T.muted : T.text,
          fontSize: '14px', fontWeight: readOnly ? '600' : '700',
          outline: 'none', boxSizing: 'border-box',
          cursor: readOnly ? 'not-allowed' : 'text',
        }}
      />
      {readOnly && (
        <div style={{ fontSize: '11px', color: T.muted, marginTop: '4px' }}>
          Contact admin to change email address.
        </div>
      )}
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle, placeholder, id }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: T.muted, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '12px 48px 12px 16px', borderRadius: '12px',
            border: `1.5px solid ${T.primary + '60'}`,
            backgroundColor: '#fff', color: T.text,
            fontSize: '14px', fontWeight: '700',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: '4px',
            display: 'flex', alignItems: 'center',
          }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

function Alert({ type, message }) {
  const isSuccess = type === 'success';
  return (
    <div style={{
      padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '700',
      display: 'flex', alignItems: 'center', gap: '8px',
      backgroundColor: isSuccess ? T.greenLight : T.redLight,
      color: isSuccess ? T.green : T.red,
      border: `1px solid ${isSuccess ? '#A7F3D0' : '#FECACA'}`,
      marginTop: '4px',
    }}>
      {isSuccess ? <CheckCircle size={15} /> : <Shield size={15} />}
      {message}
    </div>
  );
}

function SaveButton({ onClick, saving, saved, label = 'Save Changes', savedLabel = 'Saved!' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        backgroundColor: saved ? T.green : T.primary,
        color: 'white', border: 'none', borderRadius: '12px',
        padding: '11px 24px', fontWeight: '800', fontSize: '14px',
        cursor: saving ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: '8px',
        boxShadow: `0 4px 14px ${T.primary}35`,
        opacity: saving ? 0.75 : 1,
        transition: 'background-color 0.3s',
      }}
    >
      {saved ? <CheckCircle size={15} /> : null}
      {saving ? 'Saving…' : saved ? savedLabel : label}
    </button>
  );
}

// ── Sidebar Nav ────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'profile',       label: 'Profile',         icon: User },
  { id: 'security',      label: 'Account Security', icon: Lock },
  { id: 'notifications', label: 'Notifications',    icon: Bell },
  { id: 'language',      label: 'Language',         icon: Globe },
  { id: 'appearance',    label: 'Appearance',       icon: Moon },
];

// ── Main Component ────────────────────────────────────────────────
export default function Settings() {
  const { teacher, updateTeacher } = useAuth();

  // ── Profile State ────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [classes, setClasses]         = useState([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);
  const [profileError, setProfileError]   = useState('');

  // ── Password State ───────────────────────────────────────────────
  const [currentPwd, setCurrentPwd]   = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdSaving, setPwdSaving]     = useState(false);
  const [pwdMsg, setPwdMsg]           = useState(null); // { type, text }

  // ── Notification State ───────────────────────────────────────────
  const [notifs, setNotifs] = useState({
    enrollment:    true,
    recitation:    true,
    announcement:  true,
    messages:      false,
    system:        true,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved,  setNotifSaved]  = useState(false);

  // ── Language State ───────────────────────────────────────────────
  const [language, setLanguage] = useState('en');
  const [langSaving, setLangSaving] = useState(false);
  const [langSaved,  setLangSaved]  = useState(false);

  // ── Theme State ──────────────────────────────────────────────────
  const [theme, setTheme]         = useState('light');
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaved,  setThemeSaved]  = useState(false);

  // ── DB Columns Discovery State ───────────────────────────────────
  const [dbColumns, setDbColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('profile');

  // ── Load Data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacher?.id) return;

    const load = async () => {
      setLoading(true);

      // Set display name from auth context
      setDisplayName(teacher.full_name || teacher.display_name || '');

      // Load teacher's classes
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name, class_code, unique_code')
        .eq('teacher_id', teacher.id);
      setClasses(classData || []);

      // Load saved preferences from teacher_settings
      let prefs = null;
      try {
        const { data } = await supabase
          .from('teacher_settings')
          .select('*')
          .eq('teacher_id', teacher.id)
          .maybeSingle();
        prefs = data;
      } catch (err) {
        console.error('Error fetching teacher_settings:', err);
      }

      // Discover columns in DB to handle schema migrations gracefully
      let cols = [];
      if (prefs) {
        cols = Object.keys(prefs);
      } else {
        // Table has no row yet for this teacher. Attempt a minimal insert to fetch columns
        try {
          const { data } = await supabase
            .from('teacher_settings')
            .insert({ teacher_id: teacher.id })
            .select();
          if (data && data.length > 0) {
            cols = Object.keys(data[0]);
            prefs = data[0];
          }
        } catch (err) {
          console.error('Error discovering columns:', err);
        }
      }
      setDbColumns(cols);

      // Load local fallbacks
      const localLanguage = localStorage.getItem('tasmiq_teacher_language') || 'en';
      const localTheme = localStorage.getItem('tasmiq_teacher_theme') || 'light';
      const localNotifsStr = localStorage.getItem('tasmiq_teacher_local_notifs');
      let localNotifs = {};
      if (localNotifsStr) {
        try { localNotifs = JSON.parse(localNotifsStr); } catch (e) {}
      }

      // Match values from DB or LocalStorage
      setLanguage(prefs && cols.includes('language') ? prefs.language : localLanguage);
      setTheme(prefs && cols.includes('theme') ? prefs.theme : localTheme);

      setNotifs({
        enrollment: prefs && cols.includes('notify_enrollment') ? prefs.notify_enrollment : (localNotifs.enrollment !== undefined ? localNotifs.enrollment : true),
        recitation: prefs && cols.includes('notify_recitation') ? prefs.notify_recitation : (localNotifs.recitation !== undefined ? localNotifs.recitation : true),
        announcement: prefs && cols.includes('notify_announcement') ? prefs.notify_announcement : (localNotifs.announcement !== undefined ? localNotifs.announcement : true),
        messages: prefs && cols.includes('notify_messages') ? prefs.notify_messages : (localNotifs.messages !== undefined ? localNotifs.messages : false),
        system: prefs && cols.includes('notify_system') ? prefs.notify_system : (localNotifs.system !== undefined ? localNotifs.system : true),
      });

      setLoading(false);
    };

    load();
  }, [teacher]);

  // ── Upsert helper with graceful LocalStorage fallback ─────────────
  const upsertPrefs = async (patch) => {
    const dbPayload = { teacher_id: teacher.id };
    const localPayload = {};

    // Partition key-value pairs between DB columns and LocalStorage fallback
    Object.keys(patch).forEach(key => {
      if (dbColumns.includes(key)) {
        dbPayload[key] = patch[key];
      } else {
        localPayload[key] = patch[key];
      }
    });

    // Write to DB if there are any supported columns
    if (Object.keys(dbPayload).length > 1) {
      await supabase
        .from('teacher_settings')
        .upsert([{ ...dbPayload, updated_at: new Date().toISOString() }], { onConflict: 'teacher_id' });
    }

    // Write to local fallbacks
    if (Object.keys(localPayload).length > 0) {
      if (localPayload.language) localStorage.setItem('tasmiq_teacher_language', localPayload.language);
      if (localPayload.theme) localStorage.setItem('tasmiq_teacher_theme', localPayload.theme);

      const localNotifsStr = localStorage.getItem('tasmiq_teacher_local_notifs');
      let localNotifsObj = {};
      if (localNotifsStr) {
        try { localNotifsObj = JSON.parse(localNotifsStr); } catch (e) {}
      }

      if (localPayload.notify_enrollment   !== undefined) localNotifsObj.enrollment   = localPayload.notify_enrollment;
      if (localPayload.notify_recitation   !== undefined) localNotifsObj.recitation   = localPayload.notify_recitation;
      if (localPayload.notify_announcement !== undefined) localNotifsObj.announcement = localPayload.notify_announcement;
      if (localPayload.notify_messages     !== undefined) localNotifsObj.messages     = localPayload.notify_messages;
      if (localPayload.notify_system       !== undefined) localNotifsObj.system       = localPayload.notify_system;

      localStorage.setItem('tasmiq_teacher_local_notifs', JSON.stringify(localNotifsObj));
    }
  };

  // ── Profile Save ─────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!displayName.trim()) { setProfileError('Name cannot be empty.'); return; }
    setProfileError('');
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ full_name: displayName.trim() })
        .eq('id', teacher.id);
      if (error) throw error;

      // Update name instantly in context
      if (updateTeacher) {
        updateTeacher({
          full_name: displayName.trim(),
          display_name: displayName.trim(),
        });
      }

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError('Failed to update name: ' + err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Password Change ──────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwdMsg(null);

    // Validate inputs
    if (!currentPwd || !newPwd || !confirmPwd) {
      setPwdMsg({ type: 'error', text: 'Please fill in all password fields.' });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (newPwd.length < 6) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    setPwdSaving(true);
    try {
      // 1. Verify current password against DB
      const { data: userData, error: fetchErr } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', teacher.id)
        .single();

      if (fetchErr || !userData) throw new Error('Could not retrieve account data.');

      if (userData.password_hash !== currentPwd) {
        setPwdMsg({ type: 'error', text: 'Current password is incorrect.' });
        return;
      }

      // 2. Update to new password
      const { error: updateErr } = await supabase
        .from('users')
        .update({ password_hash: newPwd })
        .eq('id', teacher.id);

      if (updateErr) throw updateErr;

      // 3. Success — clear fields
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setPwdMsg({ type: 'success', text: 'Password updated successfully.' });
      setTimeout(() => setPwdMsg(null), 5000);
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setPwdSaving(false);
    }
  };

  // ── Notification Save ────────────────────────────────────────────
  const handleSaveNotifs = async () => {
    setNotifSaving(true);
    try {
      await upsertPrefs({
        notify_enrollment:   notifs.enrollment,
        notify_recitation:   notifs.recitation,
        notify_announcement: notifs.announcement,
        notify_messages:     notifs.messages,
        notify_system:       notifs.system,
      });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } catch (err) {
      alert('Failed to save notification preferences: ' + err.message);
    } finally {
      setNotifSaving(false);
    }
  };

  // ── Language Save ────────────────────────────────────────────────
  const handleSaveLanguage = async () => {
    setLangSaving(true);
    try {
      await upsertPrefs({ language });
      localStorage.setItem('tasmiq_teacher_language', language);
      setLangSaved(true);
      setTimeout(() => setLangSaved(false), 3000);
    } catch (err) {
      alert('Failed to save language preference: ' + err.message);
    } finally {
      setLangSaving(false);
    }
  };

  // ── Theme Save ───────────────────────────────────────────────────
  const handleSaveTheme = async () => {
    setThemeSaving(true);
    try {
      await upsertPrefs({ theme });
      localStorage.setItem('tasmiq_teacher_theme', theme);
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 3000);
    } catch (err) {
      alert('Failed to save theme preference: ' + err.message);
    } finally {
      setThemeSaving(false);
    }
  };

  // ── Scroll to section ────────────────────────────────────────────
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '12px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: `4px solid ${T.primaryLight}`, borderTop: `4px solid ${T.primary}`, animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>

      {/* ── Page Header ───────────────────────────────────────────── */}
      <div style={{ marginBottom: '36px' }}>
        <p style={{ fontSize: '12px', fontWeight: '800', color: T.primary, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px' }}>
          Configuration
        </p>
        <h1 style={{ fontSize: '28px', fontWeight: '900', color: T.text, margin: '0 0 6px' }}>
          Settings
        </h1>
        <p style={{ fontSize: '14px', color: T.muted, margin: 0 }}>
          Manage your profile, security, and portal preferences.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '28px', alignItems: 'start' }}>

        {/* ── Sidebar Nav ─────────────────────────────────────────── */}
        <div style={{
          backgroundColor: T.card, borderRadius: '20px', padding: '12px',
          border: `1px solid ${T.border}`, position: 'sticky', top: '24px',
          boxShadow: '0 2px 12px rgba(11,110,79,0.05)',
        }}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '12px', border: 'none',
                  backgroundColor: active ? T.primaryLight : 'transparent',
                  color: active ? T.primary : T.muted,
                  fontWeight: active ? '800' : '600',
                  fontSize: '14px', cursor: 'pointer',
                  textAlign: 'left', marginBottom: '4px',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={16} />
                {label}
                {active && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
              </button>
            );
          })}
        </div>

        {/* ── Settings Sections ────────────────────────────────────── */}
        <div>

          {/* ── 1. PROFILE ─────────────────────────────────────────── */}
          <SectionCard id="profile" title="Profile" icon={User}>
            {/* Avatar placeholder */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px', paddingBottom: '28px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '50%',
                  backgroundColor: T.primaryLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `3px solid ${T.primary}30`,
                }}>
                  <span style={{ fontSize: '28px' }}>👤</span>
                </div>
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: '24px', height: '24px', borderRadius: '50%',
                  backgroundColor: T.primary, border: '2px solid white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}>
                  <Camera size={11} color="white" />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '900', color: T.text }}>
                  {teacher?.full_name || teacher?.display_name || 'Teacher'}
                </div>
                <div style={{ fontSize: '13px', color: T.muted, marginTop: '2px' }}>
                  {teacher?.role?.toUpperCase() || 'TEACHER'} · TasmiqAI Portal
                </div>
                <div style={{ fontSize: '12px', color: T.primary, fontWeight: '700', marginTop: '4px' }}>
                  {classes.length} Assigned Class{classes.length !== 1 ? 'es' : ''}
                </div>
              </div>
            </div>

            <FieldRow
              label="Full Name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Enter your full name"
            />
            <FieldRow
              label="Email Address"
              value={teacher?.email || ''}
              readOnly
            />

            {/* Assigned Classes */}
            {classes.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: T.muted, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Assigned Classes
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {classes.map(cls => (
                    <div key={cls.id} style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      backgroundColor: T.primaryLight, borderRadius: '10px',
                      padding: '6px 14px', fontSize: '13px', fontWeight: '700', color: T.primary,
                    }}>
                      <BookOpen size={13} />
                      {cls.name}
                      <span style={{ fontSize: '11px', color: T.primaryDark, opacity: 0.7, marginLeft: '2px' }}>
                        · {cls.unique_code || cls.class_code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profileError && <Alert type="error" message={profileError} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <SaveButton onClick={handleSaveProfile} saving={profileSaving} saved={profileSaved} />
            </div>
          </SectionCard>

          {/* ── 2. ACCOUNT SECURITY ────────────────────────────────── */}
          <SectionCard id="security" title="Account Security" icon={Lock} accent="#8B5CF6">
            <p style={{ fontSize: '13px', color: T.muted, margin: '0 0 24px', lineHeight: '1.6' }}>
              To change your password, verify your current password then enter and confirm your new one.
            </p>

            <PasswordField
              id="current-password"
              label="Current Password"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              show={showCurrent}
              onToggle={() => setShowCurrent(s => !s)}
              placeholder="Enter your current password"
            />
            <PasswordField
              id="new-password"
              label="New Password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              show={showNew}
              onToggle={() => setShowNew(s => !s)}
              placeholder="Enter new password (min. 6 characters)"
            />
            <PasswordField
              id="confirm-password"
              label="Confirm New Password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              show={showConfirm}
              onToggle={() => setShowConfirm(s => !s)}
              placeholder="Re-enter new password"
            />

            {pwdMsg && <div style={{ marginBottom: '16px' }}><Alert type={pwdMsg.type} message={pwdMsg.text} /></div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleChangePassword}
                disabled={pwdSaving}
                style={{
                  backgroundColor: '#8B5CF6',
                  color: 'white', border: 'none', borderRadius: '12px',
                  padding: '11px 24px', fontWeight: '800', fontSize: '14px',
                  cursor: pwdSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  boxShadow: '0 4px 14px rgba(139,92,246,0.3)',
                  opacity: pwdSaving ? 0.75 : 1,
                }}
              >
                <Lock size={15} />
                {pwdSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </SectionCard>

          {/* ── 3. NOTIFICATIONS ───────────────────────────────────── */}
          <SectionCard id="notifications" title="Notification Preferences" icon={Bell} accent="#F59E0B">
            <Toggle
              label="New Student Enrollment Requests"
              sublabel="Alert when a student requests to join your class"
              checked={notifs.enrollment}
              onChange={v => setNotifs(n => ({ ...n, enrollment: v }))}
            />
            <Toggle
              label="New Recitation Reviews"
              sublabel="Alert when a student submits a new recitation for review"
              checked={notifs.recitation}
              onChange={v => setNotifs(n => ({ ...n, recitation: v }))}
            />
            <Toggle
              label="Class Announcements"
              sublabel="Receive notifications when announcements are posted in your classes"
              checked={notifs.announcement}
              onChange={v => setNotifs(n => ({ ...n, announcement: v }))}
            />
            <Toggle
              label="Student Messages"
              sublabel="Get notified when students send you a message"
              checked={notifs.messages}
              onChange={v => setNotifs(n => ({ ...n, messages: v }))}
            />
            <div style={{ paddingBottom: '8px' }}>
              <Toggle
                label="System Notifications"
                sublabel="Important system updates and maintenance alerts"
                checked={notifs.system}
                onChange={v => setNotifs(n => ({ ...n, system: v }))}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <SaveButton onClick={handleSaveNotifs} saving={notifSaving} saved={notifSaved} />
            </div>
          </SectionCard>

          {/* ── 4. LANGUAGE ────────────────────────────────────────── */}
          <SectionCard id="language" title="Language" icon={Globe} accent="#0EA5E9">
            <p style={{ fontSize: '13px', color: T.muted, margin: '0 0 20px', lineHeight: '1.6' }}>
              Choose your preferred interface language. Your selection will persist across sessions.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              {[
                { value: 'en', label: 'English', flag: '🇬🇧', sublabel: 'English (United Kingdom)' },
                { value: 'ms', label: 'Bahasa Melayu', flag: '🇲🇾', sublabel: 'Malaysian Standard' },
              ].map(opt => {
                const selected = language === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setLanguage(opt.value)}
                    style={{
                      padding: '16px 20px', borderRadius: '14px',
                      border: `2px solid ${selected ? T.primary : T.border}`,
                      backgroundColor: selected ? T.primaryLight : T.bg,
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '12px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '24px' }}>{opt.flag}</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '800', color: selected ? T.primary : T.text }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '11px', color: T.muted, marginTop: '2px' }}>
                        {opt.sublabel}
                      </div>
                    </div>
                    {selected && (
                      <CheckCircle size={16} color={T.primary} style={{ marginLeft: 'auto' }} />
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton onClick={handleSaveLanguage} saving={langSaving} saved={langSaved} />
            </div>
          </SectionCard>

          {/* ── 5. APPEARANCE ──────────────────────────────────────── */}
          <SectionCard id="appearance" title="Appearance" icon={Moon} accent="#6366F1">
            <p style={{ fontSize: '13px', color: T.muted, margin: '0 0 20px', lineHeight: '1.6' }}>
              Choose a theme that's comfortable for you. TasmiqAI branding is maintained in both modes.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              {[
                {
                  value: 'light', label: 'Light Mode', icon: Sun,
                  preview: { bg: '#F8FAF8', card: '#FFFFFF', text: '#1F2937', accent: '#D1FAE5' },
                  sublabel: 'Clean and bright',
                },
                {
                  value: 'dark', label: 'Dark Mode', icon: Moon,
                  preview: { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', accent: '#064E3B' },
                  sublabel: 'Easy on the eyes',
                },
              ].map(opt => {
                const selected = theme === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      padding: '0', borderRadius: '16px',
                      border: `2px solid ${selected ? T.primary : T.border}`,
                      backgroundColor: 'transparent',
                      cursor: 'pointer', overflow: 'hidden',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Preview pane */}
                    <div style={{
                      backgroundColor: opt.preview.bg, padding: '14px',
                      display: 'flex', flexDirection: 'column', gap: '6px',
                    }}>
                      <div style={{ backgroundColor: opt.preview.card, borderRadius: '8px', padding: '8px 10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '6px', backgroundColor: opt.preview.accent }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: '5px', borderRadius: '3px', backgroundColor: opt.preview.text, opacity: 0.4, marginBottom: '3px', width: '60%' }} />
                          <div style={{ height: '4px', borderRadius: '3px', backgroundColor: opt.preview.text, opacity: 0.2, width: '80%' }} />
                        </div>
                      </div>
                      <div style={{ backgroundColor: opt.preview.card, borderRadius: '8px', padding: '6px 10px' }}>
                        <div style={{ height: '4px', borderRadius: '3px', backgroundColor: opt.preview.text, opacity: 0.3, width: '50%' }} />
                      </div>
                    </div>
                    {/* Label */}
                    <div style={{
                      padding: '12px 16px', borderTop: `1px solid ${T.border}`,
                      backgroundColor: selected ? T.primaryLight : T.card,
                      display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
                    }}>
                      <Icon size={15} color={selected ? T.primary : T.muted} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: selected ? T.primary : T.text }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '11px', color: T.muted }}>{opt.sublabel}</div>
                      </div>
                      {selected && <CheckCircle size={14} color={T.primary} style={{ marginLeft: 'auto' }} />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton onClick={handleSaveTheme} saving={themeSaving} saved={themeSaved} />
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  );
}
