import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Switch, Platform, Modal, TextInput, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabaseClient';
import {
  getUserProfile, logoutUser, updateUserProfile,
  changePassword, getCurrentUser, getStudentSettings, updateStudentSettings
} from '../../services/authService';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

export default function ProfileScreen({ navigation }) {
  const { isDark, toggleTheme, colors: C } = useTheme();
  const { language, changeLanguage, t } = useLanguage();

  // ── States ───────────────────────────────────────────────────────
  const [profile, setProfile]   = useState(null);
  const [user, setUser]         = useState(null);
  const [classes, setClasses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [nudgesSent, setNudgesSent] = useState(0);
  const [nudgesReceived, setNudgesReceived] = useState(0);

  // Notification Preferences
  const [notifs, setNotifs]     = useState({
    announcement: true,
    feedback:     true,
    nudge:        true,
    tasmiq:       true,
    murajaah:     true,
  });

  // Modals Visibility
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [pwdModalVisible, setPwdModalVisible]   = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  // Edit fields
  const [newName, setNewName]               = useState('');
  const [currentPwd, setCurrentPwd]         = useState('');
  const [newPwd, setNewPwd]                 = useState('');
  const [confirmPwd, setConfirmPwd]         = useState('');
  const [updating, setUpdating]             = useState(false);
  const [showCurrent, setShowCurrent]       = useState(false);
  const [showNew, setShowNew]               = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);

  // ── Load Data on Focus ───────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const load = async () => {
        setLoading(true);
        try {
          const session = await getCurrentUser();
          if (!session?.id) {
            if (isMounted) setLoading(false);
            return;
          }
          if (isMounted) setUser(session);

          // Get profile
          const userProf = await getUserProfile(session.id);
          if (isMounted) {
            setProfile(userProf);
            setNewName(userProf?.full_name || '');
          }

          // Get student settings (DB/AsyncStorage fallback)
          const settings = await getStudentSettings(session.id);
          if (isMounted && settings) {
            setNotifs({
              announcement: settings.notify_announcement !== false,
              feedback:     settings.notify_feedback     !== false,
              nudge:        settings.notify_nudge        !== false,
              tasmiq:       settings.notify_tasmiq       !== false,
              murajaah:     settings.notify_murajaah     !== false,
            });
          }

          // Fetch nudge analytics
          const { count: sentCount } = await supabase
            .from('nudges')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', session.id);
            
          const { count: receivedCount } = await supabase
            .from('nudges')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', session.id);

          if (isMounted) {
            setNudgesSent(sentCount || 0);
            setNudgesReceived(receivedCount || 0);
          }

          // Fetch enrolled classes
          const { data: memberships } = await supabase
            .from('class_members')
            .select('class_id, joined_at')
            .eq('student_id', session.id);

          let loadedClasses = [];
          if (memberships?.length) {
            const classIds = memberships.map(m => m.class_id);
            const { data: classData } = await supabase
              .from('classes')
              .select('id, name, class_code, unique_code, teacher_id')
              .in('id', classIds);

            // Get teacher names
            const teacherIds = [...new Set((classData || []).map(c => c.teacher_id).filter(Boolean))];
            let teacherMap = {};
            if (teacherIds.length) {
              const { data: teachers } = await supabase
                .from('users').select('id, full_name').in('id', teacherIds);
              (teachers || []).forEach(t => { teacherMap[t.id] = t.full_name; });
            }

            // Count classmates
            const countMap = {};
            for (const cid of classIds) {
              const { count } = await supabase
                .from('class_members')
                .select('*', { count: 'exact', head: true })
                .eq('class_id', cid);
              countMap[cid] = count || 0;
            }

            loadedClasses = (classData || []).map(c => {
              const membership = memberships.find(m => m.class_id === c.id);
              return {
                ...c,
                teacher_name:    teacherMap[c.teacher_id] || 'Teacher',
                total_classmates: countMap[c.id] || 0,
                joined_at:       membership?.joined_at,
                code:            c.unique_code || c.class_code || '—',
                status:          'approved',
              };
            });
          }

          // Check pending join requests (decoupled to avoid PGRST200 join cache errors)
          const { data: pending } = await supabase
            .from('join_requests')
            .select('class_id, status, created_at')
            .eq('student_id', session.id)
            .eq('status', 'pending');

          if (pending?.length) {
            const pendingClassIds = pending.map(p => p.class_id);
            const { data: pendingClasses } = await supabase
              .from('classes')
              .select('id, name')
              .in('id', pendingClassIds);

            const pendingClassMap = Object.fromEntries((pendingClasses || []).map(c => [c.id, c.name]));

            const mappedPending = pending.map(p => ({
              id: p.class_id,
              name: pendingClassMap[p.class_id] || 'Unknown Class',
              status: 'pending',
              joined_at: p.created_at,
              teacher_name: '—', total_classmates: 0, code: '—',
            }));

            loadedClasses = [...loadedClasses, ...mappedPending];
          }

          if (isMounted) setClasses(loadedClasses);
        } catch (err) {
          console.error('[ProfileScreen] load error:', err);
        } finally {
          if (isMounted) setLoading(false);
        }
      };

      load();
      return () => { isMounted = false; };
    }, [])
  );

  // ── Actions ──────────────────────────────────────────────────────
  const handleLogout = async () => {
    const doLogout = async () => {
      await logoutUser();
      navigation.replace('Welcome');
    };
    if (Platform.OS === 'web') {
      if (window.confirm(language === 'ms' ? 'Anda pasti ingin log keluar?' : 'Are you sure you want to logout?')) doLogout();
    } else {
      Alert.alert(
        language === 'ms' ? 'Log Keluar' : 'Logout',
        language === 'ms' ? 'Anda pasti ingin log keluar?' : 'Are you sure you want to logout?',
        [
          { text: language === 'ms' ? 'Batal' : 'Cancel', style: 'cancel' },
          { text: language === 'ms' ? 'Log Keluar' : 'Logout', style: 'destructive', onPress: doLogout }
        ]
      );
    }
  };

  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    setUpdating(true);
    try {
      await updateUserProfile(user.id, { full_name: newName.trim(), display_name: newName.trim() });
      setProfile(prev => ({ ...prev, full_name: newName.trim(), displayName: newName.trim() }));
      setNameModalVisible(false);
      Alert.alert(language === 'ms' ? "Berjaya" : "Success", language === 'ms' ? "Profil dikemas kini!" : "Profile updated successfully!");
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to update profile.");
    } finally {
      setUpdating(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Alert.alert("Error", language === 'ms' ? "Sila isi semua ruangan kata laluan." : "Please fill in all password fields.");
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert("Error", language === 'ms' ? "Kata laluan baru tidak sepadan." : "New password and confirmation do not match.");
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert("Error", language === 'ms' ? "Kata laluan mesti sekurang-kurangnya 6 aksara." : "New password must be at least 6 characters.");
      return;
    }

    setUpdating(true);
    try {
      await changePassword(user.id, currentPwd, newPwd);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setPwdModalVisible(false);
      Alert.alert(
        language === 'ms' ? "Berjaya" : "Success",
        language === 'ms' ? "Kata laluan dikemas kini berjaya." : "Password updated successfully."
      );
    } catch (err) {
      Alert.alert("Error", err.message || "Incorrect current password or update failed.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleNotif = async (key, val) => {
    const updated = { ...notifs, [key]: val };
    setNotifs(updated);
    try {
      await updateStudentSettings(user.id, {
        [`notify_${key}`]: val
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectLanguage = async (langCode) => {
    await changeLanguage(langCode);
    setLanguageModalVisible(false);
    try {
      await updateStudentSettings(user.id, { language: langCode });
    } catch (e) {
      console.error(e);
    }
  };

  // Helper translations
  const txt = {
    classInfo:     language === 'ms' ? 'Maklumat Kelas' : 'Class Information',
    noClass:       language === 'ms' ? 'Belum berdaftar dalam mana-mana kelas.' : 'Not enrolled in any class yet.',
    joinBtn:       language === 'ms' ? 'Sertai Kelas' : 'Join a Class',
    enrollDate:    language === 'ms' ? 'Tarikh Daftar' : 'Enrollment Date',
    teacher:       language === 'ms' ? 'Guru' : 'Teacher',
    classCode:     language === 'ms' ? 'Kod Kelas' : 'Class Code',
    classmates:    language === 'ms' ? 'Rakan Sekelas' : 'Classmates',
    student:       language === 'ms' ? 'Pelajar' : 'Student',
    status:        language === 'ms' ? 'Status' : 'Status',
    enrolled:      language === 'ms' ? 'Aktif' : 'Enrolled',
    pending:       language === 'ms' ? 'Menunggu Kelulusan' : 'Pending Approval',
    leaveBtn:      language === 'ms' ? 'Keluar Kelas' : 'Leave Class',
    leaveConfirm:  language === 'ms' ? 'Adakah anda pasti mahu keluar kelas?' : 'Are you sure you want to leave class?',
    profileInfo:   language === 'ms' ? 'Maklumat Profil' : 'Profile Information',
    fullName:      language === 'ms' ? 'Nama Penuh' : 'Full Name',
    email:         language === 'ms' ? 'Alamat Emel' : 'Email Address',
    editName:      language === 'ms' ? 'Kemas Kini Nama' : 'Edit Name',
    notifsTitle:   language === 'ms' ? 'Tetapan Notifikasi' : 'Notification Preferences',
    annNotif:      language === 'ms' ? 'Pengumuman Kelas' : 'Class Announcements',
    feedbackNotif: language === 'ms' ? 'Maklum Balas Guru' : 'Teacher Feedback',
    nudgeNotif:    language === 'ms' ? 'Notifikasi Nudge' : 'Nudge Notifications',
    tasmiqNotif:   language === 'ms' ? 'Kemaskini Tasmiq' : 'Tasmiq Updates',
    murajaahNotif: language === 'ms' ? 'Kemaskini Murajaah' : 'Murajaah Updates',
    langTitle:     language === 'ms' ? 'Bahasa Aplikasi' : 'App Language',
    secTitle:      language === 'ms' ? 'Keselamatan Akaun' : 'Account Security',
    logoutBtn:     language === 'ms' ? 'Log Keluar Akaun' : 'Logout Account',
    currentPass:   language === 'ms' ? 'Kata Laluan Semasa' : 'Current Password',
    newPass:       language === 'ms' ? 'Kata Laluan Baru' : 'New Password',
    confirmPass:   language === 'ms' ? 'Sahkan Kata Laluan Baru' : 'Confirm New Password',
    saveBtn:       language === 'ms' ? 'Simpan Perubahan' : 'Save Changes',
    cancelBtn:     language === 'ms' ? 'Batal' : 'Cancel',
  };

  const studentName = profile?.full_name || profile?.display_name || user?.user_metadata?.displayName || 'Student';
  const studentEmail = profile?.email || user?.email || '';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
      </SafeAreaView>
    );
  }

  return (
    <IslamicBackground variant="top">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

          {/* 👤 AVATAR & HEADER CARD */}
          <View style={{ height: 260, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <View style={{
              position: 'absolute', top: -100, width: '120%', height: 320,
              backgroundColor: C.primary, borderBottomLeftRadius: 1000, borderBottomRightRadius: 1000,
              opacity: 0.08
            }} />
            <Ionicons name="moon-outline" size={70} color={C.accent} style={{ position: 'absolute', top: 30, right: 30, opacity: 0.12, transform: [{ rotate: '-15deg' }] }} />

            <View style={{ position: 'relative', marginBottom: 12 }}>
              <View style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
                borderWidth: 3.5, borderColor: C.primary,
                shadowColor: C.primary, shadowOpacity: 0.15, shadowRadius: 15, elevation: 8
              }}>
                <Text style={{ fontSize: 44 }}>👤</Text>
              </View>
              <View style={{ position: 'absolute', bottom: 2, right: 2, backgroundColor: C.accent, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white }}>
                <Ionicons name="star" size={10} color="white" />
              </View>
            </View>

            <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 4 }}>{studentName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600' }}>{studentEmail}</Text>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#CCC' }} />
              <Text style={{ fontSize: 12, color: C.primary, fontWeight: '800', textTransform: 'uppercase' }}>
                {txt.student}
              </Text>
            </View>
          </View>

          {/* 📊 NUDGE ANALYTICS GRID */}
          <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{
                flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 14,
                alignItems: 'center', borderWidth: 1, borderColor: C.border,
                shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
              }}>
                <Ionicons name="paper-plane-outline" size={20} color={C.primary} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{nudgesSent}</Text>
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {language === 'ms' ? 'Nudge Dihantar' : 'Nudges Sent'}
                </Text>
              </View>
              <View style={{
                flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 14,
                alignItems: 'center', borderWidth: 1, borderColor: C.border,
                shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
              }}>
                <Ionicons name="mail-unread-outline" size={20} color={C.accent} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{nudgesReceived}</Text>
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {language === 'ms' ? 'Nudge Diterima' : 'Nudges Received'}
                </Text>
              </View>
            </View>
          </View>

          {/* ⚙️ CONTROLLERS & SECTIONS */}
          <View style={{ paddingHorizontal: 20 }}>

            {/* 1. CLASS INFORMATION SECTION */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: C.primary, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase', paddingHorizontal: 4 }}>
                {txt.classInfo}
              </Text>
              <View style={{
                backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
                borderWidth: 1, borderColor: C.border
              }}>
                {classes.length === 0 ? (
                  <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ color: C.muted, fontSize: 14, marginBottom: 12 }}>{txt.noClass}</Text>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('JoinClass')}
                      style={{ backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10 }}
                    >
                      <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{txt.joinBtn}</Text>
                    </TouchableOpacity>
                  </View>
                ) : classes.map((cls, i) => (
                  <View key={cls.id || i} style={{
                    paddingVertical: 12,
                    borderBottomWidth: i < classes.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.06)',
                  }}>
                    {/* Class Title and status badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, flex: 1 }}>{cls.name}</Text>
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                        backgroundColor: cls.status === 'pending' ? '#FEF3C7' : '#D1FAE5',
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '800',
                          color: cls.status === 'pending' ? '#B45309' : '#047857',
                        }}>
                          {cls.status === 'pending' ? txt.pending : txt.enrolled}
                        </Text>
                      </View>
                    </View>

                    {/* Class fields */}
                    {[
                      { icon: 'person-outline',    label: txt.teacher,   value: cls.teacher_name },
                      { icon: 'key-outline',        label: txt.classCode, value: cls.code },
                      { icon: 'people-outline',     label: txt.classmates,value: `${cls.total_classmates} ${txt.student}` },
                      { icon: 'calendar-outline',   label: txt.enrollDate,value: cls.joined_at ? new Date(cls.joined_at).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                    ].map((row, j) => (
                      <View key={j} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                        <Ionicons name={row.icon} size={14} color={C.muted} style={{ marginRight: 8, width: 14 }} />
                        <Text style={{ fontSize: 12, color: C.muted, width: 85 }}>{row.label}:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>{row.value}</Text>
                      </View>
                    ))}

                    {/* Leave class option */}
                    {cls.status === 'approved' && (
                      <TouchableOpacity
                        onPress={() => {
                          const triggerLeave = async () => {
                            try {
                              await supabase.from('class_members').delete().eq('class_id', cls.id).eq('student_id', user.id);
                              await supabase.from('join_requests').delete().eq('class_id', cls.id).eq('student_id', user.id);
                              setClasses(prev => prev.filter(c => c.id !== cls.id));
                              Alert.alert('Done', 'Left class.');
                            } catch (e) {
                              Alert.alert('Error', e.message);
                            }
                          };

                          if (Platform.OS === 'web') {
                            if (window.confirm(txt.leaveConfirm)) triggerLeave();
                          } else {
                            Alert.alert(txt.leaveBtn, txt.leaveConfirm, [
                              { text: txt.cancelBtn, style: 'cancel' },
                              { text: txt.leaveBtn, style: 'destructive', onPress: triggerLeave }
                            ]);
                          }
                        }}
                        style={{
                          marginTop: 10, alignSelf: 'flex-start',
                          borderWidth: 1, borderColor: '#EF4444',
                          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5,
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Ionicons name="log-out-outline" size={13} color="#EF4444" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{txt.leaveBtn}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* 2. PROFILE INFORMATION SECTION */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: C.primary, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase', paddingHorizontal: 4 }}>
                {txt.profileInfo}
              </Text>
              <View style={{
                backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
                borderWidth: 1, borderColor: C.border
              }}>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, color: C.muted, fontWeight: '800', marginBottom: 2 }}>{txt.fullName}</Text>
                  <Text style={{ fontSize: 14, color: C.text, fontWeight: '700' }}>{studentName}</Text>
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, color: C.muted, fontWeight: '800', marginBottom: 2 }}>{txt.email}</Text>
                  <Text style={{ fontSize: 14, color: C.muted, fontWeight: '700' }}>{studentEmail}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setNameModalVisible(true)}
                  style={{
                    backgroundColor: C.primary + '12', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                    borderWidth: 1, borderColor: C.primary + '20'
                  }}
                >
                  <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>{txt.editName}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 3. LANGUAGE SETTINGS SECTION */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: C.primary, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase', paddingHorizontal: 4 }}>
                {txt.langTitle}
              </Text>
              <View style={{
                backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
                borderWidth: 1, borderColor: C.border
              }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setLanguageModalVisible(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary + '10', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ionicons name="globe-outline" size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{txt.langTitle}</Text>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {language === 'en' ? 'English (US)' : 'Bahasa Melayu'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#BBB" />
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. NOTIFICATION SETTINGS SECTION */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: C.primary, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase', paddingHorizontal: 4 }}>
                {txt.notifsTitle}
              </Text>
              <View style={{
                backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8,
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
                borderWidth: 1, borderColor: C.border
              }}>
                {[
                  { key: 'announcement', label: txt.annNotif, icon: 'megaphone-outline' },
                  { key: 'feedback',     label: txt.feedbackNotif, icon: 'chatbox-ellipses-outline' },
                  { key: 'nudge',        label: txt.nudgeNotif, icon: 'notifications-outline' },
                  { key: 'tasmiq',       label: txt.tasmiqNotif, icon: 'book-outline' },
                  { key: 'murajaah',     label: txt.murajaahNotif, icon: 'repeat-outline' },
                ].map((item, idx) => (
                  <View key={item.key} style={{
                    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                    borderBottomWidth: idx < 4 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.06)'
                  }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary + '10', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name={item.icon} size={18} color={C.primary} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>{item.label}</Text>
                    <Switch
                      value={notifs[item.key]}
                      onValueChange={(val) => handleToggleNotif(item.key, val)}
                      trackColor={{ false: '#DDD', true: C.primary }}
                      thumbColor="#FFF"
                    />
                  </View>
                ))}
              </View>
            </View>

            {/* 5. ACCOUNT SECURITY (CHANGE PASSWORD) */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: C.primary, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase', paddingHorizontal: 4 }}>
                {txt.secTitle}
              </Text>
              <View style={{
                backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
                borderWidth: 1, borderColor: C.border
              }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setPwdModalVisible(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary + '10', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ionicons name="key-outline" size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{language === 'ms' ? 'Tukar Kata Laluan' : 'Change Password'}</Text>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {language === 'ms' ? 'Kemas kini kata laluan keselamatan anda' : 'Update your account security password'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#BBB" />
                </TouchableOpacity>
              </View>
            </View>

            {/* 🚪 LOGOUT BUTTON */}
            <TouchableOpacity
              onPress={handleLogout}
              activeOpacity={0.7}
              style={{
                marginTop: 10, backgroundColor: C.card, borderRadius: 18, padding: 18,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: C.red + '20',
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 1
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={C.red} style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.red }}>{txt.logoutBtn}</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>

        {/* ── 📝 EDIT NAME MODAL ────────────────────────────────────── */}
        <Modal visible={nameModalVisible} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 }}>{txt.editName}</Text>
              <Text style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
                {language === 'ms' ? 'Sila masukkan nama penuh anda untuk dipaparkan.' : 'Please enter your full name for display.'}
              </Text>

              <TextInput
                style={{
                  backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 15,
                  color: C.text, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20
                }}
                placeholder="Full name"
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setNameModalVisible(false)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}
                >
                  <Text style={{ fontWeight: '700', color: C.muted }}>{txt.cancelBtn}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleUpdateName}
                  disabled={updating}
                  style={{ flex: 2, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.primary }}
                >
                  {updating ? <ActivityIndicator color="white" /> : (
                    <Text style={{ fontWeight: '700', color: 'white' }}>{txt.saveBtn}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── 🔒 CHANGE PASSWORD MODAL ──────────────────────────────── */}
        <Modal visible={pwdModalVisible} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 }}>{language === 'ms' ? 'Tukar Kata Laluan' : 'Change Password'}</Text>
              <Text style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
                {language === 'ms' ? 'Sila lengkapkan butiran untuk menukar kata laluan.' : 'Please fill details to change password.'}
              </Text>

              {/* Current Password */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 4 }}>{txt.currentPass}</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, paddingRight: 45, fontSize: 14, color: C.text, borderWidth: 1, borderColor: '#E5E7EB' }}
                    secureTextEntry={!showCurrent}
                    placeholder={txt.currentPass}
                    value={currentPwd}
                    onChangeText={setCurrentPwd}
                  />
                  <TouchableOpacity style={{ position: 'absolute', right: 12, top: 14 }} onPress={() => setShowCurrent(!showCurrent)}>
                    <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* New Password */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 4 }}>{txt.newPass}</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, paddingRight: 45, fontSize: 14, color: C.text, borderWidth: 1, borderColor: '#E5E7EB' }}
                    secureTextEntry={!showNew}
                    placeholder={txt.newPass}
                    value={newPwd}
                    onChangeText={setNewPwd}
                  />
                  <TouchableOpacity style={{ position: 'absolute', right: 12, top: 14 }} onPress={() => setShowNew(!showNew)}>
                    <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 4 }}>{txt.confirmPass}</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, paddingRight: 45, fontSize: 14, color: C.text, borderWidth: 1, borderColor: '#E5E7EB' }}
                    secureTextEntry={!showConfirm}
                    placeholder={txt.confirmPass}
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                  />
                  <TouchableOpacity style={{ position: 'absolute', right: 12, top: 14 }} onPress={() => setShowConfirm(!showConfirm)}>
                    <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => { setPwdModalVisible(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                  style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}
                >
                  <Text style={{ fontWeight: '700', color: C.muted }}>{txt.cancelBtn}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSavePassword}
                  disabled={updating}
                  style={{ flex: 2, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.primary }}
                >
                  {updating ? <ActivityIndicator color="white" /> : (
                    <Text style={{ fontWeight: '700', color: 'white' }}>{txt.saveBtn}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── 🌏 LANGUAGE SELECTION MODAL ──────────────────────────── */}
        <Modal visible={languageModalVisible} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 }}>App Language</Text>
              <Text style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>Pilih bahasa aplikasi / Select app language</Text>

              <TouchableOpacity
                onPress={() => handleSelectLanguage('en')}
                style={{
                  padding: 14, borderRadius: 12, backgroundColor: language === 'en' ? C.primary + '12' : '#F9F9F9',
                  borderWidth: 1.5, borderColor: language === 'en' ? C.primary : '#E5E7EB', marginBottom: 10
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: language === 'en' ? C.primary : C.text }}>English (US)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSelectLanguage('ms')}
                style={{
                  padding: 14, borderRadius: 12, backgroundColor: language === 'ms' ? C.primary + '12' : '#F9F9F9',
                  borderWidth: 1.5, borderColor: language === 'ms' ? C.primary : '#E5E7EB', marginBottom: 20
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: language === 'ms' ? C.primary : C.text }}>Bahasa Melayu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setLanguageModalVisible(false)}
                style={{ padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}
              >
                <Text style={{ fontWeight: '700', color: C.muted }}>{txt.cancelBtn}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </IslamicBackground>
  );
}
