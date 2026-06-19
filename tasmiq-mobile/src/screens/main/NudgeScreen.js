import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { getCurrentUser } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';

const NUDGE_TYPES = [
  { id: 'murajaah', label: "Complete today's Murajaah", icon: 'refresh-circle', emoji: '📖' },
  { id: 'tasmiq',   label: "Perform today's Tasmiq",   icon: 'mic',             emoji: '🎙️' },
  { id: 'general',  label: 'General reminder',          icon: 'notifications',   emoji: '💬' },
];

export default function NudgeScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const [session, setSession]         = useState(null);
  const [classmates, setClassmates]   = useState([]);
  const [received, setReceived]       = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(null);
  const [tab, setTab]                 = useState('send');

  const E = '#0B6E4F';
  const ED = '#047857';

  useEffect(() => { init(); }, []);

  const init = async () => {
    const s = await getCurrentUser();
    setSession(s);
    if (s?.id) {
      await Promise.all([
        loadClassmates(s.id),
        loadReceivedNudges(s.id),
        loadLeaderboard(s.id),
      ]);
    }
    setLoading(false);
  };

  const loadClassmates = async (myId) => {
    // Get my class memberships
    const { data: myClasses } = await supabase
      .from('class_members').select('class_id').eq('student_id', myId);
    if (!myClasses?.length) return;

    const classIds = myClasses.map(c => c.class_id);

    // Get other members in same classes
    const { data: members } = await supabase
      .from('class_members')
      .select('student_id, classes(name)')
      .in('class_id', classIds)
      .neq('student_id', myId);

    const uniqueIds = [...new Set((members || []).map(m => m.student_id))];
    if (!uniqueIds.length) return;

    const { data: users } = await supabase
      .from('users').select('id, full_name, email').in('id', uniqueIds);

    // Count today's nudges sent to each
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

    setClassmates((users || []).map(u => ({
      ...u,
      name:         u.full_name || u.email?.split('@')[0] || 'Student',
      nudgesToday:  countMap[u.id] || 0,
      className:    members.find(m => m.student_id === u.id)?.classes?.name || '',
    })));
  };

  const loadReceivedNudges = async (myId) => {
    const { data } = await supabase
      .from('nudges')
      .select('*, sender:sender_id(full_name, email)')
      .eq('receiver_id', myId)
      .order('created_at', { ascending: false })
      .limit(20);
    setReceived(data || []);
  };

  const loadLeaderboard = async (myId) => {
    const { data: myClasses } = await supabase
      .from('class_members').select('class_id').eq('student_id', myId);
    if (!myClasses?.length) return;

    const classIds = myClasses.map(c => c.class_id);
    const { data: members } = await supabase
      .from('class_members').select('student_id').in('class_id', classIds);

    const memberIds = [...new Set((members || []).map(m => m.student_id))];
    if (!memberIds.length) return;

    // Count nudges sent per person
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const { data: nudges } = await supabase
      .from('nudges')
      .select('sender_id')
      .in('sender_id', memberIds)
      .gte('created_at', since.toISOString());

    const counts = {};
    (nudges || []).forEach(n => { counts[n.sender_id] = (counts[n.sender_id] || 0) + 1; });

    const { data: users } = await supabase
      .from('users').select('id, full_name, email').in('id', memberIds);

    setLeaderboard(
      (users || [])
        .map(u => ({ ...u, name: u.full_name || u.email?.split('@')[0], count: counts[u.id] || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    );
  };

  const sendNudge = async (receiverId, type) => {
    if (!session?.id) return;
    const target = classmates.find(c => c.id === receiverId);
    if (!target) return;

    if (target.nudgesToday >= 3) {
      Alert.alert('Limit Reached', 'You can only send 3 nudges per classmate per day.');
      return;
    }

    setSending(receiverId + type);
    try {
      const nudgeType = NUDGE_TYPES.find(t => t.id === type);
      await supabase.from('nudges').insert([{
        sender_id:   session.id,
        receiver_id: receiverId,
        type,
        message:     `${session.full_name || 'Your classmate'} nudged you to ${nudgeType?.label.toLowerCase()}.`,
        is_read:     false,
      }]);

      setClassmates(prev => prev.map(c =>
        c.id === receiverId ? { ...c, nudgesToday: c.nudgesToday + 1 } : c
      ));
      Alert.alert('Nudge Sent! 🎉', `You reminded ${target.name} to ${nudgeType?.label.toLowerCase()}.`);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSending(null);
    }
  };

  const markRead = async (nudgeId) => {
    await supabase.from('nudges').update({ is_read: true }).eq('id', nudgeId);
    setReceived(prev => prev.map(n => n.id === nudgeId ? { ...n, is_read: true } : n));
  };

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FEFCE8', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={E} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FEFCE8' }}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={ED} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: ED }}>Nudge System</Text>
          <Text style={{ fontSize: 13, color: '#6B7280' }}>Remind classmates to practice 🌿</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 8 }}>
        {[
          { key: 'send',        label: 'Send Nudge' },
          { key: 'received',    label: `Received (${received.filter(n => !n.is_read).length})` },
          { key: 'leaderboard', label: '🏆 Top Nudgers' },
        ].map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
            backgroundColor: tab === t.key ? ED : 'white',
            borderWidth: 1, borderColor: tab === t.key ? ED : '#EAE3D5',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: tab === t.key ? 'white' : ED }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TAB: SEND NUDGE */}
      {tab === 'send' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
          {classmates.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Ionicons name="people-outline" size={48} color="#EAE3D5" />
              <Text style={{ color: '#6B7280', marginTop: 12, fontSize: 15, textAlign: 'center' }}>
                No classmates found.{'\n'}Join a class to start nudging!
              </Text>
            </View>
          ) : classmates.map(mate => (
            <View key={mate.id} style={{
              backgroundColor: 'white', borderRadius: 18, padding: 18,
              marginBottom: 12, borderWidth: 1, borderColor: '#EAE3D5',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEFCE8', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: ED }}>{mate.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#064E3B', fontSize: 15 }}>{mate.name}</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>{mate.className}</Text>
                </View>
                <View style={{ backgroundColor: mate.nudgesToday >= 3 ? '#FEE2E2' : '#FEFCE8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: mate.nudgesToday >= 3 ? '#991B1B' : ED }}>
                    {mate.nudgesToday}/3 today
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {NUDGE_TYPES.map(type => (
                  <TouchableOpacity
                    key={type.id}
                    onPress={() => sendNudge(mate.id, type.id)}
                    disabled={mate.nudgesToday >= 3 || sending === mate.id + type.id}
                    style={{
                      flex: 1, minWidth: 90, paddingVertical: 8, paddingHorizontal: 10,
                      borderRadius: 10, alignItems: 'center',
                      backgroundColor: mate.nudgesToday >= 3 ? '#F3F4F6' : '#FEFCE8',
                      opacity: mate.nudgesToday >= 3 ? 0.5 : 1,
                    }}
                  >
                    {sending === mate.id + type.id
                      ? <ActivityIndicator size="small" color={E} />
                      : <Text style={{ fontSize: 16 }}>{type.emoji}</Text>
                    }
                    <Text style={{ fontSize: 10, fontWeight: '700', color: ED, textAlign: 'center', marginTop: 2 }}>
                      {type.id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* TAB: RECEIVED */}
      {tab === 'received' && (
        <FlatList
          data={received}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Ionicons name="notifications-outline" size={48} color="#EAE3D5" />
              <Text style={{ color: '#6B7280', marginTop: 12 }}>No nudges received yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const senderName = item.sender?.full_name || item.sender?.email?.split('@')[0] || 'Classmate';
            const nudgeType  = NUDGE_TYPES.find(t => t.id === item.type);
            return (
              <TouchableOpacity onPress={() => markRead(item.id)} style={{
                backgroundColor: item.is_read ? 'white' : '#FEFCE8',
                borderRadius: 16, padding: 16, marginBottom: 10,
                borderWidth: 1, borderColor: item.is_read ? '#EAE3D5' : E,
                flexDirection: 'row', alignItems: 'center', gap: 12,
              }}>
                <Text style={{ fontSize: 24 }}>{nudgeType?.emoji || '💬'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#064E3B', fontSize: 14 }}>{senderName}</Text>
                  <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{item.message}</Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {!item.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: E }} />}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* TAB: LEADERBOARD */}
      {tab === 'leaderboard' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>
            Top nudgers in your class this week 🌿
          </Text>
          {leaderboard.map((user, i) => (
            <View key={user.id} style={{
              backgroundColor: 'white', borderRadius: 16, padding: 16,
              marginBottom: 10, flexDirection: 'row', alignItems: 'center',
              borderWidth: 1, borderColor: i === 0 ? '#D4AF37' : '#EAE3D5',
              borderLeftWidth: 4, borderLeftColor: i === 0 ? '#D4AF37' : i === 1 ? '#9CA3AF' : '#CD7F32',
            }}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: '#064E3B', fontSize: 14 }}>
                  {user.name} {user.id === session?.id ? '(You)' : ''}
                </Text>
              </View>
              <View style={{ backgroundColor: '#FEFCE8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontWeight: '900', color: ED, fontSize: 14 }}>{user.count} nudges</Text>
              </View>
            </View>
          ))}
          {leaderboard.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ color: '#6B7280', fontSize: 15 }}>No nudge activity yet this week.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}




