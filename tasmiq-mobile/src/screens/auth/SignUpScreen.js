import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, Image, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PlatformStorage from '../../services/storage';
import { registerStudent, registerTeacher } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

const Field = ({ icon, placeholder, value, onChangeText, secure, keyboardType, extra, showPassword, C, autoComplete = 'off' }) => (
  <View style={{
    backgroundColor: C.card, borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
    borderWidth: 1, borderColor: '#F0F0F0'
  }}>
    <Ionicons name={icon} size={20} color={C.primary} style={{ marginRight: 14 }} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#BBBBBB"
      secureTextEntry={secure && !showPassword}
      keyboardType={keyboardType || 'default'}
      autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      autoComplete={autoComplete}
      importantForAutofill="no"
      textContentType="none"
      style={{ flex: 1, fontSize: 16, color: C.text }}
    />
    {extra}
  </View>
);

export default function SignUpScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();
  const role = route?.params?.role || 'student';
  const isStaff = role === 'staff' || role === 'teacher';
  const ACCENT = isStaff ? C.lilac : C.primary;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  }, []);

  const handleSignUp = async () => {
    setError('');
    setSuccess('');

    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isStaff) {
        await registerTeacher(email.trim(), password, name.trim());
        await PlatformStorage.setItem('user_role', 'staff');
        setSuccess('✅ Staff account created! Redirecting...');
        setTimeout(() => navigation.replace('TeacherDashboard'), 1000);
      } else {
        await registerStudent(email.trim(), password, name.trim());
        await PlatformStorage.setItem('user_role', 'student');
        setSuccess('✅ Account created! Redirecting...');
        setTimeout(() => navigation.replace('MainTabs'), 1000);
      }
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IslamicBackground variant="full">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32, maxWidth: 500, alignSelf: 'center', width: '100%' }} showsVerticalScrollIndicator={false}>

          {/* Back Button */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', elevation: 2 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>

          {/* Logo + Title */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <View style={{ backgroundColor: C.card, padding: 12, borderRadius: 24, elevation: 4, marginBottom: 20 }}>
              <Image
                source={require('../../../assets/logo.png')}
                style={{ width: 80, height: 80 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: C.text, marginBottom: 8 }}>
              {isStaff ? 'Staff Registration' : 'Join TasmiqAI'}
            </Text>
            <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 }}>
              {isStaff ? 'Register as a TasmiqAI staff member to manage student progress' : 'Create your student account and start your recitation journey'}
            </Text>
          </View>

          {/* Feedback Banners */}
          {error ? (
            <View style={{ backgroundColor: '#FFECEC', borderRadius: 14, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="alert-circle" size={20} color="#E05252" />
              <Text style={{ color: '#E05252', fontSize: 14, flex: 1, fontWeight: '700' }}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={{ backgroundColor: '#EDFAF4', borderRadius: 14, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="checkmark-circle" size={20} color={C.primary} />
              <Text style={{ color: C.primary, fontSize: 14, flex: 1, fontWeight: '700' }}>{success}</Text>
            </View>
          ) : null}

          {/* Form Fields */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Full Name</Text>
          <Field icon="person-outline" placeholder="Your Name" value={name} onChangeText={setName} showPassword={showPassword} C={C} autoComplete="off" />

          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Email Address</Text>
          <Field icon="mail-outline" placeholder={isStaff ? 'staff@staff.tahfiz.my' : 'your@student.tahfiz.my'} value={email} onChangeText={setEmail} keyboardType="email-address" showPassword={showPassword} C={C} autoComplete="off" />
          {email.toLowerCase().includes('tahfiz.my') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 16, marginLeft: 4 }}>
              <Ionicons name="shield-checkmark" size={14} color={C.primary} />
              <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700' }}>
                Verified {email.includes('staff') ? 'Staff' : 'Student'} Domain Detected
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Password</Text>
          <Field
            icon="lock-closed-outline"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secure
            showPassword={showPassword}
            C={C}
            autoComplete="new-password"
            extra={
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.muted} />
              </TouchableOpacity>
            }
          />

          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Confirm Password</Text>
          <Field icon="shield-checkmark-outline" placeholder="Re-enter password" value={confirmPassword} onChangeText={setConfirmPassword} secure showPassword={showPassword} C={C} autoComplete="new-password" />

          {/* Sign Up Button */}
          <TouchableOpacity
            style={{
              backgroundColor: ACCENT, borderRadius: 20,
              paddingVertical: 20, alignItems: 'center', marginTop: 12,
              shadowColor: ACCENT, shadowOpacity: 0.3,
              shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8,
              opacity: loading ? 0.75 : 1,
            }}
            onPress={handleSignUp}
            disabled={loading || !!success}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 }}>
                  {isStaff ? 'Register as Staff' : 'Create Account'}
                </Text>
            }
          </TouchableOpacity>

          {/* Already have account */}
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: C.muted }}>
              Already have an account?{' '}
              <Text style={{ color: ACCENT, fontWeight: '900' }}>Log In</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </IslamicBackground>
  );
}

