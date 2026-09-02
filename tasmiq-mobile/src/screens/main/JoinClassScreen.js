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

const PRIMARY = '#047857';  // dark emerald — for buttons only
const GOLD    = '#D4AF37';

const showAlert = (title, message) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function JoinClassScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();

  const [code, setCode]               = useState('');
  const [loading, setLoading]         = useState(false);
  const [checking, setChecking]       = useState(true);
  const [enrollment, setEnrollment]   = useState(null); // { status, className, classId }
  const [errorMsg, setErrorMsg]       = useState('');

  useEffect(() => { checkExistingEnrollment(); }, []);

  const checkExistingEnrollment = async () => {
    setChecking(true);
    try {
      const session = await getCurrentUser();
      if (!session?.id) { setChecking(false); return; }

      // Check class_members first (approved)
      const { data: membership } = await supabase
        .from('class_members')
        .select('class_id, classes(name)')
        .eq('student_id', session.id)
        .limit(1);

      if (membership?.length > 0) {
        setEnrollment({ status: 'approved', className: membership[0].classes?.name, classId: membership[0].class_id });
      } else {
        setEnrollment(null);
      }
    } catch (err) {
      console.error('Enrollment check error:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleJoin = async () => {
    setErrorMsg('');
    const trimmedCode = code.trim().toUpperCase();

    // Constraint 1: Format & Length check
    if (!trimmedCode || trimmedCode.length < 4) {
      const msg = 'Invalid class code. Please check with your teacher';
      setErrorMsg(msg);
      showAlert('Invalid class code. Please check with your teacher', msg);
      return;
    }

    setLoading(true);
    try {
      const session = await getCurrentUser();
      if (!session?.id) throw new Error('Not logged in.');

      // Constraint 2: One-class enrollment constraint check
      const { data: existingMembership } = await supabase
        .from('class_members')
        .select('id')
        .eq('student_id', session.id)
        .limit(1);

      if (existingMembership?.length > 0) {
        const msg = 'You are already enrolled in a class.';
        setErrorMsg(msg);
        showAlert('Already Enrolled', msg);
        setLoading(false);
        return;
      }

      // Constraint 3: Database existence check
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id, name')
        .or(`unique_code.eq.${trimmedCode},class_code.eq.${trimmedCode}`)
        .maybeSingle();

      if (clsErr) {
        console.error('Class lookup error:', clsErr);
      }

      if (clsErr || !cls) {
        const msg = 'Invalid class code. Please check with your teacher';
        setErrorMsg(msg);
        showAlert('Invalid class code. Please check with your teacher', msg);
        setLoading(false);
        return;
      }

      // Automatically join: insert directly into class_members
      const { error } = await supabase
        .from('class_members')
        .insert([{ class_id: cls.id, student_id: session.id }]);

      if (error) throw error;

      setEnrollment({ status: 'approved', className: cls.name, classId: cls.id });
      showAlert('Success! 🎉', `You have successfully joined "${cls.name}".`);

    } catch (err) {
      console.error('Join class error:', err);
      const msg = 'Invalid class code. Please check with your teacher';
      setErrorMsg(msg);
      showAlert('Invalid class code. Please check with your teacher', msg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFDF0', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={PRIMARY} />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFDF0' }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={'#FFFDF0'} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
            <Ionicons name="arrow-back" size={24} color={'#064E3B'} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#064E3B' }}>Join a Class</Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {/* -- STATUS: APPROVED -- */}
            {enrollment?.status === 'approved' && (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 }}>
                <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#E6F9F3', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <Ionicons name="checkmark-circle" size={36} color={PRIMARY} />
                </View>
                <Text style={{ fontSize: 19, fontWeight: '900', color: '#064E3B', marginBottom: 8 }}>Enrolled!</Text>
                <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 }}>
                  You are a member of{' '}
                  <Text style={{ fontWeight: '800', color: PRIMARY }}>{enrollment.className}</Text>.
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 12, textAlign: 'center' }}>
                  To join a different class, leave your current class from Profile → Class Information.
                </Text>
              </View>
            )}

            {/* -- JOIN FORM — only show if not approved -- */}
            {(!enrollment || enrollment.status !== 'approved') && (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, elevation: 4 }}>
                <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: '#E6F9F3', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <Ionicons name="keypad" size={26} color={PRIMARY} />
                </View>

                <Text style={{ fontSize: 20, fontWeight: '800', color: '#064E3B', marginBottom: 6 }}>Enter Class Code</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 22, lineHeight: 20 }}>
                  Ask your teacher for the class code and enter it below. Each student can only be in one class at a time.
                </Text>

                <View style={{
                  backgroundColor: '#FFFDF0', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16,
                  marginBottom: errorMsg ? 10 : 20, borderWidth: errorMsg ? 1.5 : 1, borderColor: errorMsg ? '#EF4444' : '#E5E7EB',
                }}>
                  <TextInput
                    value={code}
                    onChangeText={t => {
                      // Character constraint: uppercase alphanumeric and hyphens only
                      const cleaned = t.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                      setCode(cleaned);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="e.g. TSMQ-4X9A"
                    placeholderTextColor="#BBBBBB"
                    autoCapitalize="characters"
                    maxLength={15}
                    style={{ fontSize: 22, fontWeight: '800', color: errorMsg ? '#EF4444' : '#064E3B', letterSpacing: 3, textAlign: 'center' }}
                  />
                </View>

                {errorMsg ? (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2',
                    padding: 12, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FCA5A5',
                  }}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600', flex: 1 }}>{errorMsg}</Text>
                  </View>
                ) : null}

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
                    : <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Join Class</Text>
                  }
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    
    </SafeAreaView>
  );
}
