import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Modal, Image, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserProfile, getStudentAnnouncements, getCurrentUser } from '../../services/authService';
import { checkBackendConnection } from '../../services/api';
import { getRecitationHistory } from '../../services/recitationService';
import {
  getStudentNotifications, getUnreadCount, markAsRead,
  markAllAsRead, subscribeToNotifications,
  isEvaluationNotification, getEvaluationRecitationId,
} from '../../services/notificationService';
import { useTheme } from '../../context/ThemeContext';
import quranData from '../../data/quran_data.json';

// ── Design tokens ──────────────────────────────────────────────────────────────
const P  = '#0B6E4F';
const PD = '#064E3B';
const PL = '#D1FAE5';
const G  = '#D4AF37';
const BG = '#FFFDF0';
const CARD = '#FFFFFF';
const RED  = '#DC2626';

function useGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Animated pulse dot for notification bell ───────────────────────────────────
function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.5, duration: 600, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', top: 7, right: 7,
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: RED, borderWidth: 2, borderColor: BG,
      transform: [{ scale }],
    }} />
  );
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ text, action, onAction }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {text}
      </Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: P }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Recent activity row ────────────────────────────────────────────────────────
function ActivityRow({ item, isLast }) {
  const passed = (item.score || 0) >= 70;
  const isExercise = item.is_exercise;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#F3F4F6' }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isExercise ? PL : '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <Ionicons name={isExercise ? 'sparkles' : 'ribbon'} size={18} color={isExercise ? P : G} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: PD }}>
          {item.surah || `Surah ${item.surah_number}`}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
          {isExercise ? 'AI Practice' : 'Official Assessment'} · Ayah {item.ayah || `${item.start_verse}–${item.end_verse}`}
        </Text>
      </View>
      {isExercise ? (
        <View style={{ backgroundColor: passed ? PL : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: passed ? '#065F46' : '#92400E' }}>
            {item.score || 0}%
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: item.status === 'approved' ? PL : item.status === 'repeat' ? '#FEE2E2' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: item.status === 'approved' ? '#065F46' : item.status === 'repeat' ? RED : '#92400E' }}>
            {item.status === 'approved' ? 'PASS' : item.status === 'repeat' ? 'REPEAT' : 'PENDING'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const { colors: C } = useTheme();
  const greeting = useGreeting();

  const [profile,       setProfile]       = useState(null);
  const [user,          setUser]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [recentActivity,setRecentActivity]= useState([]);
  const [backendOnline, setBackendOnline] = useState(true);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading,  setNotifLoading]  = useState(false);
  const [notifVisible,  setNotifVisible]  = useState(false);

  const userRef = useRef(null);

  // Notification modal load
  useEffect(() => {
    if (!notifVisible || !userRef.current?.id) return;
    setNotifLoading(true);
    getStudentNotifications(userRef.current.id)
      .then(d => setNotifications(d || []))
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, [notifVisible]);

  // Realtime subscription
  useEffect(() => {
    let cleanup = () => {};
    getCurrentUser().then(s => {
      if (!s?.id) return;
      cleanup = subscribeToNotifications(s.id, n => {
        setNotifications(prev => [n, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    });
    return () => cleanup();
  }, []);

  const handleNotifClick = async (notif) => {
    if (!notif.is_read && userRef.current?.id) {
      await markAsRead(notif.id, userRef.current.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (isEvaluationNotification(notif)) {
      const rid = getEvaluationRecitationId(notif);
      if (rid) {
        setNotifVisible(false);
        setTimeout(() => navigation.navigate('TeacherEvaluation', { recitationId: rid, notificationId: notif.id }), 300);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!userRef.current?.id) return;
    await markAllAsRead(userRef.current.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  // Data load
  useFocusEffect(useCallback(() => {
    const load = async () => {
      try {
        const session = await getCurrentUser();
        if (!session?.id) { setLoading(false); return; }
        setUser(session);
        userRef.current = session;

        const [prof, anns, online, count, history] = await Promise.all([
          getUserProfile(session.id),
          getStudentAnnouncements(session.id),
          checkBackendConnection(),
          getUnreadCount(session.id),
          getRecitationHistory(session.id).catch(() => []),
        ]);

        setProfile(prof);
        setAnnouncements(anns || []);
        setBackendOnline(online);
        setUnreadCount(count);
        setRecentActivity(Array.isArray(history) ? history.slice(0, 3) : []);
      } catch (err) {
        console.error('[Dashboard]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []));

  // Derived
  const firstName = (profile?.full_name || user?.full_name || 'Student').split(' ')[0];
  const streak    = profile?.streak_days        ?? 0;
  const sessions  = profile?.total_sessions     ?? 0;
  const avgScore  = profile?.avg_score          ?? 0;
  const progress  = profile?.progress_percentage ?? 0;

  // Verse of the day (stable per mount)
  const verse = useMemo(() => {
    const s = quranData[Math.floor(Math.random() * quranData.length)];
    const a = Math.floor(Math.random() * s.count) + 1;
    return { surah: s, ayah: a, text: s.verse[`verse_${a}`] };
  }, []);

  // Latest teacher feedback (first non-exercise with feedback)
  const latestFeedback = useMemo(() => {
    return recentActivity.find(r => !r.is_exercise && r.feedback && r.reviewed);
  }, [recentActivity]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={{ paddingBottom: 56 }} showsVerticalScrollIndicator={false}>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1 — GREETING + STATS (answers: "What is my progress?")
            ════════════════════════════════════════════════════════════════════ */}
        <LinearGradient
          colors={[P, PD]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          {/* Top bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Image source={require('../../../assets/logo.jpg')} style={{ width: 34, height: 34 }} resizeMode="contain" />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '800' }}>
                Tasmiq<Text style={{ color: G }}>AI</Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setNotifVisible(true)}
              style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="notifications-outline" size={22} color="white" />
              {unreadCount > 0 && <PulseDot />}
            </TouchableOpacity>
          </View>

          {/* Greeting */}
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 2 }}>السلام عليكم</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 2 }}>
            {greeting}, {loading ? '…' : firstName} 👋
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 18 }}>
            Recite. Improve. Grow.
          </Text>

          {/* Progress bar */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' }}>Memorization Progress</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{progress}%</Text>
            </View>
            <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.min(progress, 100)}%`, backgroundColor: G, borderRadius: 4 }} />
            </View>
          </View>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {[
              { label: 'Sessions', value: sessions, icon: 'mic-outline' },
              { label: 'Day Streak', value: `${streak} 🔥`, icon: 'flame-outline' },
              { label: 'Avg Score', value: `${avgScore}%`, icon: 'star-outline' },
            ].map(s => (
              <View key={s.label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>{s.value}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20 }}>

          {/* Backend offline warning */}
          {!backendOnline && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14, marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
              <Ionicons name="warning-outline" size={18} color="#92400E" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: '#92400E', fontSize: 13 }}>AI Backend Offline</Text>
                <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>AI assessment unavailable. Start your local backend or check internet.</Text>
              </View>
            </View>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 2 — PRIMARY LEARNING ACTIONS (answers: "What should I do next?")
              Priority: TASMIQ first, then MURAJAAH
              ════════════════════════════════════════════════════════════════════ */}
          <View style={{ marginTop: 22 }}>
            <SectionLabel text="Start Learning" />

            {/* TASMIQ — primary, larger card */}
            <TouchableOpacity
              onPress={() => navigation.navigate('TasmiqPrep')}
              activeOpacity={0.88}
              style={{ marginBottom: 12 }}
            >
              <LinearGradient
                colors={[P, PD]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center' }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                  <Ionicons name="mic" size={28} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFFFFF' }}>Tasmiq</Text>
                    <View style={{ backgroundColor: G + '40', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: G }}>CORE</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>AI Practice · Official Assessment</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
              </LinearGradient>
            </TouchableOpacity>

            {/* MURAJAAH — secondary */}
            <TouchableOpacity
              onPress={() => navigation.navigate('MurajaahMode')}
              activeOpacity={0.88}
            >
              <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E8F5EC', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: PL, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                  <Ionicons name="book-outline" size={24} color={P} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: PD, marginBottom: 3 }}>Murajaah</Text>
                  <Text style={{ fontSize: 13, color: '#6B7280' }}>Self Revision · Practice Independently</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CCCCCC" />
              </View>
            </TouchableOpacity>
          </View>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 3 — TASMIQ FLOW GUIDE (answers: "Did I pass? What's next?")
              Shows the AI → Official progression clearly
              ════════════════════════════════════════════════════════════════════ */}
          <View style={{ marginTop: 22 }}>
            <SectionLabel text="Your Tasmiq Journey" action="View Progress" onAction={() => navigation.navigate('Progress')} />
            <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              {/* Step indicators */}
              {[
                { step: 1, icon: 'sparkles', label: 'AI Practice', desc: 'Score 70%+ to unlock official', color: P, bg: PL },
                { step: 2, icon: 'ribbon', label: 'Official Assessment', desc: 'Submitted to teacher', color: G, bg: '#FEF3C7' },
                { step: 3, icon: 'checkmark-circle', label: 'Fully Passed', desc: 'Teacher marks PASS', color: '#059669', bg: '#D1FAE5' },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: i < 2 ? 14 : 0 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: PD }}>{item.label}</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{item.desc}</Text>
                  </View>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#6B7280' }}>{item.step}</Text>
                  </View>
                  {i < 2 && (
                    <View style={{ position: 'absolute', left: 18, top: 38, width: 2, height: 14, backgroundColor: '#E8F0EA' }} />
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 4 — TEACHER FEEDBACK (answers: "Has my teacher reviewed?")
              ════════════════════════════════════════════════════════════════════ */}
          {latestFeedback && (
            <View style={{ marginTop: 22 }}>
              <SectionLabel text="Teacher Feedback" action="View All" onAction={() => navigation.navigate('History')} />
              <TouchableOpacity
                onPress={() => navigation.navigate('TeacherEvaluation', { recitation: latestFeedback })}
                activeOpacity={0.88}
                style={{ backgroundColor: CARD, borderRadius: 20, padding: 18, borderLeftWidth: 4, borderLeftColor: latestFeedback.status === 'approved' ? P : RED, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: latestFeedback.status === 'approved' ? PL : '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ionicons name={latestFeedback.status === 'approved' ? 'checkmark-circle' : 'refresh-circle'} size={20} color={latestFeedback.status === 'approved' ? P : RED} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: PD }}>
                      {latestFeedback.surah || `Surah ${latestFeedback.surah_number}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>Teacher reviewed your recitation</Text>
                  </View>
                  <View style={{ backgroundColor: latestFeedback.status === 'approved' ? PL : '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: latestFeedback.status === 'approved' ? '#065F46' : RED }}>
                      {latestFeedback.status === 'approved' ? 'PASS' : 'REPEAT'}
                    </Text>
                  </View>
                </View>
                {latestFeedback.feedback && (
                  <Text style={{ fontSize: 13, color: '#6B7280', fontStyle: 'italic', lineHeight: 20 }} numberOfLines={2}>
                    "{latestFeedback.feedback}"
                  </Text>
                )}
                <Text style={{ fontSize: 11, color: P, fontWeight: '700', marginTop: 8 }}>Tap to view full evaluation →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Notification banner if unread but no feedback yet */}
          {unreadCount > 0 && !latestFeedback && (
            <TouchableOpacity
              onPress={() => setNotifVisible(true)}
              style={{ marginTop: 22, backgroundColor: PL, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="notifications" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: PD }}>
                  {unreadCount} New Notification{unreadCount > 1 ? 's' : ''}
                </Text>
                <Text style={{ fontSize: 12, color: P, marginTop: 1 }}>Tap to view teacher feedback</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={P} />
            </TouchableOpacity>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 5 — RECENT ACTIVITY (answers: "What have I completed?")
              ════════════════════════════════════════════════════════════════════ */}
          <View style={{ marginTop: 22 }}>
            <SectionLabel text="Recent Activity" action="See All" onAction={() => navigation.navigate('History')} />
            <View style={{ backgroundColor: CARD, borderRadius: 20, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              {loading ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <ActivityIndicator color={P} />
                </View>
              ) : recentActivity.length === 0 ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={36} color="#D1D5DB" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, color: '#9CA3AF', fontWeight: '600' }}>No activity yet</Text>
                  <Text style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4, textAlign: 'center' }}>
                    Start your first Tasmiq session above
                  </Text>
                </View>
              ) : (
                recentActivity.map((item, idx) => (
                  <ActivityRow key={item.id || idx} item={item} isLast={idx === recentActivity.length - 1} />
                ))
              )}
            </View>
          </View>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 6 — ANNOUNCEMENTS (secondary, below core learning)
              ════════════════════════════════════════════════════════════════════ */}
          {announcements.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <SectionLabel text="Announcements" />
              {announcements.slice(0, 2).map(ann => (
                <View key={ann.id} style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: G, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                    <Ionicons name="megaphone-outline" size={14} color={G} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: PD, flex: 1 }}>{ann.title}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#6B7280', lineHeight: 19 }} numberOfLines={2}>{ann.content}</Text>
                  <Text style={{ fontSize: 11, color: '#AAAAAA', marginTop: 6 }}>
                    {ann.classes?.name} · {new Date(ann.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 7 — VERSE OF THE DAY (decorative, bottom)
              ════════════════════════════════════════════════════════════════════ */}
          <View style={{ marginTop: 22 }}>
            <SectionLabel text="Verse of the Day" />
            <View style={{ backgroundColor: CARD, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 }}>
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="book" size={13} color={G} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
                  {verse.surah.name} · Ayah {verse.ayah}
                </Text>
              </View>
              <View style={{ padding: 20 }}>
                <Text style={{ fontSize: 20, textAlign: 'right', color: PD, lineHeight: 40 }}>{verse.text}</Text>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════════════
          NOTIFICATIONS MODAL
          ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={notifVisible} animationType="slide" transparent onRequestClose={() => setNotifVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%', paddingBottom: 32 }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: PD }}>Notifications</Text>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllRead}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: P }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setNotifVisible(false)}>
                  <Ionicons name="close-circle" size={28} color="#D1D5DB" />
                </TouchableOpacity>
              </View>
            </View>

            {notifLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={P} />
              </View>
            ) : notifications.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Ionicons name="notifications-outline" size={44} color="#D1D5DB" />
                <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>No notifications yet</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
                {notifications.map((notif) => (
                  <TouchableOpacity
                    key={notif.id}
                    onPress={() => handleNotifClick(notif)}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: notif.is_read ? CARD : PL,
                      borderRadius: 16, padding: 16, marginBottom: 10,
                      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                      borderWidth: 1, borderColor: notif.is_read ? '#E8F0EA' : P + '30',
                    }}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: notif.is_read ? '#F3F4F6' : P + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={isEvaluationNotification(notif) ? 'ribbon' : 'notifications'} size={18} color={notif.is_read ? '#9CA3AF' : P} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: notif.is_read ? '600' : '800', color: PD, marginBottom: 3 }}>
                        {notif.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 18 }} numberOfLines={2}>
                        {notif.body || notif.message}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                        {new Date(notif.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {!notif.is_read && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P, marginTop: 4 }} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
