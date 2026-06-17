import React, { useState, useEffect } from 'react';
import { Save, Bell, GraduationCap, BarChart2, FileText, Monitor, RefreshCw, CheckCircle } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

const T = {
  primary: '#10B981', primaryDark: '#047857', primaryLight: '#F5F2E9',
  gold: '#D4AF37', bg: '#F5F2E9', card: '#FFFFFF',
  text: '#1E2A22', muted: '#6B7280', red: '#EF4444', border: '#EAE3D5',
};

const DEFAULT = {
  notify_enrollment: true, notify_recitation: true,
  notify_weekly_report: true, notify_student_inactive: true,
  min_passing_score: 70, warning_threshold: 60,
  ai_confidence_threshold: 75, require_teacher_review: true,
  default_report_period: 'monthly', default_pdf_format: 'portrait',
  enrollment_enabled: true, qr_enrollment_enabled: true,
};

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div style={{
      backgroundColor: T.card, borderRadius: '20px', padding: '28px',
      border: `1px solid ${T.border}`, marginBottom: '24px',
      boxShadow: '0 2px 12px rgba(16,185,129,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: T.primaryLight, borderRadius: '10px', padding: '8px' }}>
          <Icon size={18} color={T.primaryDark} />
        </div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: T.text }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, sublabel, checked, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', marginBottom: '16px', borderBottom: `1px solid ${T.primaryLight}` }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>{label}</div>
        {sublabel && <div style={{ fontSize: '12px', color: T.muted, marginTop: '2px' }}>{sublabel}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: '48px', height: '26px', borderRadius: '13px',
          backgroundColor: checked ? T.primary : '#D1D5DB',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background-color 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          width: '20px', height: '20px', borderRadius: '10px', backgroundColor: 'white',
          position: 'absolute', top: '3px',
          left: checked ? '25px' : '3px',
          transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

function NumberInput({ label, sublabel, value, min, max, onChange }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: T.text, marginBottom: '4px' }}>{label}</label>
      {sublabel && <div style={{ fontSize: '12px', color: T.muted, marginBottom: '8px' }}>{sublabel}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{ flex: 1, accentColor: T.primary }}
        />
        <span style={{
          backgroundColor: T.primaryLight, color: T.primaryDark, fontWeight: '800',
          fontSize: '14px', padding: '4px 12px', borderRadius: '8px', minWidth: '48px', textAlign: 'center',
        }}>
          {value}%
        </span>
      </div>
    </div>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: T.text, marginBottom: '8px' }}>{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '12px',
          border: `1px solid ${T.border}`, backgroundColor: T.bg,
          color: T.text, fontSize: '14px', fontWeight: '600', outline: 'none',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function Settings() {
  const { teacher } = useAuth();
  const [settings, setSettings] = useState(DEFAULT);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    loadSettings();
    checkApiStatus();
  }, [teacher]);

  const loadSettings = async () => {
    if (!teacher?.id) return;
    try {
      const { data } = await supabase
        .from('teacher_settings')
        .select('*')
        .eq('teacher_id', teacher.id)
        .maybeSingle();
      if (data) setSettings({ ...DEFAULT, ...data });
    } catch (err) {
      console.error('Load settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkApiStatus = async () => {
    try {
      const res = await fetch('http://localhost:8001/health');
      setApiStatus(res.ok ? 'online' : 'offline');
    } catch {
      setApiStatus('offline');
    }
  };

  const saveSettings = async () => {
    if (!teacher?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('teacher_settings')
        .upsert([{ ...settings, teacher_id: teacher.id, updated_at: new Date().toISOString() }],
          { onConflict: 'teacher_id' });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `4px solid ${T.primaryLight}`, borderTop: `4px solid ${T.primary}`, animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '800', color: T.primary, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px' }}>Configuration</p>
          <h1 style={{ fontSize: '28px', fontWeight: '900', color: T.text, margin: '0 0 4px' }}>Teacher Settings</h1>
          <p style={{ fontSize: '14px', color: T.muted, margin: 0 }}>Configure your portal preferences and system options.</p>
        </div>
        <button
          onClick={saveSettings} disabled={saving}
          style={{
            backgroundColor: saved ? T.primary : T.primaryDark,
            color: 'white', border: 'none', borderRadius: '14px',
            padding: '12px 24px', fontWeight: '800', fontSize: '14px',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: `0 4px 14px ${T.primary}40`,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saved ? <CheckCircle size={16} /> : <Save size={16} />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Notification Settings */}
      <SectionCard title="Notification Settings" icon={Bell}>
        <Toggle label="New Enrollment Request" sublabel="Alert when a student requests to join your class" checked={settings.notify_enrollment} onChange={v => set('notify_enrollment', v)} />
        <Toggle label="New Recitation Submitted" sublabel="Alert when a student submits a recitation for review" checked={settings.notify_recitation} onChange={v => set('notify_recitation', v)} />
        <Toggle label="Weekly Report Reminder" sublabel="Reminder to review weekly performance report" checked={settings.notify_weekly_report} onChange={v => set('notify_weekly_report', v)} />
        <Toggle label="Student Inactivity Alert" sublabel="Alert when a student has not practiced for 3+ days" checked={settings.notify_student_inactive} onChange={v => set('notify_student_inactive', v)} />
      </SectionCard>

      {/* Assessment Settings */}
      <SectionCard title="Assessment Settings" icon={BarChart2}>
        <NumberInput label="Minimum Passing Score" sublabel="Students scoring below this will be flagged" value={settings.min_passing_score} min={50} max={90} onChange={v => set('min_passing_score', v)} />
        <NumberInput label="Warning Threshold" sublabel="Students scoring below this receive an early warning" value={settings.warning_threshold} min={40} max={80} onChange={v => set('warning_threshold', v)} />
        <NumberInput label="AI Confidence Threshold" sublabel="Minimum AI confidence level to accept an assessment" value={settings.ai_confidence_threshold} min={50} max={95} onChange={v => set('ai_confidence_threshold', v)} />
        <Toggle label="Require Teacher Review" sublabel="AI assessments must be manually reviewed before shown to students" checked={settings.require_teacher_review} onChange={v => set('require_teacher_review', v)} />
      </SectionCard>

      {/* Class Settings */}
      <SectionCard title="Class Settings" icon={GraduationCap}>
        <Toggle label="Enable Student Enrollment" sublabel="Allow students to submit join requests for your classes" checked={settings.enrollment_enabled} onChange={v => set('enrollment_enabled', v)} />
        <Toggle label="Enable QR Code Enrollment" sublabel="Students can scan QR code to join class instantly" checked={settings.qr_enrollment_enabled} onChange={v => set('qr_enrollment_enabled', v)} />
      </SectionCard>

      {/* Report Settings */}
      <SectionCard title="Report Settings" icon={FileText}>
        <SelectInput
          label="Default Report Period"
          value={settings.default_report_period}
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'quarterly', label: 'Quarterly' },
          ]}
          onChange={v => set('default_report_period', v)}
        />
        <SelectInput
          label="Default PDF Format"
          value={settings.default_pdf_format}
          options={[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ]}
          onChange={v => set('default_pdf_format', v)}
        />
      </SectionCard>

      {/* System Status */}
      <SectionCard title="System Status" icon={Monitor}>
        {[
          { label: 'Supabase Database', status: 'online', detail: 'Connected to mrxgwwhbcskcjkgtnrtd' },
          { label: 'AI Engine (TasmiqAI API)', status: apiStatus, detail: 'localhost:8001' },
          { label: 'Application Version', status: 'info', detail: 'v2.1.0 — TasmiqAI Educator' },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0', borderBottom: i < 2 ? `1px solid ${T.primaryLight}` : 'none',
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>{item.label}</div>
              <div style={{ fontSize: '12px', color: T.muted, marginTop: '2px' }}>{item.detail}</div>
            </div>
            <div style={{
              padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '800',
              backgroundColor:
                item.status === 'online'   ? '#F5F2E9' :
                item.status === 'offline'  ? '#FEE2E2' :
                item.status === 'checking' ? '#FEF9C3' : '#E0E7FF',
              color:
                item.status === 'online'   ? '#065F46' :
                item.status === 'offline'  ? '#991B1B' :
                item.status === 'checking' ? '#92400E' : '#3730A3',
            }}>
              {item.status === 'online'   ? '● Online' :
               item.status === 'offline'  ? '● Offline' :
               item.status === 'checking' ? '● Checking...' : 'ℹ Info'}
            </div>
          </div>
        ))}
        <button
          onClick={checkApiStatus}
          style={{
            marginTop: '16px', padding: '10px 20px', borderRadius: '12px',
            border: `1px solid ${T.border}`, backgroundColor: T.bg,
            color: T.primaryDark, fontWeight: '700', fontSize: '13px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <RefreshCw size={14} /> Refresh Status
        </button>
      </SectionCard>
    </div>
  );
}


