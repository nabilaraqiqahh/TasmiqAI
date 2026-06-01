import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import IslamicBackground from '../../components/IslamicBackground';

export default function JoinClassScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const { t, language } = useLanguage();
  
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // null, 'pending', 'approved', 'rejected'
  const [currentClass, setCurrentClass] = useState(null);

  useEffect(() => {
    checkExistingEnrollment();
  }, []);

  const checkExistingEnrollment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check for pending requests
      const { data: request, error: reqError } = await supabase
        .from('join_requests')
        .select('*, classes(name)')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (request && request.length > 0) {
        setStatus(request[0].status);
        setCurrentClass(request[0].classes.name);
      }
      
      // Check for approved memberships (in class_members)
      const { data: membership, error: memError } = await supabase
        .from('class_members')
        .select('*, classes(name)')
        .eq('student_id', user.id)
        .limit(1);
        
      if (membership && membership.length > 0) {
        setStatus('approved');
        setCurrentClass(membership[0].classes.name);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoin = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter a valid class code.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Find class by unique code
      const { data: cls, error: clsError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('unique_code', code.trim().toUpperCase())
        .single();

      if (clsError || !cls) {
        Alert.alert('Class Not Found', 'No class matches the code you entered. Please double check with your teacher.');
        setLoading(false);
        return;
      }

      // Check if already in class or pending
      const { data: existingReq } = await supabase
        .from('join_requests')
        .select('*')
        .eq('class_id', cls.id)
        .eq('student_id', user.id);
        
      if (existingReq && existingReq.length > 0) {
        Alert.alert('Already Requested', 'You have already sent a request to join this class.');
        setLoading(false);
        return;
      }

      // Send join request
      const { error: insertError } = await supabase
        .from('join_requests')
        .insert([{
          class_id: cls.id,
          student_id: user.id,
          status: 'pending'
        }]);

      if (insertError) throw insertError;
      
      setStatus('pending');
      setCurrentClass(cls.name);
      Alert.alert('Request Sent!', `Your request to join ${cls.name} has been sent. Please wait for your teacher to approve it.`);
      
    } catch (err) {
      console.error(err);
      Alert.alert('Error', `An error occurred: ${err.message || JSON.stringify(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
      
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Join a Class</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          
          {/* Status View */}
          {status && (
            <View style={{
              backgroundColor: C.card, borderRadius: 20, padding: 24, marginBottom: 32,
              alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
            }}>
              {status === 'approved' && (
                <>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.green + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <Ionicons name="checkmark-circle" size={32} color={C.green} />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' }}>You are enrolled!</Text>
                  <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>You are currently a member of <Text style={{fontWeight: '700', color: C.primary}}>{currentClass}</Text>.</Text>
                </>
              )}
              {status === 'pending' && (
                <>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.gold + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <Ionicons name="time" size={32} color={C.gold} />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' }}>Waiting for Approval</Text>
                  <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>Your request to join <Text style={{fontWeight: '700', color: C.primary}}>{currentClass}</Text> is pending teacher approval.</Text>
                </>
              )}
              {status === 'rejected' && (
                <>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.red + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <Ionicons name="close-circle" size={32} color={C.red} />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' }}>Request Rejected</Text>
                  <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>Your request to join <Text style={{fontWeight: '700', color: C.primary}}>{currentClass}</Text> was not approved.</Text>
                </>
              )}
            </View>
          )}

          {/* Join Form */}
          {status !== 'approved' && status !== 'pending' && (
            <View style={{
              backgroundColor: C.card, borderRadius: 24, padding: 28,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, elevation: 4,
            }}>
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Ionicons name="keypad" size={28} color={C.primary} />
              </View>
              
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8 }}>Enter Class Code</Text>
              <Text style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 22 }}>
                Ask your teacher for the 9-character unique class code, then enter it here.
              </Text>

              <View style={{
                backgroundColor: C.bg, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18,
                flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#F0F0F0'
              }}>
                <TextInput
                  value={code}
                  onChangeText={c => setCode(c.toUpperCase())}
                  placeholder="e.g. TSMQ-4X9A"
                  placeholderTextColor="#BBBBBB"
                  autoCapitalize="characters"
                  maxLength={10}
                  style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 2, textAlign: 'center' }}
                />
              </View>

              <TouchableOpacity
                onPress={handleJoin}
                disabled={loading || code.length < 5}
                style={{
                  backgroundColor: code.length >= 5 ? C.primary : C.muted, borderRadius: 16,
                  paddingVertical: 18, alignItems: 'center',
                  shadowColor: C.primary, shadowOpacity: code.length >= 5 ? 0.3 : 0, shadowRadius: 10, elevation: code.length >= 5 ? 5 : 0,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </IslamicBackground>
  );
}
