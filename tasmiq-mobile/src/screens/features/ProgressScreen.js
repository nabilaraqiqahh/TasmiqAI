import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Modal, FlatList, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import quranData from '../../data/quran_data.json';

// ── Design tokens ──────────────────────────────────────────────────────────────
const P   = '#0B6E4F';
const PD  = '#064E3B';
const PL  = '#D1FAE5';
const G   = '#C8A84B';
const GL  = '#F5E3A0';
const BG  = '#FFFDF0';
const RED = '#DC2626';

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, color, bg, label, value }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: PD }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: '#9CA3AF', textAlign: 'center', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function SectionLabel({ text, action, onAction }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.2 }}>{text}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={{ fontSize: 12, fontWeight: '700', color: P }}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

// ── Score bar (horizontal) ────────────────────────────────────────────────────
function ScoreBar({ label, value, color }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProgressScreen({ navigation }) {
  const { colors: C } = useTheme();

  const [loading,      setLoading]      = useState(true);
  const [profile,      setProfile]      = useState(null);
  const [recitations,  setRecitations]  = useState([]);

  // Comparison state
  const [compSurahIdx,   setCompSurahIdx]   = useState(0);
  const [surahModal,     setSurahModal]     = useState(false);
  const [surahSearch,    setSurahSearch]    = useState('');
  const [playingUrl,     setPlayingUrl]     = useState(null);
  const soundRef = useRef(null);

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
        const recs = recsRes.data || [];
        setRecitations(recs);

        // Default comparison surah to latest recited
        if (recs.length > 0 && recs[0].surah_number) {
          const idx = Math.max(0, Number(recs[0].surah_number) - 1);
          setCompSurahIdx(Math.min(idx, quranData.length - 1));
        }
      } catch (err) {
        console.error('[ProgressScreen]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      if (soundRef.current) { soundRef.current.unloadAsync().catch(() => {}); }
    };
  }, []));

  // Audio playback
  const handlePlay = async (url) => {
    if (!url) return;
    try {
      if (playingUrl === url && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingUrl(null); return;
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingUrl(url);
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (s) => {
        if (s.didJustFinish) setPlayingUrl(null);
      });
      soundRef.current = sound;
    } catch (e) { setPlayingUrl(null); }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const exercises   = recitations.filter(r => r.is_exercise);
    const assessments = recitations.filter(r => !r.is_exercise);
    const approved    = assessments.filter(r => r.status === 'approved');
    const avgAI       = exercises.length
      ? Math.round(exercises.reduce((s, r) => s + (r.score || 0), 0) / exercises.length)
      : 0;

    const now  = Date.now();
    const week = recitations.filter(r => now - new Date(r.submitted_at || r.recorded_at || 0).getTime() < 7 * 86400000);
    const surahSet = new Set(recitations.map(r => r.surah_number).filter(Boolean));

    const recent = exercises.slice(0, 5).map(r => ({
      id: r.id, surah: r.surah || `Surah ${r.surah_number}`,
      ayah: r.ayah || `${r.start_verse}–${r.end_verse}`, score: r.score || 0,
    }));

    let improvement = null;
    if (exercises.length >= 4) {
      const n = exercises.slice(0, 3).reduce((s, r) => s + (r.score || 0), 0) / 3;
      const o = exercises.slice(-3).reduce((s, r) => s + (r.score || 0), 0) / 3;
      improvement = Math.round(n - o);
    }

    return { exercises: exercises.length, assessments: assessments.length, approved: approved.length, avgAI, weekActivity: week.length, surahCount: surahSet.size, recent, improvement };
  }, [recitations]);

  // ── AI-vs-AI Comparison data for selected surah ───────────────────────────
  const comparisonData = useMemo(() => {
    const activeSurah = quranData[compSurahIdx];
    const surahExercises = recitations
      .filter(r => r.is_exercise && (r.surah === activeSurah.name || r.surah_number === parseInt(activeSurah.index)))
      .sort((a, b) => new Date(a.submitted_at || a.recorded_at || 0) - new Date(b.submitted_at || b.recorded_at || 0));

    return surahExercises.map((r, i) => ({
      ...r,
      attemptNumber: i + 1,
      date: new Date(r.submitted_at || r.recorded_at || 0).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
    }));
  }, [recitations, compSurahIdx]);

  // Latest two attempts for side-by-side comparison
  const prevAttempt   = comparisonData.length >= 2 ? comparisonData[comparisonData.length - 2] : null;
  const latestAttempt = comparisonData.length >= 1 ? comparisonData[comparisonData.length - 1] : null;
  const delta = (latestAttempt && prevAttempt) ? (latestAttempt.score || 0) - (prevAttempt.score || 0) : null;

  const streak   = profile?.streak_days        ?? 0;
  const sessions = profile?.total_sessions     ?? 0;
  const progress = profile?.progress_percentage ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 56 }}>

        {/* ── HEADER ── */}
        <LinearGradient
          colors={[P, PD]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            {/* Circle progress */}
            <View style={{ width: 86, height: 86, borderRadius: 43, borderWidth: 8, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: G }}>{progress}%</Text>
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>MEMORY</Text>
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: G, fontSize: 18, fontWeight: '900' }}>{streak}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' }}>Streak 🔥</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900' }}>{sessions}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' }}>Sessions</Text>
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
                  AI Score: {stats.avgAI}%
                  {stats.improvement !== null && (
                    <Text style={{ color: stats.improvement >= 0 ? '#86EFAC' : '#FCA5A5', fontSize: 13 }}>
                      {'  '}{stats.improvement >= 0 ? '▲' : '▼'} {Math.abs(stats.improvement)}%
                    </Text>
                  )}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' }}>Avg AI Practice Score</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator size="large" color={P} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>

            {/* ── OVERVIEW STATS ── */}
            <SectionLabel text="OVERVIEW" />
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <StatCard icon="mic"          color={P}         bg={PL}       label="AI Practices"  value={stats.exercises} />
              <StatCard icon="ribbon"       color="#7C3AED"   bg="#EDE9FE"  label="Official"      value={stats.assessments} />
              <StatCard icon="checkmark-circle" color="#059669" bg="#D1FAE5" label="Approved"     value={stats.approved} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
              <StatCard icon="book"         color="#0891B2"   bg="#E0F2FE"  label="Surahs"        value={stats.surahCount} />
              <StatCard icon="calendar"     color={G}         bg={GL}       label="This Week"     value={stats.weekActivity} />
              <StatCard icon="flame"        color="#EA580C"   bg="#FED7AA"  label="Streak"        value={streak} />
            </View>

            {/* ── WEEKLY ACTIVITY ── */}
            <SectionLabel text="WEEKLY ACTIVITY" />
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              <WeeklyBars recitations={recitations} />
            </View>

            {/* ════════════════════════════════════════════════════════════════
                AI-vs-AI PRACTICE COMPARISON
                ════════════════════════════════════════════════════════════════ */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.2 }}>AI PRACTICE COMPARISON</Text>
              <TouchableOpacity
                onPress={() => setSurahModal(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PL, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: P }}>{quranData[compSurahIdx]?.name}</Text>
                <Ionicons name="chevron-down" size={13} color={P} />
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }}>

              {comparisonData.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="stats-chart-outline" size={40} color="#D1D5DB" style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#9CA3AF' }}>No AI practice for {quranData[compSurahIdx]?.name}</Text>
                  <Text style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4, textAlign: 'center' }}>Practice this surah to see your progress here</Text>
                </View>
              ) : comparisonData.length === 1 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="information-circle-outline" size={36} color={P} style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                    Complete at least 2 AI practice attempts for {quranData[compSurahIdx]?.name} to see a comparison.
                  </Text>
                  <View style={{ marginTop: 16, backgroundColor: PL, borderRadius: 12, padding: 14, width: '100%' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: P, marginBottom: 6 }}>ATTEMPT #1</Text>
                    <Text style={{ fontSize: 28, fontWeight: '900', color: PD }}>{latestAttempt?.score || 0}%</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>{latestAttempt?.date}</Text>
                  </View>
                </View>
              ) : (
                <>
                  {/* Delta banner */}
                  <View style={{
                    backgroundColor: delta !== null && delta >= 0 ? '#D1FAE5' : '#FEE2E2',
                    borderRadius: 14, padding: 14, marginBottom: 18,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <View>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: delta >= 0 ? '#065F46' : '#B91C1C', letterSpacing: 0.8 }}>
                        ATTEMPT #{prevAttempt.attemptNumber} → #{latestAttempt.attemptNumber}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: PD, marginTop: 2 }}>Progress Delta</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: delta >= 0 ? '#FFFFFF' : '#FEE2E2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Ionicons name={delta >= 0 ? 'trending-up' : 'trending-down'} size={16} color={delta >= 0 ? '#065F46' : '#B91C1C'} />
                      <Text style={{ fontSize: 16, fontWeight: '900', color: delta >= 0 ? '#065F46' : '#B91C1C' }}>
                        {delta >= 0 ? '+' : ''}{delta}%
                      </Text>
                    </View>
                  </View>

                  {/* Side-by-side score cards */}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
                    {/* Previous */}
                    <View style={{ flex: 1, backgroundColor: '#FAFAF9', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>
                        Attempt #{prevAttempt.attemptNumber}
                      </Text>
                      <Text style={{ fontSize: 26, fontWeight: '900', color: '#6B7280', marginBottom: 2 }}>
                        {prevAttempt.score || 0}%
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{prevAttempt.date}</Text>
                      <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                        {prevAttempt.recording_mode === 'advanced' ? 'Advanced' : 'Beginner'} Mode
                      </Text>
                      {prevAttempt.audio_url && (
                        <TouchableOpacity
                          onPress={() => handlePlay(prevAttempt.audio_url)}
                          style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 7 }}
                        >
                          <Ionicons name={playingUrl === prevAttempt.audio_url ? 'pause' : 'play'} size={13} color="#6B7280" />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#6B7280' }}>
                            {playingUrl === prevAttempt.audio_url ? 'Pause' : 'Play'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Latest */}
                    <View style={{ flex: 1, backgroundColor: PL, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: P + '40' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: P, textTransform: 'uppercase', marginBottom: 4 }}>
                        Latest #{latestAttempt.attemptNumber}
                      </Text>
                      <Text style={{ fontSize: 26, fontWeight: '900', color: P, marginBottom: 2 }}>
                        {latestAttempt.score || 0}%
                      </Text>
                      <Text style={{ fontSize: 11, color: '#6B7280' }}>{latestAttempt.date}</Text>
                      <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                        {latestAttempt.recording_mode === 'advanced' ? 'Advanced' : 'Beginner'} Mode
                      </Text>
                      {latestAttempt.audio_url && (
                        <TouchableOpacity
                          onPress={() => handlePlay(latestAttempt.audio_url)}
                          style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: P, borderRadius: 8, paddingVertical: 7 }}
                        >
                          <Ionicons name={playingUrl === latestAttempt.audio_url ? 'pause' : 'play'} size={13} color="white" />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>
                            {playingUrl === latestAttempt.audio_url ? 'Pause' : 'Play'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Score breakdown comparison */}
                  {(latestAttempt.memorization_score || latestAttempt.pronunciation_score || latestAttempt.tajwid_score || latestAttempt.fluency_score) && (
                    <View>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1, marginBottom: 12 }}>LATEST BREAKDOWN</Text>
                      <ScoreBar label="Memorization"  value={latestAttempt.memorization_score}  color={P} />
                      <ScoreBar label="Pronunciation" value={latestAttempt.pronunciation_score} color={G} />
                      <ScoreBar label="Tajweed"       value={latestAttempt.tajwid_score}        color="#7C3AED" />
                      <ScoreBar label="Fluency"       value={latestAttempt.fluency_score}       color="#0891B2" />
                    </View>
                  )}

                  {/* Latest AI feedback */}
                  {latestAttempt.feedback && (
                    <View style={{ marginTop: 14, backgroundColor: '#FAFAF9', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#9CA3AF', marginBottom: 4 }}>AI FEEDBACK</Text>
                      <Text style={{ fontSize: 13, color: '#6B7280', fontStyle: 'italic', lineHeight: 19 }}>
                        "{latestAttempt.feedback}"
                      </Text>
                    </View>
                  )}

                  {/* All attempts score timeline */}
                  {comparisonData.length > 2 && (
                    <View style={{ marginTop: 18 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1, marginBottom: 12 }}>ALL ATTEMPTS TIMELINE</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64 }}>
                        {comparisonData.map((attempt, i) => {
                          const maxScore = Math.max(...comparisonData.map(a => a.score || 0), 1);
                          const barH = Math.max(((attempt.score || 0) / maxScore) * 56, 6);
                          const isLatest = i === comparisonData.length - 1;
                          const passed = (attempt.score || 0) >= 70;
                          return (
                            <View key={attempt.id || i} style={{ flex: 1, alignItems: 'center' }}>
                              <Text style={{ fontSize: 8, fontWeight: '800', color: isLatest ? P : '#9CA3AF', marginBottom: 3 }}>
                                {attempt.score || 0}%
                              </Text>
                              <View style={{ width: '100%', height: barH, backgroundColor: isLatest ? P : passed ? PL : '#FEF3C7', borderRadius: 4, borderWidth: isLatest ? 1.5 : 0, borderColor: P }} />
                              <Text style={{ fontSize: 8, color: '#9CA3AF', marginTop: 3 }}>#{attempt.attemptNumber}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── RECENT AI RESULTS ── */}
            {stats.recent.length > 0 && (
              <>
                <SectionLabel text="RECENT AI PRACTICE" action="See All →" onAction={() => navigation.navigate('History')} />
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                  {stats.recent.map((r, i) => {
                    const passed = r.score >= 70;
                    return (
                      <View key={r.id || i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < stats.recent.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: passed ? PL : '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                          <Ionicons name="sparkles" size={17} color={passed ? P : '#D97706'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: PD }}>{r.surah}</Text>
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

            {/* ── IMPROVEMENT TIP ── */}
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
                        ? "You're improving. Aim for 70% to unlock official assessment."
                        : 'Practice daily with Murajaah to strengthen your memorization.'}
                  </Text>
                </View>
              </View>
            )}

            {/* ── EMPTY STATE ── */}
            {recitations.length === 0 && !loading && (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 36, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                <Ionicons name="stats-chart-outline" size={52} color="#D1D5DB" style={{ marginBottom: 14 }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#9CA3AF', marginBottom: 6 }}>No data yet</Text>
                <Text style={{ fontSize: 13, color: '#D1D5DB', textAlign: 'center', lineHeight: 20 }}>
                  Complete your first Tasmiq session to see your progress here.
                </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('TasmiqPrep')}
                  style={{ marginTop: 20, backgroundColor: P, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Start First Session</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        )}
      </ScrollView>

      {/* ── SURAH PICKER MODAL ── */}
      <Modal visible={surahModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFDF0', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, height: '72%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: PD }}>Select Surah for Comparison</Text>
              <TouchableOpacity onPress={() => { setSurahModal(false); setSurahSearch(''); }}>
                <Ionicons name="close-circle" size={30} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E5EDE6' }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput
                placeholder="Search surah..."
                value={surahSearch}
                onChangeText={setSurahSearch}
                placeholderTextColor="#B8967A"
                style={{ flex: 1, padding: 12, fontSize: 15, color: PD }}
              />
            </View>
            <FlatList
              data={quranData.filter(s => s.name.toLowerCase().includes(surahSearch.toLowerCase()) || s.index.includes(surahSearch))}
              keyExtractor={item => item.index}
              renderItem={({ item }) => {
                const idx = parseInt(item.index) - 1;
                const hasData = recitations.some(r => r.is_exercise && (r.surah === item.name || r.surah_number === parseInt(item.index)));
                return (
                  <TouchableOpacity
                    onPress={() => { setCompSurahIdx(idx); setSurahModal(false); setSurahSearch(''); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: compSurahIdx === idx ? P : PL, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Text style={{ fontWeight: '800', fontSize: 12, color: compSurahIdx === idx ? '#FFFFFF' : P }}>{parseInt(item.index)}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: PD, flex: 1 }}>{item.name}</Text>
                    {hasData && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P }} />}
                    {compSurahIdx === idx && <Ionicons name="checkmark-circle" size={20} color={P} style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Weekly bar chart ───────────────────────────────────────────────────────────
function WeeklyBars({ recitations }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const todayIdx = (today.getDay() + 6) % 7;

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
      <Text style={{ fontSize: 13, fontWeight: '700', color: PD, marginBottom: 16 }}>
        {counts.reduce((a, b) => a + b, 0)} sessions this week
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 }}>
        {counts.map((count, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: '100%', height: count > 0 ? Math.max((count / maxCount) * 52, 8) : 6, backgroundColor: i === todayIdx ? P : count > 0 ? PL : '#F3F4F6', borderRadius: 6 }} />
            <Text style={{ fontSize: 9, color: i === todayIdx ? P : '#9CA3AF', fontWeight: i === todayIdx ? '800' : '600', marginTop: 4 }}>
              {days[i]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
