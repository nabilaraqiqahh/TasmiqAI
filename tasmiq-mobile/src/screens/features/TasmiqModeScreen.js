import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Alert, ActivityIndicator, Animated, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
import { saveRecitationResult } from '../../services/recitationService';
import { analyzeRecitation } from '../../services/api';
import { supabase } from '../../services/supabaseClient';
import quranData from '../../data/quran_data.json';

const { width: SCREEN_W } = Dimensions.get('window');

const P = {
  primary:  '#0B6E4F',
  gold:     '#D4AF37',
  goldBg:   '#FDF8E7',
  green:    '#0B6E4F',
  red:      '#DC2626',
  amber:    '#D97706',
  bg:       '#FEFCE8',
  card:     '#FFFFFF',
  muted:    '#6B7280',
  text:     '#1A2E1C',
  lightGreen: '#E8F5EC',
};

// Generate UUID for session grouping
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function TasmiqModeScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();

  /* Route params */
  const {
    initialSurahIndex = 0,
    initialAyahStart = 1,
    initialAyahEnd,
    recitationMode: initMode = '5',
    recordingMode: initRecordingMode = 'beginner',
    teacherName = 'Teacher',
    assignment = null,
    isExercise = false,
  } = route.params || {};

  const currentSurah = quranData[initialSurahIndex];
  const ayahCount    = currentSurah.count;

  // Calculate target end ayah based on selected mode
  const targetEndAyahNumber = useMemo(() => {
    if (initMode === 'single') return initialAyahStart;
    if (initMode === '5')  return Math.min(initialAyahStart + 4, ayahCount);
    if (initMode === '10') return Math.min(initialAyahStart + 9, ayahCount);
    // continuous — use initialAyahEnd passed from prep screen (user-selected)
    return initialAyahEnd != null
      ? Math.min(Math.max(Number(initialAyahEnd), initialAyahStart), ayahCount)
      : ayahCount;
  }, [initMode, initialAyahStart, initialAyahEnd, ayahCount]);

  // Selected ayahs list
  const selectedAyahs = useMemo(() => {
    const list = [];
    for (let a = initialAyahStart; a <= targetEndAyahNumber; a++) {
      list.push(a);
    }
    return list;
  }, [initialAyahStart, targetEndAyahNumber]);

  /* State */
  const [recordingMode] = useState(initRecordingMode); // 'beginner' | 'advanced'
  const [recordings, setRecordings] = useState({}); // { [ayahNum]: { audioUri, isAnalyzing, isSubmittedToAi, score, analysis } }
  const [currentRecordingAyah, setCurrentRecordingAyah] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingAyah, setPlayingAyah] = useState(null);
  const [loopingAyah, setLoopingAyah] = useState(null);
  const [isSequentialPlay, setIsSequentialPlay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [attemptNumber, setAttemptNumber] = useState(1);

  // Advanced Mode state
  const [advancedRecording, setAdvancedRecording] = useState(null); // { audioUri, isAnalyzing, isSubmittedToAi, score, analysis, duration }
  const [advancedIsPlaying, setAdvancedIsPlaying] = useState(false);

  // Beginner Mode navigation
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);

  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const playbackSoundRef = useRef(null);
  const micPulse = useRef(new Animated.Value(1)).current;

  // Clean up player and recorder on unmount/blur
  useFocusEffect(
    useCallback(() => {
      loadAttemptNumber();
      return () => {
        cleanupAll();
      };
    }, [])
  );

  const loadAttemptNumber = async () => {
    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();
      if (!session?.id) return;

      const { count, error } = await supabase
        .from('recitations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.id)
        .eq('surah_number', initialSurahIndex + 1)
        .eq('is_exercise', true);

      if (!error && count !== null) {
        setAttemptNumber(count + 1);
      }
    } catch (e) {
      console.error('Error loading attempt number:', e);
    }
  };

  const cleanupAll = async () => {
    clearInterval(recordingTimerRef.current);
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    if (playbackSoundRef.current) {
      try { await playbackSoundRef.current.stopAsync(); await playbackSoundRef.current.unloadAsync(); } catch {}
      playbackSoundRef.current = null;
    }
  };

  // Mic Pulse animation during recording
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

  // ═══════════════════════════════════════════════════════════════
  // RECORDING HANDLERS (shared between Beginner & Advanced)
  // ═══════════════════════════════════════════════════════════════

  const startRecording = async (ayahNum) => {
    await cleanupAll();
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow microphone access to record your recitation.');
        return;
      }

      setCurrentRecordingAyah(ayahNum);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        metering: true,
      });
      recordingRef.current = recording;
    } catch (err) {
      console.error('Failed to start recording:', err);
      setIsRecording(false);
      setCurrentRecordingAyah(null);
      Alert.alert('Error', 'Could not start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    const ayahNum = currentRecordingAyah;
    const activeRec = recordingRef.current;
    
    if (!activeRec || ayahNum === null) return;

    try {
      await activeRec.stopAndUnloadAsync();
      const audioUri = activeRec.getURI();
      recordingRef.current = null;
      setCurrentRecordingAyah(null);

      if (recordingMode === 'advanced') {
        // Advanced mode: save as single recording
        setAdvancedRecording({
          audioUri,
          isAnalyzing: false,
          isSubmittedToAi: false,
          score: undefined,
          analysis: null,
          duration: recordingSeconds,
        });
      } else {
        // Beginner mode: save per-ayah
        setRecordings(prev => ({
          ...prev,
          [ayahNum]: {
            audioUri,
            isAnalyzing: false,
            isSubmittedToAi: false,
            score: undefined,
            analysis: null,
            duration: recordingSeconds,
          }
        }));
      }

    } catch (err) {
      console.error('Stop recording error:', err);
      setCurrentRecordingAyah(null);
      Alert.alert('Error', 'Could not save recording. Try again.');
    }
  };

  const deleteRecording = (ayahNum) => {
    setRecordings(prev => {
      const next = { ...prev };
      delete next[ayahNum];
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // AI SUBMISSION
  // ═══════════════════════════════════════════════════════════════

  const submitToAi = async (ayahNum) => {
    const rec = recordings[ayahNum];
    if (!rec?.audioUri) return;

    setRecordings(prev => ({
      ...prev,
      [ayahNum]: {
        ...prev[ayahNum],
        isAnalyzing: true,
      }
    }));

    try {
      const expectedText = currentSurah.verse[`verse_${ayahNum}`] || '';
      const response = await analyzeRecitation(rec.audioUri, initialSurahIndex + 1, String(ayahNum), expectedText);
      const result = response?.result || response || {};

      // ── No speech detected ────────────────────────────────────────────────
      if (result.status === 'no_speech') {
        setRecordings(prev => ({
          ...prev,
          [ayahNum]: {
            audioUri: null,
            isAnalyzing: false,
            isSubmittedToAi: false,
            score: undefined,
            analysis: null,
            duration: 0,
          }
        }));
        Alert.alert(
          '🎙 No Speech Detected',
          result.message || 'No speech was detected in your recording. Please speak clearly into the microphone and try again.',
          [{ text: 'Re-record', style: 'default' }]
        );
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Wrong surah detected ───────────────────────────────────────────────
      if (result.status === 'wrong_surah') {
        // Reset to unanalyzed state so the student can re-record
        setRecordings(prev => ({
          ...prev,
          [ayahNum]: {
            audioUri: null,
            isAnalyzing: false,
            isSubmittedToAi: false,
            score: undefined,
            analysis: null,
            duration: 0,
          }
        }));
        Alert.alert(
          '⚠️ Wrong Surah',
          result.message || 'You recited the wrong surah. Please recite the assigned surah.',
          [{ text: 'Re-record', style: 'default' }]
        );
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      const score = typeof result.overall_score === 'number' ? Math.round(result.overall_score) : 75;

      setRecordings(prev => ({
        ...prev,
        [ayahNum]: {
          ...prev[ayahNum],
          isAnalyzing: false,
          isSubmittedToAi: true,
          score,
          analysis: {
            score,
            memorization: typeof result.memorization_score === 'number' ? Math.round(result.memorization_score) : score,
            pronunciation: typeof result.pronunciation_score === 'number' ? Math.round(result.pronunciation_score) : score,
            tajwid: typeof result.tajwid_score === 'number' ? Math.round(result.tajwid_score) : score,
            fluency: typeof result.fluency_score === 'number' ? Math.round(result.fluency_score) : score,
            feedbackText: result.feedback || 'Good recitation.',
            transcription: result.user_phonetics || result.transcription || '',
            wordAlignments: result.word_alignments || [],
          }
        }
      }));
    } catch (err) {
      console.error('ASR analysis failed:', err);
      setRecordings(prev => ({
        ...prev,
        [ayahNum]: {
          ...prev[ayahNum],
          isAnalyzing: false,
        }
      }));
      Alert.alert('Analysis Failed', 'Could not reach the AI Server. Please make sure the backend API is running.');
    }
  };

  // Advanced mode AI submission
  const submitAdvancedToAi = async () => {
    if (!advancedRecording?.audioUri) return;

    setAdvancedRecording(prev => ({ ...prev, isAnalyzing: true }));

    try {
      // Concatenate all verse texts for the range
      let expectedText = '';
      for (let a = initialAyahStart; a <= targetEndAyahNumber; a++) {
        expectedText += (currentSurah.verse[`verse_${a}`] || '') + ' ';
      }
      expectedText = expectedText.trim();

      const ayahRange = `${initialAyahStart}-${targetEndAyahNumber}`;
      const response = await analyzeRecitation(advancedRecording.audioUri, initialSurahIndex + 1, ayahRange, expectedText);
      const result = response?.result || response || {};

      // ── No speech detected ────────────────────────────────────────────────
      if (result.status === 'no_speech') {
        setAdvancedRecording({
          audioUri: null,
          isAnalyzing: false,
          isSubmittedToAi: false,
          score: undefined,
          analysis: null,
          duration: 0,
        });
        Alert.alert(
          '🎙 No Speech Detected',
          result.message || 'No speech was detected in your recording. Please speak clearly into the microphone and try again.',
          [{ text: 'Re-record', style: 'default' }]
        );
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Wrong surah detected ───────────────────────────────────────────────
      if (result.status === 'wrong_surah') {
        setAdvancedRecording({
          audioUri: null,
          isAnalyzing: false,
          isSubmittedToAi: false,
          score: undefined,
          analysis: null,
          duration: 0,
        });
        Alert.alert(
          '⚠️ Wrong Surah',
          result.message || 'You recited the wrong surah. Please recite the assigned surah.',
          [{ text: 'Re-record', style: 'default' }]
        );
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      const score = typeof result.overall_score === 'number' ? Math.round(result.overall_score) : 75;

      // Parse detected/missing ayahs from backend (continuous mode)
      const detectedAyahs  = result.detected_ayahs  || null;
      const missingAyahs   = result.missing_ayahs   || null;
      const completionStatus = result.completion_status || null; // 'complete' | 'incomplete' | 'uncertain'

      setAdvancedRecording(prev => ({
        ...prev,
        isAnalyzing: false,
        isSubmittedToAi: true,
        score,
        analysis: {
          score,
          memorization: typeof result.memorization_score === 'number' ? Math.round(result.memorization_score) : score,
          pronunciation: typeof result.pronunciation_score === 'number' ? Math.round(result.pronunciation_score) : score,
          tajwid: typeof result.tajwid_score === 'number' ? Math.round(result.tajwid_score) : score,
          fluency: typeof result.fluency_score === 'number' ? Math.round(result.fluency_score) : score,
          feedbackText: result.feedback || 'Good recitation.',
          transcription: result.user_phonetics || result.transcription || '',
          wordAlignments: result.word_alignments || [],
          detectedAyahs,
          missingAyahs,
          completionStatus,
        }
      }));
    } catch (err) {
      console.error('Advanced ASR analysis failed:', err);
      setAdvancedRecording(prev => ({ ...prev, isAnalyzing: false }));
      Alert.alert('Analysis Failed', 'Could not reach the AI Server. Please make sure the backend API is running.');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // AUDIO PLAYBACK (Beginner mode)
  // ═══════════════════════════════════════════════════════════════

  const handlePlayAyah = async (ayahNum) => {
    const rec = recordings[ayahNum];
    if (!rec?.audioUri) return;

    try {
      if (playingAyah === ayahNum && playbackSoundRef.current) {
        // Pause
        await playbackSoundRef.current.pauseAsync();
        setPlayingAyah(null);
        return;
      }

      if (playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
      }

      setPlayingAyah(ayahNum);

      const { sound } = await Audio.Sound.createAsync(
        { uri: rec.audioUri },
        { shouldPlay: true },
        async (status) => {
          if (status.didJustFinish) {
            setPlayingAyah(null);
            
            // Loop logic
            if (loopingAyah === ayahNum) {
              handlePlayAyah(ayahNum);
            }
            // Sequential play logic
            else if (isSequentialPlay) {
              const currentIndex = selectedAyahs.indexOf(ayahNum);
              const nextIndex = currentIndex + 1;
              if (nextIndex < selectedAyahs.length) {
                const nextAyah = selectedAyahs[nextIndex];
                if (recordings[nextAyah]?.audioUri) {
                  // Small delay before playing next
                  setTimeout(() => {
                    handlePlayAyah(nextAyah);
                  }, 600);
                }
              }
            }
          }
        }
      );
      playbackSoundRef.current = sound;
    } catch (err) {
      console.error('Playback error:', err);
      setPlayingAyah(null);
      Alert.alert('Playback Error', 'Could not play audio. Try again.');
    }
  };

  const handlePausePlayback = async () => {
    if (playbackSoundRef.current) {
      await playbackSoundRef.current.pauseAsync();
      setPlayingAyah(null);
      setAdvancedIsPlaying(false);
    }
  };

  const handleReplayAyah = async (ayahNum) => {
    if (playbackSoundRef.current && playingAyah === ayahNum) {
      await playbackSoundRef.current.setPositionAsync(0);
      await playbackSoundRef.current.playAsync();
    } else {
      handlePlayAyah(ayahNum);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // ADVANCED MODE PLAYBACK
  // ═══════════════════════════════════════════════════════════════

  const handlePlayAdvanced = async () => {
    if (!advancedRecording?.audioUri) return;
    try {
      if (advancedIsPlaying && playbackSoundRef.current) {
        await playbackSoundRef.current.pauseAsync();
        setAdvancedIsPlaying(false);
        return;
      }

      if (playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
      }

      setAdvancedIsPlaying(true);

      const { sound } = await Audio.Sound.createAsync(
        { uri: advancedRecording.audioUri },
        { shouldPlay: true },
        async (status) => {
          if (status.didJustFinish) {
            setAdvancedIsPlaying(false);
          }
        }
      );
      playbackSoundRef.current = sound;
    } catch (err) {
      console.error('Advanced playback error:', err);
      setAdvancedIsPlaying(false);
      Alert.alert('Playback Error', 'Could not play audio. Try again.');
    }
  };

  const handleReplayAdvanced = async () => {
    if (playbackSoundRef.current) {
      await playbackSoundRef.current.setPositionAsync(0);
      await playbackSoundRef.current.playAsync();
      setAdvancedIsPlaying(true);
    } else {
      handlePlayAdvanced();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // BEGINNER NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  const goToPreviousAyah = () => {
    if (currentAyahIndex > 0) {
      setCurrentAyahIndex(currentAyahIndex - 1);
    }
  };

  const goToNextAyah = () => {
    if (currentAyahIndex < selectedAyahs.length - 1) {
      setCurrentAyahIndex(currentAyahIndex + 1);
    }
  };

  const toggleLoop = (ayahNum) => {
    if (loopingAyah === ayahNum) {
      setLoopingAyah(null);
    } else {
      setLoopingAyah(ayahNum);
      setIsSequentialPlay(false);
    }
  };

  const toggleSequentialPlay = () => {
    if (isSequentialPlay) {
      setIsSequentialPlay(false);
    } else {
      setIsSequentialPlay(true);
      setLoopingAyah(null);
      // Start sequential play from the first recorded ayah
      const firstRecorded = selectedAyahs.find(a => recordings[a]?.audioUri);
      if (firstRecorded) {
        handlePlayAyah(firstRecorded);
      } else {
        Alert.alert('No recordings', 'Please record at least one Ayat/Pause first.');
        setIsSequentialPlay(false);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT
  // ═══════════════════════════════════════════════════════════════

  const handleSubmit = async () => {
    if (recordingMode === 'advanced') {
      // Advanced: check single recording
      if (!advancedRecording?.audioUri) {
        Alert.alert('No Recording', 'Please record your recitation before submitting.');
        return;
      }
      if (isExercise && !advancedRecording.isSubmittedToAi) {
        Alert.alert('Analysis Required', 'Please submit your recording to the AI for analysis first.');
        return;
      }
    } else {
      // Beginner: check per-ayah recordings
      const recordedCount = Object.keys(recordings).length;
      if (recordedCount === 0) {
        Alert.alert('No Recordings', 'Please record at least one Ayat/Pause before submitting.');
        return;
      }
      if (isExercise) {
        const unanalyzed = Object.keys(recordings).filter(ayahNum => !recordings[ayahNum].isSubmittedToAi);
        if (unanalyzed.length > 0) {
          Alert.alert('Analysis Required', 'Please submit your recordings to the AI for analysis first.');
          return;
        }
      }
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();

      if (!session?.id) {
        Alert.alert('Not Logged In', 'Please log in first to submit.');
        setSubmitting(false);
        return;
      }

      const sessionId = generateUUID();
      const studentName = session.full_name || session.email?.split('@')[0] || 'Student';

      if (recordingMode === 'advanced') {
        // Advanced mode: save ONE record with ayah range
        const rec = advancedRecording;
        const payload = {
          studentName,
          surah:               String(currentSurah.name || ''),
          surahNumber:         initialSurahIndex + 1,
          ayah:                `${initialAyahStart}-${targetEndAyahNumber}`,
          score:               Number(rec.score) || 0,
          memorization_score:  Number(rec.analysis?.memorization) || 0,
          pronunciation_score: Number(rec.analysis?.pronunciation) || 0,
          tajwid:              Number(rec.analysis?.tajwid) || 0,
          fluency_score:       Number(rec.analysis?.fluency) || 0,
          makhraj:             Number(rec.analysis?.tajwid) || 0,
          feedback:            String(rec.analysis?.feedbackText || ''),
          transcription:       String(rec.analysis?.transcription || ''),
          audioUri:            rec.audioUri,
          word_alignments:     rec.analysis?.wordAlignments || [],
          is_exercise:         isExercise,
          status:              isExercise ? 'approved' : 'pending',
          session_id:          sessionId,
          attempt_number:      isExercise ? attemptNumber : null,
          duration:            rec.duration || 0,
          recording_mode:      'advanced',
        };

        await saveRecitationResult(session.id, payload);
      } else {
        // Beginner mode: save each ayah separately
        for (const ayahNum of selectedAyahs) {
          const rec = recordings[ayahNum];
          if (!rec?.audioUri) continue;

          const payload = {
            studentName,
            surah:               String(currentSurah.name || ''),
            surahNumber:         initialSurahIndex + 1,
            ayah:                String(ayahNum),
            score:               Number(rec.score) || 0,
            memorization_score:  Number(rec.analysis?.memorization) || 0,
            pronunciation_score: Number(rec.analysis?.pronunciation) || 0,
            tajwid:              Number(rec.analysis?.tajwid) || 0,
            fluency_score:       Number(rec.analysis?.fluency) || 0,
            makhraj:             Number(rec.analysis?.tajwid) || 0,
            feedback:            String(rec.analysis?.feedbackText || ''),
            transcription:       String(rec.analysis?.transcription || ''),
            audioUri:            rec.audioUri,
            word_alignments:     rec.analysis?.wordAlignments || [],
            is_exercise:         isExercise,
            status:              isExercise ? 'approved' : 'pending',
            session_id:          sessionId,
            attempt_number:      isExercise ? attemptNumber : null,
            duration:            rec.duration || 0,
            recording_mode:      'beginner',
          };

          await saveRecitationResult(session.id, payload);
        }
      }

      setSubmitSuccess(true);
    } catch (e) {
      console.error('Submission error:', e);
      setSubmitError(e?.message || 'Failed to submit. Please check your internet connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtTime = (secs) => {
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // AI Practice Pass/Fail badge component
  const AiPracticeBadge = ({ score }) => {
    if (score === undefined || score === null) return null;
    const passed = score >= 70;
    return (
      <View style={{
        backgroundColor: passed ? '#D1FAE5' : '#FFFBEB',
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderWidth: 1, borderColor: passed ? '#A7F3D0' : '#FDE68A',
      }}>
        <Ionicons name={passed ? "checkmark-circle" : "alert-circle"} size={14} color={passed ? '#065F46' : '#92400E'} />
        <Text style={{ fontSize: 12, fontWeight: '800', color: passed ? '#065F46' : '#92400E' }}>
          {score}% — {passed ? 'PASS' : 'NEEDS MORE PRACTICE'}
        </Text>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // SUCCESS SCREEN
  // ═══════════════════════════════════════════════════════════════

  if (submitSuccess) {
    return (
      <IslamicBackground variant="minimal">
        <SafeAreaView style={{ flex: 1, backgroundColor: P.bg }}>
          <StatusBar barStyle="dark-content" />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <View style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
            }}>
              <Ionicons name="checkmark-circle" size={64} color={P.primary} />
            </View>

            <Text style={{ fontSize: 26, fontWeight: '900', color: P.primary, marginBottom: 8, textAlign: 'center' }}>
              Submission Successful!
            </Text>
            <Text style={{ fontSize: 15, color: P.muted, textAlign: 'center', lineHeight: 24, marginBottom: 36 }}>
              Your recordings for <Text style={{ fontWeight: '800', color: P.text }}>{currentSurah.name}</Text> have been saved.
              {isExercise 
                ? '\nSince this was an AI Exercise, it is completed!' 
                : '\nOfficial assessment submitted for teacher review.'
              }
            </Text>

            <TouchableOpacity
              onPress={() => navigation.navigate('History')}
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
              onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
              style={{
                width: '100%', padding: 18, borderRadius: 16,
                backgroundColor: 'white', alignItems: 'center',
                borderWidth: 1.5, borderColor: P.primary,
              }}
            >
              <Text style={{ color: P.primary, fontSize: 16, fontWeight: '800' }}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </IslamicBackground>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Top Header bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
          borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
        }}>
          <TouchableOpacity
            onPress={() => {
              if (isRecording) {
                Alert.alert('Recording Active', 'Please stop recording before leaving.');
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
            <Text style={{ fontSize: 11, color: P.gold, fontWeight: '800', letterSpacing: 1.2 }}>
              {isExercise ? `AI PRACTICE EXERCISE (ATTEMPT #${attemptNumber})` : 'OFFICIAL ASSESSMENT'}
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '900', color: P.primary }}>
              {currentSurah.name} · {selectedAyahs.length} Ayat
              {initMode === 'continuous' ? ' · Continuous' : ''}
            </Text>
          </View>

          {/* Recording mode badge */}
          <View style={{
            backgroundColor: recordingMode === 'advanced' ? '#EDE9FE' : P.lightGreen,
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: recordingMode === 'advanced' ? '#6D28D9' : P.primary }}>
              {recordingMode === 'advanced' ? 'ADVANCED' : 'BEGINNER'}
            </Text>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════
            ADVANCED MODE UI
            ═══════════════════════════════════════════════════════ */}
        {recordingMode === 'advanced' ? (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Surah / Ayah info card */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 20, marginBottom: 16,
              borderWidth: 1, borderColor: '#E5E7EB',
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: P.primary, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                {initMode === 'continuous' ? 'Continuous Recitation' : `${initMode === 'single' ? 'Single Ayah' : initMode + ' Ayat/Group'} Recording`}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: P.text, marginBottom: 4 }}>
                {currentSurah.name}
              </Text>
              <Text style={{ fontSize: 13, color: P.muted }}>
                Ayah {initialAyahStart} → Ayah {targetEndAyahNumber}
                {' '}·{' '}{selectedAyahs.length} Ayat total
              </Text>
              {initMode === 'continuous' && (
                <View style={{
                  marginTop: 10, backgroundColor: P.primary + '10', borderRadius: 8,
                  padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
                }}>
                  <Ionicons name="information-circle" size={14} color={P.primary} />
                  <Text style={{ fontSize: 11, color: P.primary, fontWeight: '600', flex: 1 }}>
                    Record Ayah {initialAyahStart}–{targetEndAyahNumber} continuously without pausing. The AI will verify which ayat were recited.
                  </Text>
                </View>
              )}
            </View>

            {/* Hidden text indicator */}
            {(!advancedRecording?.audioUri || (isExercise && !advancedRecording?.isSubmittedToAi)) ? (
              <View style={{
                backgroundColor: '#FAFAF9', padding: 16, borderRadius: 14, alignItems: 'center',
                borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', marginBottom: 16,
              }}>
                <Ionicons name="eye-off" size={24} color={P.muted} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 13, color: P.muted, fontWeight: '600', textAlign: 'center' }}>
                  Quran text hidden. Recite all {selectedAyahs.length} Ayat/Pause from memory continuously.
                </Text>
              </View>
            ) : advancedRecording?.isSubmittedToAi ? (
              <View style={{ backgroundColor: '#FAFAF9', padding: 14, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' }}>
                {selectedAyahs.map(ayahNum => (
                  <Text key={ayahNum} style={{
                    fontSize: 19, color: P.text, textAlign: 'right', fontFamily: 'serif',
                    lineHeight: 34, marginVertical: 4, paddingHorizontal: 6,
                  }}>
                    {currentSurah.verse[`verse_${ayahNum}`]}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Recording controls */}
            <View style={{
              backgroundColor: P.card, borderRadius: 20, padding: 24, marginBottom: 16,
              borderWidth: 1, borderColor: isRecording ? P.red : '#E5E7EB',
              alignItems: 'center',
            }}>
              {/* Timer */}
              {isRecording && (
                <Animated.View style={{ transform: [{ scale: micPulse }], marginBottom: 16 }}>
                  <View style={{
                    width: 80, height: 80, borderRadius: 40,
                    backgroundColor: P.red + '15', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="mic" size={36} color={P.red} />
                  </View>
                </Animated.View>
              )}

              {isRecording && (
                <Text style={{ fontSize: 28, fontWeight: '900', color: P.red, marginBottom: 16, fontVariant: ['tabular-nums'] }}>
                  {fmtTime(recordingSeconds)}
                </Text>
              )}

              {!advancedRecording?.audioUri ? (
                // No recording yet — show Record/Stop
                <TouchableOpacity
                  onPress={() => isRecording ? stopRecording() : startRecording('advanced')}
                  style={{
                    paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16,
                    backgroundColor: isRecording ? P.red : P.primary,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}
                >
                  <Ionicons name={isRecording ? "stop" : "mic"} size={22} color="white" />
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                  </Text>
                </TouchableOpacity>
              ) : (
                // Recording exists — show playback controls
                <View style={{ width: '100%' }}>
                  {/* Duration info */}
                  <Text style={{ fontSize: 13, color: P.muted, textAlign: 'center', marginBottom: 14 }}>
                    Recording: {fmtTime(advancedRecording.duration)}
                  </Text>

                  {/* Playback buttons */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
                    <TouchableOpacity
                      onPress={handlePlayAdvanced}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: advancedIsPlaying ? '#FEF3C7' : P.lightGreen,
                        paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
                      }}
                    >
                      <Ionicons name={advancedIsPlaying ? "pause" : "play"} size={18} color={advancedIsPlaying ? P.amber : P.primary} />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: advancedIsPlaying ? P.amber : P.primary }}>
                        {advancedIsPlaying ? 'Pause' : 'Play'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleReplayAdvanced}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: '#F3F4F6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
                      }}
                    >
                      <Ionicons name="refresh" size={17} color={P.muted} />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: P.muted }}>Replay</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Re-record button */}
                  <TouchableOpacity
                    onPress={() => { setAdvancedRecording(null); }}
                    style={{
                      paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                      borderWidth: 1.5, borderColor: P.red, marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: P.red, fontWeight: '800', fontSize: 13 }}>Re-record Entire Recording</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Submit to AI (if recorded but not analyzed) */}
            {advancedRecording?.audioUri && isExercise && !advancedRecording.isSubmittedToAi && !advancedRecording.isAnalyzing && (
              <TouchableOpacity
                onPress={submitAdvancedToAi}
                style={{
                  backgroundColor: P.primary, borderRadius: 14,
                  paddingVertical: 14, alignItems: 'center', marginBottom: 16,
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
              >
                <Ionicons name="sparkles" size={18} color="white" />
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 14 }}>Submit to AI for Analysis</Text>
              </TouchableOpacity>
            )}

            {/* AI Analyzing indicator */}
            {advancedRecording?.isAnalyzing && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: P.lightGreen, borderRadius: 12, marginBottom: 16 }}>
                <ActivityIndicator size="small" color={P.primary} />
                <Text style={{ fontSize: 13, color: P.primary, fontWeight: '700' }}>Evaluating recitation details...</Text>
              </View>
            )}

            {/* AI Practice Result */}
            {advancedRecording?.isSubmittedToAi && advancedRecording.analysis && (
              <View style={{
                backgroundColor: '#F7FAF7', borderRadius: 16, padding: 18, marginBottom: 16,
                borderWidth: 1, borderColor: P.primary + '15',
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: P.primary, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    AI Practice Result
                  </Text>
                  <AiPracticeBadge score={advancedRecording.score} />
                </View>

                {/* ── Ayah Detection Result (continuous mode only) ── */}
                {initMode === 'continuous' && (
                  <View style={{
                    marginBottom: 14, padding: 12, borderRadius: 12,
                    backgroundColor: advancedRecording.analysis.completionStatus === 'complete'
                      ? '#D1FAE5'
                      : advancedRecording.analysis.completionStatus === 'incomplete'
                        ? '#FEF3C7'
                        : '#F3F4F6',
                    borderWidth: 1,
                    borderColor: advancedRecording.analysis.completionStatus === 'complete'
                      ? '#A7F3D0'
                      : advancedRecording.analysis.completionStatus === 'incomplete'
                        ? '#FDE68A'
                        : '#E5E7EB',
                  }}>
                    <Text style={{
                      fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
                      color: advancedRecording.analysis.completionStatus === 'complete' ? '#065F46'
                        : advancedRecording.analysis.completionStatus === 'incomplete' ? '#92400E' : '#374151',
                      marginBottom: 6, textTransform: 'uppercase',
                    }}>
                      {advancedRecording.analysis.completionStatus === 'complete'
                        ? '✅ Range Completed'
                        : advancedRecording.analysis.completionStatus === 'incomplete'
                          ? '⚠️ Incomplete Recitation'
                          : '🔍 Ayah Detection'
                      }
                    </Text>
                    <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600', marginBottom: 2 }}>
                      Expected: Ayah {initialAyahStart}–{targetEndAyahNumber}
                    </Text>
                    {advancedRecording.analysis.detectedAyahs && advancedRecording.analysis.detectedAyahs.length > 0 ? (
                      <>
                        <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600', marginBottom: 2 }}>
                          Detected: Ayah {Math.min(...advancedRecording.analysis.detectedAyahs)}–{Math.max(...advancedRecording.analysis.detectedAyahs)}
                        </Text>
                        {advancedRecording.analysis.missingAyahs && advancedRecording.analysis.missingAyahs.length > 0 && (
                          <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600' }}>
                            Not detected: Ayah {advancedRecording.analysis.missingAyahs.join(', ')}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={{ fontSize: 12, color: P.muted, fontWeight: '500' }}>
                        {advancedRecording.analysis.completionStatus === 'complete'
                          ? `All ${selectedAyahs.length} ayat detected in recitation.`
                          : 'Could not verify individual ayat — check transcription quality.'}
                      </Text>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <View style={{ backgroundColor: 'white', padding: 10, borderRadius: 10, flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 10, color: P.muted }}>Memorization</Text>
                    <Text style={{ fontSize: 14, fontWeight: '850', color: P.text }}>{advancedRecording.analysis.memorization}%</Text>
                  </View>
                  <View style={{ backgroundColor: 'white', padding: 10, borderRadius: 10, flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 10, color: P.muted }}>Pronunciation</Text>
                    <Text style={{ fontSize: 14, fontWeight: '850', color: P.text }}>{advancedRecording.analysis.pronunciation}%</Text>
                  </View>
                  <View style={{ backgroundColor: 'white', padding: 10, borderRadius: 10, flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 10, color: P.muted }}>Tajweed</Text>
                    <Text style={{ fontSize: 14, fontWeight: '850', color: P.text }}>{advancedRecording.analysis.tajwid}%</Text>
                  </View>
                  <View style={{ backgroundColor: 'white', padding: 10, borderRadius: 10, flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 10, color: P.muted }}>Fluency</Text>
                    <Text style={{ fontSize: 14, fontWeight: '850', color: P.text }}>{advancedRecording.analysis.fluency}%</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: P.muted, fontStyle: 'italic' }}>
                  Suggestions: <Text style={{ color: P.text, fontWeight: '500' }}>{advancedRecording.analysis.feedbackText}</Text>
                </Text>
              </View>
            )}

            {/* Submit / Save button */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !advancedRecording?.audioUri}
              style={{
                backgroundColor: advancedRecording?.audioUri ? P.primary : '#D1D5DB',
                borderRadius: 16, paddingVertical: 18, alignItems: 'center',
                marginTop: 10, shadowColor: P.primary, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>
                  {isExercise
                    ? `Save Practice Attempt #${attemptNumber}`
                    : `Submit Recording to Teacher`
                  }
                </Text>
              )}
            </TouchableOpacity>

            {submitError ? (
              <View style={{
                backgroundColor: '#FEE2E2', borderRadius: 14, padding: 16,
                marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <Ionicons name="alert-circle" size={20} color={P.red} />
                <Text style={{ color: P.red, fontSize: 13, fontWeight: '600', flex: 1 }}>{submitError}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          /* ═══════════════════════════════════════════════════════
             BEGINNER MODE UI
             ═══════════════════════════════════════════════════════ */
          <>
            {/* Replay All + Controls strip */}
            {Object.keys(recordings).length > 0 && (
              <View style={{
                backgroundColor: P.goldBg, paddingVertical: 12, paddingHorizontal: 20,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                borderBottomWidth: 1, borderBottomColor: '#FDF0CD',
              }}>
                <TouchableOpacity onPress={toggleSequentialPlay} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={isSequentialPlay ? "stop-circle" : "play-circle"} size={22} color={P.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: P.primary }}>
                    {isSequentialPlay ? 'Playing Sequential' : 'Replay All'}
                  </Text>
                </TouchableOpacity>

                {playingAyah !== null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <TouchableOpacity onPress={() => {
                      if (playingAyah !== null) {
                        const ci = selectedAyahs.indexOf(playingAyah);
                        if (ci > 0 && recordings[selectedAyahs[ci - 1]]?.audioUri) {
                          handlePlayAyah(selectedAyahs[ci - 1]);
                        }
                      }
                    }}>
                      <Ionicons name="play-skip-back" size={20} color={P.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      if (playingAyah !== null) {
                        const ci = selectedAyahs.indexOf(playingAyah);
                        if (ci < selectedAyahs.length - 1 && recordings[selectedAyahs[ci + 1]]?.audioUri) {
                          handlePlayAyah(selectedAyahs[ci + 1]);
                        }
                      }
                    }}>
                      <Ionicons name="play-skip-forward" size={20} color={P.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
            >
              {/* List of Ayat/Pause cards */}
              {selectedAyahs.map((ayahNum) => {
                const rec = recordings[ayahNum];
                const isThisRecording = currentRecordingAyah === ayahNum && isRecording;
                const isThisPlaying = playingAyah === ayahNum;
                const isThisLooping = loopingAyah === ayahNum;

                return (
                  <View key={ayahNum} style={{
                    backgroundColor: P.card, borderRadius: 20, padding: 18, marginBottom: 14,
                    borderWidth: 1, borderColor: isThisRecording ? P.red : '#E5E7EB',
                    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{
                          backgroundColor: P.primary + '12',
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
                        }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: P.primary }}>Ayat/Pause {ayahNum}</Text>
                        </View>

                        {rec?.score !== undefined && isExercise && rec.isSubmittedToAi && (
                          <AiPracticeBadge score={rec.score} />
                        )}
                      </View>

                      {/* Recording control or Clear state button */}
                      {!rec?.audioUri ? (
                        <TouchableOpacity
                          onPress={() => isThisRecording ? stopRecording() : startRecording(ayahNum)}
                          disabled={isRecording && !isThisRecording}
                          style={{
                            paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
                            backgroundColor: isThisRecording ? P.red : P.primary,
                            opacity: (isRecording && !isThisRecording) ? 0.5 : 1,
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                          }}
                        >
                          <Ionicons name={isThisRecording ? "stop" : "mic"} size={16} color="white" />
                          <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>
                            {isThisRecording ? fmtTime(recordingSeconds) : 'Record'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => deleteRecording(ayahNum)}
                          disabled={isRecording}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                            borderWidth: 1.5, borderColor: P.red,
                            opacity: isRecording ? 0.5 : 1,
                          }}
                        >
                          <Text style={{ color: P.red, fontWeight: '800', fontSize: 11 }}>Record Again</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Arabic Quran Verse Text or Memorization Placeholder */}
                    {(!rec?.audioUri || (isExercise && !rec.isSubmittedToAi)) ? (
                      <View style={{
                        backgroundColor: '#FAFAF9', padding: 12, borderRadius: 12, alignItems: 'center',
                        borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed',
                      }}>
                        <Ionicons name="eye-off" size={20} color={P.muted} style={{ marginBottom: 4 }} />
                        <Text style={{ fontSize: 12, color: P.muted, fontWeight: '600' }}>
                          Quran text hidden. Recite from memory.
                        </Text>
                      </View>
                    ) : (
                      <Text style={{
                        fontSize: 21, color: P.text, textAlign: 'right', fontFamily: 'serif',
                        lineHeight: 36, marginVertical: 8, paddingHorizontal: 6,
                      }}>
                        {currentSurah.verse[`verse_${ayahNum}`]}
                      </Text>
                    )}

                    {/* Submit to AI Action Button (If recorded but not analyzed yet in Practice Mode) */}
                    {rec?.audioUri && isExercise && !rec.isSubmittedToAi && !rec?.isAnalyzing && (
                      <TouchableOpacity
                        onPress={() => submitToAi(ayahNum)}
                        style={{
                          backgroundColor: P.primary, borderRadius: 12,
                          paddingVertical: 10, alignItems: 'center', marginTop: 12,
                          flexDirection: 'row', justifyContent: 'center', gap: 6
                        }}
                      >
                        <Ionicons name="sparkles" size={16} color="white" />
                        <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>Use This Recording (Submit to AI)</Text>
                      </TouchableOpacity>
                    )}

                    {/* Ayah Analysis loading indicator */}
                    {rec?.isAnalyzing && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, backgroundColor: P.lightGreen, borderRadius: 10 }}>
                        <ActivityIndicator size="small" color={P.primary} />
                        <Text style={{ fontSize: 12, color: P.primary, fontWeight: '700' }}>Evaluating recitation details...</Text>
                      </View>
                    )}

                    {/* AI Performance Evaluation Breakdown Metrics */}
                    {rec?.audioUri && isExercise && rec.isSubmittedToAi && rec.analysis && (
                      <View style={{
                        backgroundColor: '#F7FAF7', borderRadius: 12, padding: 12, marginTop: 12,
                        borderWidth: 1, borderColor: P.primary + '15'
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: P.primary, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
                          AI Evaluation breakdown
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          <View style={{ backgroundColor: 'white', padding: 8, borderRadius: 8, flex: 1, minWidth: '45%' }}>
                            <Text style={{ fontSize: 10, color: P.muted }}>Memorization</Text>
                            <Text style={{ fontSize: 13, fontWeight: '850', color: P.text }}>{rec.analysis.memorization}%</Text>
                          </View>
                          <View style={{ backgroundColor: 'white', padding: 8, borderRadius: 8, flex: 1, minWidth: '45%' }}>
                            <Text style={{ fontSize: 10, color: P.muted }}>Pronunciation</Text>
                            <Text style={{ fontSize: 13, fontWeight: '850', color: P.text }}>{rec.analysis.pronunciation}%</Text>
                          </View>
                          <View style={{ backgroundColor: 'white', padding: 8, borderRadius: 8, flex: 1, minWidth: '45%' }}>
                            <Text style={{ fontSize: 10, color: P.muted }}>Tajweed</Text>
                            <Text style={{ fontSize: 13, fontWeight: '850', color: P.text }}>{rec.analysis.tajwid}%</Text>
                          </View>
                          <View style={{ backgroundColor: 'white', padding: 8, borderRadius: 8, flex: 1, minWidth: '45%' }}>
                            <Text style={{ fontSize: 10, color: P.muted }}>Fluency</Text>
                            <Text style={{ fontSize: 13, fontWeight: '850', color: P.text }}>{rec.analysis.fluency}%</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: P.muted, fontStyle: 'italic' }}>
                          Suggestions: <Text style={{ color: P.text, fontWeight: '500' }}>{rec.analysis.feedbackText}</Text>
                        </Text>
                      </View>
                    )}

                    {/* Individual Ayat/Pause Playback controls */}
                    {rec?.audioUri && !rec?.isAnalyzing && (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6',
                      }}>
                        <TouchableOpacity
                          onPress={() => isThisPlaying ? handlePausePlayback() : handlePlayAyah(ayahNum)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            backgroundColor: isThisPlaying ? '#FEF3C7' : P.lightGreen,
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                          }}
                        >
                          <Ionicons name={isThisPlaying ? "pause" : "play"} size={16} color={isThisPlaying ? P.amber : P.primary} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: isThisPlaying ? P.amber : P.primary }}>
                            {isThisPlaying ? 'Pause' : 'Play Ayat/Pause'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleReplayAyah(ayahNum)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                          }}
                        >
                          <Ionicons name="refresh" size={15} color={P.muted} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: P.muted }}>Replay</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => toggleLoop(ayahNum)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            backgroundColor: isThisLooping ? '#E0E7FF' : '#F3F4F6',
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                          }}
                        >
                          <Ionicons name="repeat" size={15} color={isThisLooping ? '#4F46E5' : P.muted} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: isThisLooping ? '#4F46E5' : P.muted }}>
                            {isThisLooping ? 'Looping' : 'Loop'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              {submitError ? (
                <View style={{
                  backgroundColor: '#FEE2E2', borderRadius: 14, padding: 16,
                  marginVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <Ionicons name="alert-circle" size={20} color={P.red} />
                  <Text style={{ color: P.red, fontSize: 13, fontWeight: '600', flex: 1 }}>{submitError}</Text>
                </View>
              ) : null}

              {/* Practice History quick link */}
              {isExercise && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('History')}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    backgroundColor: P.goldBg, borderRadius: 12, paddingVertical: 12, marginTop: 8,
                    borderWidth: 1, borderColor: P.gold + '40',
                  }}
                >
                  <Ionicons name="time-outline" size={16} color={P.gold} />
                  <Text style={{ color: P.amber, fontSize: 13, fontWeight: '700' }}>View Practice History</Text>
                </TouchableOpacity>
              )}

              {/* Submit / Save button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting || Object.keys(recordings).length === 0}
                style={{
                  backgroundColor: Object.keys(recordings).length > 0 ? P.primary : '#D1D5DB',
                  borderRadius: 16, paddingVertical: 18, alignItems: 'center',
                  marginTop: 10, shadowColor: P.primary, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>
                    {isExercise
                      ? `Save Practice Attempt #${attemptNumber}`
                      : `Submit ${Object.keys(recordings).length} Recording${Object.keys(recordings).length > 1 ? 's' : ''} to Teacher`
                    }
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </IslamicBackground>
  );
}
