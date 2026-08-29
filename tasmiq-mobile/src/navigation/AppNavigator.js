import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
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
import TeacherDashboard        from '../screens/teacher/TeacherDashboard';
import TeacherStudents         from '../screens/teacher/TeacherStudents';
import TeacherReview           from '../screens/teacher/TeacherReview';
import TeacherEvaluationScreen from '../screens/features/TeacherEvaluationScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const PRIMARY = '#0B6E4F';
const GOLD    = '#D4AF37';

// -- Student Tab Navigator -----------------------------------------------------
function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   PRIMARY,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 84 : 70,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 20,
          shadowColor: '#000',
          shadowOpacity: 0.10,
          shadowRadius: 20,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            Home:     focused ? 'home'           : 'home-outline',
            Learn:    focused ? 'book'            : 'book-outline',
            Tasmiq:   focused ? 'mic-circle'      : 'mic-circle-outline',
            Progress: focused ? 'stats-chart'     : 'stats-chart-outline',
            Profile:  focused ? 'person-circle'   : 'person-circle-outline',
          };
          // Make Tasmiq tab icon bigger and use gold when active
          if (route.name === 'Tasmiq') {
            return (
              <View style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: focused ? PRIMARY : PRIMARY + '15',
                alignItems: 'center', justifyContent: 'center',
                marginTop: -18,
                shadowColor: PRIMARY, shadowOpacity: focused ? 0.35 : 0,
                shadowRadius: 12, elevation: focused ? 8 : 0,
              }}>
                <Ionicons name="mic" size={26} color={focused ? '#FFFFFF' : PRIMARY} />
              </View>
            );
          }
          return <Ionicons name={icons[route.name] || 'help-outline'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"     component={DashboardScreen}   options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Learn"    component={MurajaahModeScreen} options={{ tabBarLabel: 'Learn' }} />
      <Tab.Screen name="Tasmiq"   component={TasmiqPrepScreen}   options={{ tabBarLabel: 'Tasmiq' }} />
      <Tab.Screen name="Progress" component={ProgressScreen}     options={{ tabBarLabel: 'Progress' }} />
      <Tab.Screen name="Profile"  component={ProfileScreen}      options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// -- Root Navigator ------------------------------------------------------------
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
      <View style={{ flex: 1, backgroundColor: '#FFFDF0', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0B6E4F" />
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
          // -- TEACHER ZONE --
          <>
            <Stack.Screen name="TeacherDashboard" component={TeacherDashboard} />
            <Stack.Screen name="TeacherStudents"  component={TeacherStudents} />
            <Stack.Screen name="TeacherReview"    component={TeacherReview} />
          </>
        ) : (
          // -- STUDENT ZONE --
          <>
            <Stack.Screen name="MainTabs"          component={MainTabNavigator} />
            <Stack.Screen name="TasmiqPrep"        component={TasmiqPrepScreen} />
            <Stack.Screen name="TasmiqMode"        component={TasmiqModeScreen} />
            <Stack.Screen name="MurajaahMode"      component={MurajaahModeScreen} />
            <Stack.Screen name="JoinClass"         component={JoinClassScreen} />
            <Stack.Screen name="Nudge"             component={NudgeScreen} />
            <Stack.Screen name="History"           component={HistoryScreen} />
            <Stack.Screen name="TeacherEvaluation" component={TeacherEvaluationScreen} />
          </>
        )
      ) : (
        // -- AUTH ZONE --
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login"   component={LoginScreen} />
          <Stack.Screen name="SignUp"  component={SignUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}


