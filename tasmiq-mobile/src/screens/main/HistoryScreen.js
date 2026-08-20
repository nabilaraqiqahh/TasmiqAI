import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { getRecitationHistory } from '../../services/recitationService';
import { getCurrentUser } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

const { width: SCREEN_W } = Dimensions.get('window');

const P = {
  primary: '#0B6E4F',
  accent: '#D4AF37',
  gold: '#D4AF37',
  red: '#DC2626',
  card: '#FFFFFF',
  text: '#1A2E1C',
  muted: '#6B7280',
  lightGreen: '#E8F5EC',
  bg: '#FEFCE8',
};

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

export default function HistoryScreen() {
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
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 10 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.text }}>Audio History</Text>
          <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Listen to your past Quran recitations</Text>
        </View>

        {/* Filter Tab Chips */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 16, gap: 8 }}>
          {['All', 'Assessment', 'Exercise'].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: filter === tab ? P.primary : C.card,
                borderWidth: 1, borderColor: filter === tab ? P.primary : '#E5E7EB',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: filter === tab ? '#FFFFFF' : C.muted }}>
                {tab === 'Exercise' ? 'AI Exercises' : tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort toggle */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 14, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600' }}>Sort by:</Text>
          <TouchableOpacity
            onPress={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.card, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
          >
            <Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={13} color={P.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: P.primary }}>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</Text>
          </TouchableOpacity>
        </View>

        {/* History List */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={P.primary} />
            <Text style={{ color: C.muted, marginTop: 12 }}>Loading history...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 32, alignItems: 'center', marginTop: 20 }}>
                <Ionicons name="time-outline" size={48} color={C.muted} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12 }}>No Recitations Found</Text>
                <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4 }}>
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
                      backgroundColor: C.card,
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
                            backgroundColor: item.is_exercise ? P.lightGreen : P.goldBg,
                            alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Ionicons
                              name={item.is_exercise ? "sparkles" : "ribbon"}
                              size={20}
                              color={item.is_exercise ? P.primary : P.accent}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 16, fontWeight: '800', color: P.text }}>
                                {item.surah || `Surah ${item.surah_number}`}
                              </Text>
                              {item.is_exercise && attemptNo && (
                                <View style={{ backgroundColor: P.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: P.primary }}>
                                    #{attemptNo}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                              Ayah {item.ayah || `${item.start_verse}–${item.end_verse}`} · {item.is_exercise ? 'AI Practice' : 'Official Assessment'}
                            </Text>
                            <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                              {formatDate(item.submitted_at || item.recorded_at)}
                            </Text>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          {item.is_exercise ? (
                            <View style={{ backgroundColor: (item.score || 0) >= 70 ? P.lightGreen : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: (item.score || 0) >= 70 ? P.primary : '#92400E' }}>
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
                                color: item.status === 'approved' ? '#065F46' : item.status === 'repeat' ? P.red : '#92400E'
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
                              <Ionicons name={isPlaying ? "pause" : "play"} size={16} color={isPlaying ? P.accent : P.primary} />
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
                                <Text style={{ fontSize: 10, color: P.muted }}>{m.label}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: P.text }}>{m.val}%</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Teacher feedback */}
                        {item.feedback && (
                          <View>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: item.is_exercise ? P.primary : P.accent, marginBottom: 2 }}>
                              {item.is_exercise ? 'AI Suggestions:' : 'Teacher Feedback:'}
                            </Text>
                            <Text style={{ fontSize: 13, color: C.muted, lineHeight: 18 }}>{item.feedback}</Text>
                          </View>
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
    </IslamicBackground>
  );
}
