import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Lock, Save } from 'lucide-react';
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

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (teacher) {
      setDisplayName(teacher.user_metadata?.displayName || '');
      setEmail(teacher.email || '');
    }
  }, [teacher]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Update display name in auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { displayName: displayName }
      });
      if (authError) throw authError;

      // Update password if provided
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          alert("Passwords do not match!");
          setSaving(false);
          return;
        }
        const { error: passError } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (passError) throw passError;
        setNewPassword('');
        setConfirmPassword('');
      }

      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Error updating profile", err);
      alert(`Failed to update profile: ${err.message || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '20px' }}>
            <ArrowLeft size={28} color={C.text} />
          </button>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Profile Settings</h1>
            <p style={{ fontSize: '15px', color: C.muted }}>Manage your account details</p>
          </div>
        </div>

        {/* Profile Card */}
        <div style={{ backgroundColor: C.card, borderRadius: '24px', padding: '40px', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', border: '1px solid #F8F8F8' }}>
          <form onSubmit={handleSaveProfile}>
            
            {/* Display Name */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <User size={16} color={C.primary} /> DISPLAY NAME
              </label>
              <input 
                required
                type="text" 
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <Mail size={16} color={C.primary} /> EMAIL ADDRESS
              </label>
              <input 
                disabled
                type="email" 
                value={email}
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box', backgroundColor: '#F9F9F9', color: C.muted }}
              />
              <p style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>Email cannot be changed from this portal.</p>
            </div>

            <div style={{ height: '1px', backgroundColor: '#F0F0F0', margin: '32px 0' }} />

            {/* Password Change */}
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: C.text, marginBottom: '16px' }}>Change Password</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <Lock size={16} color={C.primary} /> NEW PASSWORD
              </label>
              <input 
                type="password" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>
                <Lock size={16} color={C.primary} /> CONFIRM NEW PASSWORD
              </label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <button 
                type="button" 
                onClick={() => navigate(-1)}
                style={{ flex: 1, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: '#F0F0F0', color: C.text, fontWeight: '800', fontSize: '16px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={saving}
                style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: C.primary, color: 'white', fontWeight: '800', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving...' : <><Save size={20} /> Save Changes</>}
              </button>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
}
