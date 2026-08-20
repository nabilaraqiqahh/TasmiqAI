import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert, Modal, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
import quranData from '../../data/quran_data.json';

const P = {
  primary: '#0B6E4F',
  accent: '#D4AF37',
  gold: '#D4AF37',
  goldBg: '#FDF8E7',
  red: '#DC2626',
  card: '#FFFFFF',
  text: '#1A2E1C',
  muted: '#6B7280',
  lightGreen: '#E8F5EC',
  bg: '#FEFCE8',
};

export default function ProgressScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [recitations, setRecitations] = useState([]);
  const [selectedSurahIndex, setSelectedSurahIndex] = useState(0);
  const [surahModalVisible, setSurahModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  /* Audio player state for Ayah progress */
  const [playingUrl, setPlayingUrl] = useState(null);
  const playbackSoundRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      loadProgressData();
      return () => {
        if (playbackSoundRef.current) {
          playbackSoundRef.current.unloadAsync().catch(() => {});
        }
      };
    }, [])
  );

  const loadProgressData = async () => {
    setLoading(true);
    try {
      const { getCurrentUser } = await import('../../services/authService');
      const session = await getCurrentUser();
      if (!session?.id) { setLoading(false); return; }

      // 1. User profile
      const { data: prof } = await supabase
        .from('users')
        .select('streak_days, total_sessions, avg_score, progress_percentage')
        .eq('id', session.id)
        .maybeSingle();
      setProfile(prof);

      // 2. All recitations
      const { data: recs } = await supabase
        .from('recitations')
        .select('*')
        .eq('user_id', session.id)
        .order('submitted_at', { ascending: false });

      const allRecs = recs || [];
      setRecitations(allRecs);

      // Default selected Surah to the latest recited surah if available
      if (allRecs.length > 0) {
        const latestRec = allRecs[0];
        const matchIndex = quranData.findIndex(q => q.name === latestRec.surah || parseInt(q.index) === latestRec.surah_number);
        if (matchIndex !== -1) {
          setSelectedSurahIndex(matchIndex);
        }
      }

    } catch (err) {
      console.error('Progress load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Play audio directly from the report
  const handlePlayAudio = async (url) => {
    if (!url) return;

    try {
      if (playingUrl === url && playbackSoundRef.current) {
        await playbackSoundRef.current.pauseAsync();
        setPlayingUrl(null);
        return;
      }

      if (playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
      }

      setPlayingUrl(url);

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (status.didJustFinish) {
            setPlayingUrl(null);
          }
        }
      );
      playbackSoundRef.current = sound;
    } catch (err) {
      console.error('Playback error:', err);
      setPlayingUrl(null);
      Alert.alert('Playback Error', 'Could not play recording.');
    }
  };

  // Calculations for Student Performance Report
  const performanceStats = useMemo(() => {
    const assessments = recitations.filter(r => !r.is_exercise);
    const exercises = recitations.filter(r => r.is_exercise);
    
    const completed = assessments.filter(r => r.reviewed).length;
    const approved = assessments.filter(r => r.status === 'approved').length;
    const repeats = assessments.filter(r => r.status === 'repeat').length;
    
    // Average AI score for practice exercises
    const avgAi = exercises.length 
      ? Math.round(exercises.reduce((s, r) => s + (r.score || 0), 0) / exercises.length)
      : 0;

    // Latest teacher result
    const latestReviewedAssessment = assessments.find(r => r.reviewed);
    const latestResult = latestReviewedAssessment 
      ? {
          surah: latestReviewedAssessment.surah || `Surah ${latestReviewedAssessment.surah_number}`,
          ayah: latestReviewedAssessment.ayah,
          status: latestReviewedAssessment.status === 'approved' ? 'PASS' : 'REPEAT',
          feedback: latestReviewedAssessment.feedback || 'No comments',
          date: latestReviewedAssessment.reviewed_at || latestReviewedAssessment.recorded_at || latestReviewedAssessment.submitted_at,
        }
      : null;

    return {
      completed,
      approved,
      repeats,
      avgAi,
      latestResult
    };
  }, [recitations]);

  // Calculations for Progress by Ayah according to Business Logic Rules
  const surahAyahsProgress = useMemo(() => {
    const activeSurah = quranData[selectedSurahIndex];
    const totalAyahs = activeSurah.count;
    
    const progressList = [];
    for (let a = 1; a <= totalAyahs; a++) {
      // 1. AI Tasmiq Exercise status
      const aiExerciseRecs = recitations.filter(r => 
        r.is_exercise &&
        (r.surah === activeSurah.name || r.surah_number === parseInt(activeSurah.index)) &&
        (String(r.ayah) === String(a))
      );
      const hasAiExercise = aiExerciseRecs.length > 0;
      const aiStatus = hasAiExercise ? 'Completed' : 'Not Started';

      // 2. Official Teacher Assessment status
      const teacherRecs = recitations.filter(r => 
        !r.is_exercise &&
        (r.surah === activeSurah.name || r.surah_number === parseInt(activeSurah.index)) &&
        (String(r.ayah) === String(a))
      );
      const latestTeacherRec = teacherRecs[0];
      
      let teacherStatus = 'Not Submitted';
      let audioUrl = null;

      if (latestTeacherRec) {
        audioUrl = latestTeacherRec.audio_url;
        if (latestTeacherRec.status === 'approved') teacherStatus = 'PASS';
        else if (latestTeacherRec.status === 'repeat') teacherStatus = 'REPEAT';
        else teacherStatus = 'Pending';
      } else if (hasAiExercise) {
        audioUrl = aiExerciseRecs[0]?.audio_url;
      }

      // 3. Final Tasmiq Status
      let finalStatus = 'NOT ELIGIBLE';
      if (!hasAiExercise) {
        finalStatus = 'NOT ELIGIBLE';
      } else if (!latestTeacherRec) {
        finalStatus = 'IN PROGRESS';
      } else if (latestTeacherRec.status === 'approved') {
        finalStatus = 'FULLY PASSED';
      } else if (latestTeacherRec.status === 'repeat') {
        finalStatus = 'REPEAT REQUIRED';
      } else {
        finalStatus = 'IN PROGRESS';
      }

      progressList.push({
        ayah: a,
        aiStatus,
        teacherStatus,
        finalStatus,
        audioUrl
      });
    }

    return progressList;
  }, [recitations, selectedSurahIndex]);

  // AI-to-AI Practice Comparison data
  const aiAttemptsForSurah = useMemo(() => {
    const activeSurah = quranData[selectedSurahIndex];
    return recitations
      .filter(r => r.is_exercise && (r.surah === activeSurah.name || r.surah_number === parseInt(activeSurah.index)))
      .sort((a, b) => new Date(b.submitted_at || b.recorded_at) - new Date(a.submitted_at || a.recorded_at));
  }, [recitations, selectedSurahIndex]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={P.primary} />
        <Text style={{ color: C.muted, marginTop: 12 }}>Loading progress report...</Text>
      </SafeAreaView>
    );
  }

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text }}>Progress Report</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* ── PART 6: Student Performance Report Card ── */}
          <View style={{
            backgroundColor: C.card, borderRadius: 20, padding: 20, marginBottom: 24,
            shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
            borderWidth: 1, borderColor: '#F0F0F0',
          }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: P.primary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>
              Student Performance Report
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 13, color: P.muted, fontWeight: '600' }}>Total Tasmiq Completed</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: P.text, marginTop: 2 }}>{performanceStats.completed} assessed</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 13, color: P.muted, fontWeight: '600' }}>Average AI Score</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: P.accent, marginTop: 2 }}>{performanceStats.avgAi}%</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 10 }}>
              <View style={{ flex: 1, backgroundColor: P.lightGreen, padding: 12, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: P.primary }}>{performanceStats.approved}</Text>
                <Text style={{ fontSize: 11, color: P.primary, fontWeight: '700', marginTop: 2 }}>Total Approved</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#FEE2E2', padding: 12, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: P.red }}>{performanceStats.repeats}</Text>
                <Text style={{ fontSize: 11, color: P.red, fontWeight: '700', marginTop: 2 }}>Repeat Requests</Text>
              </View>
            </View>

            {/* Latest Teacher Result */}
            {performanceStats.latestResult ? (
              <View style={{
                marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: P.primary, marginBottom: 6 }}>LATEST TEACHER RESULT</Text>
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: P.text }}>
                    {performanceStats.latestResult.surah} (Ayah {performanceStats.latestResult.ayah})
                  </Text>
                  
                  <View style={{
                    backgroundColor: performanceStats.latestResult.status === 'PASS' ? '#D1FAE5' : '#FEE2E2',
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                  }}>
                    <Text style={{
                      fontSize: 11, fontWeight: '800',
                      color: performanceStats.latestResult.status === 'PASS' ? '#065F46' : '#B91C1C',
                    }}>
                      {performanceStats.latestResult.status}
                    </Text>
                  </View>
                </View>
                
                <Text style={{ fontSize: 13, color: P.muted, fontStyle: 'italic', lineHeight: 18 }}>
                  "{performanceStats.latestResult.feedback}"
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: P.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 10 }}>
                No teacher reviews received yet.
              </Text>
            )}
          </View>

          {/* ── AI Practice Recitation Comparison (AI Attempt vs AI Attempt Only) ── */}
          <View style={{
            backgroundColor: C.card, borderRadius: 20, padding: 20, marginBottom: 24,
            shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
            borderWidth: 1, borderColor: '#F0F0F0',
          }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: P.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              AI Practice Comparison
            </Text>
            <Text style={{ fontSize: 12, color: P.muted, marginBottom: 16 }}>
              Compare AI practice attempt history for {quranData[selectedSurahIndex].name}
            </Text>

            {aiAttemptsForSurah.length < 2 ? (
              <View style={{ backgroundColor: '#FAFAF8', padding: 14, borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
                <Ionicons name="stats-chart-outline" size={24} color={P.muted} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 13, color: P.muted, textAlign: 'center', fontWeight: '500' }}>
                  {aiAttemptsForSurah.length === 1
                    ? 'Complete at least 2 AI practice attempts to view comparison delta.'
                    : 'No AI practice attempts recorded for this surah yet.'}
                </Text>
              </View>
            ) : (() => {
              const latest = aiAttemptsForSurah[0];
              const previous = aiAttemptsForSurah[1];
              const scoreDelta = (latest.score || 0) - (previous.score || 0);

              return (
                <View>
                  {/* Score comparison header */}
                  <View style={{
                    backgroundColor: P.lightGreen, borderRadius: 14, padding: 14,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: P.primary, textTransform: 'uppercase' }}>
                        Attempt #{previous.attempt_number || 1} → #{latest.attempt_number || 2}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: P.text, marginTop: 2 }}>
                        Progress Delta
                      </Text>
                    </View>

                    <View style={{
                      backgroundColor: scoreDelta >= 0 ? '#D1FAE5' : '#FEE2E2',
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                    }}>
                      <Ionicons
                        name={scoreDelta >= 0 ? "trending-up" : "trending-down"}
                        size={16}
                        color={scoreDelta >= 0 ? '#065F46' : '#B91C1C'}
                      />
                      <Text style={{
                        fontSize: 14, fontWeight: '900',
                        color: scoreDelta >= 0 ? '#065F46' : '#B91C1C',
                      }}>
                        {scoreDelta >= 0 ? `+${scoreDelta}%` : `${scoreDelta}%`}
                      </Text>
                    </View>
                  </View>

                  {/* Side-by-side comparison cards */}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    {/* Previous Attempt Card */}
                    <View style={{ flex: 1, backgroundColor: '#FAFAF8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: P.muted, textTransform: 'uppercase' }}>
                        PREVIOUS (Attempt #{previous.attempt_number || 1})
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: P.text, marginVertical: 4 }}>
                        {previous.score || 0}%
                      </Text>
                      <Text style={{ fontSize: 11, color: P.muted }}>
                        Ayat/Pause: {previous.ayah}
                      </Text>
                      <Text style={{ fontSize: 10, color: P.primary, fontWeight: '700', marginTop: 2 }}>
                        Mode: {previous.recording_mode === 'advanced' ? 'Advanced' : 'Beginner'}
                      </Text>
                      {previous.audio_url && (
                        <TouchableOpacity
                          onPress={() => handlePlayAudio(previous.audio_url)}
                          style={{
                            marginTop: 8, paddingVertical: 6, backgroundColor: P.primary + '15',
                            borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
                          }}
                        >
                          <Ionicons name={playingUrl === previous.audio_url ? "pause" : "play"} size={12} color={P.primary} />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: P.primary }}>
                            {playingUrl === previous.audio_url ? 'Pause' : 'Play Audio'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Latest Attempt Card */}
                    <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: P.primary + '40' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: P.primary, textTransform: 'uppercase' }}>
                        LATEST (Attempt #{latest.attempt_number || 2})
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: P.primary, marginVertical: 4 }}>
                        {latest.score || 0}%
                      </Text>
                      <Text style={{ fontSize: 11, color: P.muted }}>
                        Ayat/Pause: {latest.ayah}
                      </Text>
                      <Text style={{ fontSize: 10, color: P.primary, fontWeight: '700', marginTop: 2 }}>
                        Mode: {latest.recording_mode === 'advanced' ? 'Advanced' : 'Beginner'}
                      </Text>
                      {latest.audio_url && (
                        <TouchableOpacity
                          onPress={() => handlePlayAudio(latest.audio_url)}
                          style={{
                            marginTop: 8, paddingVertical: 6, backgroundColor: P.primary,
                            borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
                          }}
                        >
                          <Ionicons name={playingUrl === latest.audio_url ? "pause" : "play"} size={12} color="white" />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: 'white' }}>
                            {playingUrl === latest.audio_url ? 'Pause' : 'Play Audio'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Feedback contrast */}
                  {latest.feedback ? (
                    <View style={{ backgroundColor: '#FAFAF8', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E5E7EB' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: P.muted, textTransform: 'uppercase', marginBottom: 2 }}>
                        Latest AI Feedback
                      </Text>
                      <Text style={{ fontSize: 12, color: P.text, fontStyle: 'italic', lineHeight: 16 }}>
                        "{latest.feedback}"
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })()}
          </View>

          {/* ── PART 6: Progress by Ayah ── */}
          <View style={{
            backgroundColor: C.card, borderRadius: 20, padding: 20,
            shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
            borderWidth: 1, borderColor: '#F0F0F0',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: P.primary, textTransform: 'uppercase', letterSpacing: 1 }}>
                Progress by Ayah
              </Text>
              
              <TouchableOpacity
                onPress={() => setSurahModalVisible(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: P.primary + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: P.primary }}>
                  {quranData[selectedSurahIndex].name}
                </Text>
                <Ionicons name="chevron-down" size={14} color={P.primary} />
              </TouchableOpacity>
            </View>

            {/* List of Ayahs */}
            {surahAyahsProgress.map((item) => {
              const isPlaying = playingUrl === item.audioUrl;

              const badgeColor = item.finalStatus === 'FULLY PASSED'
                ? { bg: '#D1FAE5', text: '#065F46' }
                : item.finalStatus === 'REPEAT REQUIRED'
                ? { bg: '#FEE2E2', text: '#B91C1C' }
                : item.finalStatus === 'IN PROGRESS'
                ? { bg: '#FEF3C7', text: '#92400E' }
                : { bg: '#F3F4F6', text: P.muted };

              return (
                <View key={item.ayah} style={{
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: P.text }}>Ayah {item.ayah}</Text>
                      
                      {/* Final Tasmiq Status Badge */}
                      <View style={{
                        backgroundColor: badgeColor.bg,
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '800',
                          color: badgeColor.text,
                        }}>{item.finalStatus}</Text>
                      </View>
                    </View>

                    {/* Separate Stage Statuses */}
                    <Text style={{ fontSize: 11, color: P.muted, marginTop: 2 }}>
                      AI Exercise: <Text style={{ fontWeight: '700', color: item.aiStatus === 'Completed' ? P.primary : P.muted }}>{item.aiStatus}</Text>
                      {'  •  '}
                      Teacher: <Text style={{ fontWeight: '700', color: item.teacherStatus === 'PASS' ? '#065F46' : item.teacherStatus === 'REPEAT' ? P.red : P.muted }}>{item.teacherStatus}</Text>
                    </Text>
                  </View>

                  {/* Play audio button if recording available */}
                  {item.audioUrl ? (
                    <TouchableOpacity
                      onPress={() => handlePlayAudio(item.audioUrl)}
                      style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: isPlaying ? '#FFFBEB' : '#F3F4F6',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={isPlaying ? "pause" : "play"} size={16} color={isPlaying ? P.accent : P.primary} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: 11, color: '#CCCCCC', fontWeight: '600' }}>No Audio</Text>
                  )}
                </View>
              );
            })}
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* Surah Picker Modal */}
      <Modal visible={surahModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#FFFFFF', height: '72%',
            borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: P.primary }}>Select Surah for Report</Text>
              <TouchableOpacity onPress={() => { setSurahModalVisible(false); setSearchQuery(''); }}>
                <Ionicons name="close-circle" size={32} color="#CCC" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={quranData}
              keyExtractor={item => item.index}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedSurahIndex(index);
                    setSurahModalVisible(false);
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
                  }}
                >
                  <View style={{
                    backgroundColor: P.primary + '18', width: 34, height: 34,
                    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14,
                  }}>
                    <Text style={{ color: P.primary, fontWeight: '800', fontSize: 12 }}>{parseInt(item.index)}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2C2C', flex: 1 }}>{item.name}</Text>
                  {selectedSurahIndex === index && (
                    <Ionicons name="checkmark-circle" size={20} color={P.primary} />
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
