import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Modal, FlatList, TextInput, Animated, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../services/supabaseClient';
import quranData from '../../data/quran_data.json';

/* ── Design constants ───────────────────────────────────────── */
const PRIMARY     = '#0B6E4F';
const DARK_EM     = '#064E3B';
const GOLD        = '#D4AF37';
const GOLD_BG     = '#FDF8E7';
const LIGHT_GREEN = '#D1FAE5';
const RED         = '#DC2626';
const BG          = '#F8FAF8';

const RULES = [
  { id: 1, icon: 'book-outline',        text: 'Recite entirely from memory' },
  { id: 2, icon: 'eye-off-outline',     text: 'Quran text is hidden during assessment' },
  { id: 3, icon: 'bulb-outline',        text: 'Maximum 5 hints allowed' },
  { id: 4, icon: 'mic-outline',         text: 'Pronunciation will be evaluated by AI' },
  { id: 5, icon: 'checkmark-circle-outline', text: 'Memorization accuracy will be assessed' },
  { id: 6, icon: 'list-outline',        text: 'Complete all assigned verses' },
];

/* ── Animated Rule Row ─────────────────────────────────────── */
function RuleRow({ icon, text, delay }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{
      flexDirection: 'row', alignItems: 'center',
      marginBottom: 14,
      opacity: fadeAnim,
      transform: [{ translateY: slideAnim }],
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: PRIMARY + '18',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14,
      }}>
        <Ionicons name={icon} size={18} color={PRIMARY} />
      </View>
      <Text style={{ fontSize: 14, color: '#2C3E2D', flex: 1, lineHeight: 20, fontWeight: '500' }}>
        {text}
      </Text>
      <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />
    </Animated.View>
  );
}

/* ── Main Screen ───────────────────────────────────────────── */
export default function TasmiqPrepScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();

  /* selection state */
  const [selectedSurahIndex, setSelectedSurahIndex] = useState(0);
  const [selectedAyahStart, setSelectedAyahStart] = useState(1);
  const [selectedAyahEnd, setSelectedAyahEnd]   = useState(5);
  const [recitationMode, setRecitationMode]     = useState('5');
  const [recordingMode, setRecordingMode]       = useState('beginner'); // 'beginner' | 'advanced'
  const [isExercise, setIsExercise]             = useState(true); // Default to AI Practice Exercise

  /* Prerequisite tracking */
  const [hasCompletedAiExercise, setHasCompletedAiExercise] = useState(false);

  /* modals */
  const [surahModalVisible, setSurahModalVisible]     = useState(false);
  const [ayahStartModalVisible, setAyahStartModalVisible] = useState(false);
  const [ayahEndModalVisible, setAyahEndModalVisible]   = useState(false);
  const [searchQuery, setSearchQuery]                 = useState('');

  /* teacher assignment (from Supabase) */
  const [assignment, setAssignment]   = useState(null);
  const [teacherName, setTeacherName] = useState('—');
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  const currentSurah = quranData[selectedSurahIndex];
  const ayahCount    = currentSurah.count;

  /* Load assignment & prerequisite status from Supabase */
  useFocusEffect(
    useCallback(() => {
      loadAssignment();
    }, [selectedSurahIndex])
  );

  const loadAssignment = async () => {
    setLoadingAssignment(true);
    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();
      if (!session?.id) { setLoadingAssignment(false); return; }

      // ── 1. Check if student has completed at least ONE AI Tasmiq Exercise for this surah ──
      const { data: aiRecs } = await supabase
        .from('recitations')
        .select('id')
        .eq('user_id', session.id)
        .eq('surah_number', selectedSurahIndex + 1)
        .eq('is_exercise', true)
        .limit(1);

      const aiCompleted = (aiRecs && aiRecs.length > 0);
      setHasCompletedAiExercise(aiCompleted);

      // If student hasn't completed AI exercise, force isExercise = true
      if (!aiCompleted) {
        setIsExercise(true);
      }

      // ── 2. Get teacher name from enrolled class ──
      const { data: membership } = await supabase
        .from('class_members')
        .select('classes(id, name, teacher_id)')
        .eq('student_id', session.id)
        .limit(1)
        .maybeSingle();

      if (membership?.classes?.teacher_id) {
        const { data: teacher } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', membership.classes.teacher_id)
          .maybeSingle();
        if (teacher?.full_name) setTeacherName(teacher.full_name);
      } else if (membership?.classes?.name) {
        setTeacherName(membership.classes.name);
      }

      // ── 3. Fetch formal assignment ──
      const { data: assigns } = await supabase
        .from('assignments')
        .select('*, classes(name, teacher_name)')
        .eq('student_id', session.id)
        .order('due_date', { ascending: false })
        .limit(1);

      if (assigns && assigns.length > 0) {
        const a = assigns[0];
        setAssignment(a);
        if (a.classes?.teacher_name) setTeacherName(a.classes.teacher_name);
        if (a.surah_index !== undefined && a.surah_index !== null) {
          setSelectedSurahIndex(Number(a.surah_index));
        }
        if (a.ayah_start) setSelectedAyahStart(Number(a.ayah_start));
        if (a.ayah_end)   setSelectedAyahEnd(Number(a.ayah_end));
      }
    } catch (e) {
      console.error('Assignment load error:', e);
    } finally {
      setLoadingAssignment(false);
    }
  };

  const handleSelectOfficialAssessment = () => {
    if (!hasCompletedAiExercise) {
      Alert.alert(
        'Prerequisite Required',
        'You must complete the AI Tasmiq Exercise before taking the Official Teacher Assessment.'
      );
      return;
    }
    setIsExercise(false);
  };

  // Compute the effective end ayah based on recitation mode
  // For continuous: use selectedAyahEnd (user-chosen)
  // For fixed modes: auto-compute from start
  const computedEndAyah = useMemo(() => {
    if (recitationMode === 'single') return selectedAyahStart;
    if (recitationMode === '5')  return Math.min(selectedAyahStart + 4, ayahCount);
    if (recitationMode === '10') return Math.min(selectedAyahStart + 9, ayahCount);
    // continuous — use user's selectedAyahEnd, clamp to valid range
    return Math.min(Math.max(selectedAyahEnd, selectedAyahStart), ayahCount);
  }, [recitationMode, selectedAyahStart, selectedAyahEnd, ayahCount]);

  const ayatSelected = computedEndAyah - selectedAyahStart + 1;

  // When recitation mode changes to non-continuous, auto-update selectedAyahEnd
  useEffect(() => {
    if (recitationMode !== 'continuous') {
      setSelectedAyahEnd(computedEndAyah);
    }
  }, [recitationMode, selectedAyahStart]);

  const handleBegin = () => {
    if (!isExercise && !hasCompletedAiExercise) {
      Alert.alert(
        'Prerequisite Required',
        'You must complete the AI Tasmiq Exercise before taking the Official Teacher Assessment.'
      );
      return;
    }

    // Validate range
    if (computedEndAyah < selectedAyahStart) {
      Alert.alert('Invalid Range', '"To Ayah" must be greater than or equal to "From Ayah".');
      return;
    }

    navigation.navigate('TasmiqMode', {
      initialSurahIndex: selectedSurahIndex,
      initialAyahStart: selectedAyahStart,
      initialAyahEnd: computedEndAyah,
      recitationMode,
      recordingMode,
      teacherName,
      assignment,
      isExercise,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

        {/* ── Header ── */}
        <LinearGradient
          colors={[PRIMARY, DARK_EM]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Assessment
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF' }}>
                Tasmiq Preparation
              </Text>
            </View>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: GOLD + '30', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mic" size={20} color={GOLD} />
            </View>
          </View>
        </LinearGradient>

      <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, paddingTop: 20 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Today's Assignment Card ── */}
          <View style={{
            backgroundColor: PRIMARY,
            borderRadius: 24, padding: 24,
            marginBottom: 20,
            shadowColor: PRIMARY, shadowOpacity: 0.25,
            shadowRadius: 16, elevation: 8,
          }}>
            {/* Gold accent bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 4, height: 20, backgroundColor: GOLD, borderRadius: 2, marginRight: 10 }} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 }}>
                TODAY'S TASMIQ ASSIGNMENT
              </Text>
            </View>

            {loadingAssignment ? (
              <ActivityIndicator color="white" />
            ) : assignment ? (
              <>
                <Text style={{ fontSize: 28, fontWeight: '900', color: 'white', marginBottom: 4 }}>
                  {currentSurah.name}
                </Text>
                <Text style={{ fontSize: 15, color: GOLD, fontWeight: '700', marginBottom: 20 }}>
                  Verse {assignment.ayah_start || selectedAyahStart} – {assignment.ayah_end || computedEndAyah}
                </Text>
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <View>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '700', marginBottom: 2 }}>TEACHER</Text>
                    <Text style={{ fontSize: 14, color: 'white', fontWeight: '700' }}>{teacherName}</Text>
                  </View>
                  {assignment.due_date && (
                    <View>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '700', marginBottom: 2 }}>DUE DATE</Text>
                      <Text style={{ fontSize: 14, color: 'white', fontWeight: '700' }}>
                        {new Date(assignment.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              /* No assignment — manual selection */
              <>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                  No assignment set. Select surah and ayah manually:
                </Text>
                {/* Surah Selector */}
                <TouchableOpacity
                  onPress={() => setSurahModalVisible(true)}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    borderRadius: 14, padding: 14,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', marginBottom: 2 }}>SURAH</Text>
                    <Text style={{ fontSize: 17, color: 'white', fontWeight: '800' }}>{currentSurah.name}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color={GOLD} />
                </TouchableOpacity>
                {/* Ayah Range row */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* FROM Ayah - tappable picker */}
                  <TouchableOpacity
                    onPress={() => setAyahStartModalVisible(true)}
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, flex: 1, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>FROM AYAH</Text>
                    <Text style={{ fontSize: 18, color: 'white', fontWeight: '800' }}>{selectedAyahStart}</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: GOLD, fontSize: 16, fontWeight: '700' }}>→</Text>
                  </View>
                  {/* TO Ayah - tappable picker (only interactive in continuous mode) */}
                  <TouchableOpacity
                    onPress={() => recitationMode === 'continuous' ? setAyahEndModalVisible(true) : null}
                    style={{
                      backgroundColor: recitationMode === 'continuous' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
                      borderRadius: 10, padding: 10, flex: 1, alignItems: 'center',
                      borderWidth: 1, borderColor: recitationMode === 'continuous' ? GOLD + '60' : 'rgba(255,255,255,0.1)',
                    }}
                  >
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>TO AYAH</Text>
                    <Text style={{ fontSize: 18, color: recitationMode === 'continuous' ? GOLD : 'rgba(255,255,255,0.7)', fontWeight: '800' }}>
                      {computedEndAyah}
                    </Text>
                    {recitationMode === 'continuous' && (
                      <Text style={{ fontSize: 9, color: GOLD, fontWeight: '600', marginTop: 2 }}>TAP TO CHANGE</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {/* Range summary */}
                <View style={{ marginTop: 10, backgroundColor: 'rgba(212,175,55,0.12)', borderRadius: 8, padding: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: GOLD, fontWeight: '700' }}>
                    {recitationMode === 'continuous'
                      ? `Ayah ${selectedAyahStart} → Ayah ${computedEndAyah} · ${ayatSelected} Ayat · Continuous`
                      : recitationMode === 'single'
                        ? `Ayah ${selectedAyahStart} · Single Ayah`
                        : `Ayah ${selectedAyahStart} → Ayah ${computedEndAyah} · ${ayatSelected} Ayat · ${recitationMode} per group`
                    }
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* ── Tasmiq Type Chips ── */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: PRIMARY + '80', letterSpacing: 1.2, marginBottom: 12 }}>
              TASMIQ TYPE
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setIsExercise(true)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 14,
                  backgroundColor: isExercise ? PRIMARY : LIGHT_GREEN,
                  borderWidth: 1.5,
                  borderColor: isExercise ? PRIMARY : PRIMARY + '30',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: isExercise ? 'white' : PRIMARY }}>
                  AI Practice Exercise
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSelectOfficialAssessment}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 14,
                  backgroundColor: !isExercise ? PRIMARY : hasCompletedAiExercise ? LIGHT_GREEN : '#F3F4F6',
                  borderWidth: 1.5,
                  borderColor: !isExercise ? PRIMARY : hasCompletedAiExercise ? PRIMARY + '30' : '#E5E7EB',
                  alignItems: 'center',
                  opacity: hasCompletedAiExercise ? 1 : 0.7,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: !isExercise ? 'white' : hasCompletedAiExercise ? PRIMARY : '#9CA3AF' }}>
                  {!hasCompletedAiExercise ? '🔒 Official Teacher' : 'Official Teacher'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Prerequisite Notification Callout */}
            {!hasCompletedAiExercise && (
              <View style={{
                backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 10,
                flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#FDE68A'
              }}>
                <Ionicons name="alert-circle" size={18} color="#92400E" />
                <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '700', flex: 1 }}>
                  You must complete the AI Tasmiq Exercise before taking the Official Teacher Assessment.
                </Text>
              </View>
            )}
          </View>

          {/* ── Recording Mode Selector ── */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: PRIMARY + '80', letterSpacing: 1.2, marginBottom: 12 }}>
              RECORDING MODE
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Beginner Mode Card */}
              <TouchableOpacity
                onPress={() => setRecordingMode('beginner')}
                style={{
                  flex: 1, paddingVertical: 16, paddingHorizontal: 14, borderRadius: 16,
                  backgroundColor: recordingMode === 'beginner' ? PRIMARY : '#FFFFFF',
                  borderWidth: 2,
                  borderColor: recordingMode === 'beginner' ? PRIMARY : PRIMARY + '25',
                  alignItems: 'center',
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                  borderColor: recordingMode === 'beginner' ? 'white' : PRIMARY + '50',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                }}>
                  {recordingMode === 'beginner' && (
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: 'white' }} />
                  )}
                </View>
                <Ionicons name="list-outline" size={22} color={recordingMode === 'beginner' ? 'white' : PRIMARY} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: recordingMode === 'beginner' ? 'white' : PRIMARY, marginBottom: 4 }}>
                  Beginner Mode
                </Text>
                <Text style={{ fontSize: 11, color: recordingMode === 'beginner' ? 'rgba(255,255,255,0.8)' : PRIMARY + '80', textAlign: 'center', lineHeight: 16 }}>
                  Record Ayat/Pause one by one
                </Text>
              </TouchableOpacity>

              {/* Advanced Mode Card */}
              <TouchableOpacity
                onPress={() => setRecordingMode('advanced')}
                style={{
                  flex: 1, paddingVertical: 16, paddingHorizontal: 14, borderRadius: 16,
                  backgroundColor: recordingMode === 'advanced' ? PRIMARY : '#FFFFFF',
                  borderWidth: 2,
                  borderColor: recordingMode === 'advanced' ? PRIMARY : PRIMARY + '25',
                  alignItems: 'center',
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                  borderColor: recordingMode === 'advanced' ? 'white' : PRIMARY + '50',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                }}>
                  {recordingMode === 'advanced' && (
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: 'white' }} />
                  )}
                </View>
                <Ionicons name="radio-outline" size={22} color={recordingMode === 'advanced' ? 'white' : PRIMARY} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: recordingMode === 'advanced' ? 'white' : PRIMARY, marginBottom: 4 }}>
                  Advanced Mode
                </Text>
                <Text style={{ fontSize: 11, color: recordingMode === 'advanced' ? 'rgba(255,255,255,0.8)' : PRIMARY + '80', textAlign: 'center', lineHeight: 16 }}>
                  Record continuously
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Mode Selector Chips ── */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: PRIMARY + '80', letterSpacing: 1.2, marginBottom: 12 }}>
              RECITATION MODE
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'single', label: 'Single' },
                { id: '5',      label: '5 Ayat/Pause' },
                { id: '10',     label: '10 Ayat/Pause' },
                { id: 'continuous', label: 'Continuous' },
              ].map(m => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setRecitationMode(m.id)}
                  style={{
                    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
                    backgroundColor: recitationMode === m.id ? PRIMARY : LIGHT_GREEN,
                    borderWidth: 1.5,
                    borderColor: recitationMode === m.id ? PRIMARY : PRIMARY + '30',
                  }}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: '700',
                    color: recitationMode === m.id ? 'white' : PRIMARY,
                  }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Mode description + range summary */}
            <View style={{
              marginTop: 12, backgroundColor: PRIMARY + '08',
              borderRadius: 12, padding: 12, borderWidth: 1, borderColor: PRIMARY + '15',
            }}>
              <Text style={{ fontSize: 12, color: PRIMARY, fontWeight: '700', marginBottom: 2 }}>
                {recitationMode === 'single'
                  ? '🎙 Single Mode — Record one ayah at a time'
                  : recitationMode === '5'
                    ? '🎙 5 Ayat Mode — Record 5 consecutive ayat per recording'
                    : recitationMode === '10'
                      ? '🎙 10 Ayat Mode — Record 10 consecutive ayat per recording'
                      : '🎙 Continuous Mode — Record the entire selected range in one go'
                }
              </Text>
              {!assignment && (
                <Text style={{ fontSize: 13, color: PRIMARY + 'CC', fontWeight: '800' }}>
                  {recitationMode === 'continuous'
                    ? `Ayah ${selectedAyahStart} → Ayah ${computedEndAyah} · ${ayatSelected} Ayat selected`
                    : recitationMode === 'single'
                      ? `Ayah ${selectedAyahStart} selected`
                      : `Ayah ${selectedAyahStart} → Ayah ${computedEndAyah} · ${ayatSelected} Ayat selected`
                  }
                </Text>
              )}
              {recitationMode === 'continuous' && !assignment && (
                <Text style={{ fontSize: 11, color: PRIMARY + '80', marginTop: 4 }}>
                  Tap "To Ayah" in the card above to change the end ayah.
                </Text>
              )}
            </View>
          </View>

          {/* ── Assessment Rules ── */}
          <View style={{
            backgroundColor: '#FAFAF8', borderRadius: 20,
            padding: 22, marginBottom: 24,
            borderWidth: 1, borderColor: PRIMARY + '15',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 4, height: 18, backgroundColor: GOLD, borderRadius: 2, marginRight: 10 }} />
              <Text style={{ fontSize: 13, fontWeight: '900', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 1 }}>
                Assessment Rules
              </Text>
            </View>
            {RULES.map((r, i) => (
              <RuleRow key={r.id} icon={r.icon} text={r.text} delay={i * 80} />
            ))}
          </View>

          {/* ── Warning Banner ── */}
          <View style={{
            backgroundColor: '#FEF3C7', borderRadius: 14,
            padding: 14, marginBottom: 24,
            flexDirection: 'row', alignItems: 'flex-start',
            borderWidth: 1, borderColor: '#F59E0B' + '40',
          }}>
            <Ionicons name="warning-outline" size={20} color="#92400E" style={{ marginRight: 10, marginTop: 1 }} />
            <Text style={{ fontSize: 13, color: '#92400E', flex: 1, lineHeight: 20 }}>
              <Text style={{ fontWeight: '800' }}>Important: </Text>
              Quran text will be hidden during recording. Recite entirely from memory. Each hint used reduces your final score.
            </Text>
          </View>

          {/* ── Begin Assessment Button ── */}
          <TouchableOpacity
            onPress={handleBegin}
            activeOpacity={0.88}
            style={{
              backgroundColor: PRIMARY, borderRadius: 20,
              paddingVertical: 20, alignItems: 'center',
              shadowColor: PRIMARY, shadowOpacity: 0.35,
              shadowRadius: 16, elevation: 10,
              flexDirection: 'row', justifyContent: 'center', gap: 12,
            }}
          >
            <Ionicons name="mic" size={22} color="white" />
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 }}>
              Begin Assessment
            </Text>
            <Ionicons name="arrow-forward" size={20} color={GOLD} />
          </TouchableOpacity>

          <Text style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 14 }}>
            Your recitation will be analysed by TasmiqAI and submitted to your teacher.
          </Text>
        </ScrollView>
      </SafeAreaView>

      {/* ── Surah Picker Modal ── */}
      <Modal visible={surahModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#FFFFFF', height: '72%',
            borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: PRIMARY }}>Select Surah</Text>
              <TouchableOpacity onPress={() => { setSurahModalVisible(false); setSearchQuery(''); }}>
                <Ionicons name="close-circle" size={32} color="#CCC" />
              </TouchableOpacity>
            </View>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#F5F5F5', borderRadius: 14,
              paddingHorizontal: 14, marginBottom: 14,
            }}>
              <Ionicons name="search" size={18} color="#AAA" />
              <TextInput
                placeholder="Search surah..."
                style={{ flex: 1, padding: 12, fontSize: 15, color: '#333' }}
                onChangeText={setSearchQuery}
                value={searchQuery}
              />
            </View>
            <FlatList
              data={quranData.filter(s =>
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.index.includes(searchQuery)
              )}
              keyExtractor={item => item.index}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedSurahIndex(parseInt(item.index) - 1);
                    setSelectedAyahStart(1);
                    setSelectedAyahEnd(Math.min(5, parseInt(item.count)));
                    setSurahModalVisible(false);
                    setSearchQuery('');
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
                  }}
                >
                  <View style={{
                    backgroundColor: PRIMARY + '18', width: 38, height: 38,
                    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14,
                  }}>
                    <Text style={{ color: PRIMARY, fontWeight: '800', fontSize: 12 }}>{parseInt(item.index)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2C2C' }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: '#888' }}>{item.count} verses</Text>
                  </View>
                  {selectedSurahIndex === parseInt(item.index) - 1 && (
                    <Ionicons name="checkmark-circle" size={22} color={PRIMARY} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── From Ayah Picker Modal ── */}
      <Modal visible={ayahStartModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#FFFFFF', height: '60%',
            borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: PRIMARY }}>Select From Ayah</Text>
              <TouchableOpacity onPress={() => setAyahStartModalVisible(false)}>
                <Ionicons name="close-circle" size={32} color="#CCC" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              {currentSurah.name} · Total {ayahCount} Ayat
            </Text>
            <FlatList
              data={Array.from({ length: ayahCount }, (_, i) => i + 1)}
              keyExtractor={item => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedAyahStart(item);
                    // Clamp end to >= start
                    if (selectedAyahEnd < item) setSelectedAyahEnd(item);
                    setAyahStartModalVisible(false);
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
                    backgroundColor: selectedAyahStart === item ? PRIMARY + '08' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: selectedAyahStart === item ? PRIMARY : '#333' }}>
                    Ayah {item}
                  </Text>
                  {selectedAyahStart === item && (
                    <Ionicons name="checkmark-circle" size={22} color={PRIMARY} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── To Ayah Picker Modal (Continuous mode only) ── */}
      <Modal visible={ayahEndModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#FFFFFF', height: '60%',
            borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: PRIMARY }}>Select To Ayah</Text>
              <TouchableOpacity onPress={() => setAyahEndModalVisible(false)}>
                <Ionicons name="close-circle" size={32} color="#CCC" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              {currentSurah.name} · From Ayah {selectedAyahStart} · Total {ayahCount} Ayat
            </Text>
            <FlatList
              data={Array.from({ length: ayahCount - selectedAyahStart + 1 }, (_, i) => selectedAyahStart + i)}
              keyExtractor={item => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedAyahEnd(item);
                    setAyahEndModalVisible(false);
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
                    backgroundColor: selectedAyahEnd === item ? PRIMARY + '08' : 'transparent',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: selectedAyahEnd === item ? PRIMARY : '#333' }}>
                      Ayah {item}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#AAA' }}>
                      {item - selectedAyahStart + 1} ayat selected
                    </Text>
                  </View>
                  {selectedAyahEnd === item && (
                    <Ionicons name="checkmark-circle" size={22} color={PRIMARY} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
  );
}


