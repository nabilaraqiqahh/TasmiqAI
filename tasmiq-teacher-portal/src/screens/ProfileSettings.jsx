import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Lock, Save } from 'lucide-react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const C = {
  bg: '#FEFCE8', card: '#FFFFFF', primary: '#0B6E4F',
  text: '#1E2A22', muted: '#5C6E65', red: '#E05252', green: '#0B6E4F',
};

const SESSION_KEY = 'tasmiq_teacher_session';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { teacher, logout } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (teacher) {
      setDisplayName(teacher.full_name || teacher.display_name || '');
      setEmail(teacher.email || '');
    }
  }, [teacher]);

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    setSaving(true);

    try {
      const updates = { full_name: displayName, display_name: displayName };

      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
        if (newPassword.length < 6) throw new Error("Password must be at least 6 characters");
        updates.password_hash = newPassword;
      }

      const { error: dbError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', teacher.uid || teacher.id);

      if (dbError) throw new Error(dbError.message);

      // Update local session
      const updated = { ...teacher, ...updates };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));

      setNewPassword(''); setConfirmPassword('');
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '20px' }}>
            <ArrowLeft size={28} color={C.text} />
          </button>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Profile Settings</h1>
            <p style={{ fontSize: '15px', color: C.muted, margin: 0 }}>Manage your account details</p>
          </div>
        </div>

        {message && <div style={{ backgroundColor: '#EDFAF4', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', color: C.green, fontWeight: '700', fontSize: '14px' }}>{message}</div>}
        {error && <div style={{ backgroundColor: '#FFECEC', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', color: C.red, fontWeight: '700', fontSize: '14px' }}>{error}</div>}

        <div style={{ backgroundColor: C.card, borderRadius: '24px', padding: '40px', boxShadow: '0 8px 24px rgba(0,0,0,0.03)' }}>
          <form onSubmit={handleSave}>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <User size={16} color={C.primary} /> FULL NAME
              </label>
              <input required type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your full name"
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <Mail size={16} color={C.primary} /> EMAIL ADDRESS
              </label>
              <input disabled type="email" value={email}
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box', backgroundColor: '#F9F9F9', color: C.muted }} />
              <p style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>Email cannot be changed here.</p>
            </div>

            <div style={{ height: '1px', backgroundColor: '#F0F0F0', margin: '28px 0' }} />
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: C.text, marginBottom: '16px' }}>Change Password</h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <Lock size={16} color={C.primary} /> NEW PASSWORD
              </label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <Lock size={16} color={C.primary} /> CONFIRM NEW PASSWORD
              </label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button type="button" onClick={() => navigate(-1)}
                style={{ flex: 1, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: '#F0F0F0', color: C.text, fontWeight: '800', fontSize: '16px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: C.primary, color: 'white', fontWeight: '800', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : <><Save size={20} /> Save Changes</>}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}




