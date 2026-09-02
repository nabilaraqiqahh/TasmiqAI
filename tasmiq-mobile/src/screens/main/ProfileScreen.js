import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Switch, Platform, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabaseClient';
import {
  getUserProfile, logoutUser, updateUserProfile,
  changePassword, getCurrentUser, getStudentSettings, updateStudentSettings
} from '../../services/authService';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

const P  = '#0B6E4F';
const PD = '#064E3B';
const PL = '#D1FAE5';
const G  = '#D4AF37';
const BG = '#FFFDF0';
const BS = '#FFF9E6';

export default function ProfileScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const { language, changeLanguage } = useLanguage();

  const [profile,   setProfile]   = useState(null);
  const [user,      setUser]      = useState(null);
  const [classes,   setClasses]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [nudgesSent,     setNudgesSent]     = useState(0);
  const [nudgesReceived, setNudgesReceived] = useState(0);

  const [notifs, setNotifs] = useState({
    announcement: true, feedback: true, nudge: true, tasmiq: true, murajaah: true,
  });

  const [nameModalVisible,     setNameModalVisible]     = useState(false);
  const [pwdModalVisible,      setPwdModalVisible]      = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const [newName,    setNewName]    = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [updating,   setUpdating]   = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const session = await getCurrentUser();
        if (!session?.id) { if (mounted) setLoading(false); return; }
        if (mounted) setUser(session);

        const userProf = await getUserProfile(session.id);
        if (mounted) { setProfile(userProf); setNewName(userProf?.full_name || ''); }

        const settings = await getStudentSettings(session.id);
        if (mounted && settings) {
          setNotifs({
            announcement: settings.notify_announcement !== false,
            feedback:     settings.notify_feedback     !== false,
            nudge:        settings.notify_nudge        !== false,
            tasmiq:       settings.notify_tasmiq       !== false,
            murajaah:     settings.notify_murajaah     !== false,
          });
        }

        const { count: sent }     = await supabase.from('nudges').select('*', { count: 'exact', head: true }).eq('sender_id', session.id);
        const { count: received } = await supabase.from('nudges').select('*', { count: 'exact', head: true }).eq('receiver_id', session.id);
        if (mounted) { setNudgesSent(sent || 0); setNudgesReceived(received || 0); }

        const { data: memberships } = await supabase.from('class_members').select('class_id, joined_at').eq('student_id', session.id);
        let loadedClasses = [];
        if (memberships?.length) {
          const classIds = memberships.map(m => m.class_id);
          const { data: classData } = await supabase.from('classes').select('id, name, class_code, unique_code, teacher_id').in('id', classIds);
          const teacherIds = [...new Set((classData || []).map(c => c.teacher_id).filter(Boolean))];
          let teacherMap = {};
          if (teacherIds.length) {
            const { data: teachers } = await supabase.from('users').select('id, full_name').in('id', teacherIds);
            (teachers || []).forEach(t => { teacherMap[t.id] = t.full_name; });
          }
          const countMap = {};
          for (const cid of classIds) {
            const { count } = await supabase.from('class_members').select('*', { count: 'exact', head: true }).eq('class_id', cid);
            countMap[cid] = count || 0;
          }
          loadedClasses = (classData || []).map(c => {
            const mem = memberships.find(m => m.class_id === c.id);
            return { ...c, teacher_name: teacherMap[c.teacher_id] || 'Teacher', total_classmates: countMap[c.id] || 0, joined_at: mem?.joined_at, code: c.unique_code || c.class_code || '—', status: 'approved' };
          });
        }

        const { data: pending } = await supabase.from('join_requests').select('class_id, status, created_at').eq('student_id', session.id).eq('status', 'pending');
        if (pending?.length) {
          const pids = pending.map(p => p.class_id);
          const { data: pc } = await supabase.from('classes').select('id, name').in('id', pids);
          const pm = Object.fromEntries((pc || []).map(c => [c.id, c.name]));
          loadedClasses = [...loadedClasses, ...pending.map(p => ({ id: p.class_id, name: pm[p.class_id] || 'Unknown', status: 'pending', joined_at: p.created_at, teacher_name: '—', total_classmates: 0, code: '—' }))];
        }
        if (mounted) setClasses(loadedClasses);
      } catch (err) {
        console.error('[ProfileScreen]', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []));

  const handleLogout = async () => {
    const doLogout = async () => { await logoutUser(); navigation.replace('Welcome'); };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) doLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    setUpdating(true);
    try {
      await updateUserProfile(user.id, { full_name: newName.trim(), display_name: newName.trim() });
      setProfile(prev => ({ ...prev, full_name: newName.trim() }));
      setNameModalVisible(false);
      Alert.alert('Success', 'Name updated!');
    } catch (err) { Alert.alert('Error', err.message); }
    finally { setUpdating(false); }
  };

  const handleSavePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { Alert.alert('Error', 'Fill in all fields.'); return; }
    if (newPwd !== confirmPwd) { Alert.alert('Error', 'Passwords do not match.'); return; }
    if (newPwd.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return; }
    setUpdating(true);
    try {
      await changePassword(user.id, currentPwd, newPwd);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      setPwdModalVisible(false);
      Alert.alert('Success', 'Password updated.');
    } catch (err) { Alert.alert('Error', err.message || 'Incorrect current password.'); }
    finally { setUpdating(false); }
  };

  const handleToggleNotif = async (key, val) => {
    setNotifs(prev => ({ ...prev, [key]: val }));
    try { await updateStudentSettings(user.id, { [`notify_${key}`]: val }); } catch {}
  };

  const handleSelectLanguage = async (langCode) => {
    await changeLanguage(langCode);
    setLanguageModalVisible(false);
    try { await updateStudentSettings(user.id, { language: langCode }); } catch {}
  };

  const ms = language === 'ms';
  const txt = {
    classInfo:     ms ? 'Maklumat Kelas'       : 'Class Information',
    noClass:       ms ? 'Belum berdaftar.'     : 'Not enrolled in any class yet.',
    joinBtn:       ms ? 'Sertai Kelas'         : 'Join a Class',
    enrollDate:    ms ? 'Tarikh Daftar'        : 'Enrollment Date',
    teacher:       ms ? 'Guru'                 : 'Teacher',
    classCode:     ms ? 'Kod Kelas'            : 'Class Code',
    classmates:    ms ? 'Rakan Sekelas'        : 'Classmates',
    student:       ms ? 'Pelajar'              : 'Student',
    enrolled:      ms ? 'Aktif'                : 'Enrolled',
    pending:       ms ? 'Menunggu Kelulusan'   : 'Pending Approval',
    leaveBtn:      ms ? 'Keluar Kelas'         : 'Leave Class',
    leaveConfirm:  ms ? 'Pasti mahu keluar?'   : 'Are you sure you want to leave?',
    profileInfo:   ms ? 'Maklumat Profil'      : 'Profile Information',
    fullName:      ms ? 'Nama Penuh'           : 'Full Name',
    email:         ms ? 'Emel'                 : 'Email Address',
    editName:      ms ? 'Kemas Kini Nama'      : 'Edit Name',
    notifsTitle:   ms ? 'Tetapan Notifikasi'   : 'Notification Preferences',
    annNotif:      ms ? 'Pengumuman Kelas'     : 'Class Announcements',
    feedbackNotif: ms ? 'Maklum Balas Guru'    : 'Teacher Feedback',
    nudgeNotif:    ms ? 'Notifikasi Nudge'     : 'Nudge Notifications',
    tasmiqNotif:   ms ? 'Kemaskini Tasmiq'     : 'Tasmiq Updates',
    murajaahNotif: ms ? 'Kemaskini Murajaah'   : 'Murajaah Updates',
    langTitle:     ms ? 'Bahasa Aplikasi'      : 'App Language',
    secTitle:      ms ? 'Keselamatan Akaun'    : 'Account Security',
    logoutBtn:     ms ? 'Log Keluar'           : 'Logout Account',
    saveBtn:       ms ? 'Simpan'               : 'Save Changes',
    cancelBtn:     ms ? 'Batal'                : 'Cancel',
    changePwd:     ms ? 'Tukar Kata Laluan'    : 'Change Password',
    currentPass:   ms ? 'Kata Laluan Semasa'   : 'Current Password',
    newPass:       ms ? 'Kata Laluan Baru'     : 'New Password',
    confirmPass:   ms ? 'Sahkan Kata Laluan'   : 'Confirm New Password',
  };

  const studentName  = profile?.full_name || profile?.display_name || user?.user_metadata?.displayName || 'Student';
  const studentEmail = profile?.email || user?.email || '';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={P} />
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* ── GRADIENT HEADER ── */}
        <LinearGradient
          colors={[P, PD]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 28, paddingBottom: 36, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 20 }}
        >
          <View style={{ position: 'relative', marginBottom: 12 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' }}>
              <Text style={{ fontSize: 40 }}>👤</Text>
            </View>
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: G, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: PD }}>
              <Ionicons name="star" size={11} color="white" />
            </View>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF', marginBottom: 4 }}>{studentName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>{studentEmail}</Text>
            <View style={{ backgroundColor: 'rgba(212,175,55,0.3)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: G, textTransform: 'uppercase' }}>{txt.student}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── NUDGE STATS ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              { icon: 'paper-plane-outline', color: P,  bg: PL, label: ms ? 'Nudge Dihantar' : 'Nudges Sent',     value: nudgesSent },
              { icon: 'mail-unread-outline', color: G,  bg: '#FEF3C7', label: ms ? 'Nudge Diterima' : 'Nudges Received', value: nudgesReceived },
            ].map((item, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E8F0EA', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: PD }}>{item.value}</Text>
                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2, textAlign: 'center' }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20 }}>

          {/* ── CLASS INFO ── */}
          <SectionHeader label={txt.classInfo} />
          <Card>
            {classes.length === 0 ? (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 12 }}>{txt.noClass}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('JoinClass')} style={{ backgroundColor: P, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10 }}>
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{txt.joinBtn}</Text>
                </TouchableOpacity>
              </View>
            ) : classes.map((cls, i) => (
              <View key={cls.id || i} style={{ paddingVertical: 12, borderBottomWidth: i < classes.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: PD, flex: 1 }}>{cls.name}</Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: cls.status === 'pending' ? '#FEF3C7' : PL }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: cls.status === 'pending' ? '#B45309' : '#047857' }}>
                      {cls.status === 'pending' ? txt.pending : txt.enrolled}
                    </Text>
                  </View>
                </View>
                {[
                  { icon: 'person-outline',  label: txt.teacher,   value: cls.teacher_name },
                  { icon: 'key-outline',     label: txt.classCode, value: cls.code },
                  { icon: 'people-outline',  label: txt.classmates,value: `${cls.total_classmates} ${txt.student}` },
                  { icon: 'calendar-outline',label: txt.enrollDate,value: cls.joined_at ? new Date(cls.joined_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                ].map((row, j) => (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                    <Ionicons name={row.icon} size={14} color="#6B7280" style={{ marginRight: 8, width: 14 }} />
                    <Text style={{ fontSize: 12, color: '#6B7280', width: 85 }}>{row.label}:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: PD }}>{row.value}</Text>
                  </View>
                ))}
                {cls.status === 'approved' && (
                  <TouchableOpacity
                    onPress={() => {
                      const doLeave = async () => {
                        try {
                          await supabase.from('class_members').delete().eq('class_id', cls.id).eq('student_id', user.id);
                          await supabase.from('join_requests').delete().eq('class_id', cls.id).eq('student_id', user.id);
                          setClasses(prev => prev.filter(c => c.id !== cls.id));
                        } catch (e) { Alert.alert('Error', e.message); }
                      };
                      if (Platform.OS === 'web') { if (window.confirm(txt.leaveConfirm)) doLeave(); }
                      else Alert.alert(txt.leaveBtn, txt.leaveConfirm, [{ text: txt.cancelBtn, style: 'cancel' }, { text: txt.leaveBtn, style: 'destructive', onPress: doLeave }]);
                    }}
                    style={{ marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Ionicons name="log-out-outline" size={13} color="#EF4444" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{txt.leaveBtn}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </Card>

          {/* ── PROFILE INFO ── */}
          <SectionHeader label={txt.profileInfo} />
          <Card>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '800', marginBottom: 2 }}>{txt.fullName}</Text>
              <Text style={{ fontSize: 14, color: PD, fontWeight: '700' }}>{studentName}</Text>
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '800', marginBottom: 2 }}>{txt.email}</Text>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '700' }}>{studentEmail}</Text>
            </View>
            <TouchableOpacity onPress={() => setNameModalVisible(true)} style={{ backgroundColor: P + '12', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: P + '20' }}>
              <Text style={{ color: P, fontWeight: '800', fontSize: 13 }}>{txt.editName}</Text>
            </TouchableOpacity>
          </Card>

          {/* ── LANGUAGE ── */}
          <SectionHeader label={txt.langTitle} />
          <Card>
            <TouchableOpacity onPress={() => setLanguageModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: P + '10', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="globe-outline" size={18} color={P} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: PD }}>{txt.langTitle}</Text>
                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{language === 'en' ? 'English (US)' : 'Bahasa Melayu'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#BBB" />
            </TouchableOpacity>
          </Card>

          {/* ── NOTIFICATIONS ── */}
          <SectionHeader label={txt.notifsTitle} />
          <Card>
            {[
              { key: 'announcement', label: txt.annNotif,      icon: 'megaphone-outline' },
              { key: 'feedback',     label: txt.feedbackNotif, icon: 'chatbox-ellipses-outline' },
              { key: 'nudge',        label: txt.nudgeNotif,    icon: 'notifications-outline' },
              { key: 'tasmiq',       label: txt.tasmiqNotif,   icon: 'book-outline' },
              { key: 'murajaah',     label: txt.murajaahNotif, icon: 'repeat-outline' },
            ].map((item, idx) => (
              <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: idx < 4 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: P + '10', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name={item.icon} size={18} color={P} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: PD }}>{item.label}</Text>
                <Switch value={notifs[item.key]} onValueChange={val => handleToggleNotif(item.key, val)} trackColor={{ false: '#DDD', true: P }} thumbColor="#FFF" />
              </View>
            ))}
          </Card>

          {/* ── SECURITY ── */}
          <SectionHeader label={txt.secTitle} />
          <Card>
            <TouchableOpacity onPress={() => setPwdModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: P + '10', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="key-outline" size={18} color={P} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: PD }}>{txt.changePwd}</Text>
                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Update your account security password</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#BBB" />
            </TouchableOpacity>
          </Card>

          {/* ── LOGOUT ── */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{ marginTop: 10, marginBottom: 20, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#DC262620', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 1 }}
          >
            <Ionicons name="log-out-outline" size={20} color="#DC2626" style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#DC2626' }}>{txt.logoutBtn}</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* ── EDIT NAME MODAL ── */}
      <Modal visible={nameModalVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: PD, marginBottom: 16 }}>{txt.editName}</Text>
            <TextInput
              style={{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 15, color: PD, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 }}
              placeholder="Full name" value={newName} onChangeText={setNewName} autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setNameModalVisible(false)} style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}>
                <Text style={{ fontWeight: '700', color: '#6B7280' }}>{txt.cancelBtn}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdateName} disabled={updating} style={{ flex: 2, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: P }}>
                {updating ? <ActivityIndicator color="white" /> : <Text style={{ fontWeight: '700', color: 'white' }}>{txt.saveBtn}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CHANGE PASSWORD MODAL ── */}
      <Modal visible={pwdModalVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: PD, marginBottom: 16 }}>{txt.changePwd}</Text>
            {[
              { label: txt.currentPass, val: currentPwd, set: setCurrentPwd, show: showCurrent, toggle: setShowCurrent },
              { label: txt.newPass,     val: newPwd,     set: setNewPwd,     show: showNew,     toggle: setShowNew },
              { label: txt.confirmPass, val: confirmPwd, set: setConfirmPwd, show: showConfirm, toggle: setShowConfirm },
            ].map((field, i) => (
              <View key={i} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#6B7280', marginBottom: 4 }}>{field.label}</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput style={{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, paddingRight: 45, fontSize: 14, color: PD, borderWidth: 1, borderColor: '#E5E7EB' }} secureTextEntry={!field.show} placeholder={field.label} value={field.val} onChangeText={field.set} />
                  <TouchableOpacity style={{ position: 'absolute', right: 12, top: 14 }} onPress={() => field.toggle(!field.show)}>
                    <Ionicons name={field.show ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity onPress={() => { setPwdModalVisible(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }} style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}>
                <Text style={{ fontWeight: '700', color: '#6B7280' }}>{txt.cancelBtn}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSavePassword} disabled={updating} style={{ flex: 2, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: P }}>
                {updating ? <ActivityIndicator color="white" /> : <Text style={{ fontWeight: '700', color: 'white' }}>{txt.saveBtn}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── LANGUAGE MODAL ── */}
      <Modal visible={languageModalVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: PD, marginBottom: 4 }}>App Language</Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 18 }}>Pilih bahasa / Select language</Text>
            {['en', 'ms'].map(lang => (
              <TouchableOpacity key={lang} onPress={() => handleSelectLanguage(lang)} style={{ padding: 14, borderRadius: 12, backgroundColor: language === lang ? P + '12' : '#F9F9F9', borderWidth: 1.5, borderColor: language === lang ? P : '#E5E7EB', marginBottom: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: language === lang ? P : PD }}>{lang === 'en' ? 'English (US)' : 'Bahasa Melayu'}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setLanguageModalVisible(false)} style={{ padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}>
              <Text style={{ fontWeight: '700', color: '#6B7280' }}>{txt.cancelBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function SectionHeader({ label }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '900', color: '#0B6E4F', letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase', paddingHorizontal: 4 }}>
      {label}
    </Text>
  );
}

function Card({ children }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#E8F0EA' }}>
      {children}
    </View>
  );
}
