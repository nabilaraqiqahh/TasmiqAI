import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, ActivityIndicator, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getUserProfile, getStudentAnnouncements, getCurrentUser } from '../../services/authService';
import { checkBackendConnection } from '../../services/api';
import { supabase } from '../../services/supabaseClient';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
import quranData from '../../data/quran_data.json';

function ActionCard({ icon, label, sublabel, color, onPress, themeColors: C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 14,
        flexDirection: 'row', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
      }}
    >
      <View style={{
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center', marginRight: 16,
      }}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 3 }}>{label}</Text>
        <Text style={{ fontSize: 13, color: C.muted }}>{sublabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const { t, language } = useLanguage();
  
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [backendOnline, setBackendOnline] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);

  useEffect(() => {
    if (notificationModalVisible && user?.id) {
      const loadNotifs = async () => {
        setNotifLoading(true);
        try {
          const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          if (!error && data) {
            setNotifications(data);
          }
        } catch (err) {
          console.error('[Dashboard] loadNotifs error:', err);
        } finally {
          setNotifLoading(false);
        }
      };
      loadNotifs();
    }
  }, [notificationModalVisible, user]);

  const handleNotifClick = async (notif) => {
    if (!notif.is_read) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notif.id);
        if (!error) {
          setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (!error) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const hour = new Date().getHours();
  
  const greeting = useMemo(() => {
    if (hour < 12) return t('dashboard.greeting');
    if (hour < 17) return t('dashboard.afternoon');
    return t('dashboard.evening');
  }, [hour, language]);

  // Random verse for the dashboard
  const randomSurah = useMemo(() => quranData[Math.floor(Math.random() * quranData.length)], []);
  const randomAyahNum = useMemo(() => Math.floor(Math.random() * randomSurah.count) + 1, [randomSurah]);
  const randomAyahText = randomSurah.verse[`verse_${randomAyahNum}`];

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          const session = await getCurrentUser();
          if (!session?.id) { setLoading(false); return; }
          setUser(session);

          const profile = await getUserProfile(session.id);
          setProfile(profile);

          const anns = await getStudentAnnouncements(session.id);
          setAnnouncements(anns || []);

          // Check backend and unread notifications
          const online = await checkBackendConnection();
          setBackendOnline(online);

          // Load unread notifications count
          const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', session.id)
            .eq('is_read', false);
          setUnreadCount(count || 0);
        } catch (err) {
          console.error('[Dashboard] load error:', err);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [])
  );

  const displayName = profile?.full_name || profile?.display_name || user?.user_metadata?.displayName || 'Student';
  const firstName = displayName.split(' ')[0];
  const streak = profile?.streak_days ?? 0;
  const sessions = profile?.total_sessions ?? 0;

  return (
    <IslamicBackground variant="full">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Backend offline warning */}
        {!backendOnline && (
          <View style={{
            backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14,
            marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            borderWidth: 1, borderColor: '#FDE68A',
          }}>
            <Ionicons name="warning-outline" size={20} color="#92400E" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: '#92400E', fontSize: 13 }}>
                AI Backend Not Reachable
              </Text>
              <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2, lineHeight: 18 }}>
                Tasmiq AI features (assessment, audio playback) need the backend server.
                Make sure your PC backend is running and your phone is on the same WiFi network.
              </Text>
            </View>
          </View>
        )}

        {/* Greeting Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500', marginBottom: 4 }}>السلام عليكم</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: C.text }}>
              {greeting}, {loading ? '...' : firstName} 👋
            </Text>
            <Text style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{t('dashboard.ready')}</Text>
          </View>
          
          <TouchableOpacity
            onPress={() => setNotificationModalVisible(true)}
            activeOpacity={0.8}
            style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
              position: 'relative', marginTop: 10
            }}
          >
            <Ionicons name="notifications-outline" size={24} color={C.text} />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute', top: -2, right: -2,
                backgroundColor: '#EF4444', borderRadius: 10,
                minWidth: 20, height: 20, paddingHorizontal: 5,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: C.bg
              }}>
                <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Nudge Card — replaces streak */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Nudge')}
          style={{
            backgroundColor: '#047857',
            borderRadius: 20, padding: 22, marginBottom: 28,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 4 }}>
              Nudge System
            </Text>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>
              Remind classmates 🌿
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>
              {sessions} total sessions
            </Text>
          </View>
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 50,
            width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 28 }}>💬</Text>
          </View>
        </TouchableOpacity>

        {/* Announcements Section */}
        {announcements.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 1.5 }}>CLASS ANNOUNCEMENTS</Text>
              {unreadCount > 0 && (
                <View style={{ backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{unreadCount} new</Text>
                </View>
              )}
            </View>
            {announcements.map((ann) => (
              <View key={ann.id} style={{
                backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 12,
                borderLeftWidth: 4, borderLeftColor: C.gold,
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="megaphone" size={16} color={C.gold} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, flex: 1 }}>{ann.title}</Text>
                </View>
                <Text style={{ fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 10 }}>{ann.content}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#AAAAAA', fontWeight: '600' }}>
                    {ann.classes?.name} • {ann.classes?.teacher_name || 'Teacher'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#AAAAAA' }}>{new Date(ann.created_at).toLocaleDateString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 1.5, marginBottom: 14 }}>{t('dashboard.quickActions')}</Text>
        <ActionCard icon="business" label="Join Class" sublabel="Enter teacher's code to enroll" color={C.lilac} onPress={() => navigation.navigate('JoinClass')} themeColors={C} />
        <ActionCard icon="mic" label="Tasmiq (Assessment)" sublabel="Record and get AI feedback" color={C.primary} onPress={() => navigation.navigate('TasmiqPrep')} themeColors={C} />
        <ActionCard icon="refresh-circle" label={t('dashboard.murajaah')} sublabel="Review and revise memorized verses" color="#4A90A4" onPress={() => navigation.navigate('MurajaahMode')} themeColors={C} />
        <ActionCard icon="bar-chart" label={t('dashboard.progress')} sublabel="Track your improvement over time" color={C.accent} onPress={() => navigation.navigate('Progress')} themeColors={C} />

        {/* Today's Verse */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 1.5, marginBottom: 14, marginTop: 10 }}>{t('dashboard.todaysVerse')}</Text>
        <View style={{
          backgroundColor: C.card, borderRadius: 18, padding: 22,
          borderLeftWidth: 4, borderLeftColor: C.accent,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{ fontSize: 20, textAlign: 'right', color: C.text, lineHeight: 40, marginBottom: 10, fontWeight: '500' }}>
            {randomAyahText}
          </Text>
          <Text style={{ fontSize: 13, color: C.muted }}>{randomSurah.name} • Ayah {randomAyahNum}</Text>
        </View>

        </ScrollView>

        {/* 🔔 Notification Center Modal */}
        <Modal
          visible={notificationModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setNotificationModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: C.card,
              borderTopLeftRadius: 30, borderTopRightRadius: 30,
              padding: 24, maxHeight: '80%', minHeight: '50%',
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: C.text }}>Notification Center</Text>
                <TouchableOpacity onPress={() => setNotificationModalVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
              </View>

              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllAsRead}
                  style={{ alignSelf: 'flex-end', marginBottom: 12 }}
                >
                  <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>Mark all as read</Text>
                </TouchableOpacity>
              )}

              {notifLoading ? (
                <ActivityIndicator size="large" color={C.primary} style={{ marginVertical: 40 }} />
              ) : notifications.length === 0 ? (
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
                  <Ionicons name="notifications-off-outline" size={48} color={C.muted} style={{ marginBottom: 12 }} />
                  <Text style={{ color: C.muted, fontSize: 14 }}>No notifications yet</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {notifications.map((notif) => (
                    <TouchableOpacity
                      key={notif.id}
                      onPress={() => handleNotifClick(notif)}
                      activeOpacity={0.8}
                      style={{
                        padding: 16, borderRadius: 14, marginBottom: 12,
                        backgroundColor: notif.is_read ? C.bg + '50' : C.primary + '08',
                        borderLeftWidth: 4,
                        borderLeftColor: notif.is_read ? '#CCCCCC' : C.primary,
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: notif.is_read ? '#EAE3D5' : C.primary + '18',
                        alignItems: 'center', justifyContent: 'center', marginTop: 2
                      }}>
                        <Ionicons name="megaphone-outline" size={18} color={notif.is_read ? '#999999' : C.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: notif.is_read ? '600' : '800', color: C.text, marginBottom: 4 }}>
                          {notif.title}
                        </Text>
                        {notif.body && (
                          <Text style={{ fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 6 }}>
                            {notif.body}
                          </Text>
                        )}
                        <Text style={{ fontSize: 11, color: '#AAAAAA' }}>
                          {new Date(notif.created_at).toLocaleString()}
                        </Text>
                      </View>
                      {!notif.is_read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 6 }} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </IslamicBackground>
  );
}
