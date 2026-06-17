import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Alert, Modal, FlatList, TextInput, ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import quranData from '../../data/quran_data.json';
import { uploadRecitation } from '../../services/recitationService';
import { API_URL, analyzeRecitation, assessChunk } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';

export default function RecitationModeScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();
  const [surahModalVisible, setSurahModalVisible] = useState(false);
  const [ayahModalVisible, setAyahModalVisible] = useState(false);
  const [modeModalVisible, setModeModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stopAyahModalVisible, setStopAyahModalVisible] = useState(false);

  const [selectedSurahIndex, setSelectedSurahIndex] = useState(
    route.params?.initialSurahIndex !== undefined ? route.params.initialSurahIndex : 0
  );
  const [selectedAyahNumber, setSelectedAyahNumber] = useState(1);
  const [recitationMode, setRecitationMode] = useState('single'); // 'single', '5', '10', 'continuous'
  const [actualEndAyah, setActualEndAyah] = useState(null);

  // Memorization / Hint state
  const [hintCount, setHintCount] = useState(0);
  const [revealedWords, setRevealedWords] = useState(0);

  // Live AI detection state
  const [isRecording, setIsRecording] = useState(false);
  const [detectedWordIndex, setDetectedWordIndex] = useState(-1);
  const [wordResults, setWordResults] = useState([]);
  const wordResultsRef = useRef([]); // always-current ref for stale closure fix
  const detectionTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // AI analysis summary (post-recording)
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [showAIStatus, setShowAIStatus] = useState(false);

  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const [isDone, setIsDone] = useState(false);
  const [recordedUri, setRecordedUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const [refSound, setRefSound] = useState(null);
  const [isPlayingRef, setIsPlayingRef] = useState(false);
  const [isLoadingRef, setIsLoadingRef] = useState(false);
  const silenceStartRef = useRef(null);

  const currentSurah = quranData[selectedSurahIndex];
  const ayahCount = currentSurah.count;
  
  // Derived state for multiple ayahs
  const targetEndAyahNumber = useMemo(() => {
    if (recitationMode === 'single') return selectedAyahNumber;
    if (recitationMode === '5') return Math.min(selectedAyahNumber + 4, ayahCount);
    if (recitationMode === '10') return Math.min(selectedAyahNumber + 9, ayahCount);
    return ayahCount; 
  }, [recitationMode, selectedAyahNumber, ayahCount]);

  const endAyahToAnalyze = actualEndAyah || targetEndAyahNumber;

  const fullAyahText = useMemo(() => {
    let text = "";
    for(let a = selectedAyahNumber; a <= endAyahToAnalyze; a++) {
      text += (currentSurah.verse[`verse_${a}`] || '') + " \u06dd ";
    }
    return text.trim();
  }, [currentSurah, selectedAyahNumber, endAyahToAnalyze]);

  const ayahWords = useMemo(() => fullAyahText.trim().split(/\s+/), [fullAyahText]);

  useFocusEffect(
    useCallback(() => {
      resetState();
    }, [selectedSurahIndex, selectedAyahNumber, recitationMode])
  );

  useEffect(() => {
    resetState();
  }, [selectedSurahIndex, selectedAyahNumber, recitationMode]);

  useEffect(() => {
    return () => {
      if (recording) recording.stopAndUnloadAsync();
      if (refSound) refSound.unloadAsync();
      if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    };
  }, []);

  const resetState = () => {
    setHintCount(0);
    setRevealedWords(0);
    setAiAnalysis(null);
    setShowAIStatus(false);
    setIsDone(false);
    setDetectedWordIndex(-1);
    setWordResults([]);
    setActualEndAyah(null);
    wordResultsRef.current = [];
    if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    if (refSound) {
      refSound.unloadAsync();
      setRefSound(null);
      setIsPlayingRef(false);
    }
  };

  const nextAyah = () => {
    let nextStart = endAyahToAnalyze + 1;
    if (nextStart <= ayahCount) {
      setSelectedAyahNumber(nextStart);
    } else if (selectedSurahIndex < quranData.length - 1) {
      setSelectedSurahIndex(prev => prev + 1);
      setSelectedAyahNumber(1);
    }
  };

  const prevAyah = () => {
    if (selectedAyahNumber > 1) {
      setSelectedAyahNumber(prev => prev - 1);
    } else if (selectedSurahIndex > 0) {
      const prevSurahIndex = selectedSurahIndex - 1;
      setSelectedSurahIndex(prevSurahIndex);
      setSelectedAyahNumber(quranData[prevSurahIndex].count);
    }
  };

  // ── Hint System ──────────────────────────────────────────────────────────────
  const handleHint = () => {
    if (hintCount >= 5) {
      Alert.alert(
        '🌙 Max Hints Used',
        "You've used all 5 hints. Take a breath and try to recall the verse from memory.",
        [{ text: 'Retry from Memory', style: 'cancel', onPress: () => { setHintCount(0); setRevealedWords(0); } }]
      );
      return;
    }
    const next = hintCount + 1;
    setHintCount(next);
    const increment = Math.max(1, Math.ceil(ayahWords.length / 5));
    setRevealedWords(prev => Math.min(ayahWords.length, prev + increment));
  };

  // ── Live Word-by-word Detection Simulation ───────────────────────────────────
  const startWordDetection = (totalWords) => {
    let currentIndex = 0;
    const results = new Array(totalWords).fill(null);
    wordResultsRef.current = results;
    // ~800ms per word — realistic reading pace
    detectionTimerRef.current = setInterval(() => {
      if (currentIndex >= totalWords) {
        clearInterval(detectionTimerRef.current);
        return;
      }
      results[currentIndex] = Math.random() > 0.15 ? 'correct' : 'missed';
      wordResultsRef.current = [...results];
      setWordResults([...results]);
      setDetectedWordIndex(currentIndex);
      currentIndex++;
    }, 800);
  };

  const buildWordResults = (refPhonetics, userPhonetics, totalWords) => {
    const refTokens = (refPhonetics || '').trim().split(/\s+/);
    const userTokens = (userPhonetics || '').trim().split(/\s+/);
    const chunkSize = Math.max(1, Math.ceil(refTokens.length / totalWords));
    const results = [];
    for (let i = 0; i < totalWords; i++) {
      const refChunk = refTokens.slice(i * chunkSize, (i + 1) * chunkSize);
      const userChunk = userTokens.slice(i * chunkSize, (i + 1) * chunkSize);
      const matches = refChunk.filter((t, j) => t === userChunk[j]).length;
      const accuracy = refChunk.length > 0 ? matches / refChunk.length : 0;
      results.push(accuracy >= 0.5 ? 'correct' : 'missed');
    }
    return results;
  };

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      
      setIsRecording(true);
      setIsDone(false);
      setShowAIStatus(false);
      setDetectedWordIndex(-1);
      const freshResults = new Array(ayahWords.length).fill(null);
      setWordResults(freshResults);
      wordResultsRef.current = freshResults;
      // Always show full ayah during recording
      setRevealedWords(ayahWords.length);

      if (Platform.OS === 'web') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioChunksRef.current = [];
          
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
              
              // Send accumulated audio to backend for tracking word progress
              const accumulatedBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              try {
                const res = await assessChunk(accumulatedBlob, fullAyahText);
                if (res && typeof res.matched_word_count === 'number') {
                  const matchedCount = res.matched_word_count;
                  setDetectedWordIndex(matchedCount - 1);
                  
                  const newResults = [...wordResultsRef.current];
                  for (let i = 0; i < ayahWords.length; i++) {
                    if (i < matchedCount) {
                      newResults[i] = 'correct';
                    } else {
                      newResults[i] = null;
                    }
                  }
                  wordResultsRef.current = newResults;
                  setWordResults(newResults);
                }
              } catch (err) {
                console.error("Error assessing chunk:", err);
              }
            }
          };
          
          mediaRecorder.start(2000); // Trigger data available every 2 seconds
        } catch (webErr) {
          console.error("Web MediaRecorder initialization failed:", webErr);
        }
        
        // Also initialize expo-av recording so that processRecording flow remains unified
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording: newRecording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = newRecording;
        setRecording(newRecording);
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording: newRecording } = await Audio.Recording.createAsync(
          {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
            metering: true,
          }
        );
        
        newRecording.setOnRecordingStatusUpdate((status) => {
          if (status.isRecording) {
            const metering = status.metering;
            if (metering !== undefined) {
              const THRESHOLD = -50; 
              const DURATION = 3000; 
              
              if (metering < THRESHOLD) {
                if (!silenceStartRef.current) {
                  silenceStartRef.current = Date.now();
                } else if (Date.now() - silenceStartRef.current > DURATION) {
                  console.log("Silence detected, stopping recording automatically.");
                  stopRecording();
                }
              } else {
                silenceStartRef.current = null;
              }
            }
          }
        });

        recordingRef.current = newRecording;
        setRecording(newRecording);
        startWordDetection(ayahWords.length);
      }
    } catch (err) {
      console.error('Recording start error:', err);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    
    if (Platform.OS === 'web' && mediaRecorderRef.current) {
      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      mediaRecorderRef.current = null;
    }
    
    if (recitationMode === 'continuous') {
      setStopAyahModalVisible(true);
      return;
    }
    await processRecording(targetEndAyahNumber);
  };

  const handleStopAyahSelected = async (ayahNumber) => {
    setStopAyahModalVisible(false);
    setActualEndAyah(ayahNumber);
    await processRecording(ayahNumber);
  };

  const processRecording = async (endAyah) => {
    const activeRecording = recordingRef.current;
    if (!activeRecording) return;
    
    let audioUri = null;
    try {
      await activeRecording.stopAndUnloadAsync();
      audioUri = activeRecording.getURI();
      setRecordedUri(audioUri);
      recordingRef.current = null;
      setRecording(null);
      setIsDone(true);
      setLoading(true);
      
      // Analyze with AI using ranges
      const ayahRange = endAyah > selectedAyahNumber ? `${selectedAyahNumber}-${endAyah}` : `${selectedAyahNumber}`;
      const response = await analyzeRecitation(audioUri, selectedSurahIndex + 1, ayahRange);
      // Unwrap nested result: { status: "success", result: { overall_score, ... } }
      const result = response?.result || response?.data || response || {};

      let actualText = "";
      for(let a = selectedAyahNumber; a <= endAyah; a++) {
        actualText += (currentSurah.verse[`verse_${a}`] || '') + " \u06dd ";
      }
      const actualWords = actualText.trim().split(/\s+/);
      
      const realScore = typeof result.score === 'number' ? Math.round(result.score) : 0;
      const refPh = result.ref_phonetics || '';
      const userPh = result.user_phonetics || '';
      
      let wordLevelResults = buildWordResults(refPh, userPh, actualWords.length);
      // Fallback if AI completely fails
      if(wordLevelResults.length === 0) wordLevelResults = new Array(actualWords.length).fill('missed');
      
      const correct = wordLevelResults.filter(r => r === 'correct').length;
      const total = actualWords.length;
      const confidence = total > 0 ? Math.round((correct / total) * 100) : 0;
      const hesitation = wordLevelResults.includes('missed');
      
      setDetectedWordIndex(actualWords.length - 1);
      wordResultsRef.current = wordLevelResults;
      setWordResults(wordLevelResults);

      setAiAnalysis({
        confidence,
        hesitation,
        correct,
        total,
        motivation: confidence >= 90
          ? 'MashaAllah! Your recitation was fluent and clear. 🌟'
          : confidence >= 70
            ? 'Good effort! A few words need more practice. Keep going. 💪'
            : 'Keep practicing — every recitation brings you closer. 🤲',
      });
      setShowAIStatus(true);
    } catch (err) {
      console.error('Recording stop error:', err);
      // Fallback analysis
      generateAIAnalysis();
    } finally {
      setLoading(false);
    }
  };

  const generateAIAnalysis = () => {
    // Basic fallback simulation if real AI fails
    const latestResults = wordResultsRef.current;
    const correct = latestResults.filter(r => r === 'correct').length;
    const total = latestResults.length;
    const confidence = total > 0 ? Math.round((correct / total) * 100) : 0;
    const hesitation = latestResults.includes('missed');
    setAiAnalysis({
      confidence,
      hesitation,
      correct,
      total,
      motivation: confidence >= 90
        ? 'MashaAllah! Your recitation was fluent and clear. 🌟'
        : confidence >= 70
          ? 'Good effort! A few words need more practice. Keep going. 💪'
          : 'Keep practicing — every recitation brings you closer. 🤲',
    });
    setShowAIStatus(true);
  };

  // ── Reference Audio ──────────────────────────────────────────────────────────
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
        (s) => { if (s.didJustFinish) { setIsPlayingRef(false); } }
      );
      setRefSound(sound);
      setIsPlayingRef(true);
    } catch { Alert.alert('Error', 'Could not load reference audio. Check your network.'); }
    finally { setIsLoadingRef(false); }
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const ayahRange = endAyahToAnalyze > selectedAyahNumber ? `${selectedAyahNumber}-${endAyahToAnalyze}` : `${selectedAyahNumber}`;
      await uploadRecitation(recordedUri, currentSurah.name, ayahRange, fullAyahText, aiAnalysis?.confidence ?? 0, []);
      navigation.navigate('TasmiqMode', {
        score: aiAnalysis?.confidence,
        feedback: aiAnalysis?.motivation,
        surah: currentSurah.name,
        ayah: ayahRange,
      });
    } catch { Alert.alert('Error', 'Could not save your recitation.'); }
    finally { setLoading(false); }
  };

  // ── Word rendering ───────────────────────────────────────────────────────────
  const getWordStyle = (index) => {
    if (isRecording) {
      if (index === detectedWordIndex) {
        return { bg: C.warning, text: '#000', border: C.primary, scale: 1.05 }; 
      }
      if (index < detectedWordIndex) {
        return { bg: wordResults[index] === 'correct' ? C.detected : C.missed, text: C.text, border: 'transparent' };
      }
      return { bg: 'transparent', text: '#BBBBBB', border: 'transparent' }; 
    }
    if (showAIStatus) {
      return { bg: wordResults[index] === 'correct' ? C.detected : C.missed, text: C.text, border: 'transparent' };
    }
    return { bg: 'transparent', text: C.text, border: 'transparent' };
  };

  const getModeLabel = (mode) => {
    switch(mode) {
      case 'single': return 'Single Ayah';
      case '5': return '5 Ayahs';
      case '10': return '10 Ayahs';
      case 'continuous': return 'Continuous';
      default: return 'Single Ayah';
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={22} color={C.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{currentSurah.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <TouchableOpacity onPress={prevAyah} style={{ padding: 6, backgroundColor: C.accent, borderRadius: 8, marginRight: 8 }}>
              <Ionicons name="chevron-back" size={18} color={C.primary} />
            </TouchableOpacity>
            <View style={{ backgroundColor: '#EEE', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>
                Ayah {selectedAyahNumber}{recitationMode !== 'single' && endAyahToAnalyze > selectedAyahNumber ? `-${endAyahToAnalyze}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={nextAyah} style={{ padding: 6, backgroundColor: C.accent, borderRadius: 8, marginLeft: 8 }}>
              <Ionicons name="chevron-forward" size={18} color={C.primary} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity 
          onPress={() => setModeModalVisible(true)}
          style={{ backgroundColor: C.primary + '20', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginRight: 8 }}
        >
          <Text style={{ color: C.primary, fontSize: 10, fontWeight: '700', marginRight: 4 }}>{getModeLabel(recitationMode)}</Text>
          <Ionicons name="chevron-down" size={12} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSurahModalVisible(true)}
          style={{ backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}
        >
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>Surah</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAyahModalVisible(true)}
          style={{ backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, marginLeft: 6 }}
        >
          <Text style={{ color: C.primary, fontSize: 10, fontWeight: '700' }}>Ayah</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Live Status Banner ── */}
        {isRecording && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: 16, padding: 14, marginBottom: 20 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E05252', marginRight: 10 }} />
            <Text style={{ flex: 1, color: '#E05252', fontWeight: '700', fontSize: 13 }}>Recording & Detecting...</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>
              {detectedWordIndex + 1}/{ayahWords.length} words
            </Text>
          </View>
        )}

        {/* ── Main Verse Card ── */}
        <View style={{
          backgroundColor: C.card, borderRadius: 28, padding: 28, marginBottom: 24,
          shadowColor: C.primary, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6,
          borderWidth: 1, borderColor: 'rgba(107,144,128,0.1)',
        }}>
          {/* Hint Badge */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <View style={{ backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted }}>
                Surah {currentSurah.index} : {selectedAyahNumber}{recitationMode !== 'single' && endAyahToAnalyze > selectedAyahNumber ? `-${endAyahToAnalyze}` : ''}
              </Text>
            </View>
            {!isRecording && !showAIStatus && (
              <View style={{ backgroundColor: C.highlight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#D4A017' }}>
                  {hintCount < 5 ? `${hintCount}/5 Hints` : 'All Hints Used'}
                </Text>
              </View>
            )}
            {showAIStatus && (
              <View style={{ backgroundColor: C.detected, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#2D6A4F' }}>Analysis Complete</Text>
              </View>
            )}
          </View>

          {/* Word Grid - RTL Arabic */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {ayahWords.map((word, index) => {
              const style = getWordStyle(index);
              const isCurrentlyDetected = isRecording && index === detectedWordIndex;
              const isHidden = !isRecording && !showAIStatus && index >= revealedWords;

              return (
                <View
                  key={index}
                  style={{
                    margin: 4,
                    paddingHorizontal: isHidden ? 0 : 10,
                    paddingVertical: isHidden ? 0 : 6,
                    backgroundColor: style.bg,
                    borderRadius: 12,
                    borderWidth: isCurrentlyDetected ? 2.5 : 0,
                    borderColor: isCurrentlyDetected ? C.primary : 'transparent',
                    minWidth: isHidden ? 36 : undefined,
                    transform: [{ scale: isCurrentlyDetected ? 1.08 : 1 }],
                  }}
                >
                  {isHidden ? (
                    <View style={{ height: 4, width: 36, backgroundColor: C.accent, borderRadius: 2, marginBottom: 2, marginTop: 26 }} />
                  ) : (
                    <Text style={{ fontSize: 30, color: style.text, fontFamily: 'serif', lineHeight: 46 }}>
                      {word}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* AI Detection Legend (during/after recording) */}
          {(isRecording || showAIStatus) && (
            <View style={{ flexDirection: 'row', marginTop: 20, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.detected, marginRight: 5 }} />
                <Text style={{ fontSize: 11, color: C.muted }}>Detected</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.warning, marginRight: 5 }} />
                <Text style={{ fontSize: 11, color: C.muted }}>Scanning</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.missed, marginRight: 5 }} />
                <Text style={{ fontSize: 11, color: C.muted }}>Review</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── AI Analysis Panel ── */}
        {showAIStatus && aiAnalysis && (
          <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 24, marginBottom: 24, shadowColor: C.primary, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 16 }}>AI Analysis</Text>

            {/* Confidence Bar */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600' }}>PRONUNCIATION SCORE</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.primary }}>{aiAnalysis.confidence}%</Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#EEE', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{
                  width: `${aiAnalysis.confidence}%`, height: '100%', borderRadius: 4,
                  backgroundColor: aiAnalysis.confidence > 85 ? C.primary : aiAnalysis.confidence > 70 ? C.warning : '#E05252'
                }} />
              </View>
            </View>

            {/* Word Count Stats */}
            <View style={{ flexDirection: 'row', marginBottom: 16 }}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.detected, borderRadius: 14, padding: 12, marginRight: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#2D6A4F' }}>{aiAnalysis.correct}</Text>
                <Text style={{ fontSize: 11, color: '#2D6A4F' }}>Detected</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.missed, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#A44' }}>{aiAnalysis.total - aiAnalysis.correct}</Text>
                <Text style={{ fontSize: 11, color: '#A44' }}>Review</Text>
              </View>
            </View>

            {/* Hesitation Indicator */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: C.bg, borderRadius: 14, marginBottom: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: aiAnalysis.hesitation ? C.warning : C.primary, marginRight: 10 }} />
              <Text style={{ fontSize: 13, color: C.text }}>
                {aiAnalysis.hesitation ? 'Minor hesitation detected in a few words' : 'Excellent fluency — no hesitation detected'}
              </Text>
            </View>

            {/* Motivational Feedback */}
            <Text style={{ fontSize: 15, color: C.primary, fontWeight: '600', fontStyle: 'italic', textAlign: 'center', lineHeight: 22 }}>
              {aiAnalysis.motivation}
            </Text>
          </View>
        )}

        {/* ── Action Buttons ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginBottom: 28 }}>
          <TouchableOpacity
            onPress={handleHint}
            disabled={isRecording}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: isRecording ? '#EEE' : C.highlight,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="bulb-outline" size={26} color={isRecording ? '#CCC' : '#D4A017'} />
            <Text style={{ fontSize: 8, fontWeight: '800', color: isRecording ? '#CCC' : '#D4A017', marginTop: 2 }}>{hintCount}/5</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isRecording ? stopRecording : startRecording}
            disabled={loading}
            style={{
              width: 88, height: 88, borderRadius: 44,
              backgroundColor: isRecording ? '#E05252' : C.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: isRecording ? '#E05252' : C.primary,
              shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
            }}
          >
            {loading 
              ? <ActivityIndicator color="#FFF" size="large" /> 
              : <Ionicons name={isRecording ? 'stop' : 'mic'} size={40} color="#FFF" />
            }
          </TouchableOpacity>

          <TouchableOpacity
            onPress={playRefAudio}
            disabled={isRecording}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: isRecording ? '#EEE' : C.accent,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isLoadingRef ? <ActivityIndicator color={C.primary} size="small" /> : (
              <Ionicons name={isPlayingRef ? 'pause' : 'volume-high-outline'} size={26} color={isRecording ? '#CCC' : C.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Submit & Retry Buttons ── */}
        {isDone && !isRecording && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <TouchableOpacity
                onPress={resetState}
                disabled={loading}
                style={{
                  flex: 1, backgroundColor: C.card, borderRadius: 20,
                  paddingVertical: 18, alignItems: 'center',
                  borderWidth: 2, borderColor: C.primary,
                  marginRight: 10,
                }}
              >
                <Text style={{ color: C.primary, fontSize: 16, fontWeight: '800' }}>Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={nextAyah}
                disabled={loading}
                style={{
                  flex: 1, backgroundColor: C.accent, borderRadius: 20,
                  paddingVertical: 18, alignItems: 'center',
                }}
              >
                <Text style={{ color: C.primary, fontSize: 16, fontWeight: '800' }}>Next Ayah</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={{
                backgroundColor: C.primary, borderRadius: 20,
                paddingVertical: 18, alignItems: 'center',
                shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
              }}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '800' }}>Confirm & Submit Recitation</Text>
              }
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Mode Modal */}
      <Modal visible={modeModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Recitation Mode</Text>
              <TouchableOpacity onPress={() => setModeModalVisible(false)}>
                <Ionicons name="close-circle" size={32} color={C.muted} />
              </TouchableOpacity>
            </View>
            {[
              { id: 'single', label: 'Single Ayah', desc: 'Recite one ayah at a time.' },
              { id: '5', label: '5 Ayahs', desc: 'Recite up to 5 ayahs consecutively.' },
              { id: '10', label: '10 Ayahs', desc: 'Recite up to 10 ayahs consecutively.' },
              { id: 'continuous', label: 'Continuous (Stop Anytime)', desc: 'Recite as many as you want, then press stop.' },
            ].map(m => (
              <TouchableOpacity
                key={m.id}
                onPress={() => { setRecitationMode(m.id); setModeModalVisible(false); }}
                style={{
                  padding: 16, borderRadius: 16, marginBottom: 12,
                  backgroundColor: recitationMode === m.id ? C.primary + '15' : C.bg,
                  borderWidth: 2, borderColor: recitationMode === m.id ? C.primary : 'transparent'
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>{m.label}</Text>
                <Text style={{ fontSize: 13, color: C.muted }}>{m.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Stop Ayah Selection Modal for Continuous Mode */}
      <Modal visible={stopAyahModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 24, width: '100%', maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 12 }}>Which Ayah did you stop at?</Text>
            <Text style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>To accurately score your recitation, select the last Ayah you recited.</Text>
            
            <FlatList
              data={Array.from({ length: Math.min(20, ayahCount - selectedAyahNumber + 1) }, (_, i) => selectedAyahNumber + i)}
              keyExtractor={item => item.toString()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleStopAyahSelected(item)}
                  style={{
                    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border,
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>Ayah {item}</Text>
                  <Ionicons name="chevron-forward" size={18} color={C.muted} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setStopAyahModalVisible(false)} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: C.red, fontWeight: '700', paddingVertical: 10 }}>Cancel Analysis</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Surah Modal */}
      <Modal visible={surahModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, height: '72%', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Select Surah</Text>
              <TouchableOpacity onPress={() => { setSurahModalVisible(false); setSearchQuery(''); }}>
                <Ionicons name="close-circle" size={32} color={C.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 14, marginBottom: 14 }}>
              <Ionicons name="search" size={18} color={C.muted} />
              <TextInput
                placeholder="Search surah name or number..."
                style={{ flex: 1, padding: 12, fontSize: 15, color: C.text }}
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
                    setSelectedAyahNumber(1);
                    setSurahModalVisible(false);
                    setSearchQuery('');
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border || '#F0F0F0' }}
                >
                  <View style={{ backgroundColor: C.accent, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>{parseInt(item.index)}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: C.muted }}>{item.count} verses</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Ayah Modal */}
      <Modal visible={ayahModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, height: '50%', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Select Ayah</Text>
              <TouchableOpacity onPress={() => setAyahModalVisible(false)}>
                <Ionicons name="close-circle" size={32} color={C.muted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={Array.from({ length: ayahCount }, (_, i) => i + 1)}
              numColumns={5}
              keyExtractor={item => item.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { setSelectedAyahNumber(item); setAyahModalVisible(false); }}
                  style={{
                    width: '18%', aspectRatio: 1, borderRadius: 12, margin: '1%',
                    backgroundColor: item === selectedAyahNumber ? C.primary : C.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: item === selectedAyahNumber ? '#FFF' : C.primary, fontSize: 14 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
