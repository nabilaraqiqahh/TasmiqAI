import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, Image, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginUser, getUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

export default function LoginScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async () => {
    setError('');
    setSuccess('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const user = await loginUser(email.trim(), password);
      const profile = await getUserProfile(user.id);
      const role = profile?.role || 'student';
      
      await AsyncStorage.setItem('user_role', role);

      if (role === 'staff' || role === 'teacher') {
        setSuccess('✅ Welcome back, Staff! Redirecting...');
        setTimeout(() => navigation.replace('TeacherDashboard'), 1200);
      } else {
        setSuccess('✅ Login successful! Redirecting...');
        setTimeout(() => navigation.replace('MainTabs'), 1200);
      }
    } catch (err) {
      const msg =
        err.code === 'auth/invalid-credential' ? 'Incorrect email or password.' :
        err.code === 'auth/user-not-found' ? 'No account found with this email.' :
        err.code === 'auth/wrong-password' ? 'Incorrect password.' :
        err.code === 'auth/invalid-email' ? 'Invalid email address.' :
        err.code === 'auth/too-many-requests' ? 'Too many failed attempts. Try again later.' :
        `Login failed: ${err.message}`;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IslamicBackground variant="full">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, maxWidth: 500, alignSelf: 'center', width: '100%' }}>

          {/* Logo + Title */}
          <View style={{ alignItems: 'center', marginBottom: 48 }}>
            <View style={{ backgroundColor: C.card, padding: 16, borderRadius: 28, elevation: 6, marginBottom: 24 }}>
              <Image
                source={require('../../../assets/logo.png')}
                style={{ width: 90, height: 90 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ fontSize: 32, fontWeight: '900', color: C.text, marginBottom: 8 }}>Welcome Back</Text>
            <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center' }}>Sign in to continue your journey</Text>
          </View>

          {/* Banners */}
          {error ? (
            <View style={{ backgroundColor: '#FFECEC', borderRadius: 16, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="alert-circle" size={20} color="#E05252" />
              <Text style={{ color: '#E05252', fontSize: 14, flex: 1, fontWeight: '700' }}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={{ backgroundColor: '#EDFAF4', borderRadius: 16, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="checkmark-circle" size={20} color={C.primary} />
              <Text style={{ color: C.primary, fontSize: 14, flex: 1, fontWeight: '700' }}>{success}</Text>
            </View>
          ) : null}

          {/* Email */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Email Address</Text>
          <View style={{
            backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18,
            flexDirection: 'row', alignItems: 'center', marginBottom: 16,
            shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
            borderWidth: 1, borderColor: '#F0F0F0'
          }}>
            <Ionicons name="mail-outline" size={20} color={C.primary} style={{ marginRight: 14 }} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#BBBBBB"
              keyboardType="email-address"
              autoCapitalize="none"
              style={{ flex: 1, fontSize: 16, color: C.text }}
            />
          </View>

          {/* Password */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Password</Text>
          <View style={{
            backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18,
            flexDirection: 'row', alignItems: 'center', marginBottom: 32,
            shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
            borderWidth: 1, borderColor: '#F0F0F0'
          }}>
            <Ionicons name="lock-closed-outline" size={20} color={C.primary} style={{ marginRight: 14 }} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#BBBBBB"
              secureTextEntry={!showPassword}
              style={{ flex: 1, fontSize: 16, color: C.text }}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={{
              backgroundColor: C.primary, borderRadius: 20, paddingVertical: 20, alignItems: 'center',
              shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8,
              opacity: loading ? 0.75 : 1,
            }}
            onPress={handleLogin}
            disabled={loading || !!success}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 }}>Sign In</Text>
            }
          </TouchableOpacity>

          {/* Sign Up Link */}
          <TouchableOpacity onPress={() => navigation.navigate('SignUp', { role: route?.params?.role })} style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: C.muted }}>
              Don't have an account?{' '}
              <Text style={{ color: C.primary, fontWeight: '900' }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>

        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </IslamicBackground>
  );
}
