import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { getCurrentUser } from '../services/authService';
import { supabase } from '../services/supabaseClient';

// Auth Screens
import WelcomeScreen  from '../screens/auth/WelcomeScreen';
import LoginScreen    from '../screens/auth/LoginScreen';
import SignUpScreen   from '../screens/auth/SignUpScreen';

// Student Screens
import DashboardScreen    from '../screens/main/DashboardScreen';
import HistoryScreen      from '../screens/main/HistoryScreen';
import ProfileScreen      from '../screens/main/ProfileScreen';
import JoinClassScreen    from '../screens/main/JoinClassScreen';
import NudgeScreen        from '../screens/main/NudgeScreen';
import MurajaahModeScreen from '../screens/features/MurajaahModeScreen';
import ProgressScreen     from '../screens/features/ProgressScreen';
import TasmiqModeScreen   from '../screens/features/TasmiqModeScreen';
import TasmiqPrepScreen   from '../screens/features/TasmiqPrepScreen';

// Teacher Screens
import TeacherDashboard        from '../screens/teacher/TeacherDashboard';
import TeacherStudents         from '../screens/teacher/TeacherStudents';
import TeacherReview           from '../screens/teacher/TeacherReview';
import TeacherEvaluationScreen from '../screens/features/TeacherEvaluationScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const P  = '#0B6E4F';
const PD = '#064E3B';
const PL = '#D1FAE5';
const G  = '#D4AF37';

// ── Join Class Bottom Sheet ────────────────────────────────────────────────────
// Appears from the center tab — no extra screen needed
function JoinClassSheet({ visible, onClose, userId }) {
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const reset = () => { setCode(''); setLoading(false); setSuccess(null); };

  const handleClose = () => { reset(); onClose(); };

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { Alert.alert('Enter Code', 'Please enter a class code.'); return; }
    if (!userId)  { Alert.alert('Not logged in', 'Please log in first.'); return; }
    setLoading(true);
    try {
      // 1. Find class by code
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id, name, teacher_id')
        .or(`class_code.eq.${trimmed},unique_code.eq.${trimmed}`)
        .maybeSingle();

      if (clsErr || !cls) {
        Alert.alert('Invalid Code', 'No class found with that code. Check the code and try again.');
        setLoading(false); return;
      }

      // 2. Check if already enrolled
      const { data: existing } = await supabase
        .from('class_members')
        .select('id')
        .eq('class_id', cls.id)
        .eq('student_id', userId)
        .maybeSingle();

      if (existing) {
        Alert.alert('Already Enrolled', `You are already a member of ${cls.name}.`);
        setLoading(false); return;
      }

      // 3. Join directly — no teacher approval required
      const { error: joinErr } = await supabase
        .from('class_members')
        .insert({ class_id: cls.id, student_id: userId, joined_at: new Date().toISOString() });

      if (joinErr) throw joinErr;

      // 4. Clean up any pending join request
      await supabase.from('join_requests').delete()
        .eq('class_id', cls.id).eq('student_id', userId);

      setSuccess({ className: cls.name });
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not join class. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={handleClose} />
      <View style={{ backgroundColor: '#FFFDF0', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
        {/* Handle */}
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 }} />

        {success ? (
          // ── Success state ──
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: PL, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="checkmark-circle" size={44} color={P} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: PD, marginBottom: 8 }}>Joined!</Text>
            <Text style={{ fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 28 }}>
              You are now a member of{'\n'}
              <Text style={{ fontWeight: '800', color: PD }}>{success.className}</Text>
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={{ backgroundColor: P, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 48, shadowColor: P, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── Entry state ──
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: PL, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="people" size={20} color={P} />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '900', color: PD }}>Join a Class</Text>
                <Text style={{ fontSize: 13, color: '#6B7280' }}>Enter the class code from your teacher</Text>
              </View>
            </View>

            <View style={{ marginTop: 22, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: PD, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Class Code
              </Text>
              <TextInput
                value={code}
                onChangeText={t => setCode(t.toUpperCase())}
                placeholder="e.g. TAHFIZ2024"
                placeholderTextColor="#B0B8C1"
                autoCapitalize="characters"
                autoCorrect={false}
                style={{
                  backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18,
                  fontSize: 20, fontWeight: '800', color: PD, letterSpacing: 2,
                  borderWidth: 2, borderColor: code ? P : '#E5E7EB',
                  textAlign: 'center',
                }}
              />
            </View>

            <TouchableOpacity
              onPress={handleJoin}
              disabled={loading || !code.trim()}
              style={{
                backgroundColor: code.trim() ? P : '#D1D5DB',
                borderRadius: 16, paddingVertical: 18, alignItems: 'center',
                shadowColor: P, shadowOpacity: code.trim() ? 0.3 : 0, shadowRadius: 10, elevation: code.trim() ? 6 : 0,
              }}
            >
              {loading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Join Class →</Text>
              }
            </TouchableOpacity>

            <Text style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 14 }}>
              Ask your teacher for the class code. You will be added instantly.
            </Text>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Student Tab Navigator ─────────────────────────────────────────────────────
function MainTabNavigator() {
  const [joinVisible, setJoinVisible] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    getCurrentUser().then(s => { if (s?.id) setUserId(s.id); });
  }, []);

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor:   P,
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            height: Platform.OS === 'ios' ? 88 : 72,
            paddingBottom: Platform.OS === 'ios' ? 26 : 12,
            paddingTop: 8,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 0,
            elevation: 20,
            shadowColor: '#000',
            shadowOpacity: 0.10,
            shadowRadius: 20,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
          tabBarIcon: ({ focused, color }) => {
            // ── CENTER: Join Class ──
            if (route.name === 'JoinClassTab') {
              return (
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: P,
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: -22,
                  shadowColor: P, shadowOpacity: 0.4, shadowRadius: 14,
                  shadowOffset: { width: 0, height: 4 }, elevation: 10,
                  borderWidth: 3, borderColor: '#FFFFFF',
                }}>
                  <Ionicons name="people" size={24} color="#FFFFFF" />
                </View>
              );
            }
            // ── Tasmiq ──
            if (route.name === 'Tasmiq') {
              return (
                <View style={{
                  width: 46, height: 46, borderRadius: 23,
                  backgroundColor: focused ? P : P + '18',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: -14,
                  shadowColor: P, shadowOpacity: focused ? 0.3 : 0, shadowRadius: 10, elevation: focused ? 6 : 0,
                }}>
                  <Ionicons name="mic" size={22} color={focused ? '#FFFFFF' : P} />
                </View>
              );
            }
            const icons = {
              Home:     focused ? 'home'         : 'home-outline',
              Learn:    focused ? 'book'          : 'book-outline',
              Profile:  focused ? 'person-circle' : 'person-circle-outline',
            };
            return <Ionicons name={icons[route.name] || 'help-outline'} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home"        component={DashboardScreen}    options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Learn"       component={MurajaahModeScreen}  options={{ tabBarLabel: 'Murajaah' }} />
        <Tab.Screen
          name="JoinClassTab"
          component={DashboardScreen}   // placeholder — tap opens modal
          options={{
            tabBarLabel: 'Join Class',
            tabBarLabelStyle: { fontSize: 9, fontWeight: '800', color: P, marginTop: 2 },
          }}
          listeners={{ tabPress: e => { e.preventDefault(); setJoinVisible(true); } }}
        />
        <Tab.Screen name="Tasmiq"      component={TasmiqPrepScreen}    options={{ tabBarLabel: 'Tasmiq' }} />
        <Tab.Screen name="Profile"     component={ProfileScreen}       options={{ tabBarLabel: 'Profile' }} />
      </Tab.Navigator>

      {/* Join Class bottom sheet */}
      <JoinClassSheet
        visible={joinVisible}
        onClose={() => setJoinVisible(false)}
        userId={userId}
      />
    </>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const load = async () => {
      try { setSession(await getCurrentUser() || null); }
      catch { setSession(null); }
    };
    load();
    const interval = setInterval(async () => {
      try {
        const s = await getCurrentUser();
        setSession(prev => {
          if (prev?.id !== s?.id) return s || null;
          return prev;
        });
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFDF0', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={P} />
      </View>
    );
  }

  const role    = session?.role?.toLowerCase() || 'student';
  const isStaff = role === 'staff' || role === 'teacher' || role === 'admin';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session?.id ? (
        isStaff ? (
          <>
            <Stack.Screen name="TeacherDashboard" component={TeacherDashboard} />
            <Stack.Screen name="TeacherStudents"  component={TeacherStudents} />
            <Stack.Screen name="TeacherReview"    component={TeacherReview} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs"          component={MainTabNavigator} />
            <Stack.Screen name="TasmiqPrep"        component={TasmiqPrepScreen} />
            <Stack.Screen name="TasmiqMode"        component={TasmiqModeScreen} />
            <Stack.Screen name="MurajaahMode"      component={MurajaahModeScreen} />
            <Stack.Screen name="JoinClass"         component={JoinClassScreen} />
            <Stack.Screen name="Nudge"             component={NudgeScreen} />
            <Stack.Screen name="History"           component={HistoryScreen} />
            <Stack.Screen name="Progress"          component={ProgressScreen} />
            <Stack.Screen name="TeacherEvaluation" component={TeacherEvaluationScreen} />
          </>
        )
      ) : (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login"   component={LoginScreen} />
          <Stack.Screen name="SignUp"  component={SignUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
