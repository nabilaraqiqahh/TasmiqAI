/**
 * TasmiqPrepScreen — Redesigned Step-by-Step Tasmiq Preparation
 *
 * Visual spec:
 *   65% warm ivory background  (#FFF9E8)
 *   20% light cream cards      (#FFFCF5)
 *   10% emerald actions        (#0B6E4F)
 *    3% soft emerald selected  (#E5F2EC)
 *    2% gold accents            (#C99A2E)
 *
 * Layout:
 *   Header (compact emerald gradient)
 *   Step indicator  ① Recitation Details  ② Practice Mode  ③ Start
 *   Scrollable body:
 *     STEP 1 — Surah + Ayat range
 *     STEP 2 — AI Practice | Official Assessment
 *     STEP 3 — Beginner (+ group size) | Advanced
 *     Warning note
 *     Assignment banner (if present)
 *     Primary CTA
 *
 * Subtle Islamic geometric SVG pattern at 6% opacity in background.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Modal, FlatList, TextInput, ActivityIndicator,
  Alert, Dimensions, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabaseClient';
import quranData from '../../data/quran_data.json';

const { width: SW } = Dimensions.get('window');

// ── Palette ────────────────────────────────────────────────────────────────────
const BG    = '#FFF9E8';   // warm ivory — main background
const SURF  = '#FFFCF5';   // card surface
const P     = '#0B6E4F';   // emerald primary
const PD    = '#064E3B';   // dark emerald
const SEL   = '#E5F2EC';   // selected state bg
const PBRD  = '#0B6E4F';   // selected border
const G_    = '#C99A2E';   // gold
const GL    = '#F5E8C3';   // soft gold
const MUTED = '#7A8694';
const BORD  = '#E8EDE9';   // soft border
const WARN_BG   = '#FFFBEB';
const WARN_BORD = '#FDE68A';
const WARN_TXT  = '#92400E';

// ─────────────────────────────────────────────────────────────────────────────
// Islamic Geometric Background Pattern — pure View, no SVG dependency
// Renders a grid of tiny rotated squares (diamond shapes) at low opacity
// to mimic a traditional geometric lattice texture.
// ─────────────────────────────────────────────────────────────────────────────
function IslamicPatternBg() {
  const tileSize  = 36;
  const dotSize   = 10;
  const cols      = Math.ceil(SW / tileSize) + 1;
  const rows      = 28;

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = (r % 2 === 0) ? 0 : tileSize / 2;
      const useGold = (r + c) % 5 === 0;   // every 5th tile is a gold accent
      tiles.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left:  c * tileSize - 6 + offsetX,
            top:   r * tileSize - 6,
            width:  dotSize,
            height: dotSize,
            borderWidth:  useGold ? 0.8 : 0.6,
            borderColor:  useGold ? G_ : P,
            opacity:       useGold ? 0.13 : 0.08,
            transform: [{ rotate: '45deg' }],
          }}
        />
      );
    }
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {tiles}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────
function StepBar({ currentStep }) {
  const steps = [
    { n: 1, label: 'Recitation' },
    { n: 2, label: 'Mode' },
    { n: 3, label: 'Start' },
  ];

  return (
    <View style={styles.stepBarWrap}>
      {steps.map((s, i) => {
        const done   = s.n < currentStep;
        const active = s.n === currentStep;
        return (
          <React.Fragment key={s.n}>
            <View style={styles.stepDotCol}>
              <View style={[
                styles.stepDot,
                done   && styles.stepDotDone,
                active && styles.stepDotActive,
              ]}>
                {done
                  ? <Ionicons name="checkmark" size={13} color="#FFF" />
                  : <Text style={[styles.stepDotNum, active && { color: '#FFF' }]}>{s.n}</Text>}
              </View>
              <Text style={[styles.stepLabel, active && { color: P, fontWeight: '700' }]}>
                {s.label}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View style={[styles.stepLine, done && styles.stepLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header with numbered badge
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeading({ n, title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionBadgeRow}>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeNum}>{n}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {subtitle ? (
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Type selection card (AI Practice / Official)
// ─────────────────────────────────────────────────────────────────────────────
function TypeCard({ icon, title, desc, badge, selected, onPress, locked, lockMsg }) {
  return (
    <TouchableOpacity
      onPress={locked
        ? () => Alert.alert('Locked', lockMsg || 'Not available yet.')
        : onPress}
      activeOpacity={0.82}
      style={[styles.typeCard, selected && styles.typeCardSel, locked && { opacity: 0.5 }]}
    >
      {/* Icon */}
      <View style={[styles.typeIcon, selected && styles.typeIconSel]}>
        <Ionicons name={icon} size={20} color={selected ? '#FFF' : P} />
      </View>

      {/* Text */}
      <Text style={[styles.typeTitle, selected && { color: PD }]}>
        {title}
        {locked ? '  🔒' : ''}
      </Text>
      <Text style={styles.typeDesc}>{desc}</Text>

      {/* Badge */}
      {badge ? (
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{badge}</Text>
        </View>
      ) : null}

      {/* Check */}
      {selected && (
        <View style={styles.typeCheck}>
          <Ionicons name="checkmark" size={11} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording mode card (Beginner / Advanced)
// ─────────────────────────────────────────────────────────────────────────────
function ModeCard({ icon, title, desc, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.modeCard, selected && styles.modeCardSel]}
    >
      <View style={[styles.modeIcon, selected && styles.modeIconSel]}>
        <Ionicons name={icon} size={18} color={selected ? '#FFF' : P} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modeTitle, selected && { color: PD }]}>{title}</Text>
        <Text style={styles.modeDesc}>{desc}</Text>
      </View>
      {selected && (
        <View style={styles.modeCheck}>
          <Ionicons name="checkmark" size={10} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill chip (group size selector)
// ─────────────────────────────────────────────────────────────────────────────
function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, selected && styles.chipSel]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function TasmiqPrepScreen({ navigation }) {
  const [surahIndex,     setSurahIndex]     = useState(0);
  const [ayahStart,      setAyahStart]      = useState(1);
  const [ayahEnd,        setAyahEnd]        = useState(5);
  const [isExercise,     setIsExercise]     = useState(true);
  const [recordingMode,  setRecordingMode]  = useState('beginner');
  const [recitationMode, setRecitationMode] = useState('5');
  const [assignment,     setAssignment]     = useState(null);
  const [teacherName,    setTeacherName]    = useState('—');
  const [hasAI,          setHasAI]          = useState(false);
  const [loading,        setLoading]        = useState(true);

  // Modals
  const [surahModal,  setSurahModal]  = useState(false);
  const [startModal,  setStartModal]  = useState(false);
  const [endModal,    setEndModal]    = useState(false);
  const [search,      setSearch]      = useState('');

  const surah     = quranData[surahIndex];
  const ayahCount = surah.count;

  // Computed end ayah based on group mode
  const computedEnd = useMemo(() => {
    if (recitationMode === 'single')     return ayahStart;
    if (recitationMode === '5')          return Math.min(ayahStart + 4,  ayahCount);
    if (recitationMode === '10')         return Math.min(ayahStart + 9,  ayahCount);
    return Math.min(Math.max(ayahEnd, ayahStart), ayahCount); // continuous
  }, [recitationMode, ayahStart, ayahEnd, ayahCount]);

  // Which step indicator is active
  const currentStep = loading ? 1 : 3;

  useFocusEffect(useCallback(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { getCurrentUser } = await import('../../services/authService');
        const s = await getCurrentUser();
        if (!s?.id) { setLoading(false); return; }

        // AI prerequisite check
        const { data: ai } = await supabase
          .from('recitations').select('id')
          .eq('user_id', s.id)
          .eq('surah_number', surahIndex + 1)
          .eq('is_exercise', true)
          .limit(1);
        setHasAI((ai || []).length > 0);
        if (!(ai || []).length) setIsExercise(true);

        // Teacher name
        const { data: mem } = await supabase
          .from('class_members')
          .select('classes(id, name, teacher_id)')
          .eq('student_id', s.id)
          .limit(1).maybeSingle();
        if (mem?.classes?.teacher_id) {
          const { data: t } = await supabase
            .from('users').select('full_name')
            .eq('id', mem.classes.teacher_id).maybeSingle();
          if (t?.full_name) setTeacherName(t.full_name);
        }

        // Latest assignment
        const { data: assigns } = await supabase
          .from('assignments').select('*')
          .eq('student_id', s.id)
          .order('due_date', { ascending: false })
          .limit(1);
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
      Alert.alert(
        'Prerequisite Required',
        'Complete at least one AI Practice session before taking the Official Teacher Assessment.',
      );
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

  const rangeLabel = recitationMode === 'single'
    ? `Ayah ${ayahStart}`
    : `Ayah ${ayahStart} – ${computedEnd}  ·  ${computedEnd - ayahStart + 1} ayat`;

  const modeDescMap = {
    single:     'Record one ayah at a time. AI analyses each individually.',
    '5':        'Record 5 ayat per group. Great for building confidence.',
    '10':       'Record 10 ayat per group. For confident reciters.',
    continuous: 'Record the entire selected range in one continuous take.',
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex1, { backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={P} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex1, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={PD} />

      {/* ── Islamic background texture ───────────────────────────────────── */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <IslamicPatternBg />
      </View>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={[P, PD]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={19} color="#FFF" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerEyebrow}>TASMIQ</Text>
          <Text style={styles.headerTitle}>Setup Your Session</Text>
        </View>

        {/* Mode pill */}
        <View style={[styles.headerPill, isExercise ? styles.headerPillAI : styles.headerPillOfficial]}>
          <Ionicons
            name={isExercise ? 'sparkles' : 'ribbon'}
            size={11}
            color={isExercise ? '#7A5C1E' : '#FFF'}
          />
          <Text style={[styles.headerPillText, !isExercise && { color: '#FFF' }]}>
            {isExercise ? 'AI PRACTICE' : 'OFFICIAL'}
          </Text>
        </View>
      </LinearGradient>

      {/* ── Step indicator ──────────────────────────────────────────────────── */}
      <StepBar currentStep={currentStep} />

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ════════════════════════════════════════════════════════════════════
            STEP 1 — RECITATION DETAILS
            ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <SectionHeading
            n="1"
            title="Recitation Details"
            subtitle="Select the Surah and Ayat range you will recite."
          />

          {/* Surah selector button */}
          <TouchableOpacity onPress={() => setSurahModal(true)} style={styles.surahBtn}>
            <View style={styles.surahNumBadge}>
              <Text style={styles.surahNumText}>{parseInt(surah.index)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.surahLabel}>SURAH</Text>
              <Text style={styles.surahName}>{surah.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.surahAyatCount}>{surah.count} ayat</Text>
              <Ionicons name="chevron-down" size={15} color={P} style={{ marginTop: 2 }} />
            </View>
          </TouchableOpacity>

          {/* Ayat range row */}
          <View style={styles.ayatRow}>
            <TouchableOpacity onPress={() => setStartModal(true)} style={styles.ayatBox}>
              <Text style={styles.ayatBoxLabel}>FROM AYAT</Text>
              <Text style={styles.ayatBoxNum}>{ayahStart}</Text>
            </TouchableOpacity>

            <View style={styles.ayatArrow}>
              <Ionicons name="arrow-forward" size={16} color={G_} />
            </View>

            <TouchableOpacity
              onPress={() => recitationMode === 'continuous' ? setEndModal(true) : null}
              style={[
                styles.ayatBox,
                recitationMode === 'continuous' && styles.ayatBoxActive,
              ]}
            >
              <Text style={styles.ayatBoxLabel}>TO AYAT</Text>
              <Text style={[styles.ayatBoxNum, recitationMode === 'continuous' && { color: P }]}>
                {computedEnd}
              </Text>
              {recitationMode === 'continuous' && (
                <Text style={styles.ayatBoxTap}>TAP TO CHANGE</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Range summary */}
          <View style={styles.rangePill}>
            <Ionicons name="book-outline" size={13} color={G_} />
            <Text style={styles.rangePillText}>{rangeLabel}</Text>
          </View>
        </View>

        {/* ════════════════════════════════════════════════════════════════════
            STEP 2 — TASMIQ TYPE
            ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <SectionHeading
            n="2"
            title="Choose Tasmiq Type"
            subtitle="How do you want to practice today?"
          />

          <View style={styles.typeRow}>
            <TypeCard
              icon="sparkles"
              title="AI Practice"
              desc="Practice freely and receive a percentage score from AI."
              badge="Recommended"
              selected={isExercise}
              onPress={() => setIsExercise(true)}
            />
            <TypeCard
              icon="ribbon"
              title="Official Assessment"
              desc="Submit to your teacher for official review and grading."
              selected={!isExercise}
              onPress={() => setIsExercise(false)}
              locked={!hasAI}
              lockMsg="Complete at least one AI Practice session first before taking the Official Assessment."
            />
          </View>

          {!hasAI && (
            <View style={styles.infoRow}>
              <Ionicons name="lock-closed-outline" size={13} color={MUTED} />
              <Text style={styles.infoText}>
                Official Assessment unlocks after your first AI Practice.
              </Text>
            </View>
          )}
        </View>

        {/* ════════════════════════════════════════════════════════════════════
            STEP 3 — RECORDING MODE
            ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <SectionHeading
            n="3"
            title="Recording Mode"
            subtitle="Choose how you will record your recitation."
          />

          {/* ── Group size chips — always visible at top of step 3 ── */}
          <View style={styles.groupBox}>
            <Text style={styles.groupLabel}>GROUP SIZE</Text>
            <View style={styles.chipRow}>
              {[
                { id: 'single',     label: 'Single' },
                { id: '5',          label: '5 Ayat' },
                { id: '10',         label: '10 Ayat' },
                { id: 'continuous', label: 'Continuous' },
              ].map(m => (
                <Chip
                  key={m.id}
                  label={m.label}
                  selected={recitationMode === m.id}
                  onPress={() => {
                    setRecitationMode(m.id);
                    // Switching to continuous → also switch recording mode
                    if (m.id === 'continuous') setRecordingMode('advanced');
                    else setRecordingMode('beginner');
                  }}
                />
              ))}
            </View>

            {/* Mode description tip */}
            <View style={styles.modeTip}>
              <Ionicons name="information-circle-outline" size={14} color={P} />
              <Text style={styles.modeTipText}>{modeDescMap[recitationMode]}</Text>
            </View>
          </View>

          <View style={{ height: 14 }} />

          {/* ── Beginner / Advanced cards ── */}
          <ModeCard
            icon="list-outline"
            title="Beginner Mode"
            desc="Record Ayat/Pause one by one at your own pace."
            selected={recordingMode === 'beginner'}
            onPress={() => {
              setRecordingMode('beginner');
              if (recitationMode === 'continuous') setRecitationMode('5');
            }}
          />
          <View style={{ height: 8 }} />
          <ModeCard
            icon="radio-outline"
            title="Advanced Mode"
            desc="Record your entire selection continuously without stopping."
            selected={recordingMode === 'advanced'}
            onPress={() => {
              setRecordingMode('advanced');
              setRecitationMode('continuous');
            }}
          />
        </View>

        {/* ── Memory reminder ─────────────────────────────────────────────────── */}
        <View style={styles.warnBox}>
          <View style={styles.warnIconWrap}>
            <Ionicons name="warning-outline" size={17} color={WARN_TXT} />
          </View>
          <Text style={styles.warnText}>
            <Text style={{ fontWeight: '800' }}>Remember: </Text>
            Quran text is hidden during recording. Recite entirely from memory.
            Each hint used reduces your score.
          </Text>
        </View>

        {/* ── Assignment banner ────────────────────────────────────────────────── */}
        {assignment && (
          <View style={styles.assignBanner}>
            <View style={styles.assignHeader}>
              <Ionicons name="school-outline" size={14} color={P} />
              <Text style={styles.assignHeaderText}>TODAY'S ASSIGNMENT</Text>
            </View>
            <Text style={styles.assignSurah}>{surah.name}</Text>
            <Text style={styles.assignDetail}>
              Ayah {assignment.ayah_start || ayahStart} – {assignment.ayah_end || computedEnd}
              {'  ·  Teacher: '}{teacherName}
            </Text>
            {assignment.due_date && (
              <Text style={styles.assignDue}>
                Due: {new Date(assignment.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </Text>
            )}
          </View>
        )}

        {/* ── Primary CTA ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleStart}
          activeOpacity={0.87}
          style={styles.cta}
        >
          <Ionicons name="mic" size={21} color="#FFF" />
          <Text style={styles.ctaText}>
            {isExercise ? 'Start AI Practice' : 'Begin Official Assessment'}
          </Text>
          <Ionicons name="arrow-forward" size={17} color={GL} />
        </TouchableOpacity>

        <Text style={styles.ctaHint}>
          Your recitation will be analysed by TasmiqAI
        </Text>

      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════════════
          SURAH MODAL
          ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={surahModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Surah</Text>
              <TouchableOpacity onPress={() => { setSurahModal(false); setSearch(''); }}>
                <Ionicons name="close-circle" size={28} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={15} color={MUTED} />
              <TextInput
                placeholder="Search surah..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor="#B0B8C1"
                style={styles.searchInput}
              />
            </View>
            <FlatList
              data={quranData.filter(s =>
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.index.includes(search)
              )}
              keyExtractor={i => i.index}
              renderItem={({ item }) => {
                const idx = parseInt(item.index) - 1;
                const sel = surahIndex === idx;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setSurahIndex(idx);
                      setAyahStart(1);
                      setAyahEnd(Math.min(5, item.count));
                      setSurahModal(false);
                      setSearch('');
                    }}
                    style={[styles.modalRow, sel && { backgroundColor: SEL }]}
                  >
                    <View style={[styles.modalRowNum, sel && { backgroundColor: P }]}>
                      <Text style={[styles.modalRowNumText, sel && { color: '#FFF' }]}>
                        {parseInt(item.index)}
                      </Text>
                    </View>
                    <Text style={[styles.modalRowName, sel && { color: PD }]}>{item.name}</Text>
                    <Text style={styles.modalRowCount}>{item.count} ayat</Text>
                    {sel && <Ionicons name="checkmark-circle" size={18} color={P} style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════════
          FROM AYAH MODAL
          ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={startModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { height: '60%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>From Ayah</Text>
              <TouchableOpacity onPress={() => setStartModal(false)}>
                <Ionicons name="close-circle" size={28} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={Array.from({ length: ayahCount }, (_, i) => i + 1)}
              keyExtractor={i => String(i)}
              renderItem={({ item }) => {
                const sel = ayahStart === item;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setAyahStart(item);
                      if (ayahEnd < item) setAyahEnd(item);
                      setStartModal(false);
                    }}
                    style={[styles.modalAyahRow, sel && { backgroundColor: SEL }]}
                  >
                    <Text style={[styles.modalAyahText, sel && { color: P }]}>Ayah {item}</Text>
                    {sel && <Ionicons name="checkmark-circle" size={18} color={P} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════════
          TO AYAH MODAL (continuous only)
          ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={endModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { height: '60%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>To Ayah</Text>
              <TouchableOpacity onPress={() => setEndModal(false)}>
                <Ionicons name="close-circle" size={28} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={Array.from({ length: ayahCount - ayahStart + 1 }, (_, i) => ayahStart + i)}
              keyExtractor={i => String(i)}
              renderItem={({ item }) => {
                const sel = computedEnd === item;
                return (
                  <TouchableOpacity
                    onPress={() => { setAyahEnd(item); setEndModal(false); }}
                    style={[styles.modalAyahRow, sel && { backgroundColor: SEL }]}
                  >
                    <View>
                      <Text style={[styles.modalAyahText, sel && { color: P }]}>Ayah {item}</Text>
                      <Text style={styles.modalAyahSub}>{item - ayahStart + 1} ayat selected</Text>
                    </View>
                    {sel && <Ionicons name="checkmark-circle" size={18} color={P} />}
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

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex1: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.6)', fontSize: 10,
    fontWeight: '800', letterSpacing: 2,
  },
  headerTitle: {
    color: '#FFF', fontSize: 18, fontWeight: '900',
  },
  headerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  headerPillAI: { backgroundColor: GL },
  headerPillOfficial: { backgroundColor: 'rgba(255,255,255,0.2)' },
  headerPillText: {
    fontSize: 10, fontWeight: '800', color: '#7A5C1E',
  },

  // ── Step bar ─────────────────────────────────────────────────────────────────
  stepBarWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 14,
    backgroundColor: BG,
  },
  stepDotCol: { alignItems: 'center', width: 64 },
  stepDot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#E5EDE6',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: P },
  stepDotActive: {
    backgroundColor: P,
    borderWidth: 2.5, borderColor: G_,
  },
  stepDotNum: { fontWeight: '800', fontSize: 12, color: MUTED },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E5EDE6', marginBottom: 18 },
  stepLineDone: { backgroundColor: P },
  stepLabel: {
    fontSize: 9, fontWeight: '600', color: MUTED,
    marginTop: 5, textAlign: 'center',
  },

  // ── Scroll body ──────────────────────────────────────────────────────────────
  scrollBody: { paddingHorizontal: 16, paddingBottom: 52, paddingTop: 4 },

  // ── Cards ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SURF,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORD,
    // very subtle shadow
    shadowColor: '#0B6E4F',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // ── Section heading ───────────────────────────────────────────────────────────
  sectionHead: { marginBottom: 14 },
  sectionBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: P, alignItems: 'center', justifyContent: 'center',
  },
  sectionBadgeNum: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: PD },
  sectionSubtitle: {
    fontSize: 12, color: MUTED, marginTop: 3, marginLeft: 34, lineHeight: 17,
  },

  // ── Surah selector ────────────────────────────────────────────────────────────
  surahBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: BG, borderRadius: 12,
    padding: 13, borderWidth: 1, borderColor: BORD,
    marginBottom: 12,
  },
  surahNumBadge: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: SEL, alignItems: 'center', justifyContent: 'center',
  },
  surahNumText: { fontWeight: '900', fontSize: 13, color: P },
  surahLabel: { fontSize: 9, color: MUTED, fontWeight: '700', letterSpacing: 1 },
  surahName: { fontSize: 15, fontWeight: '800', color: PD, marginTop: 1 },
  surahAyatCount: { fontSize: 11, color: MUTED },

  // ── Ayat range ────────────────────────────────────────────────────────────────
  ayatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ayatBox: {
    flex: 1, backgroundColor: BG, borderRadius: 12,
    padding: 13, borderWidth: 1, borderColor: BORD,
    alignItems: 'center',
  },
  ayatBoxActive: { backgroundColor: SEL, borderColor: P },
  ayatBoxLabel: {
    fontSize: 9, color: MUTED, fontWeight: '700',
    letterSpacing: 1, marginBottom: 4,
  },
  ayatBoxNum: { fontSize: 24, fontWeight: '900', color: PD },
  ayatBoxTap: {
    fontSize: 8, color: P, fontWeight: '800',
    letterSpacing: 0.5, marginTop: 3,
  },
  ayatArrow: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10,
  },

  // ── Range pill ────────────────────────────────────────────────────────────────
  rangePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: GL, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    alignSelf: 'center',
  },
  rangePillText: { fontSize: 13, fontWeight: '700', color: '#7A5C1E' },

  // ── Type cards (AI / Official) ────────────────────────────────────────────────
  typeRow: { flexDirection: 'row', gap: 10 },
  typeCard: {
    flex: 1, backgroundColor: BG, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: BORD,
  },
  typeCardSel: { backgroundColor: SEL, borderColor: P, borderWidth: 1.5 },
  typeIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EAF4EE',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  typeIconSel: { backgroundColor: P },
  typeTitle: {
    fontSize: 13, fontWeight: '800', color: '#1A2E1C', marginBottom: 4,
  },
  typeDesc: { fontSize: 11, color: MUTED, lineHeight: 16 },
  typeBadge: {
    marginTop: 8, alignSelf: 'flex-start',
    backgroundColor: GL, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  typeBadgeText: { fontSize: 9, fontWeight: '800', color: '#7A5C1E' },
  typeCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: P, alignItems: 'center', justifyContent: 'center',
  },

  // ── Info row ─────────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10,
  },
  infoText: { fontSize: 11, color: MUTED, flex: 1 },

  // ── Mode cards (Beginner / Advanced) ──────────────────────────────────────────
  modeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: BG, borderRadius: 12,
    padding: 13, borderWidth: 1, borderColor: BORD, gap: 12,
  },
  modeCardSel: { backgroundColor: SEL, borderColor: P, borderWidth: 1.5 },
  modeIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EAF4EE',
    alignItems: 'center', justifyContent: 'center',
  },
  modeIconSel: { backgroundColor: P },
  modeTitle: { fontSize: 13, fontWeight: '800', color: '#1A2E1C', marginBottom: 2 },
  modeDesc: { fontSize: 11, color: MUTED, lineHeight: 16 },
  modeCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: P, alignItems: 'center', justifyContent: 'center',
    marginLeft: 'auto',
  },

  // ── Group size chips ──────────────────────────────────────────────────────────
  groupBox: {
    marginTop: 12,
    backgroundColor: BG, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: BORD,
  },
  groupLabel: {
    fontSize: 9, color: MUTED, fontWeight: '800',
    letterSpacing: 1.2, marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    backgroundColor: SURF, borderWidth: 1, borderColor: BORD,
  },
  chipSel: { backgroundColor: P, borderColor: P },
  chipLabel: { fontSize: 12, fontWeight: '700', color: PD },
  chipLabelSel: { color: '#FFF' },

  // ── Mode tip ──────────────────────────────────────────────────────────────────
  modeTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: SEL, borderRadius: 8,
    padding: 10, marginTop: 10,
  },
  modeTipText: {
    fontSize: 11, color: P, flex: 1, fontWeight: '600', lineHeight: 17,
  },

  // ── Warning box ───────────────────────────────────────────────────────────────
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: WARN_BG, borderRadius: 12,
    padding: 13, marginBottom: 14,
    borderWidth: 1, borderColor: WARN_BORD,
  },
  warnIconWrap: { marginTop: 1 },
  warnText: {
    fontSize: 12, color: WARN_TXT, flex: 1, lineHeight: 18,
  },

  // ── Assignment banner ─────────────────────────────────────────────────────────
  assignBanner: {
    backgroundColor: SEL, borderRadius: 14,
    padding: 15, marginBottom: 16,
    borderWidth: 1, borderColor: P + '28',
  },
  assignHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  assignHeaderText: {
    fontSize: 10, fontWeight: '800', color: P, letterSpacing: 1,
  },
  assignSurah: { fontSize: 15, fontWeight: '800', color: PD },
  assignDetail: { fontSize: 12, color: MUTED, marginTop: 2 },
  assignDue: { fontSize: 11, color: G_, fontWeight: '700', marginTop: 4 },

  // ── CTA ───────────────────────────────────────────────────────────────────────
  cta: {
    backgroundColor: P, borderRadius: 18,
    paddingVertical: 19, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
    shadowColor: P, shadowOpacity: 0.28,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  ctaText: {
    color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.4,
  },
  ctaHint: {
    textAlign: 'center', fontSize: 11,
    color: MUTED, marginBottom: 4,
  },

  // ── Modals ────────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, height: '75%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: PD },
  searchBar: {
    backgroundColor: '#FFF', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: BORD,
  },
  searchInput: {
    flex: 1, padding: 11, fontSize: 14, color: PD,
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    borderRadius: 8, paddingHorizontal: 4,
  },
  modalRowNum: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: SEL, alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  modalRowNumText: { fontWeight: '800', fontSize: 12, color: P },
  modalRowName: { fontSize: 14, fontWeight: '700', color: PD, flex: 1 },
  modalRowCount: { fontSize: 11, color: MUTED },
  modalAyahRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6', paddingHorizontal: 4,
    borderRadius: 8,
  },
  modalAyahText: { fontSize: 14, fontWeight: '700', color: PD },
  modalAyahSub: { fontSize: 11, color: MUTED, marginTop: 2 },
});
