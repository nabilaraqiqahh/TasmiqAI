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
    if (!selected?.audioUrl) return;
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: selected.audioUrl }, { shouldPlay: true });
      setSound(newSound);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate((status) => { if (status.didJustFinish) setIsPlaying(false); });
    } catch (error) { Alert.alert("Error", "Could not play recording."); }
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
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
      
      <View style={{ flex: 1, flexDirection: isWeb && width > 1000 ? 'row' : 'column', maxWidth: 1400, alignSelf: 'center', width: '100%' }}>
        
        {/* LEFT PANEL: Queue (Hidden on small screens mobile, but visible in our "WOW" web view) */}
        {(isWeb && width > 1000) && (
          <View style={{ width: 350, borderRightWidth: 1, borderRightColor: '#E0E0E0', backgroundColor: '#FFFFFF', padding: 24 }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 24 }}>Review Queue</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {submissions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelected(s)}
                  style={{
                    backgroundColor: selected?.id === s.id ? C.primary + '10' : 'transparent',
                    borderRadius: 16, padding: 16, marginBottom: 12,
                    borderWidth: 1, borderColor: selected?.id === s.id ? C.primary : '#F0F0F0'
                  }}
                >
                  <Text style={{ fontWeight: '800', color: C.text }}>{s.studentName}</Text>
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{s.surah} • Ayah {s.ayah}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* MAIN CONTENT AREA */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWeb ? 40 : 20 }} showsVerticalScrollIndicator={false}>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', elevation: 2 }}>
              <Ionicons name="arrow-back" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 28, fontWeight: '900', color: C.text }}>Evaluation Studio</Text>
          </View>

          {!selected ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
              <Ionicons name="sparkles-outline" size={80} color={C.lilac} />
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginTop: 24 }}>Select a student to begin</Text>
              <Text style={{ color: C.muted, marginTop: 8 }}>Your review queue is ready for action.</Text>
            </View>
          ) : (
            <View style={{ gap: 24 }}>
              
              {/* STUDENT HEADER CARD */}
              <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                   <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: C.lilac, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 32, fontWeight: '900', color: 'white' }}>{(selected.studentName || 'S')[0]}</Text>
                   </View>
                   <View>
                      <Text style={{ fontSize: 26, fontWeight: '900', color: C.text }}>{selected.studentName}</Text>
                      <Text style={{ fontSize: 16, color: C.muted }}>{selected.surah} • Ayah {selected.ayah}</Text>
                   </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                   <Text style={{ fontSize: 13, color: C.muted, fontWeight: '700' }}>AI SCORE</Text>
                   <Text style={{ fontSize: 48, fontWeight: '900', color: selected.score > 85 ? C.green : C.gold }}>{selected.score}%</Text>
                </View>
              </View>

              {/* STUDIO PLAYER */}
              <View style={{ backgroundColor: C.text, borderRadius: 24, padding: 32, alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '800', marginBottom: 24, letterSpacing: 2 }}>STUDIO AUDIO PLAYBACK</Text>
                <TouchableOpacity 
                  onPress={isPlaying ? () => sound?.pauseAsync() : playSound}
                  style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={isPlaying ? "pause" : "play"} size={42} color="white" style={{ marginLeft: isPlaying ? 0 : 5 }} />
                </TouchableOpacity>
                <View style={{ width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 32, borderRadius: 1 }} />
              </View>

              {/* PHONETIC DIFF VIEW */}
              <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 32, elevation: 2 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: C.text, marginBottom: 20 }}>Refined AI Analysis</Text>
                <View style={{ backgroundColor: '#F9F8F4', borderRadius: 16, padding: 24, marginBottom: 24 }}>
                  <Text style={{ fontSize: 32, textAlign: 'right', color: C.text, lineHeight: 56, direction: 'rtl', fontWeight: '500' }}>
                    {selected.transcription}
                  </Text>
                </View>
                
                <View style={{ gap: 12 }}>
                  {selected.errors?.map((err, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 16, backgroundColor: C.red + '10', borderRadius: 16, padding: 20 }}>
                      <Ionicons name="mic-off" size={24} color={C.red} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '900', color: C.red, fontSize: 18 }}>{err.word}</Text>
                        <Text style={{ color: C.muted, fontSize: 15, marginTop: 4 }}>{err.tip}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* EVALUATION ACTION PANEL */}
              <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 32, elevation: 2, marginBottom: 40 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: C.text, marginBottom: 24 }}>Expert Evaluation</Text>
                
                <Text style={{ fontWeight: '700', color: C.muted, marginBottom: 12 }}>Proficiency Grade (1-5)</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                  {[1,2,3,4,5].map(n => (
                    <TouchableOpacity 
                      key={n} 
                      onPress={() => setGrade(n)}
                      style={{ flex: 1, height: 60, borderRadius: 16, backgroundColor: grade === n ? C.primary : C.bg, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 20, fontWeight: '900', color: grade === n ? 'white' : C.text }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  multiline
                  placeholder="Leave professional feedback..."
                  value={feedback}
                  onChangeText={setFeedback}
                  style={{ backgroundColor: C.bg, borderRadius: 16, padding: 20, height: 120, fontSize: 16, marginBottom: 24, textAlignVertical: 'top' }}
                />

                <View style={{ flexDirection: 'row', gap: 16 }}>
                   <TouchableOpacity 
                     onPress={() => handleSubmit(true)}
                     style={{ flex: 1, height: 64, borderRadius: 20, backgroundColor: C.red + '10', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                   >
                     <Ionicons name="refresh" size={20} color={C.red} />
                     <Text style={{ color: C.red, fontWeight: '800', fontSize: 16 }}>Request Redo</Text>
                   </TouchableOpacity>
                   <TouchableOpacity 
                     onPress={() => handleSubmit(false)}
                     disabled={submitting}
                     style={{ flex: 2, height: 64, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                   >
                     {submitting ? <ActivityIndicator color="white" /> : (
                       <>
                         <Ionicons name="send" size={20} color="white" />
                         <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Finalize Review</Text>
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
