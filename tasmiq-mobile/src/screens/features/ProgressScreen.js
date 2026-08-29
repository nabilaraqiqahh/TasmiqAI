import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import quranData from '../../data/quran_data.json';

const P  = '#0B6E4F';
const PD = '#064E3B';
const PL = '#D1FAE5';
const G  = '#D4AF37';
const GL = '#F8E7A1';
const BG = '#F8FAF8';
const RED = '#DC2626';

// ── Circular progress ring ────────────────────────────────────────────────────
function CircleProgress({ pct, size = 90, strokeWidth = 8, color = P, label, sub }) {
  const r   = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 100) / 100;
  // SVG-like via border — use a simple arc approximation with View borders
  const rotation = -90; // start from top
  const fillAngle = (pct / 100) * 360;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: strokeWidth,
        borderColor: PL,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Filled arc approximation via opacity overlay */}
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          borderTopColor: pct > 0 ? color : 'transparent',
          borderRightColor: pct > 25 ? color : 'transparent',
          borderBottomColor: pct > 50 ? color : 'transparent',
          borderLeftColor: pct > 75 ? color : 'transparent',
        }} />
        <Text style={{ fontSize: size === 90 ? 18 : 14, fontWeight: '900', color: P }}>{pct}%</Text>
      </View>
      {label ? <Text style={{ fontSize: 12, fontWeight: '700', color: P, marginTop: 6 }}>{label}</Text> : null}
      {sub   ? <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{sub}</Text>            : null}
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, color, bg, label, value }) {
  return (
    <View style={{
      flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16,
      padding: 14, alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: '#1A2E1C' }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: '#9CA3AF', textAlign: 'center', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function ProgressScreen({ navigation }) {
  const { colors: C } = useTheme();

  const [loading,    setLoading]    = useState(true);
  const [profile,    setProfile]    = useState(null);
  const [recitations, setRecitations] = useState([]);

  useFocusEffect(useCallback(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { getCurrentUser } = await import('../../services/authService');
        const session = await getCurrentUser();
        if (!session?.id) { setLoading(false); return; }

        const [profRes, recsRes] = await Promise.all([
          supabase.from('users').select('streak_days,total_sessions,avg_score,progress_percentage').eq('id', session.id).maybeSingle(),
          supabase.from('recitations').select('*').eq('user_id', session.id).order('submitted_at', { ascending: false }),
        ]);

        setProfile(profRes.data);
        setRecitations(recsRes.data || []);
      } catch (err) {
        console.error('[ProgressScreen]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []));

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const exercises   = recitations.filter(r => r.is_exercise);
    const assessments = recitations.filter(r => !r.is_exercise);
    const approved    = assessments.filter(r => r.status === 'approved');
    const avgAI       = exercises.length
      ? Math.round(exercises.reduce((s, r) => s + (r.score || 0), 0) / exercises.length)
      : 0;

    // Week activity — last 7 days
    const now   = Date.now();
    const week  = recitations.filter(r => {
      const d = new Date(r.submitted_at || r.recorded_at || 0).getTime();
      return now - d < 7 * 86400000;
    });

    // Surah spread
    const surahSet = new Set(recitations.map(r => r.surah_number).filter(Boolean));

    // Recent AI results (last 5 exercises)
    const recent = exercises.slice(0, 5).map(r => ({
      id:    r.id,
      surah: r.surah || `Surah ${r.surah_number}`,
      ayah:  r.ayah  || `${r.start_verse}–${r.end_verse}`,
      score: r.score || 0,
      date:  r.submitted_at || r.recorded_at,
    }));

    // Improvement: compare first 3 vs last 3 exercises
    let improvement = null;
    if (exercises.length >= 4) {
      const newer = exercises.slice(0, 3);
      const older = exercises.slice(-3);
      const avgN  = newer.reduce((s, r) => s + (r.score || 0), 0) / 3;
      const avgO  = older.reduce((s, r) => s + (r.score || 0), 0) / 3;
      improvement = Math.round(avgN - avgO);
    }

    return {
      exercises: exercises.length,
      assessments: assessments.length,
      approved: approved.length,
      avgAI,
      weekActivity: week.length,
      surahCount: surahSet.size,
      recent,
      improvement,
    };
  }, [recitations]);

  const streak    = profile?.streak_days        ?? 0;
  const sessions  = profile?.total_sessions     ?? 0;
  const progress  = profile?.progress_percentage ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <LinearGradient
          colors={[P, PD]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <View>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1.5 }}>YOUR JOURNEY</Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFFFFF', marginTop: 2 }}>Progress</Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trophy" size={22} color={G} />
            </View>
          </View>

          {/* Overall progress ring + key stats */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <CircleProgress pct={progress} size={90} color={G} label="Memorization" />
            <View style={{ flex: 1, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: G, fontSize: 18, fontWeight: '900' }}>{streak}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' }}>Day Streak 🔥</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900' }}>{sessions}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' }}>Sessions</Text>
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>
                  AI Score: {stats.avgAI}%
                  {stats.improvement !== null && (
                    <Text style={{ color: stats.improvement >= 0 ? '#86EFAC' : '#FCA5A5', fontSize: 13 }}>
                      {'  '}{stats.improvement >= 0 ? '▲' : '▼'} {Math.abs(stats.improvement)}%
                    </Text>
                  )}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' }}>Average AI Practice Score</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator size="large" color={P} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>

            {/* ── STAT CARDS ────────────────────────────────────────────── */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.2, marginBottom: 14 }}>OVERVIEW</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <StatCard icon="mic"         color={P}       bg={PL}          label="AI Practices"  value={stats.exercises} />
              <StatCard icon="ribbon"      color="#7C3AED" bg="#EDE9FE"      label="Official"      value={stats.assessments} />
              <StatCard icon="checkmark-circle" color="#059669" bg="#D1FAE5" label="Approved"      value={stats.approved} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
              <StatCard icon="book"        color="#0891B2" bg="#E0F2FE"      label="Surahs"        value={stats.surahCount} />
              <StatCard icon="calendar"    color={G}       bg={GL}          label="This Week"     value={stats.weekActivity} />
              <StatCard icon="flame"       color="#EA580C" bg="#FED7AA"      label="Streak"        value={streak} />
            </View>

            {/* ── WEEKLY ACTIVITY ───────────────────────────────────────── */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.2, marginBottom: 14 }}>WEEKLY ACTIVITY</Text>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 22, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              <WeeklyBars recitations={recitations} />
            </View>

            {/* ── RECENT AI RESULTS ─────────────────────────────────────── */}
            {stats.recent.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.2 }}>RECENT AI PRACTICE</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('History')}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: P }}>See All →</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, marginBottom: 22, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                  {stats.recent.map((r, i) => {
                    const passed = r.score >= 70;
                    return (
                      <View key={r.id || i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < stats.recent.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: passed ? PL : '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                          <Ionicons name="sparkles" size={17} color={passed ? P : '#D97706'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A2E1C' }}>{r.surah}</Text>
                          <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Ayah {r.ayah}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <View style={{ backgroundColor: passed ? PL : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: passed ? PD : '#92400E' }}>{r.score}%</Text>
                          </View>
                          <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{passed ? 'PASS' : 'NEEDS PRACTICE'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── IMPROVEMENT TIP ───────────────────────────────────────── */}
            {stats.exercises > 0 && (
              <View style={{ backgroundColor: PL, borderRadius: 16, padding: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: P + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="bulb" size={22} color={P} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: PD }}>
                    {stats.avgAI >= 80 ? 'Excellent Progress! 🌟' : stats.avgAI >= 60 ? 'Keep It Up! 💪' : 'Practice Makes Perfect 📖'}
                  </Text>
                  <Text style={{ fontSize: 12, color: P, marginTop: 2 }}>
                    {stats.avgAI >= 80
                      ? 'Your AI scores are outstanding. Ready for official assessment!'
                      : stats.avgAI >= 60
                        ? 'You\'re improving. Aim for 70% to unlock official assessment.'
                        : 'Practice daily with Murajaah to strengthen your memorization.'}
                  </Text>
                </View>
              </View>
            )}

            {/* ── EMPTY STATE ────────────────────────────────────────────── */}
            {recitations.length === 0 && !loading && (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 36, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                <Ionicons name="stats-chart-outline" size={52} color="#D1D5DB" style={{ marginBottom: 14 }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#9CA3AF', marginBottom: 6 }}>No data yet</Text>
                <Text style={{ fontSize: 13, color: '#D1D5DB', textAlign: 'center', lineHeight: 20 }}>
                  Complete your first Tasmiq or Murajaah session to see your progress here.
                </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Tasmiq')}
                  style={{ marginTop: 20, backgroundColor: P, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Start First Session</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Weekly bar chart ──────────────────────────────────────────────────────────
function WeeklyBars({ recitations }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const todayIdx = (today.getDay() + 6) % 7; // Mon=0

  const counts = days.map((_, i) => {
    const target = new Date(today);
    target.setDate(today.getDate() - ((todayIdx - i + 7) % 7));
    target.setHours(0, 0, 0, 0);
    const next = new Date(target); next.setDate(next.getDate() + 1);
    return recitations.filter(r => {
      const d = new Date(r.submitted_at || r.recorded_at || 0);
      return d >= target && d < next;
    }).length;
  });

  const maxCount = Math.max(...counts, 1);

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A2E1C', marginBottom: 16 }}>
        {counts.reduce((a, b) => a + b, 0)} sessions this week
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 }}>
        {counts.map((count, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{
              width: '100%',
              height: count > 0 ? Math.max((count / maxCount) * 52, 8) : 6,
              backgroundColor: i === todayIdx ? P : count > 0 ? PL : '#F3F4F6',
              borderRadius: 6,
            }} />
            <Text style={{ fontSize: 9, color: i === todayIdx ? P : '#9CA3AF', fontWeight: i === todayIdx ? '800' : '600', marginTop: 4 }}>
              {days[i]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
