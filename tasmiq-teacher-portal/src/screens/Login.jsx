import React, { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, User, ArrowLeft, ShieldCheck, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.png';

const Login = () => {
  const { login, register, getRoleFromEmail, teacher } = useAuth();
  const navigate = useNavigate();
  
  // States
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle auto-redirect if logged in as staff
  useEffect(() => {
    if (teacher) navigate('/dashboard');
  }, [teacher, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        if (password.length < 6) throw new Error("Password must be at least 6 characters");
        
        await register(email, password, name);
        setSuccess('Account created! Sign in to continue.');
        setTimeout(() => {
            setIsSignUp(false);
            setSuccess('');
        }, 2000);
      } else {
        await login(email, password);
        // AuthContext handles the teacher state which triggers the useEffect redirect
      }
    } catch (err) {
      setError(err.message || 'Action failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const detectedRole = getRoleFromEmail(email);

  const C = {
    primary: '#10B981',
    bg: '#F5F2E9',
    card: '#FFFFFF',
    text: '#2C2C2C',
    muted: '#6B6B6B',
    red: '#E05252',
    green: '#10B981'
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      width: '100%',
      backgroundColor: C.bg, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '450px', 
        textAlign: 'center'
      }}>
        
        {/* Header Section */}
        <div style={{ 
          backgroundColor: 'white', 
          width: '100px', 
          height: '100px', 
          borderRadius: '28px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 32px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
          padding: '16px',
          boxSizing: 'border-box'
        }}>
          <img src={logoImg} alt="TasmiqAI Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: '900', color: C.text, marginBottom: '8px' }}>
            {isSignUp ? 'Staff Registration' : 'Welcome Back'}
        </h1>
        <p style={{ color: C.muted, fontSize: '15px', marginBottom: '32px' }}>
            {isSignUp ? 'Create your staff account to manage recitations' : 'Sign in to the Teacher Portal'}
        </p>

        {/* Feedback Banners */}
        {error && (
          <div style={{ 
            backgroundColor: '#FFECEC', 
            borderRadius: '16px', 
            padding: '16px', 
            marginBottom: '24px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            textAlign: 'left',
            border: '1px solid rgba(224, 82, 82, 0.2)'
          }}>
            <AlertCircle size={20} color={C.red} />
            <p style={{ color: C.red, fontSize: '14px', fontWeight: '600', margin: 0 }}>{error}</p>
          </div>
        )}

        {success && (
          <div style={{ 
            backgroundColor: '#EDFAF4', 
            borderRadius: '16px', 
            padding: '16px', 
            marginBottom: '24px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            textAlign: 'left',
            border: `1px solid ${C.green}30`
          }}>
            <CheckCircle size={20} color={C.green} />
            <p style={{ color: C.green, fontSize: '14px', fontWeight: '600', margin: 0 }}>{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {isSignUp && (
            <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.primary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', marginLeft: '4px' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                <User style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: C.primary }} size={20} />
                <input 
                    type="text" 
                    placeholder="Ustaz Ahmad" 
                    required={isSignUp}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    style={{ width: '100%', padding: '18px 20px 18px 56px', borderRadius: '18px', border: '1px solid #F0F0F0', backgroundColor: 'white', fontSize: '16px', outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}
                />
                </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.primary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', marginLeft: '4px' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: C.primary }} size={20} />
              <input 
                type="email" 
                placeholder="ustaz@staff.tahfiz.my" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '18px 20px 18px 56px', borderRadius: '18px', border: '1px solid #F0F0F0', backgroundColor: 'white', fontSize: '16px', outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}
              />
            </div>
            {detectedRole && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', marginLeft: '4px' }}>
                    <ShieldCheck size={14} color={C.primary} />
                    <span style={{ fontSize: '12px', color: C.primary, fontWeight: '700' }}>
                        Verified {detectedRole === 'staff' ? 'Staff' : 'Student'} Domain Detected
                    </span>
                </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.primary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', marginLeft: '4px' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: C.primary }} size={20} />
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '18px 20px 18px 56px', borderRadius: '18px', border: '1px solid #F0F0F0', backgroundColor: 'white', fontSize: '16px', outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'none', color: C.muted, border: 'none', cursor: 'pointer' }}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.primary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', marginLeft: '4px' }}>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                    <ShieldCheck style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: C.primary }} size={20} />
                    <input 
                        type="password" 
                        placeholder="••••••••" 
                        required={isSignUp}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
                        style={{ width: '100%', padding: '18px 20px 18px 56px', borderRadius: '18px', border: '1px solid #F0F0F0', backgroundColor: 'white', fontSize: '16px', outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}
                    />
                </div>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            style={{ 
              backgroundColor: C.primary, 
              color: 'white', 
              padding: '20px', 
              borderRadius: '20px', 
              border: 'none', 
              fontSize: '17px', 
              fontWeight: '800', 
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '12px',
              boxShadow: `0 10px 20px ${C.primary}30`,
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Processing...' : (isSignUp ? 'Register as Staff' : 'Sign In')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '40px', fontSize: '15px', color: C.muted }}>
          {isSignUp ? 'Already have a staff account?' : "Don't have a staff account?"}{' '}
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: 'none', border: 'none', color: C.primary, fontWeight: '900', cursor: 'pointer', fontSize: '15px' }}
          >
            {isSignUp ? 'Log In' : 'Sign Up'}
          </button>
        </p>

      </div>
    </div>
  );
};

export default Login;


