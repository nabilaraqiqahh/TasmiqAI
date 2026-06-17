import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

function ProgressBar({ label, value, color }) {
  const { colors: C } = useTheme();
  const safe = Math.min(100, Math.max(0, value || 0));
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 14, color: C.text, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 14, color, fontWeight: '700' }}>{Math.round(safe)}%</Text>
      </View>
      <View style={{ height: 8, backgroundColor: '#F0F0F0', borderRadius: 8 }}>
        <View style={{ width: `${safe}%`, height: 8, backgroundColor: color, borderRadius: 8 }} />
      </View>
    </View>
  );
}

function StatCard({ icon, value, label, color }) {
  const { colors: C } = useTheme();
  return (
    <View style={{
      flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 18,
      alignItems: 'center', marginHorizontal: 5,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProgressScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [recitations, setRecitations] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [skillBreakdown, setSkillBreakdown] = useState({ tajwid: 0, pronunciation: 0, fluency: 0, memorization: 0 });
  const [surahProgress, setSurahProgress] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadProgressData();
    }, [])
  );

  const loadProgressData = async () => {
    setLoading(true);
    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();
      if (!session?.id) { setLoading(false); return; }

      // ── 1. User profile (streak, sessions, avg_score) ──────────
      const { data: prof } = await supabase
        .from('users')
        .select('streak_days, total_sessions, avg_score, progress_percentage')
        .eq('uid', user.id)
        .maybeSingle();
      setProfile(prof);

      // ── 2. All recitations for this student ─────────────────────
      const { data: recs } = await supabase
        .from('recitations')
        .select('*')
        .eq('user_id', session.id)
        .order('submitted_at', { ascending: false });

      const allRecs = recs || [];
      setRecitations(allRecs);

      // ── 3. Weekly chart (last 7 days by day-of-week) ───────────
      const dayBuckets = { Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] };
      allRecs.forEach(r => {
        if (r.recorded_at && r.score != null) {
          const day = DAY_NAMES[new Date(r.recorded_at).getDay()];
          dayBuckets[day].push(r.score);
        }
      });
      const ordered = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      setWeeklyData(ordered.map(day => ({
        day,
        score: dayBuckets[day].length
          ? Math.round(dayBuckets[day].reduce((a, b) => a + b, 0) / dayBuckets[day].length)
          : 0,
      })));

      // ── 4. Skill breakdown (avg of dedicated score columns) ─────
      const reviewed = allRecs.filter(r => r.reviewed);
      const avgOf = (field) => {
        const vals = reviewed.map(r => r[field]).filter(v => v != null);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      };
      setSkillBreakdown({
        tajwid:        avgOf('tajwid_score'),
        pronunciation: avgOf('pronunciation_score'),
        fluency:       avgOf('fluency_score'),
        memorization:  avgOf('memorization_score'),
      });

      // ── 5. Surah progress (group by surah number) ───────────────
      const surahMap = {};
      allRecs.forEach(r => {
        if (!surahMap[r.surah]) surahMap[r.surah] = { surah: r.surah, count: 0, latestAyah: 0 };
        surahMap[r.surah].count += 1;
        // track highest ayah reached
        const ayahNum = parseInt(String(r.ayah).split('-')[1] || r.ayah) || 0;
        if (ayahNum > surahMap[r.surah].latestAyah) surahMap[r.surah].latestAyah = ayahNum;
      });
      setSurahProgress(Object.values(surahMap).slice(0, 5));

    } catch (err) {
      console.error('Progress load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const maxScore = weeklyData.length ? Math.max(...weeklyData.map(d => d.score), 1) : 100;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ color: C.muted, marginTop: 12 }}>Loading progress...</Text>
      </SafeAreaView>
    );
  }

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>My Progress</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Stats Row */}
          <View style={{ flexDirection: 'row', marginHorizontal: -5, marginBottom: 24 }}>
            <StatCard icon="mic"   value={profile?.total_sessions ?? 0}      label="Sessions"   color={C.primary} />
            <StatCard icon="star"  value={`${profile?.avg_score ?? 0}%`}     label="Avg Score"  color={C.accent} />
            <StatCard icon="flame" value={`${profile?.streak_days ?? 0}`}    label="Day Streak" color="#E0952F" />
          </View>

          {/* Weekly Chart */}
          <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 20 }}>This Week's Scores</Text>
            {weeklyData.every(d => d.score === 0) ? (
              <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 20 }}>No recitations this week yet.</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 }}>
                {weeklyData.map((d, i) => (
                  <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                    <View style={{
                      width: 28,
                      height: Math.max(4, (d.score / maxScore) * 100),
                      backgroundColor: d.score === Math.max(...weeklyData.map(x => x.score)) ? C.primary : C.primary + '50',
                      borderRadius: 6, marginBottom: 8,
                    }} />
                    <Text style={{ fontSize: 11, color: C.muted }}>{d.day}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Skill Breakdown */}
          <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 20 }}>Skill Breakdown</Text>
            {skillBreakdown.tajwid === 0 && skillBreakdown.memorization === 0 ? (
              <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 10 }}>Complete a reviewed recitation to see skill data.</Text>
            ) : (
              <>
                <ProgressBar label="Tajwid Rules"           value={skillBreakdown.tajwid}        color={C.primary} />
                <ProgressBar label="Makhraj (Articulation)" value={skillBreakdown.pronunciation}  color="#4A90A4" />
                <ProgressBar label="Fluency & Rhythm"       value={skillBreakdown.fluency}        color={C.accent} />
                <ProgressBar label="Memorisation Accuracy"  value={skillBreakdown.memorization}   color="#7E57C2" />
              </>
            )}
          </View>

          {/* Surah Progress */}
          <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 16 }}>Recent Surahs</Text>
            {surahProgress.length === 0 ? (
              <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 10 }}>No recitations recorded yet.</Text>
            ) : surahProgress.map((s, i) => (
              <View key={i} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: C.text, fontWeight: '600' }}>Surah {s.surah}</Text>
                  <Text style={{ fontSize: 13, color: C.muted }}>{s.count} session{s.count !== 1 ? 's' : ''}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: '#F0F0F0', borderRadius: 6 }}>
                  <View style={{
                    width: `${Math.min(100, (s.count / 10) * 100)}%`,
                    height: 6, backgroundColor: C.primary, borderRadius: 6,
                  }} />
                </View>
              </View>
            ))}
          </View>

        </ScrollView>
      </SafeAreaView>
    </IslamicBackground>
  );
}

