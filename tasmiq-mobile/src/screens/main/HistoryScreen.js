import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { getRecitationHistory } from '../../services/recitationService';
import { getCurrentUser } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');

// â”€â”€ Design tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const P   = '#0B6E4F';
const PD  = '#064E3B';
const PL  = '#D1FAE5';
const G   = '#D4AF37';
const GL  = '#F8E7A1';
const BG  = '#FFFDF0';
const BSF = '#FFF9E6';
const RED = '#DC2626';

function formatDate(timestamp) {
  if (!timestamp) return 'Date unknown';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'Invalid date';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return 'Format error';
  }
}

export default function HistoryScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All'); // 'All' | 'Assessment' | 'Exercise'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'
  const [expandedId, setExpandedId] = useState(null);

  /* Audio player state */
  const [playingId, setPlayingId] = useState(null);
  const playbackSoundRef = useRef(null);

  useEffect(() => {
    loadHistory();
    return () => {
      if (playbackSoundRef.current) {
        playbackSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const session = await getCurrentUser();
      if (session?.id) {
        const data = await getRecitationHistory(session.id);
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('History fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Playback handlers
  const togglePlayAudio = async (item) => {
    if (!item.audio_url) {
      Alert.alert('No Audio', 'There is no audio recording saved for this recitation.');
      return;
    }

    try {
      if (playingId === item.id && playbackSoundRef.current) {
        await playbackSoundRef.current.pauseAsync();
        setPlayingId(null);
        return;
      }

      if (playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
      }

      setPlayingId(item.id);

      const { sound } = await Audio.Sound.createAsync(
        { uri: item.audio_url },
        { shouldPlay: true },
        (status) => {
          if (status.didJustFinish) {
            setPlayingId(null);
          }
        }
      );
      playbackSoundRef.current = sound;
    } catch (err) {
      console.error('Playback error:', err);
      setPlayingId(null);
      Alert.alert('Playback Error', 'Could not play audio.');
    }
  };

  // Filters: Assessment vs Practice (Exercise), with sort
  const filtered = history
    .filter(item => {
      if (filter === 'All') return true;
      if (filter === 'Assessment') return !item.is_exercise;
      if (filter === 'Exercise') return item.is_exercise;
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.submitted_at || a.recorded_at || 0);
      const db = new Date(b.submitted_at || b.recorded_at || 0);
      return sortOrder === 'desc' ? db - da : da - db;
    });

  // For exercise items, compute attempt number from sorted exercises for the same surah
  const getAttemptNumber = (item) => {
    if (!item.is_exercise) return null;
    const sameSubject = history
      .filter(r => r.is_exercise && r.surah_number === item.surah_number)
      .sort((a, b) => new Date(a.submitted_at || a.recorded_at || 0) - new Date(b.submitted_at || b.recorded_at || 0));
    const idx = sameSubject.findIndex(r => r.id === item.id);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* â”€â”€ Header â”€â”€ */}
      <LinearGradient
        colors={[P, PD]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1.5 }}>YOUR RECORDS</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginTop: 2 }}>Recitation History</Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="time" size={22} color={G} />
          </View>
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['All', 'Assessment', 'Exercise'].map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: filter === tab ? G : 'rgba(255,255,255,0.15)',
                borderWidth: 1, borderColor: filter === tab ? G : 'rgba(255,255,255,0.2)',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: filter === tab ? PD : 'rgba(255,255,255,0.85)' }}>
                {tab === 'Exercise' ? 'AI Practice' : tab}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
            style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} color="rgba(255,255,255,0.85)" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

        {/* History List */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={P} />
            <Text style={{ color: '#6B7280', marginTop: 12 }}>Loading history...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, alignItems: 'center', marginTop: 20 }}>
                <Ionicons name="time-outline" size={48} color={'#6B7280'} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: PD, marginTop: 12 }}>No Recitations Found</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4 }}>
                  {filter === 'All' ? 'You have not submitted any recitations yet.' : `No ${filter.toLowerCase()} recitations found.`}
                </Text>
              </View>
            ) : (
              filtered.map((item) => {
                const isExpanded = expandedId === item.id;
                const isPlaying = playingId === item.id;
                const attemptNo = getAttemptNumber(item);

                return (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: '#F0F0F0',
                      shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setExpandedId(isExpanded ? null : item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                          <View style={{
                            width: 42, height: 42, borderRadius: 12,
                            backgroundColor: item.is_exercise ? PL : GBg,
                            alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Ionicons
                              name={item.is_exercise ? "sparkles" : "ribbon"}
                              size={20}
                              color={item.is_exercise ? P : G}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 16, fontWeight: '800', color: PD }}>
                                {item.surah || `Surah ${item.surah_number}`}
                              </Text>
                              {item.is_exercise && attemptNo && (
                                <View style={{ backgroundColor: P + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: P }}>
                                    #{attemptNo}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                              Ayah {item.ayah || `${item.start_verse}â€“${item.end_verse}`} Â· {item.is_exercise ? 'AI Practice' : 'Official Assessment'}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                              {formatDate(item.submitted_at || item.recorded_at)}
                            </Text>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          {item.is_exercise ? (
                            <View style={{ backgroundColor: (item.score || 0) >= 70 ? PL : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: (item.score || 0) >= 70 ? P : '#92400E' }}>
                                {item.score || 0}%
                              </Text>
                            </View>
                          ) : (
                            <View style={{
                              backgroundColor: item.status === 'approved' ? '#D1FAE5' : item.status === 'repeat' ? '#FEE2E2' : '#FEF3C7',
                              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6
                            }}>
                              <Text style={{
                                fontSize: 10, fontWeight: '800',
                                color: item.status === 'approved' ? '#065F46' : item.status === 'repeat' ? RED : '#92400E'
                              }}>
                                {item.status === 'approved' ? 'APPROVED' : item.status === 'repeat' ? 'REPEAT' : 'PENDING'}
                              </Text>
                            </View>
                          )}
                          
                          {item.audio_url && (
                            <TouchableOpacity 
                              onPress={() => togglePlayAudio(item)}
                              style={{ 
                                width: 32, height: 32, borderRadius: 16, 
                                backgroundColor: isPlaying ? '#FFFBEB' : '#F3F4F6',
                                alignItems: 'center', justifyContent: 'center'
                              }}
                            >
                              <Ionicons name={isPlaying ? "pause" : "play"} size={16} color={isPlaying ? G : P} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Expandable detail section */}
                    {isExpanded && (
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                        {/* AI Breakdown (Exercise) */}
                        {item.is_exercise && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {[
                              { label: 'Memorization', val: item.memorization_score },
                              { label: 'Pronunciation', val: item.pronunciation_score },
                              { label: 'Tajweed', val: item.tajwid_score ?? item.tajeed_score },
                              { label: 'Fluency', val: item.fluency_score },
                            ].filter(m => m.val !== undefined && m.val !== null).map(m => (
                              <View key={m.label} style={{ backgroundColor: '#F7FAF7', padding: 8, borderRadius: 8, flex: 1, minWidth: '44%' }}>
                                <Text style={{ fontSize: 10, color: '#6B7280' }}>{m.label}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: PD }}>{m.val}%</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Teacher feedback */}
                        {item.feedback && (
                          <View>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: item.is_exercise ? P : G, marginBottom: 2 }}>
                              {item.is_exercise ? 'AI Suggestions:' : 'Teacher Feedback:'}
                            </Text>
                            <Text style={{ fontSize: 13, color: '#6B7280', lineHeight: 18 }}>{item.feedback}</Text>
                          </View>
                        )}

                        {/* View Evaluation button â€” official assessed submissions only */}
                        {!item.is_exercise && item.reviewed && (
                          <TouchableOpacity
                            onPress={() => navigation.navigate('TeacherEvaluation', { recitation: item })}
                            style={{
                              marginTop: 12, flexDirection: 'row', alignItems: 'center',
                              justifyContent: 'center', gap: 6,
                              backgroundColor: P, paddingVertical: 10,
                              borderRadius: 10,
                            }}
                          >
                            <Ionicons name="ribbon-outline" size={16} color="white" />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: 'white' }}>
                              View Teacher Evaluation
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}

