/**
 * TasmiqPrepScreen — Step-by-step Tasmiq preparation
 *
 * Step 1: Recitation Details (Surah + Ayat range)
 * Step 2: Choose Tasmiq Type (AI Practice | Official Assessment)
 * Step 3: Choose Recording Mode (Beginner one-by-one | Advanced continuous)
 * CTA:    START
 *
 * Background:    #FFF9E8  (warm ivory — 65%)
 * Cards:         #FFFCF5  (light cream — 20%)
 * Primary:       #0B6E4F  (emerald — 10%)
 * Selected bg:   #E5F2EC  (soft emerald — 3%)
 * Gold accent:   #C99A2E  (2%)
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Modal, FlatList, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabaseClient';
import quranData from '../../data/quran_data.json';

// ── Palette ────────────────────────────────────────────────────────────────────
const BG    = '#FFF9E8';   // warm ivory
const SURF  = '#FFFCF5';   // card surface
const P     = '#0B6E4F';   // emerald primary
const PD    = '#064E3B';   // dark emerald
const SEL   = '#E5F2EC';   // selected state bg
const PBRD  = '#0B6E4F';   // selected border
const G     = '#C99A2E';   // gold
const GL    = '#F5E8C3';   // soft gold
const MUTED = '#6B7280';
const BORD  = '#EAF0EB';   // soft border

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDot({ n, active, done }) {
  return (
    <View style={{ alignItems: 'center', width: 60 }}>
      <View style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: done ? P : active ? P : '#E5EDE6',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: active ? 2 : 0, borderColor: G,
      }}>
        {done
          ? <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          : <Text style={{ fontWeight: '800', fontSize: 13, color: active ? '#FFFFFF' : MUTED }}>{n}</Text>}
      </View>
      <Text style={{ fontSize: 9, fontWeight: '700', color: active ? P : MUTED, marginTop: 4, textAlign: 'center' }}>
        {n === 1 ? 'Recitation' : n === 2 ? 'Mode' : 'Start'}
      </Text>
    </View>
  );
}

function StepLine({ done }) {
  return <View style={{ flex: 1, height: 2, backgroundColor: done ? P : '#E5EDE6', marginBottom: 16 }} />;
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeading({ n, title, subtitle }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>{n}</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '900', color: PD }}>{title}</Text>
      </View>
      {subtitle && <Text style={{ fontSize: 12, color: MUTED, marginTop: 4, marginLeft: 36 }}>{subtitle}</Text>}
    </View>
  );
}

// ── Selection card ─────────────────────────────────────────────────────────────
function SelectCard({ icon, title, desc, selected, onPress, locked, lockMsg }) {
  return (
    <TouchableOpacity
      onPress={locked ? () => Alert.alert('Locked', lockMsg || 'Not available yet.') : onPress}
      activeOpacity={0.85}
      style={{
        flex: 1,
        backgroundColor: selected ? SEL : SURF,
        borderRadius: 14,
        padding: 16,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? P : BORD,
        opacity: locked ? 0.5 : 1,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: selected ? P : '#F0F4F1', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Ionicons name={icon} size={20} color={selected ? '#FFFFFF' : P} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: selected ? PD : '#1A2E1C', marginBottom: 4 }}>
        {title}
        {locked && <Text style={{ fontSize: 10, color: MUTED }}> 🔒</Text>}
      </Text>
      <Text style={{ fontSize: 11, color: MUTED, lineHeight: 16 }}>{desc}</Text>
      {selected && (
        <View style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TasmiqPrepScreen({ navigation }) {
  const [surahIndex,    setSurahIndex]    = useState(0);
  const [ayahStart,     setAyahStart]     = useState(1);
  const [ayahEnd,       setAyahEnd]       = useState(5);
  const [isExercise,    setIsExercise]    = useState(true);
  const [recordingMode, setRecordingMode] = useState('beginner');
  const [recitationMode,setRecitationMode]= useState('5');
  const [assignment,    setAssignment]    = useState(null);
  const [teacherName,   setTeacherName]   = useState('—');
  const [hasAI,         setHasAI]         = useState(false);
  const [loading,       setLoading]       = useState(true);

  // Modals
  const [surahModal, setSurahModal] = useState(false);
  const [startModal, setStartModal] = useState(false);
  const [endModal,   setEndModal]   = useState(false);
  const [search,     setSearch]     = useState('');

  const surah     = quranData[surahIndex];
  const ayahCount = surah.count;

  const computedEnd = useMemo(() => {
    if (recitationMode === 'single') return ayahStart;
    if (recitationMode === '5')     return Math.min(ayahStart + 4, ayahCount);
    if (recitationMode === '10')    return Math.min(ayahStart + 9, ayahCount);
    return Math.min(Math.max(ayahEnd, ayahStart), ayahCount);
  }, [recitationMode, ayahStart, ayahEnd, ayahCount]);

  useFocusEffect(useCallback(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { getCurrentUser } = await import('../../services/authService');
        const s = await getCurrentUser();
        if (!s?.id) { setLoading(false); return; }

        // Check AI prerequisite
        const { data: ai } = await supabase.from('recitations').select('id').eq('user_id', s.id).eq('surah_number', surahIndex + 1).eq('is_exercise', true).limit(1);
        setHasAI((ai || []).length > 0);
        if (!(ai || []).length) setIsExercise(true);

        // Teacher + assignment
        const { data: mem } = await supabase.from('class_members').select('classes(id, name, teacher_id)').eq('student_id', s.id).limit(1).maybeSingle();
        if (mem?.classes?.teacher_id) {
          const { data: t } = await supabase.from('users').select('full_name').eq('id', mem.classes.teacher_id).maybeSingle();
          if (t?.full_name) setTeacherName(t.full_name);
        }
        const { data: assigns } = await supabase.from('assignments').select('*').eq('student_id', s.id).order('due_date', { ascending: false }).limit(1);
        if (assigns?.length) {
          const a = assigns[0];
          setAssignment(a);
          if (a.surah_index != null) setSurahIndex(Number(a.surah_index));
          if (a.ayah_start)          setAyahStart(Number(a.ayah_start));
          if (a.ayah_end)            setAyahEnd(Number(a.ayah_end));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [surahIndex]));

  useEffect(() => {
    if (recitationMode !== 'continuous') setAyahEnd(computedEnd);
  }, [recitationMode, ayahStart]);

  const handleStart = () => {
    if (!isExercise && !hasAI) {
      Alert.alert('Prerequisite Required', 'Complete the AI Practice first before taking the Official Teacher Assessment.');
      return;
    }
    if (computedEnd < ayahStart) {
      Alert.alert('Invalid Range', '"To Ayah" must be ≥ "From Ayah".');
      return;
    }
    navigation.navigate('TasmiqMode', {
      initialSurahIndex: surahIndex,
      initialAyahStart:  ayahStart,
      initialAyahEnd:    computedEnd,
      recitationMode,
      recordingMode,
      teacherName,
      assignment,
      isExercise,
    });
  };

  const rangeText = recitationMode === 'single'
    ? `Ayah ${ayahStart}`
    : `Ayah ${ayahStart} → ${computedEnd} (${computedEnd - ayahStart + 1} ayat)`;

  const step1Done = true;
  const step2Done = true;
  const step3Active = true;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={P} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* ── Top bar ── */}
      <LinearGradient colors={[P, PD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()}
            style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>TASMIQ</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '900' }}>Setup Your Session</Text>
          </View>
          <View style={{ backgroundColor: GL, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#7A5C1E' }}>
              {isExercise ? 'AI PRACTICE' : 'OFFICIAL'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Step indicator ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, backgroundColor: BG }}>
        <StepDot n={1} active={false} done={step1Done} />
        <StepLine done={true} />
        <StepDot n={2} active={false} done={step2Done} />
        <StepLine done={false} />
        <StepDot n={3} active={true} done={false} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 56 }} showsVerticalScrollIndicator={false}>

        {/* ══════════════════════════════════════════════════════════════
            STEP 1 — RECITATION DETAILS
            ══════════════════════════════════════════════════════════════ */}
        <SectionHeading n="1" title="Recitation Details" subtitle="Select the Surah and Ayat range you will recite." />

        {/* Surah selector */}
        <TouchableOpacity onPress={() => setSurahModal(true)} style={{ backgroundColor: SURF, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORD, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: SEL, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '900', fontSize: 13, color: P }}>{parseInt(surah.index)}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 11, color: MUTED, fontWeight: '600' }}>SURAH</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: PD }}>{surah.name}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: MUTED }}>{surah.count} ayat</Text>
            <Ionicons name="chevron-down" size={16} color={P} />
          </View>
        </TouchableOpacity>

        {/* Ayat range */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => setStartModal(true)} style={{ flex: 1, backgroundColor: SURF, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: MUTED, fontWeight: '700', marginBottom: 4 }}>FROM AYAT</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: P }}>{ayahStart}</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: P, fontSize: 18, fontWeight: '700' }}>→</Text>
          </View>
          <TouchableOpacity
            onPress={() => recitationMode === 'continuous' ? setEndModal(true) : null}
            style={{ flex: 1, backgroundColor: recitationMode === 'continuous' ? SEL : SURF, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: recitationMode === 'continuous' ? P : BORD, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: MUTED, fontWeight: '700', marginBottom: 4 }}>TO AYAT</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: recitationMode === 'continuous' ? P : PD }}>{computedEnd}</Text>
            {recitationMode === 'continuous' && <Text style={{ fontSize: 8, color: P, fontWeight: '700', marginTop: 2 }}>TAP TO CHANGE</Text>}
          </TouchableOpacity>
        </View>

        {/* Range summary pill */}
        <View style={{ backgroundColor: GL, borderRadius: 10, padding: 10, alignItems: 'center', marginBottom: 28 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#7A5C1E' }}>{rangeText}</Text>
        </View>

        {/* ══════════════════════════════════════════════════════════════
            STEP 2 — TASMIQ TYPE
            ══════════════════════════════════════════════════════════════ */}
        <SectionHeading n="2" title="Tasmiq Type" subtitle="Choose how you want to practice or be assessed." />

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          <SelectCard
            icon="sparkles"
            title="AI Practice"
            desc="Practice freely. Receive AI score and feedback."
            selected={isExercise}
            onPress={() => setIsExercise(true)}
          />
          <SelectCard
            icon="ribbon"
            title="Official"
            desc="Submit to teacher for official review."
            selected={!isExercise}
            onPress={() => setIsExercise(false)}
            locked={!hasAI}
            lockMsg="Complete at least one AI Practice first before taking the Official Assessment."
          />
        </View>

        {/* ══════════════════════════════════════════════════════════════
            STEP 3 — RECORDING MODE
            ══════════════════════════════════════════════════════════════ */}
        <SectionHeading n="3" title="Recording Mode" subtitle="Choose how you will record your recitation." />

        {/* Beginner / Advanced */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <SelectCard
            icon="list"
            title="Beginner"
            desc="Record Ayat/Pause one by one."
            selected={recordingMode === 'beginner'}
            onPress={() => setRecordingMode('beginner')}
          />
          <SelectCard
            icon="radio"
            title="Advanced"
            desc="Record continuously without stopping."
            selected={recordingMode === 'advanced'}
            onPress={() => setRecordingMode('advanced')}
          />
        </View>

        {/* Beginner sub-mode: group size */}
        {recordingMode === 'beginner' && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1, marginBottom: 10 }}>GROUP SIZE</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'single', label: 'Single' },
                { id: '5',      label: '5 Ayat' },
                { id: '10',     label: '10 Ayat' },
                { id: 'continuous', label: 'Continuous' },
              ].map(m => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setRecitationMode(m.id)}
                  style={{
                    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 20,
                    backgroundColor: recitationMode === m.id ? P : SURF,
                    borderWidth: 1, borderColor: recitationMode === m.id ? P : BORD,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: recitationMode === m.id ? '#FFFFFF' : PD }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Mode description */}
            <View style={{ marginTop: 12, backgroundColor: SEL, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="information-circle-outline" size={16} color={P} style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12, color: P, flex: 1, fontWeight: '600', lineHeight: 18 }}>
                {recitationMode === 'single'
                  ? 'Record one ayah at a time. AI analyses each individually.'
                  : recitationMode === '5'
                    ? 'Record 5 consecutive ayat per group. Good for intermediate students.'
                    : recitationMode === '10'
                      ? 'Record 10 consecutive ayat per group. For confident reciters.'
                      : 'Record the entire selected range in one go.'}
              </Text>
            </View>
          </View>
        )}

        {recordingMode === 'advanced' && (
          <View style={{ marginBottom: 28, backgroundColor: SEL, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name="information-circle-outline" size={16} color={P} style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 12, color: P, flex: 1, fontWeight: '600', lineHeight: 18 }}>
              Advanced mode records your entire selected range continuously. The AI will analyse the full recitation.
            </Text>
          </View>
        )}

        {/* ── Important note ── */}
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 28, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
          <Ionicons name="warning-outline" size={18} color="#92400E" style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 12, color: '#92400E', flex: 1, lineHeight: 19 }}>
            <Text style={{ fontWeight: '800' }}>Remember: </Text>
            Quran text is hidden during recording. Recite entirely from memory. Each hint used reduces your score.
          </Text>
        </View>

        {/* ── Assignment info (if assigned) ── */}
        {assignment && (
          <View style={{ backgroundColor: SEL, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: P + '30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="school-outline" size={16} color={P} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: P, letterSpacing: 0.8 }}>TODAY'S ASSIGNMENT</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: PD }}>{surah.name}</Text>
            <Text style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
              Ayah {assignment.ayah_start || ayahStart} – {assignment.ayah_end || computedEnd} · Teacher: {teacherName}
            </Text>
            {assignment.due_date && (
              <Text style={{ fontSize: 11, color: G, marginTop: 4, fontWeight: '700' }}>
                Due: {new Date(assignment.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </Text>
            )}
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity
          onPress={handleStart}
          activeOpacity={0.88}
          style={{
            backgroundColor: P, borderRadius: 18, paddingVertical: 20,
            alignItems: 'center', shadowColor: P, shadowOpacity: 0.3,
            shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
            flexDirection: 'row', justifyContent: 'center', gap: 12,
          }}
        >
          <Ionicons name="mic" size={22} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 }}>
            {isExercise ? 'Start AI Practice' : 'Begin Official Assessment'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={GL} />
        </TouchableOpacity>

        <Text style={{ textAlign: 'center', fontSize: 11, color: MUTED, marginTop: 12 }}>
          Your recitation will be analysed by TasmiqAI
        </Text>

      </ScrollView>

      {/* ── SURAH MODAL ── */}
      <Modal visible={surahModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, height: '75%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: PD }}>Select Surah</Text>
              <TouchableOpacity onPress={() => { setSurahModal(false); setSearch(''); }}>
                <Ionicons name="close-circle" size={30} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 14, borderWidth: 1, borderColor: BORD }}>
              <Ionicons name="search" size={16} color={MUTED} />
              <TextInput placeholder="Search surah..." value={search} onChangeText={setSearch} placeholderTextColor="#B0B8C1" style={{ flex: 1, padding: 12, fontSize: 15, color: PD }} />
            </View>
            <FlatList
              data={quranData.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.index.includes(search))}
              keyExtractor={i => i.index}
              renderItem={({ item }) => {
                const idx = parseInt(item.index) - 1;
                return (
                  <TouchableOpacity
                    onPress={() => { setSurahIndex(idx); setAyahStart(1); setAyahEnd(Math.min(5, item.count)); setSurahModal(false); setSearch(''); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: surahIndex === idx ? P : SEL, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Text style={{ fontWeight: '800', fontSize: 12, color: surahIndex === idx ? '#FFFFFF' : P }}>{parseInt(item.index)}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: PD, flex: 1 }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: MUTED }}>{item.count} ayat</Text>
                    {surahIndex === idx && <Ionicons name="checkmark-circle" size={20} color={P} style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── FROM AYAH MODAL ── */}
      <Modal visible={startModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, height: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: PD }}>From Ayah</Text>
              <TouchableOpacity onPress={() => setStartModal(false)}><Ionicons name="close-circle" size={30} color="#D1D5DB" /></TouchableOpacity>
            </View>
            <FlatList
              data={Array.from({ length: ayahCount }, (_, i) => i + 1)}
              keyExtractor={i => String(i)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { setAyahStart(item); if (ayahEnd < item) setAyahEnd(item); setStartModal(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: ayahStart === item ? SEL : 'transparent' }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: ayahStart === item ? P : PD }}>Ayah {item}</Text>
                  {ayahStart === item && <Ionicons name="checkmark-circle" size={20} color={P} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── TO AYAH MODAL (continuous only) ── */}
      <Modal visible={endModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, height: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: PD }}>To Ayah</Text>
              <TouchableOpacity onPress={() => setEndModal(false)}><Ionicons name="close-circle" size={30} color="#D1D5DB" /></TouchableOpacity>
            </View>
            <FlatList
              data={Array.from({ length: ayahCount - ayahStart + 1 }, (_, i) => ayahStart + i)}
              keyExtractor={i => String(i)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { setAyahEnd(item); setEndModal(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: computedEnd === item ? SEL : 'transparent' }}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: computedEnd === item ? P : PD }}>Ayah {item}</Text>
                    <Text style={{ fontSize: 11, color: MUTED }}>{item - ayahStart + 1} ayat selected</Text>
                  </View>
                  {computedEnd === item && <Ionicons name="checkmark-circle" size={20} color={P} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
