import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, TextInput, ActivityIndicator, Alert, RefreshControl, Dimensions, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { getPendingRecitations, submitReview } from '../../services/recitationService';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

/* -- Score Ring ----------------------------------------------- */
function MetricBar({ label, score, color }) {
  const scoreNum = typeof score === 'number' ? score : 0;
  const barColor = scoreNum >= 85 ? '#0B6E4F' : scoreNum >= 70 ? '#D4AF37' : '#DC2626';
  const c = color || barColor;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '900', color: c }}>{scoreNum}%</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: '#F3F4F6', overflow: 'hidden' }}>
        <View style={{ width: `${scoreNum}%`, height: '100%', backgroundColor: c, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function TeacherReview({ navigation, route }) {
  const { isDark, colors: C } = useTheme();
  const [submissions, setSubmissions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [grade, setGrade] = useState(4);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const loadSubmissions = async () => {
    try {
      const data = await getPendingRecitations();
      setSubmissions(data);
      if (data.length > 0 && !selected) {
        setSelected(data[0]);
      }
    } catch (error) {
      console.error("Load submissions error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
    return () => { if (sound) sound.unloadAsync(); };
  }, []);

  useEffect(() => {
    if (route.params?.recitation) setSelected(route.params.recitation);
  }, [route.params]);

  const playSound = async () => {
    const audioUrl = selected?.audio_url || selected?.audioUrl;
    if (!audioUrl) return;
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUrl }, { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.didJustFinish) setIsPlaying(false);
      });
    } catch { Alert.alert('Error', 'Could not play recording.'); }
  };

  const handleSubmit = async (isRedo = false) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await submitReview(selected.id, isRedo ? 0 : grade, isRedo ? `REDO: ${feedback}` : feedback);
      Alert.alert("Success", "Evaluation Sent!");
      setFeedback('');
      setSelected(null);
      loadSubmissions();
    } catch (error) { Alert.alert("Error", "Could not submit."); } finally { setSubmitting(false); }
  };

  if (loading && !refreshing) {
    return <View style={{ flex: 1, backgroundColor: '#FFFDF0', justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={'#0B6E4F'} /></View>;
  }

  /* -- Parse metrics — supports both old errors object and new dedicated columns -- */
  const getMetrics = (s) => {
    if (!s) return { memorization: 0, pronunciation: 0, tajwid: 0, fluency: 0 };
    // New schema: dedicated score columns
    if (s.memorization_score != null) return {
      memorization:  s.memorization_score,
      pronunciation: s.pronunciation_score || s.score || 0,
      tajwid:        s.tajwid_score        || s.score || 0,
      fluency:       s.fluency_score       || s.score || 0,
    };
    // Legacy: errors JSON object
    const e = typeof s.errors === 'string' ? JSON.parse(s.errors || '{}') : (s.errors || {});
    return {
      memorization:  typeof e.memorization === 'number'  ? e.memorization  : (s.score || 0),
      pronunciation: typeof e.pronunciation === 'number' ? e.pronunciation : (s.score || 0),
      tajwid:        typeof e.tajwid === 'number'        ? e.tajwid        : (s.score || 0),
      fluency:       typeof e.fluency === 'number'       ? e.fluency       : (s.score || 0),
    };
  };

  const metrics = getMetrics(selected);
  const overallScore = selected?.score || 0;
  const scoreColor = overallScore >= 85 ? '#0B6E4F' : overallScore >= 70 ? '#D4AF37' : '#DC2626';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFDF0' }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={'#FFFDF0'} />

      <View style={{ flex: 1, flexDirection: isWeb && width > 1000 ? 'row' : 'column', maxWidth: 1400, alignSelf: 'center', width: '100%' }}>

        {/* LEFT PANEL: Queue */}
        {(isWeb && width > 1000) && (
          <View style={{ width: 350, borderRightWidth: 1, borderRightColor: '#E0E0E0', backgroundColor: '#FFFFFF', padding: 24 }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#064E3B', marginBottom: 24 }}>Review Queue</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {submissions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelected(s)}
                  style={{
                    backgroundColor: selected?.id === s.id ? '#0B6E4F' + '10' : 'transparent',
                    borderRadius: 16, padding: 16, marginBottom: 12,
                    borderWidth: 1, borderColor: selected?.id === s.id ? '#0B6E4F' : '#F0F0F0'
                  }}
                >
                  <Text style={{ fontWeight: '800', color: '#064E3B' }}>
                    {s.student_name || s.studentName || 'Unknown Student'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{s.surah} • Ayah {s.ayah}</Text>
                  <View style={{
                    marginTop: 8, backgroundColor: (s.score || 0) >= 70 ? '#DCFCE7' : '#FEE2E2',
                    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: (s.score || 0) >= 70 ? '#0B6E4F' : '#991B1B' }}>
                      {s.score || 0}%
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* MAIN CONTENT AREA */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWeb ? 40 : 20 }} showsVerticalScrollIndicator={false}>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 2 }}>
              <Ionicons name="arrow-back" size={24} color={'#064E3B'} />
            </TouchableOpacity>
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#064E3B' }}>Evaluation Studio</Text>
          </View>

          {!selected ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
              <Ionicons name="sparkles-outline" size={80} color={'#C8B6E2'} />
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#064E3B', marginTop: 24 }}>Select a student to begin</Text>
              <Text style={{ color: '#6B7280', marginTop: 8 }}>Your review queue is ready for action.</Text>
            </View>
          ) : (
            <View style={{ gap: 20 }}>

              {/* STUDENT HEADER CARD */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, elevation: 4, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#0B6E4F', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28, fontWeight: '900', color: 'white' }}>
                        {(selected.student_name || selected.studentName || 'S')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#064E3B' }}>
                        {selected.student_name || selected.studentName || 'Unknown Student'}
                      </Text>
                      <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>
                        {selected.surah} · Ayah {selected.ayah}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <View style={{ backgroundColor: '#FFFDF0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0B6E4F' }}>
                            {selected.type || 'Tasmiq'}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: '#F9F9F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280' }}>
                            Pending Review
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'center', backgroundColor: scoreColor + '12', borderRadius: 16, padding: 16, minWidth: 80 }}>
                    <Text style={{ fontSize: 11, color: scoreColor, fontWeight: '800', letterSpacing: 0.5 }}>AI SCORE</Text>
                    <Text style={{ fontSize: 44, fontWeight: '900', color: scoreColor, lineHeight: 52 }}>{overallScore}%</Text>
                    <Text style={{ fontSize: 11, color: scoreColor, fontWeight: '700' }}>
                      {overallScore >= 90 ? 'Excellent' : overallScore >= 70 ? 'Good' : 'Needs Work'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* AI METRIC BREAKDOWN */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <Ionicons name="analytics-outline" size={18} color={'#0B6E4F'} />
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#064E3B' }}>AI Assessment Breakdown</Text>
                </View>
                <MetricBar label="📖 Memorization Accuracy" score={metrics.memorization} color="#0B6E4F" />
                <MetricBar label="🗣️ Pronunciation" score={metrics.pronunciation} color="#D4AF37" />
                <MetricBar label="✨ Tajwid Rules" score={metrics.tajwid} color="#4A90A4" />
                <MetricBar label="🎵 Fluency & Flow" score={metrics.fluency} color="#9B7DC8" />
              </View>

              {/* TRANSCRIPTION / RECITED TEXT */}
              {selected.transcription ? (
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Ionicons name="text-outline" size={18} color={'#0B6E4F'} />
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#064E3B' }}>Recited Text (Transcription)</Text>
                  </View>
                  <View style={{ backgroundColor: '#FFFDF0', borderRadius: 16, padding: 20 }}>
                    <Text style={{ fontSize: 26, textAlign: 'right', color: '#064E3B', lineHeight: 48, direction: 'rtl', fontWeight: '500', fontFamily: Platform.OS === 'ios' ? 'GeezaPro' : 'serif' }}>
                      {selected.transcription}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* AI FEEDBACK TEXT */}
              {selected.feedback ? (
                <View style={{ backgroundColor: '#FFFDF0', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#BBF7D0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Ionicons name="bulb-outline" size={18} color="#0B6E4F" />
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#0B6E4F' }}>AI Feedback</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#0B6E4F', lineHeight: 22 }}>{selected.feedback}</Text>
                </View>
              ) : null}

              {/* STUDIO PLAYER */}
              <View style={{ backgroundColor: '#064E3B', borderRadius: 24, padding: 28, alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '800', marginBottom: 20, letterSpacing: 2, fontSize: 12 }}>STUDIO AUDIO PLAYBACK</Text>
                {(selected.audio_url || selected.audioUrl) ? (
                  <TouchableOpacity
                    onPress={isPlaying ? () => sound?.pauseAsync() : playSound}
                    style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#0B6E4F', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name={isPlaying ? "pause" : "play"} size={36} color="white" style={{ marginLeft: isPlaying ? 0 : 4 }} />
                  </TouchableOpacity>
                ) : (
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Ionicons name="mic-off-outline" size={36} color="rgba(255,255,255,0.3)" />
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No audio recording available</Text>
                  </View>
                )}
                <View style={{ width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 24, borderRadius: 1 }} />
              </View>

              {/* EVALUATION ACTION PANEL */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, elevation: 2, marginBottom: 40, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#064E3B', marginBottom: 20 }}>Expert Evaluation</Text>

                <Text style={{ fontWeight: '700', color: '#6B7280', marginBottom: 10, fontSize: 13 }}>Proficiency Grade (1–5)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setGrade(n)}
                      style={{ flex: 1, height: 56, borderRadius: 14, backgroundColor: grade === n ? '#0B6E4F' : '#FFFDF0', alignItems: 'center', justifyContent: 'center', borderWidth: grade === n ? 0 : 1, borderColor: '#E5E7EB' }}
                    >
                      <Text style={{ fontSize: 18, fontWeight: '900', color: grade === n ? 'white' : '#064E3B' }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ fontWeight: '700', color: '#6B7280', marginBottom: 10, fontSize: 13 }}>Teacher's Feedback</Text>
                <TextInput
                  multiline
                  placeholder="Leave professional feedback for the student..."
                  placeholderTextColor="#9CA3AF"
                  value={feedback}
                  onChangeText={setFeedback}
                  style={{ backgroundColor: '#FFFDF0', borderRadius: 14, padding: 16, height: 110, fontSize: 15, marginBottom: 20, textAlignVertical: 'top', color: '#064E3B', borderWidth: 1, borderColor: '#E5E7EB' }}
                />

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => handleSubmit(true)}
                    style={{ flex: 1, height: 58, borderRadius: 18, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                  >
                    <Ionicons name="refresh" size={18} color="#DC2626" />
                    <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 14 }}>Request Redo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSubmit(false)}
                    disabled={submitting}
                    style={{ flex: 2, height: 58, borderRadius: 18, backgroundColor: '#0B6E4F', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                  >
                    {submitting ? <ActivityIndicator color="white" /> : (
                      <>
                        <Ionicons name="send" size={18} color="white" />
                        <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>Finalize Review</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}



