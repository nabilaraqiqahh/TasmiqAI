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
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import quranData from '../../data/quran_data.json';

// -- Design tokens --------------------------------------------------------------
const PRIMARY   = '#0B6E4F';
const DARK_EM   = '#064E3B';
const GOLD      = '#D4AF37';
const GOLD_LIGHT = '#FDF6DC';
const BG        = '#FFFDF0';
const CARD      = '#FFFFFF';
const RED       = '#DC2626';

// -- Helper: time-of-day greeting -----------------------------------------------
function useGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// -- Small animated pulse dot (used on notification bell) ----------------------
function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', top: 8, right: 8,
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: RED,
      borderWidth: 2, borderColor: BG,
      transform: [{ scale }],
    }} />
  );
}

// -- Quick action tile ----------------------------------------------------------
function QuickTile({ icon, label, color, bgColor, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        flex: 1, backgroundColor: CARD, borderRadius: 20,
        padding: 18, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 }, elevation: 3,
        minHeight: 96,
      }}
    >
      <View style={{
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: bgColor, alignItems: 'center',
        justifyContent: 'center', marginBottom: 10,
      }}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F2937', textAlign: 'center', lineHeight: 18 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// -- Recent activity row --------------------------------------------------------
function ActivityRow({ item, C }) {
  const passed = (item.score || 0) >= 70;
  const isExercise = item.is_exercise;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: isExercise ? PRIMARY + '12' : GOLD + '18',
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Ionicons name={isExercise ? 'sparkles' : 'ribbon'} size={18} color={isExercise ? PRIMARY : GOLD} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#064E3B' }}>
          {item.surah || `Surah ${item.surah_number}`}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
          {isExercise ? 'AI Practice' : 'Official Assessment'} · Ayah {item.ayah || `${item.start_verse}–${item.end_verse}`}
        </Text>
      </View>
      {isExercise ? (
        <View style={{
          backgroundColor: passed ? '#D1FAE5' : '#FEF3C7',
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: passed ? '#065F46' : '#92400E' }}>
            {item.score || 0}%
          </Text>
        </View>
      ) : (
        <View style={{
          backgroundColor: item.status === 'approved' ? '#D1FAE5' : item.status === 'repeat' ? '#FEE2E2' : '#FEF3C7',
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
        }}>
          <Text style={{
            fontSize: 11, fontWeight: '800',
            color: item.status === 'approved' ? '#065F46' : item.status === 'repeat' ? RED : '#92400E',
          }}>
            {item.status === 'approved' ? 'PASS' : item.status === 'repeat' ? 'REPEAT' : 'PENDING'}
          </Text>
        </View>
      )}
    </View>
  );
}

// -- Main screen ----------------------------------------------------------------
export default function DashboardScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const { t } = useLanguage();
  const greeting = useGreeting();

  // -- State --------------------------------------------------------------------
  const [profile,   setProfile]   = useState(null);
  const [user,      setUser]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [backendOnline,  setBackendOnline]  = useState(true);
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [notifications,  setNotifications]  = useState([]);
  const [notifLoading,   setNotifLoading]   = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const userRef = useRef(null);

  // -- Notification modal load --------------------------------------------------
  useEffect(() => {
    if (!notifModalVisible || !userRef.current?.id) return;
    setNotifLoading(true);
    getStudentNotifications(userRef.current.id)
      .then(d => setNotifications(d))
      .catch(e => console.error('[Dashboard] notifs:', e))
      .finally(() => setNotifLoading(false));
  }, [notifModalVisible]);

  // -- Realtime notification subscription --------------------------------------
  useEffect(() => {
    let cleanup = () => {};
    getCurrentUser().then(s => {
      if (!s?.id) return;
      cleanup = subscribeToNotifications(s.id, (n) => {
        setNotifications(prev => [n, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    });
    return () => cleanup();
  }, []);

  // -- Notification tap ---------------------------------------------------------
  const handleNotifClick = async (notif) => {
    if (!notif.is_read && userRef.current?.id) {
      await markAsRead(notif.id, userRef.current.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (isEvaluationNotification(notif)) {
      const recitationId = getEvaluationRecitationId(notif);
      if (recitationId) {
        setNotifModalVisible(false);
        setTimeout(() => navigation.navigate('TeacherEvaluation', { recitationId, notificationId: notif.id }), 300);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!userRef.current?.id) return;
    await markAllAsRead(userRef.current.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  // -- Data load on screen focus ------------------------------------------------
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
        // Show up to 3 most recent items
        setRecentActivity(Array.isArray(history) ? history.slice(0, 3) : []);
      } catch (err) {
        console.error('[Dashboard] load:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []));

  // -- Derived values ------------------------------------------------------------
  const firstName  = (profile?.full_name || user?.full_name || 'Student').split(' ')[0];
  const streak     = profile?.streak_days        ?? 0;
  const sessions   = profile?.total_sessions     ?? 0;
  const avgScore   = profile?.avg_score          ?? 0;
  const progress   = profile?.progress_percentage ?? 0;

  // Quran verse of the day (stable per session)
  const verse = useMemo(() => {
    const s = quranData[Math.floor(Math.random() * quranData.length)];
    const a = Math.floor(Math.random() * s.count) + 1;
    return { surah: s, ayah: a, text: s.verse[`verse_${a}`] };
  }, []);

  // -----------------------------------------------------------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >

        {/* -- HEADER ----------------------------------------------------------- */}
        <LinearGradient
          colors={[PRIMARY, DARK_EM]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          {/* Top row: logo + name + notification */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Image
                  source={require('../../../assets/logo.jpg')}
                  style={{ width: 36, height: 36 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 }}>
                Tasmiq<Text style={{ color: GOLD }}>AI</Text>
              </Text>
            </View>

            {/* Notification bell */}
            <TouchableOpacity
              onPress={() => setNotifModalVisible(true)}
              activeOpacity={0.8}
              style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="notifications-outline" size={22} color="white" />
              {unreadCount > 0 && <PulseDot />}
            </TouchableOpacity>
          </View>

          {/* Greeting */}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>السلام عليكم</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginBottom: 2 }}>
            {greeting}, {loading ? '...' : firstName} 👋
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
            Recite. Improve. Grow.
          </Text>

          {/* Stats row */}
          <View style={{
            flexDirection: 'row', marginTop: 22, gap: 10,
          }}>
            {[
              { label: 'Sessions', value: sessions, icon: 'mic' },
              { label: 'Day Streak', value: streak,   icon: 'flame' },
              { label: 'Avg Score', value: `${avgScore}%`, icon: 'star' },
            ].map(stat => (
              <View key={stat.label} style={{
                flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 14, padding: 12, alignItems: 'center',
              }}>
                <Ionicons name={stat.icon} size={18} color={GOLD} style={{ marginBottom: 4 }} />
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900' }}>{stat.value}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600', marginTop: 1 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20 }}>

          {/* -- BACKEND OFFLINE BANNER ---------------------------------------- */}
          {!backendOnline && (
            <View style={{
              backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14,
              marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              borderWidth: 1, borderColor: '#FDE68A',
            }}>
              <Ionicons name="warning-outline" size={20} color="#92400E" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: '#92400E', fontSize: 13 }}>AI Backend Offline</Text>
                <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2, lineHeight: 18 }}>
                  AI assessment is unavailable. Check your internet connection.
                </Text>
              </View>
            </View>
          )}

          {/* -- TODAY'S PROGRESS CARD ----------------------------------------- */}
          <View style={{ marginTop: 22, backgroundColor: CARD, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1F2937' }}>Today's Progress</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Progress')}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>View Details →</Text>
              </TouchableOpacity>
            </View>
            {/* Progress bar */}
            <View style={{ height: 10, backgroundColor: '#F3F4F6', borderRadius: 6, overflow: 'hidden' }}>
              <View style={{ height: 10, width: `${Math.min(progress, 100)}%`, backgroundColor: PRIMARY, borderRadius: 6 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>Memorization progress</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: PRIMARY }}>{progress}%</Text>
            </View>
          </View>

          {/* -- QUICK ACTIONS ------------------------------------------------- */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', letterSpacing: 1.2, marginTop: 24, marginBottom: 14 }}>
            QUICK ACTIONS
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <QuickTile
              icon="refresh-circle"
              label="Murajaah"
              color="#0891B2"
              bgColor="#E0F2FE"
              onPress={() => navigation.navigate('MurajaahMode')}
            />
            <QuickTile
              icon="mic"
              label="Tasmiq"
              color={PRIMARY}
              bgColor={PRIMARY + '15'}
              onPress={() => navigation.navigate('TasmiqPrep')}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <QuickTile
              icon="bar-chart"
              label="Progress"
              color="#D97706"
              bgColor="#FEF3C7"
              onPress={() => navigation.navigate('Progress')}
            />
            <QuickTile
              icon="people"
              label="Nudge"
              color="#7C3AED"
              bgColor="#EDE9FE"
              onPress={() => navigation.navigate('Nudge')}
            />
          </View>

          {/* -- ANNOUNCEMENTS ------------------------------------------------- */}
          {announcements.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', letterSpacing: 1.2 }}>ANNOUNCEMENTS</Text>
                {unreadCount > 0 && (
                  <View style={{ backgroundColor: RED, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{unreadCount} new</Text>
                  </View>
                )}
              </View>
              {announcements.slice(0, 2).map(ann => (
                <View key={ann.id} style={{
                  backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 10,
                  borderLeftWidth: 4, borderLeftColor: GOLD,
                  shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                    <Ionicons name="megaphone" size={14} color={GOLD} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#1F2937', flex: 1 }}>{ann.title}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#6B7280', lineHeight: 19 }} numberOfLines={2}>{ann.content}</Text>
                  <Text style={{ fontSize: 11, color: '#AAAAAA', marginTop: 8 }}>
                    {ann.classes?.name} · {new Date(ann.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* -- RECENT ACTIVITY ----------------------------------------------- */}
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', letterSpacing: 1.2 }}>RECENT ACTIVITY</Text>
              <TouchableOpacity onPress={() => navigation.navigate('History')}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>See All →</Text>
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: CARD, borderRadius: 16, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              {loading ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <ActivityIndicator color={PRIMARY} />
                </View>
              ) : recentActivity.length === 0 ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={36} color="#D1D5DB" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, color: '#9CA3AF', fontWeight: '600' }}>No activity yet</Text>
                  <Text style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4, textAlign: 'center' }}>
                    Start your first Tasmiq or Murajaah session
                  </Text>
                </View>
              ) : (
                recentActivity.map((item, idx) => (
                  <ActivityRow key={item.id || idx} item={item} C={C} />
                ))
              )}
            </View>
          </View>

          {/* -- VERSE OF THE DAY ---------------------------------------------- */}
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', letterSpacing: 1.2, marginBottom: 14 }}>
              VERSE OF THE DAY
            </Text>
            <View style={{ backgroundColor: CARD, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 }}>
              <View style={{ backgroundColor: GOLD + '18', paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="book" size={14} color={GOLD} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
                  {verse.surah.name} · Ayah {verse.ayah}
                </Text>
              </View>
              <View style={{ padding: 20 }}>
                <Text style={{ fontSize: 22, textAlign: 'right', color: '#1F2937', lineHeight: 42, fontWeight: '500' }}>
                  {verse.text}
                </Text>
              </View>
            </View>
          </View>

          {/* -- JOIN CLASS CTA (shown if no announcements / first time) ------- */}
          <TouchableOpacity
            onPress={() => navigation.navigate('JoinClass')}
            activeOpacity={0.85}
            style={{
              marginTop: 20, flexDirection: 'row', alignItems: 'center',
              backgroundColor: CARD, borderRadius: 16, padding: 16,
              borderWidth: 1.5, borderColor: PRIMARY + '20',
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
            }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: PRIMARY + '12', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name="school" size={20} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>Join a Class</Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Enter your teacher's class code</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CCCCCC" />
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* -- NOTIFICATION CENTRE MODAL ------------------------------------------- */}
      <Modal
        visible={notifModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: CARD,
            borderTopLeftRadius: 32, borderTopRightRadius: 32,
            padding: 24, maxHeight: '82%', minHeight: '50%',
          }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#1F2937' }}>Notifications</Text>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllRead}>
                    <Text style={{ color: PRIMARY, fontSize: 13, fontWeight: '700' }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setNotifModalVisible(false)}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="close" size={18} color="#374151" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {notifLoading ? (
              <ActivityIndicator size="large" color={PRIMARY} style={{ marginVertical: 40 }} />
            ) : notifications.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" style={{ marginBottom: 12 }} />
                <Text style={{ color: '#9CA3AF', fontSize: 15, fontWeight: '600' }}>All caught up!</Text>
                <Text style={{ color: '#D1D5DB', fontSize: 13, marginTop: 4 }}>No notifications yet</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {notifications.map(notif => {
                  const isEval   = notif.type === 'TEACHER_TASMIQ_EVALUATION';
                  const isPass   = isEval && notif.title?.includes('Completed');
                  const isRepeat = isEval && notif.title?.includes('Re-record');
                  const accent   = isPass ? '#065F46' : isRepeat ? RED : PRIMARY;
                  const icon     = isPass ? 'checkmark-circle' : isRepeat ? 'refresh-circle' : 'megaphone-outline';

                  return (
                    <TouchableOpacity
                      key={notif.id}
                      onPress={() => handleNotifClick(notif)}
                      activeOpacity={0.8}
                      style={{
                        padding: 14, borderRadius: 14, marginBottom: 10,
                        backgroundColor: notif.is_read ? '#FAFAFA' : accent + '08',
                        borderLeftWidth: 3,
                        borderLeftColor: notif.is_read ? '#E5E7EB' : accent,
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: notif.is_read ? '#F3F4F6' : accent + '15',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={notif.is_read ? 'checkmark-outline' : icon} size={17} color={notif.is_read ? '#9CA3AF' : accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: notif.is_read ? '600' : '800', color: '#1F2937', marginBottom: 3 }}>
                          {notif.title}
                        </Text>
                        {notif.body ? (
                          <Text style={{ fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 4 }}>{notif.body}</Text>
                        ) : null}
                        {isEval && !notif.is_read && (
                          <Text style={{ fontSize: 11, color: accent, fontWeight: '700', marginBottom: 3 }}>
                            Tap to view evaluation →
                          </Text>
                        )}
                        <Text style={{ fontSize: 11, color: '#AAAAAA' }}>
                          {new Date(notif.created_at).toLocaleString()}
                        </Text>
                      </View>
                      {!notif.is_read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent, marginTop: 4 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
