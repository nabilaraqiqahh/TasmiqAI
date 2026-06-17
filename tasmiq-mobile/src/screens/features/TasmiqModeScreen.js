import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Alert, Modal, FlatList, ActivityIndicator,
  Animated, Easing, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
import { supabase } from '../../services/supabaseClient';
import { saveRecitationResult } from '../../services/recitationService';
import { API_URL, analyzeRecitation, assessChunk } from '../../services/api';
import quranData from '../../data/quran_data.json';

const { width: SCREEN_W } = Dimensions.get('window');

/* ── Colour palette ─────────────────────────────────────────── */
const P = {
  primary:  '#14532D',
  gold:     '#D4AF37',
  goldBg:   '#FDF8E7',
  green:    '#16A34A',
  red:      '#DC2626',
  amber:    '#D97706',
  bg:       '#F5F2E9',
  card:     '#FFFFFF',
  muted:    '#6B7280',
  text:     '#1A2E1C',
  lightGreen: '#E8F5EC',
};

/* ── TAJWID RULES for error analysis ──────────────────────── */
const TAJWID_RULES = [
  { label: 'Ghunnah',  keywords: ['ghunnah'] },
  { label: 'Qalqalah', keywords: ['qalqalah'] },
  { label: 'Mad Asli', keywords: ['madd', 'mad asli', 'madda'] },
  { label: 'Ikhfa',    keywords: ['ikhfa'] },
  { label: 'Idgham',   keywords: ['idgham'] },
  { label: 'Iqlab',    keywords: ['iqlab'] },
  { label: 'Izhar',    keywords: ['izhar'] },
];

const TAJWID_TIPS = {
  'Ghunnah':  'Practice nasalisation on Noon & Meem with prolonged nasal sound.',
  'Qalqalah': 'Apply the echo/bouncing sound on ق ط ب ج د clearly.',
  'Mad Asli': 'Ensure natural 2-count elongation on Alif, Waw, Ya.',
  'Ikhfa':    'Conceal Noon Saakin/Tanwin before the 15 Ikhfa letters.',
  'Idgham':   'Merge Noon Saakin smoothly into the following letter.',
  'Iqlab':    'Convert Noon Saakin to Meem before ب precisely.',
  'Izhar':    'Pronounce Noon Saakin clearly before throat letters.',
};

/* ── ACHIEVEMENT BADGES ─────────────────────────────────────── */
function getBadges(score, hintCount) {
  const badges = [];
  if (score >= 95) badges.push({ icon: '🏆', label: 'Perfect Tasmiq',  color: P.gold });
  if (score >= 85) badges.push({ icon: '⭐', label: 'Excellent',        color: P.green });
  if (hintCount === 0) badges.push({ icon: '🧠', label: 'No Hints Used', color: P.primary });
  if (score >= 70)  badges.push({ icon: '📖', label: 'Tasmiq Complete', color: '#4A90A4' });
  return badges;
}

/* ── AI PROCESSING STAGES ───────────────────────────────────── */
const AI_STAGES = [
  { icon: 'cloud-upload-outline',     label: 'Uploading Audio' },
  { icon: 'ear-outline',              label: 'Processing Recording' },
  { icon: 'mic-outline',              label: 'Recognizing Quran Recitation' },
  { icon: 'checkmark-done-outline',   label: 'Checking Memorization Accuracy' },
  { icon: 'analytics-outline',        label: 'Evaluating Tajwid Rules' },
  { icon: 'bulb-outline',             label: 'Generating Personalized Feedback' },
];

/* ── Animated Components ────────────────────────────────────── */
function AnimatedQuranIcon() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 28 }}>
      <View style={{
        width: 110, height: 110, borderRadius: 55,
        backgroundColor: '#0F6D3E15',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 3, borderColor: '#0F6D3E30',
      }}>
        <Ionicons name="book" size={56} color="#0F6D3E" />
      </View>
    </Animated.View>
  );
}

function RotatingMessages() {
  const messages = [
    "Every verse memorized brings you closer to excellence.",
    "Consistency is the key to Quran memorization.",
    "Keep striving for perfection in your recitation.",
    "Learning the Quran is a lifelong journey.",
  ];
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length);
      }, 400);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Animated.View style={{ opacity, height: 40, justifyContent: 'center' }}>
      <Text style={{ fontSize: 14, color: '#1A2E1C', textAlign: 'center', fontWeight: '500', paddingHorizontal: 20 }}>
        {messages[index]}
      </Text>
    </Animated.View>
  );
}

/* ── ScoreRing sub-component ────────────────────────────────── */
function ScoreRing({ score, label, color, size = 76 }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const scoreColor = score >= 85 ? P.green : score >= 70 ? P.amber : P.red;
  const c = color || scoreColor;

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Animated.View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 5, borderColor: c,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: c + '14',
        transform: [{ scale: pulseAnim }],
        marginBottom: 8,
      }}>
        <Text style={{ fontSize: size * 0.24, fontWeight: '900', color: c }}>{score}%</Text>
      </Animated.View>
      <Text style={{ fontSize: 12, color: P.muted, textAlign: 'center', fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/* ── Waveform animation ─────────────────────────────────────── */
function Waveform({ isActive }) {
  const bars = 20;
  const anims = useRef(Array.from({ length: bars }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (!isActive) {
      anims.forEach(a => Animated.timing(a, { toValue: 0.3, duration: 300, useNativeDriver: true }).start());
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(a, { toValue: 0.2 + Math.random() * 0.8, duration: 200 + i * 15, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.1 + Math.random() * 0.4, duration: 200 + i * 15, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [isActive]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 60, gap: 3 }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: (SCREEN_W - 80) / bars - 3,
            borderRadius: 2,
            backgroundColor: isActive ? P.primary : P.primary + '30',
            transform: [{ scaleY: a }],
            height: 44,
          }}
        />
      ))}
    </View>
  );
}

/* ── Recording Timer hook ───────────────────────────────────── */
function useTimer(running) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  useEffect(() => {
    if (running) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function TasmiqModeScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();

  /* ── Route params from TasmiqPrepScreen ── */
  const {
    initialSurahIndex = 0,
    initialAyahStart = 1,
    initialAyahEnd,
    recitationMode: initMode = '5',
    teacherName = 'Teacher',
    assignment = null,
  } = route.params || {};

  /* ── Surah / Ayah state ── */
  const [selectedSurahIndex, setSelectedSurahIndex] = useState(initialSurahIndex);
  const [selectedAyahNumber, setSelectedAyahNumber] = useState(initialAyahStart);
  const [recitationMode, setRecitationMode]         = useState(initMode);
  const [actualEndAyah, setActualEndAyah]           = useState(null);

  const currentSurah = quranData[selectedSurahIndex];
  const ayahCount    = currentSurah.count;

  const targetEndAyahNumber = useMemo(() => {
    if (recitationMode === 'single') return selectedAyahNumber;
    if (recitationMode === '5')  return Math.min(selectedAyahNumber + 4, ayahCount);
    if (recitationMode === '10') return Math.min(selectedAyahNumber + 9, ayahCount);
    return ayahCount;
  }, [recitationMode, selectedAyahNumber, ayahCount]);

  const endAyahToAnalyze = actualEndAyah || targetEndAyahNumber;

  const fullAyahText = useMemo(() => {
    let t = '';
    for (let a = selectedAyahNumber; a <= endAyahToAnalyze; a++) {
      t += (currentSurah.verse[`verse_${a}`] || '') + ' ۝ ';
    }
    return t.trim();
  }, [currentSurah, selectedAyahNumber, endAyahToAnalyze]);

  const ayahWords = useMemo(() => fullAyahText.trim().split(/\s+/), [fullAyahText]);

  /* ── Phase state machine ── */
  // 'recording' | 'processing' | 'results'
  const [phase, setPhase] = useState('recording');

  /* ── Hint system ── */
  const MAX_HINTS      = 5;
  const [hintCount, setHintCount]         = useState(0);
  const [revealedWords, setRevealedWords] = useState(0);
  const [hintWarning, setHintWarning]     = useState('');
  const hintWarningTimer                  = useRef(null);

  /* ── Recording ── */
  const [isRecording, setIsRecording]   = useState(false);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const recordingRef                    = useRef(null);
  const mediaRecorderRef                = useRef(null);
  const audioChunksRef                  = useRef([]);
  const silenceStartRef                 = useRef(null);

  /* ── AI Processing stages ── */
  const [completedStages, setCompletedStages] = useState([]);
  const [isTakingLong, setIsTakingLong] = useState(false);

  /* ── Results ── */
  const [aiAnalysis, setAiAnalysis]         = useState(null);
  const [showMistakes, setShowMistakes]     = useState(false);
  const [weakAreas, setWeakAreas]           = useState({});
  const [lastAudioUri, setLastAudioUri]     = useState(null);
  const [lastTranscription, setLastTranscription] = useState('');
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const playbackSoundRef = useRef(null);

  /* ── Ref audio ── */
  const [refSound, setRefSound]         = useState(null);
  const [isPlayingRef, setIsPlayingRef] = useState(false);
  const [isLoadingRef, setIsLoadingRef] = useState(false);

  /* ── Stop-ayah modal (continuous mode) ── */
  const [stopAyahModalVisible, setStopAyahModalVisible] = useState(false);

  /* ── Timer ── */
  const timer = useTimer(isRecording);

  /* ── Mic pulse animation ── */
  const micPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micPulse.setValue(1);
    }
  }, [isRecording]);

  /* ── Clean up on unmount ── */
  useFocusEffect(useCallback(() => {
    return () => {
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
      if (refSound) refSound.unloadAsync().catch(() => {});
      clearTimeout(hintWarningTimer.current);
    };
  }, [refSound]));

  /* ── Reset everything ── */
  const resetAll = () => {
    setPhase('recording');
    setHintCount(0);
    setRevealedWords(0);
    setHintWarning('');
    setCompletedStages([]);
    setIsTakingLong(false);
    setAiAnalysis(null);
    setShowMistakes(false);
    setActualEndAyah(null);
    setIsRecording(false);
    setIsAnalyzing(false);
    setSubmitError('');
    setIsPlayingRecording(false);
    if (playbackSoundRef.current) {
      playbackSoundRef.current.unloadAsync().catch(() => {});
      playbackSoundRef.current = null;
    }
    if (refSound) { refSound.unloadAsync(); setRefSound(null); setIsPlayingRef(false); }
  };

  /* ── Play back the student's own recording ── */
  const togglePlayRecording = async () => {
    if (!lastAudioUri) return;
    try {
      if (isPlayingRecording && playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
        setIsPlayingRecording(false);
        return;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: lastAudioUri },
        { shouldPlay: true },
        status => {
          if (status.didJustFinish) {
            setIsPlayingRecording(false);
            playbackSoundRef.current = null;
          }
        }
      );
      playbackSoundRef.current = sound;
      setIsPlayingRecording(true);
    } catch (err) {
      Alert.alert('Playback Error', 'Could not play your recording. Try again.');
    }
  };

  /* ── Hint handler ── */
  const handleHint = async () => {
    if (hintCount >= MAX_HINTS) {
      showHintWarning('Maximum hints reached. No further hints available.');
      return;
    }
    const next = hintCount + 1;
    setHintCount(next);
    showHintWarning(`Hint ${next} of ${MAX_HINTS} used. Final score may be reduced.`);

    if (next === 1) setRevealedWords(1);
    else if (next === 2) setRevealedWords(3);
    else if (next === 3) setRevealedWords(Math.ceil(ayahWords.length / 2));
    else if (next === 4) setRevealedWords(ayahWords.length);
    else if (next === 5) await playRefAudio();
  };

  const showHintWarning = (msg) => {
    setHintWarning(msg);
    clearTimeout(hintWarningTimer.current);
    hintWarningTimer.current = setTimeout(() => setHintWarning(''), 3500);
  };

  /* ── Ref audio ── */
  const playRefAudio = async () => {
    try {
      if (refSound) {
        const status = await refSound.getStatusAsync();
        if (status.isLoaded) {
          if (isPlayingRef) { await refSound.pauseAsync(); setIsPlayingRef(false); }
          else { await refSound.playAsync(); setIsPlayingRef(true); }
          return;
        }
      }
      setIsLoadingRef(true);
      const sp = (selectedSurahIndex + 1).toString().padStart(3, '0');
      const ap = selectedAyahNumber.toString().padStart(3, '0');
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_URL}/audio/${sp}/${ap}.mp3` },
        { shouldPlay: true },
        s => { if (s.didJustFinish) setIsPlayingRef(false); }
      );
      setRefSound(sound);
      setIsPlayingRef(true);
    } catch {
      Alert.alert('Error', 'Could not load reference audio.');
    } finally {
      setIsLoadingRef(false);
    }
  };

  /* ── Start recording ── */
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow microphone access to use Tasmiq.');
        return;
      }
      setIsRecording(true);

      if (Platform.OS === 'web') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mr;
        mr.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            try {
              const res = await assessChunk(blob, fullAyahText);
              if (res && typeof res.matched_word_count === 'number') {
                // silent live progress (no text shown)
              }
            } catch {}
          }
        };
        mr.start(2000);
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRec } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        metering: true,
      });

      newRec.setOnRecordingStatusUpdate(status => {
        if (status.isRecording && status.metering !== undefined) {
          if (status.metering < -50) {
            if (!silenceStartRef.current) silenceStartRef.current = Date.now();
            else if (Date.now() - silenceStartRef.current > 4000) stopRecording();
          } else {
            silenceStartRef.current = null;
          }
        }
      });

      recordingRef.current = newRec;
    } catch (err) {
      console.error('Recording start error:', err);
      setIsRecording(false);
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  /* ── Stop recording ── */
  const stopRecording = async () => {
    setIsRecording(false);
    if (Platform.OS === 'web' && mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      if (mediaRecorderRef.current.stream) mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }
    if (recitationMode === 'continuous') {
      setStopAyahModalVisible(true);
      return;
    }
    await processRecording(targetEndAyahNumber);
  };

  const handleStopAyahSelected = async (ayahNum) => {
    setStopAyahModalVisible(false);
    setActualEndAyah(ayahNum);
    await processRecording(ayahNum);
  };

  /* ── Process recording → AI ── */
  const processRecording = async (endAyah) => {
    const activeRec = recordingRef.current;
    if (!activeRec) return;

    let audioUri = null;
    try {
      await activeRec.stopAndUnloadAsync();
      audioUri = activeRec.getURI();
      recordingRef.current = null;
    } catch (err) {
      console.error('Recording stop error:', err);
      return;
    }

    // Switch to processing phase with staged animation
    setPhase('processing');
    setIsAnalyzing(true);
    setCompletedStages([]);
    setIsTakingLong(false);

    // 15-second timeout warning (Gemini should respond in 3-8s)
    const longTimer = setTimeout(() => {
      setIsTakingLong(true);
    }, 15000);

    // Animate stages with delays
    const stageDelay = 250;
    AI_STAGES.forEach((_, i) => {
      setTimeout(() => {
        setCompletedStages(prev => [...prev, i]);
      }, i * stageDelay);
    });

    try {
      const ayahRange = endAyah > selectedAyahNumber ? `${selectedAyahNumber}-${endAyah}` : `${selectedAyahNumber}`;
      const response = await analyzeRecitation(audioUri, selectedSurahIndex + 1, ayahRange, fullAyahText);

      // Backend returns { status: "success", result: { overall_score, ... } }
      // Unwrap the nested result object
      const result = response?.result || response || {};

      const realScore   = typeof result.overall_score      === 'number' ? Math.round(result.overall_score)      : 0;
      const memScore    = typeof result.memorization_score === 'number' ? Math.round(result.memorization_score) : realScore;
      const pronScore   = typeof result.pronunciation_score=== 'number' ? Math.round(result.pronunciation_score): realScore;
      const tajwidScore = typeof result.tajwid_score       === 'number' ? Math.round(result.tajwid_score)       : realScore;
      const fluScore    = typeof result.fluency_score      === 'number' ? Math.round(result.fluency_score)      : realScore;
      const wordAlignments = result.word_alignments || [];
      const refPh      = result.ref_phonetics  || '';
      const userPh     = result.user_phonetics || '';
      const fullFeedback = result.feedback     || '';
      const backendFeedback = result.feedback || '';

      // Apply hint penalty
      let finalScore = realScore;
      if (hintCount >= 3) finalScore = Math.max(0, finalScore - 15);
      else if (hintCount >= 1) finalScore = Math.max(0, finalScore - hintCount * 3);

      // Tajwid error analysis
      const tajwidCounts = {};
      TAJWID_RULES.forEach(r => { tajwidCounts[r.label] = 0; });
      const searchText = [fullFeedback, refPh, userPh].join(' ').toLowerCase();
      TAJWID_RULES.forEach(rule => {
        if (rule.keywords.some(kw => searchText.includes(kw))) tajwidCounts[rule.label]++;
      });
      const tajwidErrors = TAJWID_RULES
        .map(r => ({ rule: r.label, count: tajwidCounts[r.label] }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);

      // Recommendations
      const recommendations = tajwidErrors.slice(0, 3).map(e => ({
        error: e.rule,
        tip: TAJWID_TIPS[e.rule] || 'Practice this rule with a qualified Qari.',
      }));
      if (finalScore < 80) {
        recommendations.push({ error: 'Murajaah', tip: `Murajaah recommended for ${currentSurah.name}.` });
      }

      // Motivation message
      let motivation = '';
      if (finalScore >= 90) motivation = 'Excellent work! Keep maintaining your memorization. 🌟';
      else if (finalScore >= 70) motivation = 'Good effort! A little more practice will improve your accuracy.';
      else motivation = "Keep practicing. Repetition will strengthen your memorization.";

      if (finalScore < 80) {
        setWeakAreas(prev => ({ ...prev, [`${selectedAyahNumber}-${endAyah}`]: (prev[`${selectedAyahNumber}-${endAyah}`] || 0) + 1 }));
      }

      // Ensure all stages are shown as complete
      setCompletedStages(AI_STAGES.map((_, i) => i));

      // Store audio URI and transcription for submission
      // backend returns user_phonetics (the transcribed Arabic text from Gemini)
      const transcription = result.user_phonetics || result.transcription || result.user_text || '';
      setLastAudioUri(audioUri);
      setLastTranscription(transcription);

      // Brief pause before showing results
      setTimeout(() => {
        setAiAnalysis({
          score: finalScore,
          memorization: memScore,
          pronunciation: pronScore,
          tajwid: tajwidScore,
          fluency: fluScore,
          wordAlignments,
          hintsUsed: hintCount,
          motivation,
          tajwidErrors,
          recommendations,
          refPhonetics: refPh,
          userPhonetics: userPh,
          feedbackText: backendFeedback,
          transcription,
        });
        setPhase('results');
        setIsAnalyzing(false);
      }, 800);
    } catch (err) {
      console.error('AI analysis failed:', err);
      setPhase('recording');
      Alert.alert(
        'AI Server Not Reachable',
        `Cannot connect to TasmiqAI backend at:\n${API_URL}\n\nTo fix this:\n1. Make sure the backend is running on your PC (python tasmiq_api.py)\n2. Make sure your phone and PC are on the SAME WiFi network\n3. Update MY_PC_IP in src/services/api.js to your PC's current IP address (run ipconfig to find it)`,
        [{ text: 'OK' }]
      );
    } finally {
      clearTimeout(longTimer);
      setIsAnalyzing(false);
    }
  };
  /* ── Submit to teacher ── */
  const handleSubmit = async () => {
    // Go straight to submit — no blocking gate
    doSubmit();
  };

  const doSubmit = async () => {
    setSaving(true);
    setSubmitError('');
    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();

      if (!session?.id) {
        Alert.alert('Not Logged In', 'Please log in first to submit.');
        setSaving(false);
        return;
      }

      const ayahRange = endAyahToAnalyze > selectedAyahNumber
        ? `${selectedAyahNumber}-${endAyahToAnalyze}`
        : `${selectedAyahNumber}`;

      // Explicit, safe payload — no undefined values
      const payload = {
        studentName:         session.full_name || session.displayName || 'Student',
        surah:               String(currentSurah.name || ''),
        surahNumber:         selectedSurahIndex + 1,
        ayah:                ayahRange,
        score:               Number(aiAnalysis?.score)               || 0,
        memorization_score:  Number(aiAnalysis?.memorization)        || 0,
        pronunciation_score: Number(aiAnalysis?.pronunciation)       || 0,
        tajwid:              Number(aiAnalysis?.tajwid)              || 0,
        fluency_score:       Number(aiAnalysis?.fluency)             || 0,
        makhraj:             Number(aiAnalysis?.tajwid)              || 0,
        feedback:            String(aiAnalysis?.feedbackText || aiAnalysis?.motivation || ''),
        transcription:       String(aiAnalysis?.transcription || lastTranscription || ''),
        audioUri:            lastAudioUri || null,
        word_alignments:     Array.isArray(aiAnalysis?.wordAlignments) ? aiAnalysis.wordAlignments : [],
      };

      await saveRecitationResult(session.id, payload);

      // Show success screen
      setSubmitSuccess(true);

    } catch (e) {
      console.error('[doSubmit] error:', e);
      setSubmitError(e?.message || 'Unknown error. Please try again.');
    } finally {
      setSaving(false);
    }
  };


  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  // ── SUCCESS SCREEN ─────────────────────────────────────────
  if (submitSuccess) {
    const ayahRange = endAyahToAnalyze > selectedAyahNumber
      ? `${selectedAyahNumber}-${endAyahToAnalyze}`
      : `${selectedAyahNumber}`;

    return (
      <IslamicBackground variant="minimal">
        <SafeAreaView style={{ flex: 1, backgroundColor: P.bg }}>
          <StatusBar barStyle="dark-content" />
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Success Icon */}
            <View style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
            }}>
              <Text style={{ fontSize: 48 }}>✅</Text>
            </View>

            <Text style={{ fontSize: 26, fontWeight: '900', color: P.primary, marginBottom: 8, textAlign: 'center' }}>
              Submitted!
            </Text>
            <Text style={{ fontSize: 15, color: P.muted, textAlign: 'center', lineHeight: 24, marginBottom: 28 }}>
              Your recitation of{'\n'}
              <Text style={{ fontWeight: '800', color: P.text }}>{currentSurah.name}</Text>
              {' '}(Ayah {ayahRange}){'\n'}
              has been sent to{' '}
              <Text style={{ fontWeight: '800', color: P.primary }}>{teacherName}</Text>.
            </Text>

            {/* Score Summary Card */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 24, width: '100%',
              marginBottom: 28, borderWidth: 1, borderColor: '#E5E7EB',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: P.muted, textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>
                Your Score
              </Text>
              <Text style={{
                fontSize: 56, fontWeight: '900', textAlign: 'center',
                color: aiAnalysis?.score >= 85 ? '#16A34A' : aiAnalysis?.score >= 70 ? P.gold : P.red,
                lineHeight: 64,
              }}>
                {aiAnalysis?.score ?? 0}%
              </Text>
              <Text style={{ fontSize: 14, color: P.muted, textAlign: 'center', marginTop: 4 }}>
                {aiAnalysis?.score >= 85 ? '🌟 Excellent!' : aiAnalysis?.score >= 70 ? '👍 Good work!' : '📖 Keep practicing'}
              </Text>

              {/* Mini breakdown */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                {[
                  { label: 'Memory', val: aiAnalysis?.memorization ?? 0, color: P.primary },
                  { label: 'Pronunciation', val: aiAnalysis?.pronunciation ?? 0, color: '#4A90A4' },
                  { label: 'Tajwid', val: aiAnalysis?.tajwid ?? 0, color: P.gold },
                  { label: 'Fluency', val: aiAnalysis?.fluency ?? 0, color: '#9B8EC4' },
                ].map((m, i) => (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: m.color }}>{m.val}%</Text>
                    <Text style={{ fontSize: 10, color: P.muted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Info */}
            <View style={{
              backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, width: '100%',
              borderWidth: 1, borderColor: '#FDE68A', marginBottom: 28,
            }}>
              <Text style={{ fontSize: 13, color: '#92400E', textAlign: 'center', lineHeight: 20 }}>
                Your submission is now in the teacher's review queue.{'\n'}
                You can view this in your <Text style={{ fontWeight: '800' }}>History</Text> tab.
              </Text>
            </View>

            {/* Buttons */}
            <TouchableOpacity
              onPress={() => { setSubmitSuccess(false); navigation.navigate('History'); }}
              style={{
                width: '100%', padding: 18, borderRadius: 16,
                backgroundColor: P.primary, alignItems: 'center', marginBottom: 12,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              <Ionicons name="time-outline" size={20} color="white" />
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>View in History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setSubmitSuccess(false); navigation.goBack(); }}
              style={{
                width: '100%', padding: 18, borderRadius: 16,
                backgroundColor: 'white', alignItems: 'center',
                borderWidth: 1.5, borderColor: P.primary,
              }}
            >
              <Text style={{ color: P.primary, fontSize: 16, fontWeight: '800' }}>Back to Home</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </IslamicBackground>
    );
  }

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* ── Top bar ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
        }}>
          <TouchableOpacity
            onPress={() => {
              if (isRecording) {
                Alert.alert('Recording in Progress', 'Stop recording before going back.',
                  [{ text: 'OK' }]);
                return;
              }
              navigation.goBack();
            }}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: P.primary + '12',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={22} color={P.primary} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginHorizontal: 14 }}>
            <Text style={{ fontSize: 11, color: P.primary + '80', fontWeight: '700', letterSpacing: 1.2 }}>
              TASMIQ ASSESSMENT
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: P.primary }}>
              {currentSurah.name} · Ayah {selectedAyahNumber}
              {endAyahToAnalyze > selectedAyahNumber ? `–${endAyahToAnalyze}` : ''}
            </Text>
          </View>

          {/* Hint counter badge */}
          {phase === 'recording' && (
            <View style={{
              backgroundColor: hintCount >= 4 ? P.red + '20' : P.goldBg,
              borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
              borderWidth: 1, borderColor: hintCount >= 4 ? P.red + '40' : P.gold + '60',
            }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: hintCount >= 4 ? P.red : '#92400E' }}>
                {MAX_HINTS - hintCount}/{MAX_HINTS} Hints
              </Text>
            </View>
          )}
        </View>

        {/* ── Phase: RECORDING ── */}
        {phase === 'recording' && (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Assignment Info strip */}
            <View style={{
              backgroundColor: P.primary, borderRadius: 16,
              paddingVertical: 12, paddingHorizontal: 18,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 24,
            }}>
              <View>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '700' }}>CURRENT ASSIGNMENT</Text>
                <Text style={{ fontSize: 15, color: 'white', fontWeight: '800' }}>
                  {currentSurah.name} · Verse {selectedAyahNumber}–{endAyahToAnalyze}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '700' }}>TEACHER</Text>
                <Text style={{ fontSize: 13, color: P.gold, fontWeight: '700' }}>{teacherName}</Text>
              </View>
            </View>

            {/* Mic area */}
            <View style={{
              backgroundColor: P.card, borderRadius: 28,
              padding: 32, alignItems: 'center',
              marginBottom: 20,
              shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, elevation: 5,
              borderWidth: 1, borderColor: P.primary + '10',
            }}>
              {/* No-text reminder */}
              {!isRecording && (
                <View style={{
                  backgroundColor: '#FEF3C7', borderRadius: 12,
                  padding: 12, marginBottom: 24, width: '100%',
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                }}>
                  <Ionicons name="eye-off-outline" size={16} color="#92400E" />
                  <Text style={{ fontSize: 12, color: '#92400E', flex: 1, fontWeight: '600' }}>
                    Recite from memory. No Quran text is shown.
                  </Text>
                </View>
              )}

              {/* Timer */}
              <Text style={{
                fontSize: 48, fontWeight: '900',
                color: isRecording ? P.red : P.primary + '40',
                fontVariant: ['tabular-nums'], letterSpacing: 2,
                marginBottom: 8,
              }}>
                {timer}
              </Text>

              {/* Status text */}
              {isRecording ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.red }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: P.red }}>Listening...</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 14, color: P.muted, marginBottom: 20, textAlign: 'center' }}>
                  Press the mic button to start
                </Text>
              )}

              {/* Waveform */}
              <View style={{ width: '100%', marginBottom: 28 }}>
                <Waveform isActive={isRecording} />
              </View>

              {/* Mic button */}
              <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                <TouchableOpacity
                  onPress={isRecording ? stopRecording : startRecording}
                  activeOpacity={0.85}
                  style={{
                    width: 88, height: 88, borderRadius: 44,
                    backgroundColor: isRecording ? P.red : P.primary,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: isRecording ? P.red : P.primary,
                    shadowOpacity: 0.4, shadowRadius: 18, elevation: 12,
                  }}
                >
                  <Ionicons name={isRecording ? 'stop' : 'mic'} size={40} color="white" />
                </TouchableOpacity>
              </Animated.View>

              <Text style={{ fontSize: 12, color: P.muted, marginTop: 14, fontWeight: '600' }}>
                {isRecording ? 'Tap to stop recording' : 'Tap to begin reciting'}
              </Text>

              {/* Pause button (only while recording) */}
              {isRecording && (
                <TouchableOpacity
                  onPress={stopRecording}
                  style={{
                    marginTop: 16, paddingHorizontal: 24, paddingVertical: 10,
                    borderRadius: 12, borderWidth: 1.5, borderColor: P.primary + '40',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}
                >
                  <Ionicons name="pause" size={16} color={P.primary} />
                  <Text style={{ fontSize: 13, color: P.primary, fontWeight: '700' }}>Stop Recording</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Hint warning toast */}
            {hintWarning !== '' && (
              <View style={{
                backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14,
                marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
                borderWidth: 1, borderColor: '#F59E0B' + '50',
              }}>
                <Ionicons name="warning-outline" size={18} color="#92400E" />
                <Text style={{ fontSize: 13, color: '#92400E', flex: 1, fontWeight: '600' }}>{hintWarning}</Text>
              </View>
            )}

            {/* Hint section */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 20,
              borderWidth: 1, borderColor: P.primary + '12',
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: P.text }}>Hint System</Text>
                <View style={{
                  backgroundColor: hintCount >= MAX_HINTS ? P.red + '15' : P.goldBg,
                  borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: hintCount >= MAX_HINTS ? P.red : '#92400E' }}>
                    {hintCount}/{MAX_HINTS} Used
                  </Text>
                </View>
              </View>

              {/* Hint level dots */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
                {[1,2,3,4,5].map(i => (
                  <View key={i} style={{
                    flex: 1, height: 6, borderRadius: 3,
                    backgroundColor: i <= hintCount
                      ? (hintCount >= 4 ? P.red : P.gold)
                      : P.primary + '20',
                  }} />
                ))}
              </View>

              <View style={{ marginBottom: 14 }}>
                {[
                  'Hint 1 — First word revealed',
                  'Hint 2 — First three words',
                  'Hint 3 — First half of verse',
                  'Hint 4 — Full verse revealed',
                  'Hint 5 — Reference audio plays',
                ].map((label, i) => (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'center', marginBottom: 6,
                  }}>
                    <Ionicons
                      name={i < hintCount ? 'checkmark-circle' : 'ellipse-outline'}
                      size={14}
                      color={i < hintCount ? P.primary : P.muted}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={{
                      fontSize: 12, color: i < hintCount ? P.text : P.muted,
                      fontWeight: i < hintCount ? '600' : '400',
                      textDecorationLine: i < hintCount ? 'line-through' : 'none',
                    }}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Hint revealed words (only shown words, not hidden) */}
              {revealedWords > 0 && (
                <View style={{
                  backgroundColor: P.goldBg, borderRadius: 14,
                  padding: 14, marginBottom: 14,
                  borderWidth: 1, borderColor: P.gold + '40',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E', marginBottom: 8, letterSpacing: 1 }}>
                    HINT REVEALED
                  </Text>
                  <Text style={{
                    fontSize: 22, textAlign: 'right', color: P.text,
                    lineHeight: 38, fontFamily: 'serif',
                  }}>
                    {ayahWords.slice(0, revealedWords).join(' ')}
                    {revealedWords < ayahWords.length && (
                      <Text style={{ color: P.muted }}> ...</Text>
                    )}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleHint}
                disabled={hintCount >= MAX_HINTS || isRecording}
                activeOpacity={0.8}
                style={{
                  backgroundColor: hintCount >= MAX_HINTS ? '#F3F4F6' : P.goldBg,
                  borderRadius: 14, paddingVertical: 14,
                  alignItems: 'center', borderWidth: 1.5,
                  borderColor: hintCount >= MAX_HINTS ? '#E5E7EB' : P.gold + '60',
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
              >
                <Ionicons
                  name="bulb-outline"
                  size={18}
                  color={hintCount >= MAX_HINTS ? P.muted : '#92400E'}
                />
                <Text style={{
                  fontSize: 14, fontWeight: '800',
                  color: hintCount >= MAX_HINTS ? P.muted : '#92400E',
                }}>
                  {hintCount >= MAX_HINTS ? 'Maximum Hints Reached' : 'Request Hint'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Phase: PROCESSING ── */}
        {phase === 'processing' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <AnimatedQuranIcon />

            <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F6D3E', marginBottom: 8, textAlign: 'center' }}>
              Analyzing Your Recitation
            </Text>
            
            <View style={{ height: 60, marginBottom: 20 }}>
              <RotatingMessages />
            </View>

            {/* Stage list */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 20, width: '100%',
              shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
            }}>
              {AI_STAGES.map((stage, i) => {
                const done = completedStages.includes(i);
                const active = completedStages.length === i;
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 10,
                      borderBottomWidth: i < AI_STAGES.length - 1 ? 1 : 0,
                      borderBottomColor: '#F0F0F0',
                    }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: done ? '#0F6D3E15' : active ? '#D4AF3715' : '#F5F5F5',
                      alignItems: 'center', justifyContent: 'center', marginRight: 14,
                    }}>
                      {done
                        ? <Ionicons name="checkmark" size={18} color="#0F6D3E" />
                        : active 
                        ? <ActivityIndicator size="small" color="#D4AF37" />
                        : <Ionicons name={stage.icon} size={16} color={P.muted} />
                      }
                    </View>
                    <Text style={{
                      fontSize: 14, flex: 1,
                      color: done ? '#0F6D3E' : active ? '#D4AF37' : P.muted,
                      fontWeight: done || active ? '700' : '400',
                    }}>
                      {stage.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            
            {/* Long waiting timeout UI */}
            {isTakingLong && (
              <View style={{ marginTop: 24, width: '100%' }}>
                <Text style={{ textAlign: 'center', color: P.muted, marginBottom: 12 }}>
                  Analysis is taking longer than expected.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity 
                    style={{ flex: 1, paddingVertical: 12, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#D4AF37' }}
                    onPress={() => setIsTakingLong(false)}
                  >
                    <Text style={{ textAlign: 'center', color: '#D4AF37', fontWeight: '700' }}>Continue Waiting</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={{ flex: 1, paddingVertical: 12, backgroundColor: P.red, borderRadius: 10 }}
                    onPress={resetAll}
                  >
                    <Text style={{ textAlign: 'center', color: 'white', fontWeight: '700' }}>Retry Analysis</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Phase: RESULTS ── */}
        {phase === 'results' && aiAnalysis && (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Overall Score card */}
            <View style={{
              backgroundColor: '#0F6D3E',
              borderRadius: 24, padding: 28,
              alignItems: 'center', marginBottom: 16,
              shadowColor: '#0F6D3E', shadowOpacity: 0.35,
              shadowRadius: 16, elevation: 8,
            }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginBottom: 4, letterSpacing: 1 }}>
                OVERALL PERFORMANCE
              </Text>
              <Text style={{
                fontSize: 72, fontWeight: '900', color: 'white',
                lineHeight: 80, letterSpacing: -2,
              }}>
                {aiAnalysis.score}%
              </Text>
              <View style={{
                backgroundColor: aiAnalysis.score >= 90 ? '#16A34A' : aiAnalysis.score >= 70 ? '#D4AF37' : '#DC2626',
                borderRadius: 20, paddingHorizontal: 24, paddingVertical: 8, marginTop: 8,
              }}>
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                  {aiAnalysis.score >= 90 ? 'Excellent' : aiAnalysis.score >= 70 ? 'Good' : 'Needs Practice'}
                </Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 14, textAlign: 'center', lineHeight: 22, fontWeight: '500' }}>
                {aiAnalysis.motivation}
              </Text>
            </View>

            {/* Detailed Metric Cards */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 22, marginBottom: 14,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F6D3E', marginBottom: 20, letterSpacing: 0.5 }}>
                DETAILED ASSESSMENT
              </Text>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
                {/* 1. Memorization */}
                <View style={{ width: '47%', alignItems: 'center', paddingVertical: 10 }}>
                  <ScoreRing score={aiAnalysis.memorization} label="Memorization Accuracy" color="#0F6D3E" size={68} />
                </View>
                {/* 2. Pronunciation */}
                <View style={{ width: '47%', alignItems: 'center', paddingVertical: 10 }}>
                  <ScoreRing score={aiAnalysis.pronunciation} label="Pronunciation" color="#D4AF37" size={68} />
                </View>
                {/* 3. Tajwid */}
                <View style={{ width: '47%', alignItems: 'center', paddingVertical: 10 }}>
                  <ScoreRing score={aiAnalysis.tajwid} label="Tajwid Rules" color="#4A90A4" size={68} />
                </View>
                {/* 4. Fluency */}
                <View style={{ width: '47%', alignItems: 'center', paddingVertical: 10 }}>
                  <ScoreRing score={aiAnalysis.fluency} label="Fluency & Flow" color="#9B7DC8" size={68} />
                </View>
              </View>

              {/* Hints used row */}
              <View style={{
                marginTop: 10, paddingTop: 16,
                borderTopWidth: 1, borderTopColor: '#F0F0F0',
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <Text style={{ fontSize: 13, color: P.muted, fontWeight: '600' }}>Hints Used</Text>
                <View style={{
                  backgroundColor: aiAnalysis.hintsUsed > 0 ? '#FEF3C7' : P.lightGreen,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
                }}>
                  <Text style={{
                    fontSize: 14, fontWeight: '800',
                    color: aiAnalysis.hintsUsed > 0 ? '#92400E' : P.green,
                  }}>
                    {aiAnalysis.hintsUsed}/{MAX_HINTS}
                  </Text>
                </View>
              </View>
            </View>

            {/* Error Summary & Highlighted Text */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 20, marginBottom: 14,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F6D3E', marginBottom: 16, letterSpacing: 0.5 }}>
                RECITED TEXT COMPARISON
              </Text>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: P.green }} />
                  <Text style={{ fontSize: 11, color: P.muted }}>Correct</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: P.red }} />
                  <Text style={{ fontSize: 11, color: P.muted }}>Incorrect</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: P.amber }} />
                  <Text style={{ fontSize: 11, color: P.muted }}>Pronunciation</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: P.muted }} />
                  <Text style={{ fontSize: 11, color: P.muted }}>Skipped</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', direction: 'rtl' }}>
                {aiAnalysis.wordAlignments && aiAnalysis.wordAlignments.map((w, i) => {
                  let color = P.text;
                  let decoration = 'none';
                  if (w.status === 'correct') color = P.green;
                  else if (w.status === 'incorrect') { color = P.red; decoration = 'underline'; }
                  else if (w.status === 'pronunciation_issue') color = P.amber;
                  else if (w.status === 'skipped') { color = P.muted; decoration = 'line-through'; }
                  
                  return (
                    <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => {
                      if (w.status !== 'correct') {
                        Alert.alert('Word Details', `Expected: ${w.word}\n${w.user_said ? `You said: ${w.user_said}` : 'Skipped/Missed'}`);
                      }
                    }}>
                      <Text style={{ 
                        fontSize: 24, fontFamily: 'serif', marginRight: 8, marginBottom: 12,
                        color, textDecorationLine: decoration,
                      }}>
                        {w.word}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* AI Recommendations */}
            {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
              <View style={{
                backgroundColor: P.card, borderRadius: 20, padding: 20, marginBottom: 14,
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Ionicons name="sparkles" size={16} color={P.gold} />
                  <Text style={{ fontSize: 13, fontWeight: '900', color: P.primary, letterSpacing: 0.5 }}>
                    AI RECOMMENDATIONS
                  </Text>
                </View>
                {aiAnalysis.recommendations.map((r, i) => (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'flex-start',
                    backgroundColor: P.lightGreen, borderRadius: 12,
                    padding: 14, marginBottom: 10,
                  }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 8,
                      backgroundColor: P.primary + '15',
                      alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 1,
                    }}>
                      <Ionicons name="bulb-outline" size={14} color={P.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: P.primary, marginBottom: 2 }}>{r.error}</Text>
                      <Text style={{ fontSize: 13, color: P.muted, lineHeight: 20 }}>{r.tip}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Achievements / Badges */}
            {(() => {
              const badges = getBadges(aiAnalysis.score, aiAnalysis.hintsUsed);
              return badges.length > 0 ? (
                <View style={{
                  backgroundColor: P.card, borderRadius: 20, padding: 20, marginBottom: 20,
                  shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: P.primary, marginBottom: 16, letterSpacing: 0.5 }}>
                    ACHIEVEMENTS EARNED
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {badges.map((b, i) => (
                      <View key={i} style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: b.color + '15',
                        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                        borderWidth: 1, borderColor: b.color + '30',
                      }}>
                        <Text style={{ fontSize: 16, marginRight: 6 }}>{b.icon}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: b.color }}>{b.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null;
            })()}

            {/* Teacher Notification note */}
            <View style={{
              backgroundColor: P.lightGreen, borderRadius: 14,
              padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Ionicons name="mail-outline" size={20} color={P.primary} />
              <Text style={{ fontSize: 13, color: P.primary, flex: 1, fontWeight: '600' }}>
                Results will be sent to <Text style={{ fontWeight: '900' }}>{teacherName}</Text> upon submission.
              </Text>
            </View>

            {/* Action Buttons */}
            {aiAnalysis.feedbackText ? (
              <View style={{
                backgroundColor: '#F8FAF7', borderRadius: 20, padding: 18, marginBottom: 18,
                borderWidth: 1, borderColor: '#D1E7DD',
              }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F5132', marginBottom: 10 }}>AI Feedback</Text>
                <Text style={{ fontSize: 14, color: '#0F5132', lineHeight: 22 }}>{aiAnalysis.feedbackText}</Text>
              </View>
            ) : null}

            {/* ── Error Banner (shows inline if submit fails) ── */}
            {submitError ? (
              <View style={{
                backgroundColor: '#FEE2E2', borderRadius: 14, padding: 16,
                marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                borderWidth: 1, borderColor: '#FECACA',
              }}>
                <Ionicons name="alert-circle" size={20} color={P.red} style={{ marginTop: 1, flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: P.red, fontSize: 14 }}>Submission Failed</Text>
                  <Text style={{ color: P.red, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                    {submitError}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSubmitError('')}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ color: P.red, fontWeight: '700', fontSize: 12 }}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* ── Play Recording Button ── */}
            {lastAudioUri && (
              <TouchableOpacity
                onPress={togglePlayRecording}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: 16, borderRadius: 16, marginBottom: 12,
                  backgroundColor: isPlayingRecording ? '#FEF3C7' : '#F5F2E9',
                  borderWidth: 1.5,
                  borderColor: isPlayingRecording ? P.gold : '#E5E7EB',
                }}
              >
                <Ionicons
                  name={isPlayingRecording ? 'stop-circle' : 'play-circle'}
                  size={24}
                  color={isPlayingRecording ? P.gold : P.primary}
                />
                <Text style={{
                  fontWeight: '800', fontSize: 15,
                  color: isPlayingRecording ? P.gold : P.primary,
                }}>
                  {isPlayingRecording ? 'Stop Playback' : 'Play My Recording'}
                </Text>
                <View style={{
                  backgroundColor: isPlayingRecording ? P.gold + '20' : P.primary + '15',
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isPlayingRecording ? P.gold : P.primary }}>
                    {isPlayingRecording ? 'Playing...' : 'Review before submit'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={resetAll}
                style={{
                  flex: 1, paddingVertical: 18, borderRadius: 16,
                  backgroundColor: 'white',
                  borderWidth: 2, borderColor: P.primary,
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
              >
                <Ionicons name="refresh" size={18} color={P.primary} />
                <Text style={{ color: P.primary, fontSize: 15, fontWeight: '800' }}>Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={saving}
                style={{
                  flex: 2, paddingVertical: 18, borderRadius: 16,
                  backgroundColor: P.primary,
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  shadowColor: P.primary, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? <ActivityIndicator color="white" />
                  : <>
                      <Ionicons name="send-outline" size={18} color="white" />
                      <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>Submit to Teacher</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Stop Ayah modal (continuous mode) ── */}
        <Modal visible={stopAyahModalVisible} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%', maxHeight: '70%' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: P.primary, marginBottom: 8 }}>Which Ayah did you stop at?</Text>
              <Text style={{ fontSize: 14, color: P.muted, marginBottom: 20 }}>
                Select the last ayah you recited to accurately score your session.
              </Text>
              <FlatList
                data={Array.from({ length: Math.min(20, ayahCount - selectedAyahNumber + 1) }, (_, i) => selectedAyahNumber + i)}
                keyExtractor={item => item.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleStopAyahSelected(item)}
                    style={{
                      paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: P.text }}>Ayah {item}</Text>
                    <Ionicons name="chevron-forward" size={18} color={P.muted} />
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity onPress={() => setStopAyahModalVisible(false)} style={{ marginTop: 16, alignItems: 'center' }}>
                <Text style={{ color: P.red, fontWeight: '700', paddingVertical: 10 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </IslamicBackground>
  );
}
