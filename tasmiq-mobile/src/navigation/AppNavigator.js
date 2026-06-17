import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { getCurrentUser } from '../services/authService';

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
import TeacherDashboard from '../screens/teacher/TeacherDashboard';
import TeacherStudents  from '../screens/teacher/TeacherStudents';
import TeacherReview    from '../screens/teacher/TeacherReview';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Student Tab Navigator ─────────────────────────────────────────────────────
function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Home:     focused ? 'home'      : 'home-outline',
            Tasmiq:   focused ? 'mic'       : 'mic-outline',
            History:  focused ? 'time'      : 'time-outline',
            Progress: focused ? 'bar-chart' : 'bar-chart-outline',
            Profile:  focused ? 'person'    : 'person-outline',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
        tabBarActiveTintColor:   '#14532D',
        tabBarInactiveTintColor: '#AAAAAA',
        headerShown: false,
        tabBarStyle: {
          height: 76, paddingBottom: 14, paddingTop: 10,
          backgroundColor: '#FFFFFF', borderTopWidth: 0,
          elevation: 16, shadowColor: '#000',
          shadowOpacity: 0.08, shadowRadius: 16,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      })}
    >
      <Tab.Screen name="Home"     component={DashboardScreen} />
      <Tab.Screen name="Tasmiq"   component={TasmiqPrepScreen} />
      <Tab.Screen name="History"  component={HistoryScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────
export default function AppNavigator() {
  // null = not logged in | object = session | undefined = loading
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    // Load session from storage on mount
    const load = async () => {
      try {
        const s = await getCurrentUser();
        setSession(s || null);
      } catch {
        setSession(null);
      }
    };
    load();

    // Poll every 2 seconds for session changes (logout from another screen, etc.)
    const interval = setInterval(async () => {
      try {
        const s = await getCurrentUser();
        setSession(prev => {
          // Only update if session actually changed
          const prevId = prev?.id;
          const newId  = s?.id;
          if (prevId !== newId) return s || null;
          return prev;
        });
      } catch { /* ignore */ }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Loading splash
  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F2E9', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#14532D" />
      </View>
    );
  }

  const role     = session?.role?.toLowerCase() || 'student';
  const isStaff  = role === 'staff' || role === 'teacher' || role === 'admin';
  const isLoggedIn = !!session?.id;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        isStaff ? (
          // ── TEACHER ZONE ──
          <>
            <Stack.Screen name="TeacherDashboard" component={TeacherDashboard} />
            <Stack.Screen name="TeacherStudents"  component={TeacherStudents} />
            <Stack.Screen name="TeacherReview"    component={TeacherReview} />
          </>
        ) : (
          // ── STUDENT ZONE ──
          <>
            <Stack.Screen name="MainTabs"     component={MainTabNavigator} />
            <Stack.Screen name="TasmiqPrep"   component={TasmiqPrepScreen} />
            <Stack.Screen name="TasmiqMode"   component={TasmiqModeScreen} />
            <Stack.Screen name="MurajaahMode" component={MurajaahModeScreen} />
            <Stack.Screen name="JoinClass"    component={JoinClassScreen} />
            <Stack.Screen name="Nudge"        component={NudgeScreen} />
          </>
        )
      ) : (
        // ── AUTH ZONE ──
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login"   component={LoginScreen} />
          <Stack.Screen name="SignUp"  component={SignUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
