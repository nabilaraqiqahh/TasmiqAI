import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { subscribeToAuthState, getUserProfile, getRoleFromEmail } from '../services/authService';

// Auth Screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';

// Student Screens
import DashboardScreen from '../screens/main/DashboardScreen';
import HistoryScreen from '../screens/main/HistoryScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

import MurajaahModeScreen from '../screens/features/MurajaahModeScreen';
import ProgressScreen from '../screens/features/ProgressScreen';
import TasmiqModeScreen from '../screens/features/TasmiqModeScreen';
import JoinClassScreen from '../screens/main/JoinClassScreen';

// Teacher Screens
import TeacherDashboard from '../screens/teacher/TeacherDashboard';
import TeacherStudents from '../screens/teacher/TeacherStudents';
import TeacherReview from '../screens/teacher/TeacherReview';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ── Student Bottom Tab Navigator ──────────────────────────────────────────────
function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'History') iconName = focused ? 'time' : 'time-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4A8C73',
        tabBarInactiveTintColor: '#AAAAAA',
        headerShown: false,
        tabBarStyle: {
          height: 72, paddingBottom: 14, paddingTop: 10,
          backgroundColor: '#FFFFFF', borderTopWidth: 0,
          elevation: 16, shadowColor: '#000',
          shadowOpacity: 0.08, shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const [user, setUser] = useState(undefined); // undefined = loading auth
  const [role, setRole] = useState(null); // 'student' or 'staff'
  const [loadingRole, setLoadingRole] = useState(false);

  useEffect(() => {
    // 1. Load cached role for instant UI response
    const loadCachedRole = async () => {
      try {
        const cachedRole = await AsyncStorage.getItem('user_role');
        if (cachedRole) setRole(cachedRole);
      } catch (e) { /* ignore */ }
    };
    loadCachedRole();

    // 2. Subscribe to Supabase Auth
    const unsubscribe = subscribeToAuthState(async (sessionUser) => {
      setUser(sessionUser);
      
      if (sessionUser) {
        setLoadingRole(true);
        
        try {
          // STEP 1: Instant role detection from email domain (most reliable)
          const emailRole = getRoleFromEmail(sessionUser.email);
          
          // STEP 2: Try to fetch from database (may fail due to race condition on signup)
          let profile = await getUserProfile(sessionUser.id);
          
          // STEP 3: If profile doesn't exist yet (race condition), retry after a short delay
          if (!profile && emailRole) {
            console.log('Profile not found yet, retrying in 1.5s...');
            await new Promise(resolve => setTimeout(resolve, 1500));
            profile = await getUserProfile(sessionUser.id);
          }
          
          // STEP 4: Determine final role - email domain takes priority
          const newRole = emailRole || profile?.role || 'student';
          
          console.log(`Role resolved: email=${emailRole}, db=${profile?.role}, final=${newRole}`);
          
          setRole(newRole);
          await AsyncStorage.setItem('user_role', newRole);
        } catch (error) {
          console.error("Role fetch error:", error);
          // Even on error, try email domain detection
          const fallbackRole = getRoleFromEmail(sessionUser.email) || 'student';
          setRole(fallbackRole);
          await AsyncStorage.setItem('user_role', fallbackRole);
        } finally {
          setLoadingRole(false);
        }
      } else {
        setRole(null);
        setLoadingRole(false);
        await AsyncStorage.removeItem('user_role');
      }
    });

    return unsubscribe;
  }, []);

  // Show splash while Firebase resolves
  if (user === undefined || (user && !role && loadingRole)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F2E9', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4A8C73" />
      </View>
    );
  }

  const isStaff = role === 'staff' || role === 'teacher';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        isStaff ? (
          /* TEACHER ZONE */
          <>
            <Stack.Screen name="TeacherDashboard" component={TeacherDashboard} />
            <Stack.Screen name="TeacherStudents" component={TeacherStudents} />
            <Stack.Screen name="TeacherReview" component={TeacherReview} />
          </>
        ) : (
          /* STUDENT ZONE */
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />

            <Stack.Screen name="MurajaahMode" component={MurajaahModeScreen} />
            <Stack.Screen name="Progress" component={ProgressScreen} />
            <Stack.Screen name="TasmiqMode" component={TasmiqModeScreen} />
            <Stack.Screen name="JoinClass" component={JoinClassScreen} />
          </>
        )
      ) : (
        /* AUTH ZONE */
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
