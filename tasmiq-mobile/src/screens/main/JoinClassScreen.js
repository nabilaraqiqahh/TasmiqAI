import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { getCurrentUser } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

const PRIMARY = '#047857';  // dark emerald — for buttons only
const GOLD    = '#D4AF37';

export default function JoinClassScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();

  const [code, setCode]               = useState('');
  const [loading, setLoading]         = useState(false);
  const [checking, setChecking]       = useState(true);
  const [enrollment, setEnrollment]   = useState(null); // { status, className, classId }

  useEffect(() => { checkExistingEnrollment(); }, []);

  const checkExistingEnrollment = async () => {
    setChecking(true);
    try {
      const session = await getCurrentUser();
      if (!session?.id) { setChecking(false); return; }

      // ── ONE CLASS ONLY: check class_members first (approved) ──
      const { data: membership } = await supabase
        .from('class_members')
        .select('class_id, classes(name)')
        .eq('student_id', session.id)
        .limit(1);

      if (membership?.length > 0) {
        setEnrollment({ status: 'approved', className: membership[0].classes?.name, classId: membership[0].class_id });
        setChecking(false);
        return;
      }

      // Check pending/rejected requests
      const { data: req } = await supabase
        .from('join_requests')
        .select('status, class_id, classes(name)')
        .eq('student_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (req?.length > 0) {
        setEnrollment({ status: req[0].status, className: req[0].classes?.name, classId: req[0].class_id });
      }
    } catch (err) {
      console.error('Enrollment check error:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleJoin = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      Alert.alert('Error', 'Please enter a class code.');
      return;
    }

    setLoading(true);
    try {
      const session = await getCurrentUser();
      if (!session?.id) throw new Error('Not logged in.');

      // ── ONE CLASS ONLY: block if already in a class ──
      const { data: existingMembership } = await supabase
        .from('class_members')
        .select('id')
        .eq('student_id', session.id)
        .limit(1);

      if (existingMembership?.length > 0) {
        Alert.alert('Already Enrolled', 'You are already enrolled in a class. Leave your current class first before joining a new one.');
        setLoading(false);
        return;
      }

      // Find class by code
      const { data: cls } = await supabase
        .from('classes')
        .select('id, name')
        .or(`unique_code.eq.${trimmedCode},class_code.eq.${trimmedCode}`)
        .maybeSingle();

      if (!cls) {
        Alert.alert('Class Not Found', 'No class matches this code. Check with your teacher.');
        setLoading(false);
        return;
      }

      // Check for existing pending request
      const { data: existing } = await supabase
        .from('join_requests')
        .select('id, status')
        .eq('class_id', cls.id)
        .eq('student_id', session.id)
        .maybeSingle();

      if (existing) {
        Alert.alert(
          existing.status === 'pending' ? 'Already Requested' : 'Request Exists',
          existing.status === 'pending'
            ? 'You already have a pending request for this class.'
            : 'You already sent a request for this class.',
        );
        setLoading(false);
        return;
      }

      // Insert join request
      const { error } = await supabase
        .from('join_requests')
        .insert([{ class_id: cls.id, student_id: session.id, status: 'pending' }]);

      if (error) throw error;

      setEnrollment({ status: 'pending', className: cls.name, classId: cls.id });
      Alert.alert('Request Sent! 🎉', `Your request to join "${cls.name}" has been sent. Wait for teacher approval.`);

    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    Alert.alert(
      'Cancel Request',
      `Cancel your request to join "${enrollment?.className}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const session = await getCurrentUser();
              await supabase.from('join_requests')
                .delete()
                .eq('class_id', enrollment.classId)
                .eq('student_id', session.id);
              setEnrollment(null);
              setCode('');
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  if (checking) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </SafeAreaView>
  );

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Join a Class</Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {/* ── STATUS: APPROVED ── */}
            {enrollment?.status === 'approved' && (
              <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 }}>
                <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#E6F9F3', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <Ionicons name="checkmark-circle" size={36} color={PRIMARY} />
                </View>
                <Text style={{ fontSize: 19, fontWeight: '900', color: C.text, marginBottom: 8 }}>Enrolled!</Text>
                <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21 }}>
                  You are a member of{' '}
                  <Text style={{ fontWeight: '800', color: PRIMARY }}>{enrollment.className}</Text>.
                </Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 12, textAlign: 'center' }}>
                  To join a different class, leave your current class from Profile → Class Information.
                </Text>
              </View>
            )}

            {/* ── STATUS: PENDING ── */}
            {enrollment?.status === 'pending' && (
              <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 }}>
                <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFBEB', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <Ionicons name="time" size={36} color={GOLD} />
                </View>
                <Text style={{ fontSize: 19, fontWeight: '900', color: C.text, marginBottom: 8 }}>Waiting for Approval</Text>
                <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21 }}>
                  Your request to join{' '}
                  <Text style={{ fontWeight: '800', color: PRIMARY }}>{enrollment.className}</Text>{' '}
                  is pending teacher approval.
                </Text>
                <TouchableOpacity
                  onPress={handleCancelRequest}
                  style={{ marginTop: 20, borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STATUS: REJECTED ── */}
            {enrollment?.status === 'rejected' && (
              <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#FCA5A5' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Ionicons name="close-circle" size={22} color="#EF4444" />
                  <Text style={{ fontWeight: '800', color: '#EF4444', fontSize: 15 }}>Request Rejected</Text>
                </View>
                <Text style={{ fontSize: 13, color: C.muted }}>
                  Your previous request for "{enrollment.className}" was not approved. You can try a different class code below.
                </Text>
              </View>
            )}

            {/* ── JOIN FORM — only show if not approved or pending ── */}
            {(!enrollment || enrollment.status === 'rejected') && (
              <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 28, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, elevation: 4 }}>
                <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: '#E6F9F3', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <Ionicons name="keypad" size={26} color={PRIMARY} />
                </View>

                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 }}>Enter Class Code</Text>
                <Text style={{ fontSize: 13, color: C.muted, marginBottom: 22, lineHeight: 20 }}>
                  Ask your teacher for the class code and enter it below. Each student can only be in one class at a time.
                </Text>

                <View style={{
                  backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16,
                  marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB',
                }}>
                  <TextInput
                    value={code}
                    onChangeText={t => setCode(t.toUpperCase())}
                    placeholder="e.g. TSMQ-4X9A"
                    placeholderTextColor="#BBBBBB"
                    autoCapitalize="characters"
                    maxLength={10}
                    style={{ fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: 3, textAlign: 'center' }}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleJoin}
                  disabled={loading || code.length < 4}
                  style={{
                    backgroundColor: code.length >= 4 ? PRIMARY : '#D1D5DB',
                    borderRadius: 14, paddingVertical: 17, alignItems: 'center',
                    shadowColor: PRIMARY, shadowOpacity: code.length >= 4 ? 0.25 : 0, shadowRadius: 10, elevation: code.length >= 4 ? 4 : 0,
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Submit Request</Text>
                  }
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </IslamicBackground>
  );
}
