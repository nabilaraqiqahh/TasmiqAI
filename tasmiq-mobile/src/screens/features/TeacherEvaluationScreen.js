/**
 * TeacherEvaluationScreen.js
 * ─────────────────────────────────────────────────────────────────
 * Displays the teacher's official evaluation for a specific Tasmiq
 * assessment. Navigated to when a student taps a
 * TEACHER_TASMIQ_EVALUATION notification.
 *
 * Route params (either):
 *   { recitationId }  — from notification deep-link
 *   { recitation }    — full object passed directly (history screen)
 * ─────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { supabase } from '../../services/supabaseClient';
import { getCurrentUser } from '../../services/authService';
import { markAsRead } from '../../services/notificationService';
import { useTheme } from '../../context/ThemeContext';

// ── helpers ──────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
}

function StatusBadge({ status }) {
  const isPass   = status === 'PASS'   || status === 'approved';
  const isRepeat = status === 'REPEAT' || status === 'repeat';
  const bg    = isPass ? '#D1FAE5' : isRepeat ? '#FEE2E2' : '#FEF3C7';
  const color = isPass ? '#065F46' : isRepeat ? '#B91C1C' : '#92400E';
  const label = isPass ? 'PASS'    : isRepeat ? 'REPEAT'  : 'PENDING';
  const icon  = isPass ? 'checkmark-circle' : isRepeat ? 'refresh-circle' : 'time-outline';

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: bg, paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 12,
    }}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={{ fontSize: 15, fontWeight: '900', color }}>{label}</Text>
    </View>
  );
}

// ── component ────────────────────────────────────────────────────
export default function TeacherEvaluationScreen({ navigation, route }) {
  const { isDark, colors: C } = useTheme();

  // Params: from notification deep-link or history navigation
  const {
    recitationId: paramRecitationId,
    recitation:   paramRecitation,
    notificationId,   // mark this notification as read on open
  } = route?.params || {};

  const [recitation, setRecitation] = useState(paramRecitation || null);
  const [teacherName, setTeacherName] = useState('');
  const [loading, setLoading]   = useState(!paramRecitation);
  const [playingAudio, setPlayingAudio] = useState(false);
  const soundRef = useRef(null);

  // ── Load recitation + teacher name ─────────────────────────────
  useEffect(() => {
    const load = async () => {
      // Determine the recitation ID to fetch
      const recId = paramRecitationId || paramRecitation?.id;
      if (!recId) { setLoading(false); return; }

      setLoading(true);
      try {
        // Security: verify the recitation belongs to this student
        const session = await getCurrentUser();
        if (!session?.id) {
          Alert.alert('Not logged in', 'Please log in to view your evaluation.');
          navigation.goBack();
          return;
        }

        const { data, error } = await supabase
          .from('recitations')
          .select('*')
          .eq('id', recId)
          .eq('user_id', session.id)  // ownership check — student can only see their own
          .maybeSingle();

        if (error || !data) {
          console.error('[TeacherEvaluation] fetch error:', error?.message);
          Alert.alert('Not found', 'Could not load this assessment.');
          navigation.goBack();
          return;
        }

        setRecitation(data);

        // Fetch teacher's display name if teacher_id is present
        if (data.teacher_id) {
          const { data: teacherRow } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', data.teacher_id)
            .maybeSingle();

          setTeacherName(teacherRow?.full_name || 'Your Teacher');
        } else {
          setTeacherName('Your Teacher');
        }

        // Mark the originating notification as read
        if (notificationId) {
          await markAsRead(notificationId, session.id);
        }
      } catch (err) {
        console.error('[TeacherEvaluation] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [paramRecitationId, paramRecitation?.id]);

  // ── Audio playback ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const toggleAudio = async () => {
    if (!recitation?.audio_url) {
      Alert.alert('No Audio', 'No audio recording is available for this assessment.');
      return;
    }
    try {
      if (playingAudio && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingAudio(false);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingAudio(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: recitation.audio_url },
        { shouldPlay: true },
        (status) => {
          if (status.didJustFinish) setPlayingAudio(false);
        }
      );
      soundRef.current = sound;
    } catch (err) {
      console.error('Audio playback error:', err);
      setPlayingAudio(false);
      Alert.alert('Playback Error', 'Could not play audio.');
    }
  };

  // ── Resolve display values ──────────────────────────────────────
  const surahLabel   = recitation?.surah    || `Surah ${recitation?.surah_number || ''}`;
  const ayahLabel    = recitation?.ayah     || `${recitation?.start_verse || ''}–${recitation?.end_verse || ''}`;
  const evalStatus   = recitation?.teacher_status || recitation?.status || 'pending';
  const evalFeedback = recitation?.teacher_feedback
    || (recitation?.feedback || '')
        .replace(/^\[PASS\]\s*/i, '')
        .replace(/^\[REPEAT REQUIRED\]\s*/i, '')
        .trim()
    || '';
  const assessmentDate = recitation?.reviewed_at || recitation?.submitted_at;

  // ── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      
          <ActivityIndicator size="large" color="#0B6E4F" />
          <Text style={{ color: '#6B7280', marginTop: 12, fontSize: 14 }}>Loading evaluation…</Text>
        </SafeAreaView>
      
    );
  }

  if (!recitation) {
    return (
      
          <Ionicons name="alert-circle-outline" size={56} color={'#6B7280'} />
          <Text style={{ color: '#064E3B', fontSize: 18, fontWeight: '800', marginTop: 16 }}>
            Evaluation Not Found
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
            This assessment could not be loaded.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#0B6E4F', borderRadius: 14 }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      
    );
  }

  const isPass   = evalStatus === 'PASS'   || evalStatus === 'approved';
  const isRepeat = evalStatus === 'REPEAT' || evalStatus === 'repeat';

  return (
    
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* ── Header ────────────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
          borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
          gap: 12,
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: '#0B6E4F12',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#0B6E4F" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: '#064E3B' }}>
              Teacher Evaluation
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
              Official Assessment Result
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Status Banner ───────────────────────────────────── */}
          <View style={{
            borderRadius: 20, padding: 24,
            backgroundColor: isPass ? '#D1FAE5' : isRepeat ? '#FEE2E2' : '#FEF3C7',
            alignItems: 'center', marginBottom: 24,
            borderWidth: 1,
            borderColor: isPass ? '#A7F3D0' : isRepeat ? '#FCA5A5' : '#FDE68A',
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: isPass ? '#065F4620' : isRepeat ? '#B91C1C20' : '#92400E20',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Ionicons
                name={isPass ? 'checkmark-circle' : isRepeat ? 'refresh-circle' : 'time-outline'}
                size={36}
                color={isPass ? '#065F46' : isRepeat ? '#B91C1C' : '#92400E'}
              />
            </View>
            <Text style={{
              fontSize: 13, fontWeight: '700',
              color: isPass ? '#065F46' : isRepeat ? '#B91C1C' : '#92400E',
              marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase',
            }}>
              Assessment Status
            </Text>
            <StatusBadge status={evalStatus} />
            {isPass && (
              <Text style={{ color: '#065F46', fontSize: 13, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
                Congratulations! Your recitation has been approved by your teacher.
              </Text>
            )}
            {isRepeat && (
              <Text style={{ color: '#B91C1C', fontSize: 13, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
                Your teacher has reviewed your recitation and requested a re-recording. Please read the feedback below.
              </Text>
            )}
          </View>

          {/* ── Assessment Info ──────────────────────────────────── */}
          <View style={{
            backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20,
            marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB',
            shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 1.2, marginBottom: 14, textTransform: 'uppercase' }}>
              Assessment Details
            </Text>

            {[
              { icon: 'book-outline',     label: 'Surah',      value: surahLabel },
              { icon: 'list-outline',     label: 'Ayah',       value: ayahLabel },
              { icon: 'person-outline',   label: 'Teacher',    value: teacherName || 'Your Teacher' },
              { icon: 'calendar-outline', label: 'Evaluated',  value: formatDate(assessmentDate) },
            ].map((row, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 10,
                borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: '#F0F0F0',
              }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: '#0B6E4F12',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={row.icon} size={18} color="#0B6E4F" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '600' }}>{row.label}</Text>
                  <Text style={{ fontSize: 14, color: '#064E3B', fontWeight: '700', marginTop: 1 }}>{row.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Teacher Feedback ─────────────────────────────────── */}
          {evalFeedback ? (
            <View style={{
              backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20,
              marginBottom: 16, borderWidth: 1,
              borderColor: isRepeat ? '#FCA5A5' : '#E5E7EB',
              borderLeftWidth: 4,
              borderLeftColor: isPass ? '#0B6E4F' : isRepeat ? '#EF4444' : '#D4AF37',
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={isRepeat ? '#EF4444' : '#0B6E4F'} />
                <Text style={{
                  fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase',
                  color: isRepeat ? '#B91C1C' : '#065F46',
                }}>
                  Teacher Feedback
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: '#064E3B', lineHeight: 22 }}>
                {evalFeedback}
              </Text>
            </View>
          ) : null}

          {/* ── Audio Playback ───────────────────────────────────── */}
          {recitation?.audio_url ? (
            <View style={{
              backgroundColor: '#032D20', borderRadius: 18, padding: 20,
              marginBottom: 16,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: 14, textTransform: 'uppercase' }}>
                Your Recording
              </Text>
              <TouchableOpacity
                onPress={toggleAudio}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  backgroundColor: playingAudio ? '#D4AF37' : '#0B6E4F',
                  paddingVertical: 16, borderRadius: 14,
                }}
              >
                <Ionicons name={playingAudio ? 'pause-circle' : 'play-circle'} size={22} color="white" />
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>
                  {playingAudio ? 'Pause Recording' : 'Listen to Your Recording'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ── Action: Re-record button (REPEAT only) ───────────── */}
          {isRepeat && (
            <TouchableOpacity
              onPress={() => navigation.navigate('TasmiqPrep')}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: '#0B6E4F', paddingVertical: 18, borderRadius: 16, marginBottom: 12,
              }}
            >
              <Ionicons name="mic" size={20} color="white" />
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>
                Start New Recording
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Back to Dashboard ────────────────────────────────── */}
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 16,
              borderWidth: 1.5, borderColor: '#0B6E4F',
            }}
          >
            <Ionicons name="home-outline" size={18} color="#0B6E4F" />
            <Text style={{ color: '#0B6E4F', fontSize: 15, fontWeight: '800' }}>
              Back to Dashboard
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    
  );
}
