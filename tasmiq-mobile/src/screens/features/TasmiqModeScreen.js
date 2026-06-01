import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Alert, Modal, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import quranData from '../../data/quran_data.json';
import { uploadRecitation, saveRecitationResult } from '../../services/recitationService';
import { API_URL, analyzeRecitation } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabaseClient';
import IslamicBackground from '../../components/IslamicBackground';

function ScoreRing({ score, label, color }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        borderWidth: 5, borderColor: color,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: color + '12', marginBottom: 8,
      }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color }}>{score}%</Text>
      </View>
      <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function FeedbackRow({ icon, color, text }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
      <View style={{
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: color + '18', alignItems: 'center',
        justifyContent: 'center', marginRight: 12, marginTop: 2,
      }}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={{ fontSize: 14, color: C.text, flex: 1, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

export default function TasmiqModeScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();
  
  // Selection Modals
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
  const wordResultsRef = useRef([]);
  const detectionTimerRef = useRef(null);

  // AI analysis summary
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [showAIStatus, setShowAIStatus] = useState(false);

  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [refSound, setRefSound] = useState(null);
  const [isPlayingRef, setIsPlayingRef] = useState(false);
  const [isLoadingRef, setIsLoadingRef] = useState(false);

  const startTimeRef = useRef(0);
  const silenceStartRef = useRef(null);
  const [weakAreas, setWeakAreas] = useState({});

  const currentSurah = quranData[selectedSurahIndex];
  const ayahCount = currentSurah.count;
  
  // Derived state for multiple ayahs
  const targetEndAyahNumber = useMemo(() => {
    if (recitationMode === 'single') return selectedAyahNumber;
    if (recitationMode === '5') return Math.min(selectedAyahNumber + 4, ayahCount);
    if (recitationMode === '10') return Math.min(selectedAyahNumber + 9, ayahCount);
    return ayahCount; // 'continuous' could go up to the end
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

  const handleHint = async () => {
    if (hintCount >= 5) {
      Alert.alert(
        'Too many hints used',
        "Please repeat this tasmiq section again to strengthen your memorization.",
        [{ text: 'Retry', style: 'cancel', onPress: () => resetState() }]
      );
      return;
    }
    
    const nextHint = hintCount + 1;
    setHintCount(nextHint);
    
    if (nextHint === 1) {
      setRevealedWords(1);
    } else if (nextHint === 2) {
      setRevealedWords(3);
    } else if (nextHint === 3) {
      setRevealedWords(Math.ceil(ayahWords.length / 2));
    } else if (nextHint === 4) {
      await playRefAudio();
    } else if (nextHint === 5) {
      setRevealedWords(ayahWords.length);
    }
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

  const startLiveDetectionSimulation = (totalWords) => {
    let currentIndex = 0;
    const results = new Array(totalWords).fill(null);
    wordResultsRef.current = results;
    
    detectionTimerRef.current = setInterval(() => {
      if (currentIndex >= totalWords) {
        clearInterval(detectionTimerRef.current);
        return;
      }
      results[currentIndex] = 'pending';
      wordResultsRef.current = [...results];
      setWordResults([...results]);
      setDetectedWordIndex(currentIndex);
      currentIndex++;
    }, 800);
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    
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
      recordingRef.current = null;
      setRecording(null);
    } catch (err) {
      console.error('Recording stop error:', err);
      return;
    }

    setIsAnalyzing(true);
    try {
      const ayahRange = endAyah > selectedAyahNumber ? `${selectedAyahNumber}-${endAyah}` : `${selectedAyahNumber}`;
      const response = await analyzeRecitation(audioUri, selectedSurahIndex + 1, ayahRange);
      const result = response?.data || {};

      const realScore  = typeof result.score   === 'number' ? Math.round(result.score)   : 0;
      const realTajwid = typeof result.tajwid  === 'number' ? Math.round(result.tajwid)  : realScore;
      const realMakhraj= typeof result.makhraj === 'number' ? Math.round(result.makhraj) : realScore;
      const refPh      = result.ref_phonetics  || '';
      const userPh     = result.user_phonetics || '';
      const fullFeedback = result.feedback     || '';

      let actualText = "";
      for(let a = selectedAyahNumber; a <= endAyah; a++) {
        actualText += (currentSurah.verse[`verse_${a}`] || '') + " \u06dd ";
      }
      const actualWords = actualText.trim().split(/\s+/);

      const wordLevelResults = buildWordResults(refPh, userPh, actualWords.length);
      const correct = wordLevelResults.filter(r => r === 'correct').length;

      setDetectedWordIndex(actualWords.length - 1);
      wordResultsRef.current = wordLevelResults;
      setWordResults(wordLevelResults);

      let finalScore = realScore;
      if (hintCount >= 3) finalScore = Math.max(0, finalScore - 15);

      const hesitation = wordLevelResults.includes('missed') || hintCount > 2;
      let motivation = fullFeedback || 'Good effort! Keep refining your pronunciation.';
      if (finalScore >= 90) motivation = 'Excellent memorization! MashaAllah! 🌟';
      else if (finalScore < 75) motivation = "Keep practicing. Use Muraja'ah to strengthen these ayahs.";

      if (finalScore < 80) {
        setWeakAreas(prev => ({ ...prev, [`${selectedAyahNumber}-${endAyah}`]: (prev[`${selectedAyahNumber}-${endAyah}`] || 0) + 1 }));
      }

      setAiAnalysis({ score: finalScore, tajwid: realTajwid, makhraj: realMakhraj,
        hesitation, correct, total: actualWords.length, motivation, refPhonetics: refPh, userPhonetics: userPh });
      setShowAIStatus(true);
    } catch (err) {
      console.error('AI analysis failed:', err);
      Alert.alert(
        'AI Analysis Failed',
        'Could not reach the TasmiqAI server.\nMake sure the backend is running at:\n' + API_URL,
        [{ text: 'OK' }]
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow microphone access to use Tasmiq.');
        return;
      }
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

      startTimeRef.current = Date.now();
      recordingRef.current = newRecording;
      setRecording(newRecording);
      setIsRecording(true);
      setIsAnalyzing(false);
      setShowAIStatus(false);
      setDetectedWordIndex(-1);
      
      const initialResults = new Array(ayahWords.length).fill(null);
      setWordResults(initialResults);
      wordResultsRef.current = initialResults;
      
      startLiveDetectionSimulation(ayahWords.length);
    } catch (err) {
      console.error('Recording start error:', err);
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

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
    } catch { Alert.alert('Error', 'Could not load reference audio.'); }
    finally { setIsLoadingRef(false); }
  };

  const handleSubmit = async () => {
    if (aiAnalysis?.score < 75) {
       Alert.alert('Pronunciation Threshold', 'Your score is below the required threshold for Tasmiq. Please retry.');
       return;
    }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const ayahRange = endAyahToAnalyze > selectedAyahNumber ? `${selectedAyahNumber}-${endAyahToAnalyze}` : `${selectedAyahNumber}`;
      if (user) {
        await saveRecitationResult(user.id, {
          surah: currentSurah.name,
          ayah: ayahRange,
          score: aiAnalysis.score,
          tajwid: aiAnalysis.tajwid,
          makhraj: aiAnalysis.makhraj,
          feedback: aiAnalysis.motivation,
          type: 'Tasmiq',
        });
        Alert.alert('Success', 'Your recitation has been successfully submitted to the teacher!');
      } else {
        Alert.alert('Notice', 'You are not logged in, so your score was not saved. Moving to next.');
      }
      nextAyah();
    } catch (e) {
      console.error('Failed to save tasmiq error:', e);
      Alert.alert('Error', 'Could not save your tasmiq results.');
    } finally {
      setSaving(false);
    }
  };

  const getWordStyle = (index) => {
    if (isRecording || isAnalyzing) {
      if (index === detectedWordIndex) {
        return { bg: C.accent, text: '#000', border: C.primary, scale: 1.05 }; 
      }
      if (index < detectedWordIndex) {
        const result = wordResults[index];
        if (result === 'pending') return { bg: C.primary + '22', text: C.text, border: 'transparent' };
        if (result === 'correct') return { bg: C.primary + '33', text: C.text, border: 'transparent' };
        if (result === 'missed') return { bg: C.red + '33', text: C.text, border: 'transparent' };
      }
      return { bg: 'transparent', text: C.muted, border: 'transparent' };
    }
    if (showAIStatus) {
      return { bg: wordResults[index] === 'correct' ? C.primary + '33' : C.red + '33', text: C.text, border: 'transparent' };
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
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Tasmiq Mode</Text>
        </View>
        <TouchableOpacity 
          onPress={() => setModeModalVisible(true)}
          style={{ backgroundColor: C.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}
        >
          <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700', marginRight: 4 }}>{getModeLabel(recitationMode)}</Text>
          <Ionicons name="chevron-down" size={14} color={C.primary} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => { if (selectedSurahIndex > 0) { setSelectedSurahIndex(s => s - 1); setSelectedAyahNumber(1); } }}
          disabled={selectedSurahIndex === 0}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={selectedSurahIndex === 0 ? C.muted : C.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSurahModalVisible(true)}
          style={{ flex: 1, backgroundColor: C.primary + '15', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{currentSurah.name}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { if (selectedSurahIndex < quranData.length - 1) { setSelectedSurahIndex(s => s + 1); setSelectedAyahNumber(1); } }}
          disabled={selectedSurahIndex === quranData.length - 1}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary + '18', alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color={selectedSurahIndex === quranData.length - 1 ? C.muted : C.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setAyahModalVisible(true)}
          style={{ backgroundColor: C.accent + '80', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 }}
        >
          <Text style={{ color: '#7A6000', fontSize: 13, fontWeight: '700' }}>Ayah {selectedAyahNumber}{recitationMode !== 'single' && endAyahToAnalyze > selectedAyahNumber ? `-${endAyahToAnalyze}` : ''}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!showAIStatus && (
          <View style={{
            backgroundColor: C.card, borderRadius: 24, padding: 28, marginBottom: 24,
            shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, elevation: 4,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <View style={{ backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted }}>
                  Surah {currentSurah.index} : {selectedAyahNumber}{recitationMode !== 'single' && endAyahToAnalyze > selectedAyahNumber ? `-${endAyahToAnalyze}` : ''}
                </Text>
              </View>
              <View style={{ backgroundColor: hintCount >= 4 ? C.red + '20' : C.accent + '40', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: hintCount >= 4 ? C.red : '#B59100' }}>
                  {hintCount}/5 Hints Used
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {ayahWords.map((word, index) => {
                const isHidden = showAIStatus
                  ? false
                  : isRecording
                    ? index > detectedWordIndex
                    : index >= revealedWords;

                const isCurrentlyDetected = isRecording && index === detectedWordIndex;
                const style = getWordStyle(index);

                return (
                  <View
                    key={index}
                    style={{
                      margin: 4,
                      paddingHorizontal: isHidden ? 2 : 10,
                      paddingVertical: isHidden ? 0 : 6,
                      backgroundColor: isHidden ? 'transparent' : style.bg,
                      borderRadius: 12,
                      borderWidth: isCurrentlyDetected ? 2.5 : 0,
                      borderColor: isCurrentlyDetected ? C.primary : 'transparent',
                      minWidth: isHidden ? 40 : undefined,
                      alignItems: 'center',
                    }}
                  >
                    {isHidden ? (
                      <View style={{ height: 4, width: 34, backgroundColor: C.muted + '35', borderRadius: 2, marginVertical: 24 }} />
                    ) : (
                      <Text style={{
                        fontSize: 28,
                        color: isCurrentlyDetected ? C.primary : style.text,
                        fontFamily: 'serif',
                        lineHeight: 46,
                        fontWeight: isCurrentlyDetected ? '700' : '400',
                      }}>
                        {word}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {!isRecording && !isAnalyzing && !showAIStatus && (
              <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 4 }}>
                <Ionicons name="mic-circle-outline" size={36} color={C.primary} style={{ opacity: 0.5 }} />
                <Text style={{ fontSize: 13, color: C.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                  Recite from memory, then press the{'\n'}mic button below to begin.
                </Text>
              </View>
            )}

            {isRecording && (
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red, marginRight: 8 }} />
                  <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>Recording — speak clearly</Text>
                </View>
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Press Stop when finished. AI will analyse your recitation.
                </Text>
              </View>
            )}

            {isAnalyzing && (
              <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 4 }}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.primary, marginTop: 12 }}>Wav2Vec2 AI Analysing...</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 4, textAlign: 'center' }}>
                  Comparing your recitation to the reference phonetics.
                </Text>
              </View>
            )}
          </View>
        )}

        {showAIStatus && aiAnalysis && (
          <View>
            <View style={{
              backgroundColor: C.primary, borderRadius: 20,
              padding: 24, marginBottom: 20, alignItems: 'center',
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 }}>Overall Score</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 52, fontWeight: '800', lineHeight: 60 }}>{aiAnalysis.score}%</Text>
              <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>
                {aiAnalysis.motivation}
              </Text>
            </View>

            <View style={{
              backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 20,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 20 }}>Score Breakdown</Text>
              <View style={{ flexDirection: 'row' }}>
                <ScoreRing score={aiAnalysis.tajwid} label="Tajwid" color={C.primary} />
                <ScoreRing score={aiAnalysis.makhraj} label="Makhraj" color={C.lilac} />
                <ScoreRing score={aiAnalysis.score} label="Fluency" color={C.accent} />
              </View>
            </View>

            <View style={{
              backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 16 }}>AI Feedback</Text>
              {aiAnalysis.hesitation && (
                <FeedbackRow icon="warning" color="#E0952F" text="Hesitation or pronunciation gap detected. Practice more for fluency." />
              )}
              {aiAnalysis.tajwid < 80 && (
                <FeedbackRow icon="information-circle" color={C.lilac} text="Focus on Tajwid rules — pay attention to elongation (Madd)." />
              )}
              {weakAreas[`${selectedAyahNumber}-${endAyahToAnalyze}`] >= 2 && (
                <FeedbackRow icon="alert-circle" color={C.red} text="This ayah is marked as a weak area. Consider adding it to Muraja'ah." />
              )}
              {hintCount >= 3 && (
                <FeedbackRow icon="bulb-outline" color="#B59100" text="You relied heavily on hints. Try memorizing fully before Tasmiq." />
              )}
              {aiAnalysis.refPhonetics ? (
                <View style={{ marginTop: 12, backgroundColor: C.bg, borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', marginBottom: 4 }}>✅ REFERENCE PHONETICS</Text>
                  <Text style={{ fontSize: 13, color: C.primary, fontFamily: 'monospace', lineHeight: 22 }} numberOfLines={3}>
                    {aiAnalysis.refPhonetics}
                  </Text>
                  <View style={{ height: 1, backgroundColor: C.border, marginVertical: 10 }} />
                  <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', marginBottom: 4 }}>🎙 YOUR PHONETICS</Text>
                  <Text style={{ fontSize: 13, color: C.text, fontFamily: 'monospace', lineHeight: 22 }} numberOfLines={3}>
                    {aiAnalysis.userPhonetics}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity
                onPress={resetState}
                style={{
                  flex: 1, backgroundColor: C.bg, borderRadius: 16,
                  paddingVertical: 18, alignItems: 'center',
                  borderWidth: 1.5, borderColor: C.primary, marginRight: 10,
                }}
              >
                <Text style={{ color: C.primary, fontSize: 16, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit}
                style={{
                  flex: 1, backgroundColor: C.primary, borderRadius: 16,
                  paddingVertical: 18, alignItems: 'center',
                  shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
                }}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Submit to Teacher</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!showAIStatus && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginBottom: 28, marginTop: 10 }}>
            <TouchableOpacity
              onPress={handleHint}
              disabled={isRecording || isAnalyzing}
              style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: (isRecording || isAnalyzing) ? C.border : C.accent + '80',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="bulb-outline" size={26} color={(isRecording || isAnalyzing) ? C.muted : '#9B7D00'} />
              <Text style={{ fontSize: 9, fontWeight: '800', color: (isRecording || isAnalyzing) ? C.muted : '#9B7D00', marginTop: 2 }}>HINT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isAnalyzing}
              style={{
                width: 90, height: 90, borderRadius: 45,
                backgroundColor: isAnalyzing ? C.muted : (isRecording ? C.red : C.primary),
                alignItems: 'center', justifyContent: 'center',
                shadowColor: isRecording ? C.red : C.primary,
                shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
              }}
            >
              {isAnalyzing
                ? <ActivityIndicator color="#FFF" size="large" />
                : <Ionicons name={isRecording ? 'stop' : 'mic'} size={42} color="#FFF" />
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
                placeholder="Search surah..."
                style={{ flex: 1, padding: 12, fontSize: 15, color: C.text }}
                onChangeText={setSearchQuery}
                value={searchQuery}
              />
            </View>
            <FlatList
              data={quranData.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.index.includes(searchQuery))}
              keyExtractor={item => item.index}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedSurahIndex(parseInt(item.index) - 1);
                    setSelectedAyahNumber(1);
                    setSurahModalVisible(false);
                    setSearchQuery('');
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}
                >
                  <View style={{ backgroundColor: C.primary + '20', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
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
    </IslamicBackground>
  );
}
