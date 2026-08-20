import "./global.css";
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { LanguageProvider } from './src/context/LanguageContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, ActivityIndicator, View, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSISTENCE_KEY = 'TASMIQ_NAVIGATION_STATE_V2';

const linking = {
  prefixes: ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:8082', 'tasmiqai://'],
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          Home: 'home',
          Tasmiq: 'tasmiq-prep',
          History: 'history',
          Progress: 'progress',
          Profile: 'profile',
        },
      },
      TasmiqPrep: 'prep',
      TasmiqMode: 'tasmiq-mode',
      MurajaahMode: 'murajaah-mode',
      JoinClass: 'join-class',
      Nudge: 'nudge',
      Welcome: 'welcome',
      Login: 'login',
      SignUp: 'signup',
      TeacherDashboard: 'teacher-dashboard',
      TeacherStudents: 'teacher-students',
      TeacherReview: 'teacher-review',
    },
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState();

  useEffect(() => {
    const restoreState = async () => {
      try {
        const savedStateString = Platform.OS === 'web'
          ? window.localStorage.getItem(PERSISTENCE_KEY)
          : await AsyncStorage.getItem(PERSISTENCE_KEY);
        
        const state = savedStateString ? JSON.parse(savedStateString) : undefined;
        if (state !== undefined) {
          setInitialState(state);
        }
      } catch (e) {
        console.warn('Failed to restore navigation state:', e);
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
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <NavigationContainer
            linking={linking}
            initialState={initialState}
            onStateChange={(state) => {
              try {
                const json = JSON.stringify(state);
                if (Platform.OS === 'web') {
                  window.localStorage.setItem(PERSISTENCE_KEY, json);
                } else {
                  AsyncStorage.setItem(PERSISTENCE_KEY, json);
                }
              } catch (e) {
                console.warn('Failed to save navigation state:', e);
              }
            }}
          >
            <AppNavigator />
          </NavigationContainer>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
