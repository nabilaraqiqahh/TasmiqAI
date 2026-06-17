import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Modal, FlatList, TextInput, Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
import { supabase } from '../../services/supabaseClient';
import quranData from '../../data/quran_data.json';

/* ── Design constants ───────────────────────────────────────── */
const PRIMARY  = '#14532D';
const GOLD     = '#D4AF37';
const GOLD_BG  = '#FDF8E7';
const LIGHT_GREEN = '#E8F5EC';
const RED      = '#C0392B';

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

  /* modals */
  const [surahModalVisible, setSurahModalVisible]   = useState(false);
  const [searchQuery, setSearchQuery]               = useState('');

  /* teacher assignment (from Supabase) */
  const [assignment, setAssignment]   = useState(null);
  const [teacherName, setTeacherName] = useState('—');
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  const currentSurah = quranData[selectedSurahIndex];
  const ayahCount    = currentSurah.count;

  /* Load assignment from Supabase */
  useFocusEffect(
    useCallback(() => {
      loadAssignment();
    }, [])
  );

  const loadAssignment = async () => {
    setLoadingAssignment(true);
    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();
      if (!session?.id) { setLoadingAssignment(false); return; }

      // ── 1. Get teacher name from enrolled class (most reliable source) ──
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
        setTeacherName(membership.classes.name); // fallback: use class name
      }

      // ── 2. Try to fetch a formal assignment (optional) ─────────────────
      const { data: assigns } = await supabase
        .from('assignments')
        .select('*, classes(name, teacher_name)')
        .eq('student_id', session.id)
        .order('due_date', { ascending: false })
        .limit(1);

      if (assigns && assigns.length > 0) {
        const a = assigns[0];
        setAssignment(a);
        // Only override teacherName if assignment has one explicitly
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

  const handleBegin = () => {
    navigation.navigate('TasmiqMode', {
      initialSurahIndex: selectedSurahIndex,
      initialAyahStart: selectedAyahStart,
      initialAyahEnd: selectedAyahEnd,
      recitationMode,
      teacherName,
      assignment,
    });
  };

  const endAyah = Math.min(
    recitationMode === 'single' ? selectedAyahStart
      : recitationMode === '5'  ? selectedAyahStart + 4
      : recitationMode === '10' ? selectedAyahStart + 9
      : ayahCount,
    ayahCount
  );

  return (
    <IslamicBackground variant="top">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* ── Header ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: 'rgba(20,83,45,0.08)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={22} color={PRIMARY} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: PRIMARY + '99', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Assessment
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '900', color: PRIMARY }}>
              Tasmiq Preparation
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
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
                  Verse {assignment.ayah_start || selectedAyahStart} – {assignment.ayah_end || endAyah}
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
                  <TouchableOpacity
                    onPress={() => setSelectedAyahStart(Math.max(1, selectedAyahStart - 1))}
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, flex: 1, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>FROM</Text>
                    <Text style={{ fontSize: 18, color: 'white', fontWeight: '800' }}>Ayah {selectedAyahStart}</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: GOLD, fontSize: 16, fontWeight: '700' }}>→</Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, flex: 1, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>TO</Text>
                    <Text style={{ fontSize: 18, color: 'white', fontWeight: '800' }}>Ayah {endAyah}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* ── Mode Selector Chips ── */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: PRIMARY + '80', letterSpacing: 1.2, marginBottom: 12 }}>
              RECITATION MODE
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'single', label: 'Single' },
                { id: '5',      label: '5 Ayahs' },
                { id: '10',     label: '10 Ayahs' },
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
    </IslamicBackground>
  );
}

