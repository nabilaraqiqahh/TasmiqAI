import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert, FlatList, Modal, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabaseClient';
import { getCurrentUser } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

const PREDEFINED_MESSAGES = [
  "Complete Today's Murajaah",
  "Submit Today's Tasmiq",
  "Continue Your Revision",
  "Keep Up The Good Work",
  "Don't Forget Your Quran Practice"
];

export default function NudgeScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const [session, setSession]         = useState(null);
  const [classmates, setClassmates]   = useState([]);
  const [received, setReceived]       = useState([]);
  const [sent, setSent]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);

  // Tab State
  const [tab, setTab]                 = useState('send');      // 'send' or 'history'
  const [historyTab, setHistoryTab]   = useState('received');  // 'received' or 'sent'

  // Modal State for Sending Nudge
  const [nudgeModalVisible, setNudgeModalVisible] = useState(false);
  const [selectedMate, setSelectedMate]           = useState(null);
  const [selectedPreset, setSelectedPreset]       = useState(PREDEFINED_MESSAGES[0]);
  const [customText, setCustomText]               = useState('');

  // ── Load Data on Focus ───────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const load = async () => {
        setLoading(true);
        const s = await getCurrentUser();
        if (s?.id && isMounted) {
          setSession(s);
          await Promise.all([
            loadClassmates(s.id, isMounted),
            loadHistory(s.id, isMounted)
          ]);
        }
        if (isMounted) setLoading(false);
      };
      load();
      return () => { isMounted = false; };
    }, [tab, historyTab])
  );

  const loadClassmates = async (myId, isMounted) => {
    // Get my class memberships
    const { data: myClasses } = await supabase
      .from('class_members').select('class_id').eq('student_id', myId);
    if (!myClasses?.length) return;

    const classIds = myClasses.map(c => c.class_id);

    // Get other members in same classes (decoupled to avoid PGRST200 relationship joins)
    const { data: members } = await supabase
      .from('class_members')
      .select('student_id, class_id')
      .in('class_id', classIds)
      .neq('student_id', myId);

    const uniqueIds = [...new Set((members || []).map(m => m.student_id))];
    if (!uniqueIds.length) return;

    const { data: users } = await supabase
      .from('users').select('id, full_name, email').in('id', uniqueIds);

    const { data: classesData } = await supabase
      .from('classes').select('id, name').in('id', classIds);

    const classMap = Object.fromEntries((classesData || []).map(c => [c.id, c.name]));

    // Count today's nudges sent to each from midnight
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: todayNudges } = await supabase
      .from('nudges')
      .select('receiver_id')
      .eq('sender_id', myId)
      .gte('created_at', today.toISOString());

    const countMap = {};
    (todayNudges || []).forEach(n => {
      countMap[n.receiver_id] = (countMap[n.receiver_id] || 0) + 1;
    });

    if (isMounted) {
      setClassmates((users || []).map(u => {
        const mem = members.find(m => m.student_id === u.id);
        return {
          ...u,
          name:         u.full_name || u.email?.split('@')[0] || 'Student',
          nudgesToday:  countMap[u.id] || 0,
          className:    mem ? classMap[mem.class_id] || '' : '',
          classId:      mem ? mem.class_id : null,
        };
      }));
    }
  };

  const loadHistory = async (myId, isMounted) => {
    // 1. Get received nudges
    const { data: recData } = await supabase
      .from('nudges')
      .select('*')
      .eq('receiver_id', myId)
      .order('created_at', { ascending: false });

    // Decoupled sender names
    const senderIds = [...new Set((recData || []).map(n => n.sender_id).filter(Boolean))];
    let senderMap = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('users').select('id, full_name, email').in('id', senderIds);
      (senders || []).forEach(s => { senderMap[s.id] = s.full_name || s.email?.split('@')[0]; });
    }

    if (isMounted) {
      setReceived((recData || []).map(n => ({
        ...n,
        sender_name: senderMap[n.sender_id] || 'Classmate'
      })));
    }

    // 2. Get sent nudges
    const { data: sentData } = await supabase
      .from('nudges')
      .select('*')
      .eq('sender_id', myId)
      .order('created_at', { ascending: false });

    // Decoupled receiver names
    const receiverIds = [...new Set((sentData || []).map(n => n.receiver_id).filter(Boolean))];
    let receiverMap = {};
    if (receiverIds.length > 0) {
      const { data: receivers } = await supabase
        .from('users').select('id, full_name, email').in('id', receiverIds);
      (receivers || []).forEach(r => { receiverMap[r.id] = r.full_name || r.email?.split('@')[0]; });
    }

    if (isMounted) {
      setSent((sentData || []).map(n => ({
        ...n,
        receiver_name: receiverMap[n.receiver_id] || 'Classmate'
      })));
    }
  };

  // ── Anti-Spam Verification ───────────────────────────────────────
  const checkSpamLimits = async (receiverId, messageText) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // 1. Same student daily limit (max 5)
    const { count: sameStudentCount, error: err1 } = await supabase
      .from('nudges')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', session.id)
      .eq('receiver_id', receiverId)
      .gte('created_at', today.toISOString());

    if (err1) throw err1;
    if (sameStudentCount >= 5) {
      return { allowed: false, reason: 'You have reached the limit of 5 nudges per day to this classmate.' };
    }

    // 2. Total daily limit (max 20)
    const { count: totalCount, error: err2 } = await supabase
      .from('nudges')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', session.id)
      .gte('created_at', today.toISOString());

    if (err2) throw err2;
    if (totalCount >= 20) {
      return { allowed: false, reason: 'You have reached your daily limit of 20 total nudges.' };
    }

    // 3. Duplicate check (within last 5 minutes)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: duplicates, error: err3 } = await supabase
      .from('nudges')
      .select('id')
      .eq('sender_id', session.id)
      .eq('receiver_id', receiverId)
      .eq('message', messageText)
      .gte('created_at', fiveMinsAgo.toISOString());

    if (err3) throw err3;
    if (duplicates && duplicates.length > 0) {
      return { allowed: false, reason: 'Duplicate nudge blocked. You sent this exact nudge within the last 5 minutes.' };
    }

    return { allowed: true };
  };

  const handleOpenNudge = (mate) => {
    setSelectedMate(mate);
    setSelectedPreset(PREDEFINED_MESSAGES[0]);
    setCustomText('');
    setNudgeModalVisible(true);
  };

  const handleSendNudge = async () => {
    if (!session?.id || !selectedMate) return;

    // Build the final message text
    const messageText = customText.trim() ? customText.trim() : selectedPreset;

    setSending(true);
    try {
      // Enforce anti-spam checks
      const spamCheck = await checkSpamLimits(selectedMate.id, messageText);
      if (!spamCheck.allowed) {
        Alert.alert('Nudge Blocked', spamCheck.reason);
        setSending(false);
        return;
      }

      // Insert nudge
      const { data: nudgeResult, error: nudgeErr } = await supabase
        .from('nudges')
        .insert([{
          sender_id:   session.id,
          receiver_id: selectedMate.id,
          class_id:    selectedMate.classId,
          message:     messageText,
          is_read:     false,
        }])
        .select()
        .single();

      if (nudgeErr) throw nudgeErr;

      // Insert notification for receiver
      await supabase.from('notifications').insert([{
        user_id: selectedMate.id,
        title: "New nudge received!",
        body: `${session.full_name || 'A classmate'} nudged you: "${messageText}"`,
        is_read: false
      }]);

      setNudgeModalVisible(false);
      Alert.alert('Nudge Sent! 🎉', `You reminded ${selectedMate.name} to complete their activity.`);

      // Refresh data
      await loadClassmates(session.id, true);
      await loadHistory(session.id, true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send nudge.');
    } finally {
      setSending(false);
    }
  };

  const markRead = async (nudgeId) => {
    await supabase.from('nudges').update({ is_read: true }).eq('id', nudgeId);
    setReceived(prev => prev.map(n => n.id === nudgeId ? { ...n, is_read: true } : n));
  };

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={C.primary} />
    </SafeAreaView>
  );

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: '900', color: C.primary, margin: 0 }}>Nudge System</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Remind classmates to practice their Quran 🌿</p>
          </View>
        </View>

        {/* ── TABS ───────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 8 }}>
          {[
            { key: 'send',    label: 'Send Nudge' },
            { key: 'history', label: `Nudge History (${received.filter(n => !n.is_read).length} unread)` },
          ].map(t => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={{
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
              backgroundColor: tab === t.key ? C.primary : C.card,
              borderWidth: 1, borderColor: tab === t.key ? C.primary : C.border,
              shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
            }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: tab === t.key ? 'white' : C.primary }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── TAB content: SEND NUDGE ───────────────────────────────── */}
        {tab === 'send' && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
            {classmates.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Ionicons name="people-outline" size={48} color={C.border} />
                <Text style={{ color: C.muted, marginTop: 12, fontSize: 14, textAlign: 'center' }}>
                  No classmates found in your class. {'\n'}Enroll in a class to start nudging!
                </Text>
              </View>
            ) : classmates.map(mate => (
              <View key={mate.id} style={{
                backgroundColor: C.card, borderRadius: 18, padding: 18,
                marginBottom: 12, borderWidth: 1, borderColor: C.border,
                shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: C.primary }}>{mate.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ fontWeight: '800', color: C.text, fontSize: 15 }}>{mate.name}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{mate.className}</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={{ backgroundColor: mate.nudgesToday >= 5 ? '#FEE2E2' : C.primary + '10', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: mate.nudgesToday >= 5 ? '#991B1B' : C.primary }}>
                      {mate.nudgesToday}/5 today
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleOpenNudge(mate)}
                    disabled={mate.nudgesToday >= 5}
                    style={{
                      backgroundColor: mate.nudgesToday >= 5 ? '#F3F4F6' : C.primary,
                      borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14,
                      flexDirection: 'row', alignItems: 'center', gap: 4
                    }}
                  >
                    <Ionicons name="notifications-outline" size={13} color="white" />
                    <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>Nudge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── TAB content: NUDGE HISTORY ────────────────────────────── */}
        {tab === 'history' && (
          <View style={{ flex: 1 }}>
            {/* Sub-tabs */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 12 }}>
              <TouchableOpacity onPress={() => setHistoryTab('received')} style={{ borderBottomWidth: 2, borderBottomColor: historyTab === 'received' ? C.primary : 'transparent', paddingBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: historyTab === 'received' ? C.primary : C.muted }}>Received Nudges</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setHistoryTab('sent')} style={{ borderBottomWidth: 2, borderBottomColor: historyTab === 'sent' ? C.primary : 'transparent', paddingBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: historyTab === 'sent' ? C.primary : C.muted }}>Sent Nudges</Text>
              </TouchableOpacity>
            </View>

            {historyTab === 'received' ? (
              <FlatList
                data={received}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 20, paddingTop: 4 }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingTop: 40 }}>
                    <Ionicons name="mail-outline" size={44} color={C.border} />
                    <Text style={{ color: C.muted, marginTop: 12, fontSize: 14 }}>No received nudges yet.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => markRead(item.id)} activeOpacity={0.8} style={{
                    backgroundColor: item.is_read ? C.card : C.primary + '0a',
                    borderRadius: 16, padding: 16, marginBottom: 10,
                    borderWidth: 1, borderColor: item.is_read ? C.border : C.primary,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
                  }}>
                    <Text style={{ fontSize: 24 }}>💬</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: C.text, fontSize: 14 }}>{item.sender_name}</Text>
                      <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{item.message}</Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {!item.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary }} />}
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                data={sent}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 20, paddingTop: 4 }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingTop: 40 }}>
                    <Ionicons name="paper-plane-outline" size={44} color={C.border} />
                    <Text style={{ color: C.muted, marginTop: 12, fontSize: 14 }}>No sent nudges yet.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={{
                    backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10,
                    borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12,
                    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
                  }}>
                    <Text style={{ fontSize: 24 }}>📤</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: C.text, fontSize: 14 }}>To: {item.receiver_name}</Text>
                      <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{item.message}</Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        )}

        {/* ── 💬 SEND NUDGE MODAL ───────────────────────────────────── */}
        <Modal visible={nudgeModalVisible} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20, maxHeight: '85%' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 2 }}>Send Nudge</Text>
              <Text style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Remind {selectedMate?.name} to practice</Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Predefined pills */}
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 8, textTransform: 'uppercase' }}>Predefined Reminders</Text>
                <View style={{ flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {PREDEFINED_MESSAGES.map(msg => {
                    const selected = selectedPreset === msg && !customText.trim();
                    return (
                      <TouchableOpacity
                        key={msg}
                        onPress={() => { setSelectedPreset(msg); setCustomText(''); }}
                        style={{
                          padding: 12, borderRadius: 10,
                          backgroundColor: selected ? C.primary + '12' : '#F3F4F6',
                          borderWidth: 1.5, borderColor: selected ? C.primary : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? C.primary : C.text }}>
                          {msg}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom message field */}
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 6, textTransform: 'uppercase' }}>Custom Message (Optional)</Text>
                <View style={{ marginBottom: 20 }}>
                  <TextInput
                    style={{
                      backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 14,
                      color: C.text, borderWidth: 1, borderColor: '#E5E7EB',
                      minHeight: 60, textAlignVertical: 'top'
                    }}
                    placeholder="Type custom nudge message..."
                    value={customText}
                    onChangeText={(val) => {
                      if (val.length <= 100) setCustomText(val);
                    }}
                    maxLength={100}
                    multiline
                  />
                  <Text style={{ fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 4 }}>
                    {customText.length}/100
                  </Text>
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => setNudgeModalVisible(false)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E5E7EB' }}
                >
                  <Text style={{ fontWeight: '700', color: C.muted }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSendNudge}
                  disabled={sending}
                  style={{ flex: 2, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.primary }}
                >
                  {sending ? <ActivityIndicator color="white" /> : (
                    <Text style={{ fontWeight: '700', color: 'white' }}>Send Nudge</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </IslamicBackground>
  );
}
