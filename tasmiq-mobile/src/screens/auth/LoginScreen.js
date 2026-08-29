import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  Image, StatusBar, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PlatformStorage from '../../services/storage';
import { loginUser } from '../../services/authService';

// ── Design tokens ──────────────────────────────────────────────────────────────
const P   = '#0B6E4F';
const PD  = '#064E3B';
const PL  = '#D1FAE5';
const G   = '#D4AF37';
const BG  = '#FFFDF0';
const BSF = '#FFF9E6';

export default function LoginScreen({ navigation, route }) {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  const handleLogin = async () => {
    setError(''); setSuccess('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const session = await loginUser(email.trim(), password);
      const role = session.role || 'student';
      await PlatformStorage.setItem('user_role', role);
      setSuccess('Login successful! Loading your workspace...');
      const isStaff = role === 'staff' || role === 'teacher' || role === 'admin';
      setTimeout(() => navigation.replace(isStaff ? 'TeacherDashboard' : 'MainTabs'), 500);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Top gradient banner ── */}
          <LinearGradient
            colors={[P, PD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: 52, paddingBottom: 44, alignItems: 'center', borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}
          >
            {/* Back */}
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ position: 'absolute', top: 16, left: 20, width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={20} color="white" />
            </TouchableOpacity>

            {/* Logo */}
            <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Image source={require('../../../assets/logo.jpg')} style={{ width: 76, height: 76 }} resizeMode="contain" />
            </View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFFFFF', marginBottom: 6 }}>Welcome Back</Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Sign in to continue your journey</Text>
          </LinearGradient>

          {/* ── Form ── */}
          <View style={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, maxWidth: 480, alignSelf: 'center', width: '100%' }}>

            {/* Error banner */}
            {!!error && (
              <View style={{ backgroundColor: '#FEE2E2', borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#FECACA' }}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={{ color: '#DC2626', fontSize: 13, flex: 1, fontWeight: '700' }}>{error}</Text>
              </View>
            )}

            {/* Success banner */}
            {!!success && (
              <View style={{ backgroundColor: PL, borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color={P} />
                <Text style={{ color: PD, fontSize: 13, flex: 1, fontWeight: '700' }}>{success}</Text>
              </View>
            )}

            {/* Email field */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: PD, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Email Address</Text>
            <View style={{ backgroundColor: BSF, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: '#E8F0EA' }}>
              <Ionicons name="mail-outline" size={20} color={P} style={{ marginRight: 12 }} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="your@student.tahfiz.my"
                placeholderTextColor="#B0B8C1"
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ flex: 1, fontSize: 15, color: PD }}
              />
            </View>

            {/* Password field */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: PD, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Password</Text>
            <View style={{ backgroundColor: BSF, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 28, borderWidth: 1.5, borderColor: '#E8F0EA' }}>
              <Ionicons name="lock-closed-outline" size={20} color={P} style={{ marginRight: 12 }} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor="#B0B8C1"
                secureTextEntry={!showPwd}
                style={{ flex: 1, fontSize: 15, color: PD }}
              />
              <TouchableOpacity onPress={() => setShowPwd(!showPwd)}>
                <Ionicons name={showPwd ? 'eye-outline' : 'eye-off-outline'} size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Sign In button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading || !!success}
              activeOpacity={0.88}
              style={{ backgroundColor: P, borderRadius: 18, paddingVertical: 18, alignItems: 'center', shadowColor: P, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, opacity: (loading || !!success) ? 0.75 : 1 }}
            >
              {loading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.4 }}>Sign In</Text>
              }
            </TouchableOpacity>

            {/* Sign up link */}
            <TouchableOpacity
              onPress={() => navigation.navigate('SignUp', { role: route?.params?.role })}
              style={{ marginTop: 22, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, color: '#6B7280' }}>
                Don't have an account?{' '}
                <Text style={{ color: P, fontWeight: '800' }}>Create Account</Text>
              </Text>
            </TouchableOpacity>

            {/* Decorative hadith quote */}
            <View style={{ marginTop: 40, backgroundColor: PL, borderRadius: 16, padding: 18, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: PD, textAlign: 'center', lineHeight: 30, marginBottom: 8 }}>
                خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ
              </Text>
              <Text style={{ fontSize: 12, color: P, textAlign: 'center', fontStyle: 'italic', fontWeight: '600' }}>
                "The best among you are those who learn the Quran and teach it."
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
