import "./global.css";
import React, { useState, useEffect, Component } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { LanguageProvider } from './src/context/LanguageContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSISTENCE_KEY = 'TASMIQ_NAVIGATION_STATE_V4';  // bumped to purge stale V3 state

// Error Boundary to prevent blank white page crashes
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('TasmiqAI App Crash Caught:', error, errorInfo);
  }

  handleReset = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.removeItem(PERSISTENCE_KEY);
        window.location.reload();
      } else {
        await AsyncStorage.removeItem(PERSISTENCE_KEY);
        this.setState({ hasError: false, error: null });
      }
    } catch (e) {
      if (typeof window !== 'undefined') window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#FFFDF0', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 28 }}>⚠️</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937', marginBottom: 8, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            The app encountered an unexpected error. Please refresh or reset your session.
          </Text>
          <TouchableOpacity
            onPress={this.handleReset}
            style={{ backgroundColor: '#0B6E4F', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Reload Application</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const linking = {
  prefixes: ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:8082', 'tasmiqai://'],
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          Home:     'home',
          Progress: 'progress',
          History:  'history',
          Profile:  'profile',
        },
      },
      TasmiqPrep:        'tasmiq-prep',
      TasmiqMode:        'tasmiq-mode',
      MurajaahMode:      'murajaah-mode',
      JoinClass:         'join-class',
      Nudge:             'nudge',
      History:           'history-stack',
      Progress:          'progress-stack',
      Welcome:           'welcome',
      Login:             'login',
      SignUp:            'signup',
      TeacherDashboard:  'teacher-dashboard',
      TeacherStudents:   'teacher-students',
      TeacherReview:     'teacher-review',
      TeacherEvaluation: 'teacher-evaluation',
    },
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState();

  useEffect(() => {
    const restoreState = async () => {
      try {
        if (Platform.OS === 'web') {
          const savedStateString = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(PERSISTENCE_KEY) : null;
          if (savedStateString) {
            const state = JSON.parse(savedStateString);
            const VALID_ROOT_ROUTES = new Set([
              'MainTabs', 'Welcome', 'Login', 'SignUp',
              'TasmiqPrep', 'TasmiqMode', 'MurajaahMode',
              'JoinClass', 'Nudge', 'History', 'Progress',
              'TeacherDashboard', 'TeacherStudents', 'TeacherReview',
              'TeacherEvaluation',
            ]);
            const topRoute = state?.routes?.[state.index ?? 0]?.name;
            if (state && typeof state === 'object' && state.routes && VALID_ROOT_ROUTES.has(topRoute)) {
              setInitialState(state);
            } else if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.removeItem(PERSISTENCE_KEY);
            }
          }
        } else {
          // On native Android/iOS: clean up any stale persisted state to prevent crashes
          await AsyncStorage.removeItem(PERSISTENCE_KEY).catch(() => {});
        }
      } catch (e) {
        console.warn('Navigation state init:', e);
      } finally {
        setIsReady(true);
      }
    };

    restoreState();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FEFCE8', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <NavigationContainer
              linking={linking}
              initialState={Platform.OS === 'web' ? initialState : undefined}
              onStateChange={(state) => {
                if (Platform.OS === 'web') {
                  try {
                    const json = JSON.stringify(state);
                    if (typeof window !== 'undefined' && window.localStorage) {
                      window.localStorage.setItem(PERSISTENCE_KEY, json);
                    }
                  } catch (e) {
                    console.warn('Failed to save web navigation state:', e);
                  }
                }
              }}
            >
              <AppNavigator />
            </NavigationContainer>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
