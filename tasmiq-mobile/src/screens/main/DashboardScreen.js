import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { getUserProfile, logoutUser } from '../../services/authService';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
import quranData from '../../data/quran_data.json';

// Color constant removed in favor of useTheme

function ActionCard({ icon, label, sublabel, color, onPress, themeColors: C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 14,
        flexDirection: 'row', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
      }}
    >
      <View style={{
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center', marginRight: 16,
      }}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 3 }}>{label}</Text>
        <Text style={{ fontSize: 13, color: C.muted }}>{sublabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const { t, language } = useLanguage();
  
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const hour = new Date().getHours();
  
  const greeting = useMemo(() => {
    if (hour < 12) return t('dashboard.greeting');
    if (hour < 17) return t('dashboard.afternoon');
    return t('dashboard.evening');
  }, [hour, language]);

  // Random verse for the dashboard
  const randomSurah = useMemo(() => quranData[Math.floor(Math.random() * quranData.length)], []);
  const randomAyahNum = useMemo(() => Math.floor(Math.random() * randomSurah.count) + 1, [randomSurah]);
  const randomAyahText = randomSurah.verse[`verse_${randomAyahNum}`];

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data }) => {
        const currentUser = data?.user;
        setUser(currentUser);
        if (currentUser) {
          getUserProfile(currentUser.id).then(data => {
            setProfile(data);
            setLoading(false);
          }).catch(() => setLoading(false));
        } else {
          setLoading(false);
        }
      });
    }, [])
  );

  const displayName = profile?.displayName || user?.user_metadata?.displayName || 'Student';
  const firstName = displayName.split(' ')[0];
  const streak = profile?.streakDays ?? 0;
  const sessions = profile?.totalSessions ?? 0;

  return (
    <IslamicBackground variant="full">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Greeting Header */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500', marginBottom: 4 }}>السلام عليكم</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.text }}>
            {greeting}, {loading ? '...' : firstName} 👋
          </Text>
          <Text style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{t('dashboard.ready')}</Text>
        </View>

        {/* Streak Card */}
        <View style={{
          backgroundColor: C.primary, borderRadius: 20, padding: 22, marginBottom: 28,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 4 }}>{t('dashboard.streak')}</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '800' }}>{streak} {language === 'en' ? 'Days' : 'Hari'} 🔥</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>
              {sessions} {t('dashboard.sessions')}
            </Text>
          </View>
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 50,
            width: 64, height: 64, alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="star" size={32} color={C.accent} />
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 1.5, marginBottom: 14 }}>{t('dashboard.quickActions')}</Text>
        <ActionCard icon="business" label="Join Class" sublabel="Enter teacher's code to enroll" color={C.lilac} onPress={() => navigation.navigate('JoinClass')} themeColors={C} />
        <ActionCard icon="mic" label="Tasmiq (Assessment)" sublabel="Record and get AI feedback" color={C.primary} onPress={() => navigation.navigate('TasmiqMode')} themeColors={C} />
        <ActionCard icon="refresh-circle" label={t('dashboard.murajaah')} sublabel="Review and revise memorized verses" color="#4A90A4" onPress={() => navigation.navigate('MurajaahMode')} themeColors={C} />
        <ActionCard icon="bar-chart" label={t('dashboard.progress')} sublabel="Track your improvement over time" color={C.accent} onPress={() => navigation.navigate('Progress')} themeColors={C} />

        {/* Today's Verse */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 1.5, marginBottom: 14, marginTop: 10 }}>{t('dashboard.todaysVerse')}</Text>
        <View style={{
          backgroundColor: C.card, borderRadius: 18, padding: 22,
          borderLeftWidth: 4, borderLeftColor: C.accent,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{ fontSize: 20, textAlign: 'right', color: C.text, lineHeight: 40, marginBottom: 10, fontWeight: '500' }}>
            {randomAyahText}
          </Text>
          <Text style={{ fontSize: 13, color: C.muted }}>{randomSurah.name} • Ayah {randomAyahNum}</Text>
        </View>

        </ScrollView>
      </SafeAreaView>
    </IslamicBackground>
  );
}
