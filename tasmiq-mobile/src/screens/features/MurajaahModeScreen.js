/**
 * MurajaahModeScreen — Manual ayah revision tracker
 * Each ayah must be tapped 3 times before session can be completed.
 * Progress is saved to Supabase and restored on re-open.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Modal, FlatList, TextInput, ActivityIndicator,
  Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import quranData from '../../data/quran_data.json';
import { supabase } from '../../services/supabaseClient';
import { getCurrentUser } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';

const MIN_REPS   = 3;   // minimum repetitions per ayah
const E  = '#0B6E4F';   // emerald
const ED = '#064E3B';   // dark emerald
const EL = '#D1FAE5';   // light emerald
const G  = '#D4AF37';   // gold
const BG = '#F8FAF8';   // background
const RD = '#EF4444';   // red

export default function MurajaahModeScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();

  // ── Surah selection ──────────────────────────────────────────
  const [selectedSurahIndex, setSelectedSurahIndex] = useState(0);
  const [surahModal,         setSurahModal]         = useState(false);
  const [searchQuery,        setSearchQuery]        = useState('');

  const currentSurah = quranData[selectedSurahIndex];
  const totalAyahs   = currentSurah?.count || 0;

  // ── Ayah repetition tracking — { ayahNum: count } ───────────
  const [reps,    setReps]    = useState({});  // { 1: 2, 2: 3, ... }
  const [session, setSession] = useState(null); // saved DB session id
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false); // completion screen

  // ── Tap animation feedback ───────────────────────────────────
  const pulseAnims = useRef({});
  const getPulse = (num) => {
    if (!pulseAnims.current[num]) pulseAnims.current[num] = new Animated.Value(1);
    return pulseAnims.current[num];
  };

  // ── Computed stats ───────────────────────────────────────────
  const completedCount = useMemo(() =>
    Object.values(reps).filter(r => r >= MIN_REPS).length, [reps]);

  const totalReps = useMemo(() =>
    Object.values(reps).reduce((s, r) => s + r, 0), [reps]);

  const allDone = useMemo(() =>
    totalAyahs > 0 && completedCount >= totalAyahs, [completedCount, totalAyahs]);

  const progress = totalAyahs > 0 ? Math.round((completedCount / totalAyahs) * 100) : 0;

  // ── Load saved progress when surah changes ───────────────────
  useFocusEffect(useCallback(() => {
    loadProgress();
  }, [selectedSurahIndex]));

  const loadProgress = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { setLoading(false); return; }

      const { data } = await supabase
        .from('murajaah_sessions')
        .select('*')
        .eq('student_id', user.id)
        .eq('surah', selectedSurahIndex + 1)
        .eq('status', 'in_progress')
        .order('session_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setSession(data.id);
        const savedReps = data.ayah_reps || {};
        // Convert keys to numbers
        const parsed = {};
        Object.entries(savedReps).forEach(([k, v]) => { parsed[parseInt(k)] = v; });
        setReps(parsed);
      } else {
        setSession(null);
        setReps({});
      }
    } catch (err) {
      console.warn('loadProgress error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Save progress to DB (auto-save) ─────────────────────────
  const saveProgress = async (newReps, status = 'in_progress') => {
    try {
      const user = await getCurrentUser();
      if (!user?.id) return;

      const totalR = Object.values(newReps).reduce((s, r) => s + r, 0);
      const completed = Object.values(newReps).filter(r => r >= MIN_REPS).length;

      if (session) {
        await supabase.from('murajaah_sessions').update({
          ayah_reps:          newReps,
          total_reps:         totalR,
          completed_ayahs:    completed,
          progress_percentage: totalAyahs > 0 ? Math.round((completed / totalAyahs) * 100) : 0,
          status,
          updated_at:         new Date().toISOString(),
        }).eq('id', session);
      } else {
        const { data } = await supabase.from('murajaah_sessions').insert([{
          student_id:          user.id,
          surah:               selectedSurahIndex + 1,
          start_ayah:          1,
          end_ayah:            totalAyahs,
          ayah_reps:           newReps,
          total_reps:          totalR,
          completed_ayahs:     completed,
          progress_percentage: totalAyahs > 0 ? Math.round((completed / totalAyahs) * 100) : 0,
          status,
          session_date:        new Date().toISOString(),
        }]).select().maybeSingle();
        if (data) setSession(data.id);
      }
    } catch (err) {
      console.warn('saveProgress error:', err?.message);
    }
  };

  // ── Tap an ayah — increment rep count ────────────────────────
  const tapAyah = async (ayahNum) => {
    const current = reps[ayahNum] || 0;
    if (current >= MIN_REPS) return; // already done

    // Pulse animation
    const anim = getPulse(ayahNum);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.08, duration: 80, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();

    const newReps = { ...reps, [ayahNum]: current + 1 };
    setReps(newReps);
    // Auto-save every tap (debounced-style — just save directly)
    saveProgress(newReps);
  };

  // ── Reset an ayah ─────────────────────────────────────────────
  const resetAyah = (ayahNum) => {
    Alert.alert('Reset Ayah', `Reset repetition count for Ayah ${ayahNum}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive',
        onPress: async () => {
          const newReps = { ...reps, [ayahNum]: 0 };
          setReps(newReps);
          saveProgress(newReps);
        }
      }
    ]);
  };

  // ── Finish session ────────────────────────────────────────────
  const handleFinish = async () => {
    if (!allDone) {
      const remaining = Array.from({ length: totalAyahs }, (_, i) => i + 1)
        .filter(a => (reps[a] || 0) < MIN_REPS);
      Alert.alert(
        'Session Incomplete',
        `Please complete all ayahs at least ${MIN_REPS} times before finishing.\n\nRemaining: Ayah ${remaining.join(', ')}`,
        [{ text: 'Continue Practising' }]
      );
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) throw new Error('Not logged in');

      // Get student's class
      const { data: membership } = await supabase
        .from('class_members')
        .select('class_id')
        .eq('student_id', user.id)
        .limit(1)
        .maybeSingle();

      await saveProgress(reps, 'completed');

      // Also save to recitations table so teacher can see it
      await supabase.from('recitations').insert([{
        user_id:      user.id,
        student_name: user.full_name || user.displayName || 'Student',
        surah_number: selectedSurahIndex + 1,
        surah:        currentSurah.name,
        ayah:         `1-${totalAyahs}`,
        start_verse:  1,
        end_verse:    totalAyahs,
        score:        100,
        memorization_score: 100,
        reviewed:     true,   // murajaah = auto-approved
        teacher_grade: 5,
        feedback:     `Murajaah completed — ${totalAyahs} ayahs × ${MIN_REPS} repetitions = ${totalReps} total reps.`,
        submitted_at: new Date().toISOString(),
        recorded_at:  new Date().toISOString(),
        duration_seconds: null,
      }]).catch(e => console.warn('recitation insert:', e?.message));

      setDone(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save session.');
    } finally {
      setSaving(false);
    }
  };

  // ── Change surah — confirm if progress exists ─────────────────
  const changeSurah = (index) => {
    if (Object.values(reps).some(r => r > 0)) {
      Alert.alert('Change Surah?', 'Your current progress will be saved. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change', onPress: () => { setSelectedSurahIndex(parseInt(index) - 1); setSurahModal(false); setSearchQuery(''); } }
      ]);
    } else {
      setSelectedSurahIndex(parseInt(index) - 1);
      setSurahModal(false);
      setSearchQuery('');
    }
  };

  // ── COMPLETION SCREEN ─────────────────────────────────────────
  if (done) {
    const now = new Date();
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: EL, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 44 }}>🎉</Text>
          </View>
          <Text style={{ fontSize: 26, fontWeight: '900', color: ED, marginBottom: 6, textAlign: 'center' }}>Murajaah Completed!</Text>
          <Text style={{ fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 28 }}>Well done! Your revision has been saved.</Text>

          {/* Summary Card */}
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 24, width: '100%', marginBottom: 24, borderWidth: 1, borderColor: EL, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }}>
            {[
              { label: 'Surah',            value: currentSurah.name },
              { label: 'Total Ayahs',      value: `${totalAyahs} ayahs` },
              { label: 'Total Repetitions',value: `${totalReps} reps` },
              { label: 'Date',             value: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
              { label: 'Time',             value: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>{item.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: ED }}>{item.value}</Text>
              </View>
            ))}
          </View>

          {/* Progress bar */}
          <View style={{ width: '100%', marginBottom: 28 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280' }}>Progress</Text>
              <Text style={{ fontSize: 13, fontWeight: '900', color: E }}>100%</Text>
            </View>
            <View style={{ height: 10, backgroundColor: EL, borderRadius: 5 }}>
              <View style={{ height: 10, width: '100%', backgroundColor: E, borderRadius: 5 }} />
            </View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
              {totalAyahs} of {totalAyahs} Ayahs Completed · 0 Remaining
            </Text>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('Home')} style={{ width: '100%', padding: 18, borderRadius: 16, backgroundColor: E, alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Return to Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setDone(false); setReps({}); setSession(null); }} style={{ width: '100%', padding: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, borderColor: E }}>
            <Text style={{ color: E, fontSize: 14, fontWeight: '700' }}>Start New Session</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── MAIN RENDER ──────────────────────────────────────────────
  const verses = useMemo(() => {
    if (!currentSurah?.verse) return [];
    return Object.entries(currentSurah.verse)
      .map(([key, text]) => ({ num: parseInt(key.split('_')[1]), text }))
      .sort((a, b) => a.num - b.num);
  }, [currentSurah]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={BG} />

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14, width: 36, height: 36, borderRadius: 10, backgroundColor: EL, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={20} color={ED} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: ED }}>{currentSurah.name}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>{totalAyahs} Ayahs · Tap each ayah {MIN_REPS}× to complete</Text>
        </View>
        <TouchableOpacity onPress={() => setSurahModal(true)} style={{ backgroundColor: EL, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: ED }}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* ── Progress Bar ── */}
      <View style={{ backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280' }}>{completedCount}/{totalAyahs} ayahs completed</Text>
          <Text style={{ fontSize: 12, fontWeight: '900', color: E }}>{progress}%</Text>
        </View>
        <View style={{ height: 7, backgroundColor: EL, borderRadius: 4 }}>
          <View style={{ height: 7, width: `${progress}%`, backgroundColor: E, borderRadius: 4 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 11, color: '#6B7280' }}>Total reps: {totalReps}</Text>
          <Text style={{ fontSize: 11, color: '#6B7280' }}>{totalAyahs - completedCount} remaining</Text>
        </View>
      </View>

      {/* ── Instruction banner ── */}
      <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
        <Text style={{ fontSize: 16 }}>👆</Text>
        <Text style={{ fontSize: 12, color: '#92400E', flex: 1, lineHeight: 18 }}>
          Tap each ayah to count a repetition. Complete each ayah <Text style={{ fontWeight: '800' }}>{MIN_REPS}× minimum</Text>. Long-press to reset.
        </Text>
      </View>

      {/* ── Ayah Cards ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={E} />
          <Text style={{ color: '#6B7280', marginTop: 10, fontSize: 13 }}>Loading session…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {verses.map((v) => {
            const count   = reps[v.num] || 0;
            const isDone  = count >= MIN_REPS;
            const pct     = Math.min(1, count / MIN_REPS);
            const pulse   = getPulse(v.num);

            return (
              <Animated.View key={v.num} style={{ transform: [{ scale: pulse }] }}>
                <TouchableOpacity
                  onPress={() => tapAyah(v.num)}
                  onLongPress={() => resetAyah(v.num)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: isDone ? `${E}10` : 'white',
                    borderRadius: 16, marginBottom: 10, padding: 16,
                    borderWidth: isDone ? 1.5 : 1,
                    borderColor: isDone ? E : '#E5E7EB',
                    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
                  }}
                >
                  {/* Top row: ayah number + rep counter */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDone ? E : EL, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: isDone ? 'white' : ED }}>{v.num}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>Ayah {v.num}</Text>
                    </View>

                    {/* Rep counter badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                        backgroundColor: isDone ? E : count > 0 ? '#FEF3C7' : '#F3F4F6',
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: isDone ? 'white' : count > 0 ? '#92400E' : '#9CA3AF' }}>
                          {count}/{MIN_REPS}
                        </Text>
                      </View>
                      {isDone && <Ionicons name="checkmark-circle" size={18} color={E} />}
                    </View>
                  </View>

                  {/* Arabic text */}
                  <Text style={{ fontSize: 22, textAlign: 'right', color: isDone ? ED : '#1F2937', lineHeight: 42, direction: 'rtl', fontWeight: '500', fontFamily: 'serif', marginBottom: 12 }}>
                    {v.text}
                  </Text>

                  {/* Rep progress bar */}
                  <View style={{ height: 4, backgroundColor: EL, borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: 4, width: `${pct * 100}%`, backgroundColor: isDone ? E : G, borderRadius: 2, transition: 'width 0.3s' }} />
                  </View>

                  {/* Tap hint */}
                  {!isDone && (
                    <Text style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>
                      {count === 0 ? 'Tap to begin reciting' : `${MIN_REPS - count} more tap${MIN_REPS - count > 1 ? 's' : ''} to complete`}
                    </Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Fixed Finish Session Button ── */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 8 }}>
        {!allDone && (
          <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 8 }}>
            {completedCount < totalAyahs
              ? `Complete ${totalAyahs - completedCount} more ayah${totalAyahs - completedCount > 1 ? 's' : ''} to finish`
              : 'All ayahs completed!'}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleFinish}
          disabled={saving}
          style={{
            padding: 17, borderRadius: 16, alignItems: 'center',
            backgroundColor: allDone ? E : '#D1D5DB',
            shadowColor: allDone ? E : 'transparent',
            shadowOpacity: allDone ? 0.35 : 0, shadowRadius: 12, elevation: allDone ? 5 : 0,
          }}
        >
          {saving
            ? <ActivityIndicator color="white" />
            : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={allDone ? 'checkmark-circle' : 'lock-closed'} size={20} color={allDone ? 'white' : '#9CA3AF'} />
                <Text style={{ color: allDone ? 'white' : '#9CA3AF', fontSize: 16, fontWeight: '900' }}>
                  {allDone ? 'Finish Session' : `${completedCount}/${totalAyahs} Completed`}
                </Text>
              </View>
          }
        </TouchableOpacity>
      </View>

      {/* ── Surah Picker Modal ── */}
      <Modal visible={surahModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '75%', padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: ED }}>Select Surah</Text>
              <TouchableOpacity onPress={() => { setSurahModal(false); setSearchQuery(''); }}>
                <Ionicons name="close-circle" size={30} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput
                placeholder="Search…" style={{ flex: 1, padding: 10, fontSize: 14, color: '#1F2937' }}
                onChangeText={setSearchQuery} value={searchQuery}
              />
            </View>
            <FlatList
              data={quranData.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.index.includes(searchQuery))}
              keyExtractor={item => item.index}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => changeSurah(item.index)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: EL, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: ED }}>{parseInt(item.index)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>{item.count} ayahs</Text>
                  </View>
                  {selectedSurahIndex === parseInt(item.index) - 1 && <Ionicons name="checkmark-circle" size={20} color={E} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
