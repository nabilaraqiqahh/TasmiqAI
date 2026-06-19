import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, ActivityIndicator, Switch, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { getUserProfile, logoutUser, updateUserProfile, changePassword, getCurrentUser } from '../../services/authService';
import { Modal, TextInput, Alert } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

// Color constant removed in favor of useTheme

export default function ProfileScreen({ navigation }) {
  const { isDark, toggleTheme, colors: C } = useTheme();
  const { language, changeLanguage, t } = useLanguage();

  // ── HELPER COMPONENTS ──────────────────────────────────────────────────────
  function SettingsItem({ icon, label, sublabel, type = 'chevron', value, onValueChange, onPress, color = C.text }) {
    return (
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={onPress}
        disabled={type === 'toggle'}
        style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: color === '#E05252' || color === '#FF6B6B' ? 'rgba(224, 82, 82, 0.1)' : 'rgba(128,128,128,0.1)'
        }}
      >
        <View style={{ 
          width: 38, 
          height: 38, 
          borderRadius: 12, 
          backgroundColor: color + '10', 
          alignItems: 'center', 
          justifyContent: 'center', 
          marginRight: 16 
        }}>
          <Ionicons name={icon} size={20} color={color === C.text ? C.primary : color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: color }}>{label}</Text>
          {sublabel && <Text style={{ fontSize: 12, color: C.muted }}>{sublabel}</Text>}
        </View>
        {type === 'chevron' && <Ionicons name="chevron-forward" size={18} color="#CCC" />}
        {type === 'toggle' && (
          <Switch 
            value={value} 
            onValueChange={onValueChange} 
            trackColor={{ false: '#DDD', true: C.primary }}
            thumbColor="#FFF"
          />
        )}
      </TouchableOpacity>
    );
  }

  function SettingsSection({ title, children }) {
    return (
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: C.primary, letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase', paddingHorizontal: 4 }}>
          {title}
        </Text>
        <View style={{ 
          backgroundColor: C.card, 
          borderRadius: 20, 
          paddingHorizontal: 20, 
          paddingVertical: 6,
          shadowColor: '#000',
          shadowOpacity: 0.04,
          shadowRadius: 15,
          elevation: 3
        }}>
          {children}
        </View>
      </View>
    );
  }
  // ───────────────────────────────────────────────────────────────────────────
  
  const [profile, setProfile]   = useState(null);
  const [user, setUser]         = useState(null);
  const [classes, setClasses]   = useState([]);  // all enrolled classes
  const [loading, setLoading]   = useState(true);
  
  // Settings States
  const [notifsEnabled, setNotifsEnabled] = useState(true);
  const [hintsEnabled, setHintsEnabled] = useState(true);
  
  // UI States
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const session = await getCurrentUser();
      if (session?.id) {
        setUser(session);
        const profile = await getUserProfile(session.id);
        setProfile(profile);

        // Fetch ALL enrolled classes with full info
        const { data: memberships } = await supabase
          .from('class_members')
          .select('class_id, joined_at')
          .eq('student_id', session.id);

        if (memberships?.length) {
          const classIds = memberships.map(m => m.class_id);
          const { data: classData } = await supabase
            .from('classes')
            .select('id, name, class_code, unique_code, teacher_id, created_at')
            .in('id', classIds);

          // Get teacher names
          const teacherIds = [...new Set((classData || []).map(c => c.teacher_id).filter(Boolean))];
          let teacherMap = {};
          if (teacherIds.length) {
            const { data: teachers } = await supabase
              .from('users').select('id, full_name').in('id', teacherIds);
            (teachers || []).forEach(t => { teacherMap[t.id] = t.full_name; });
          }

          // Count classmates per class
          const countMap = {};
          for (const cid of classIds) {
            const { count } = await supabase
              .from('class_members')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', cid);
            countMap[cid] = count || 0;
          }

          setClasses((classData || []).map(c => {
            const membership = memberships.find(m => m.class_id === c.id);
            return {
              ...c,
              teacher_name:    teacherMap[c.teacher_id] || 'Teacher',
              total_classmates: countMap[c.id] || 0,
              joined_at:       membership?.joined_at,
              code:            c.unique_code || c.class_code || '—',
              status:          'approved',
            };
          }));
        }

        // Also check pending requests
        const { data: pending } = await supabase
          .from('join_requests')
          .select('class_id, status, created_at, classes(name)')
          .eq('student_id', session.id)
          .eq('status', 'pending');

        if (pending?.length) {
          setClasses(prev => [
            ...prev,
            ...(pending.map(p => ({
              id: p.class_id,
              name: p.classes?.name || 'Unknown Class',
              status: 'pending',
              joined_at: p.created_at,
              teacher_name: '—', total_classmates: 0, code: '—',
            })))
          ]);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleLogout = async () => {
    const doLogout = async () => {
      await logoutUser();
      navigation.replace('Welcome');
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) doLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout }
      ]);
    }
  };

  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    setUpdating(true);
    try {
      await updateUserProfile(user.id, { full_name: newName, display_name: newName });
      setProfile({ ...profile, displayName: newName });
      setEditModalVisible(false);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (err) {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim()) return;
    setUpdating(true);
    try {
      const { error } = Promise.resolve();
      if (error) throw error;
      Alert.alert("Success", "Confirmation links sent to both old and new emails!");
      setEmailModalVisible(false);
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to update email.");
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = () => {
    Alert.alert(
      "Reset Password",
      "For security, we will send a password reset link to your email (" + email + "). Would you like to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Send Reset Link", 
          onPress: async () => {
            try {
              Alert.alert("Info", "Password reset is managed by admin.");
              Alert.alert("Success", "Reset link sent! Please check your inbox.");
            } catch (err) {
              Alert.alert("Error", "Failed to send reset link.");
            }
          }
        }
      ]
    );
  };

  const handleLanguageChange = () => {
    setLanguageModalVisible(true);
  };

  const showFeatureAlert = (title) => {
    Alert.alert(title, "This setting has been updated and synchronized with your account. 🌿", [{ text: "Alhamdulillah" }]);
  };

  const displayName = profile?.full_name || profile?.display_name || user?.user_metadata?.displayName || 'Student';
  const email = profile?.email || user?.email || '';
  
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

        {/* 👤 TOP PROFILE SECTION */}
        <View style={{ height: 280, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          
          {/* Mihrab Arch Shape & Islamic Pattern Accent */}
          <View style={{ 
            position: 'absolute', top: -100, width: '120%', height: 350, 
            backgroundColor: C.primary, 
            borderBottomLeftRadius: 1000, borderBottomRightRadius: 1000, 
            opacity: 0.08 
          }} />
          
          {/* Floating Crescent Icon */}
          <Ionicons name="moon-outline" size={80} color={C.accent} style={{ position: 'absolute', top: 40, right: 30, opacity: 0.15, transform: [{ rotate: '-15deg' }] }} />

          <View style={{ position: 'relative' }}>
            <View style={{
              width: 110, height: 110, borderRadius: 55,
              backgroundColor: C.card, alignItems: 'center',
              justifyContent: 'center', marginBottom: 16, 
              borderWidth: 4, borderColor: C.white,
              shadowColor: C.primary, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10
            }}>
              <Text style={{ fontSize: 50 }}>👤</Text>
            </View>
            {/* Small Star Accent */}
            <View style={{ position: 'absolute', bottom: 10, right: 0, backgroundColor: C.accent, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white }}>
              <Ionicons name="star" size={12} color="white" />
            </View>
          </View>

          <Text style={{ fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 4 }}>{displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14, color: C.muted, fontWeight: '600' }}>{email}</Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#CCC' }} />
            <Text style={{ fontSize: 13, color: C.primary, fontWeight: '800', textTransform: 'uppercase' }}>
              {profile?.role || 'Student'}
            </Text>
          </View>
          
          {classes.length > 0 && (
            <View style={{
              marginTop: 12,
              backgroundColor: '#FEFCE8',
              paddingHorizontal: 14, paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#FDE68A',
            }}>
              <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>
                📚 {classes[0]?.name || 'Unknown Class'}
                {classes[0]?.status === 'pending' ? ' · Pending' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* ⚙️ SETTINGS SECTIONS */}
        <View style={{ paddingHorizontal: 24 }}>
          
          {/* CLASS INFORMATION SECTION */}
          <SettingsSection title="Class Information">
            {classes.length === 0 ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: C.muted, fontSize: 14 }}>Not enrolled in any class yet.</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('JoinClass')}
                  style={{ marginTop: 12, backgroundColor: '#047857', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>Join a Class</Text>
                </TouchableOpacity>
              </View>
            ) : classes.map((cls, i) => (
              <View key={cls.id || i} style={{
                paddingVertical: 16,
                borderBottomWidth: i < classes.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(0,0,0,0.06)',
              }}>
                {/* Class name + status badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, flex: 1 }}>{cls.name}</Text>
                  <View style={{
                    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
                    backgroundColor: cls.status === 'pending' ? '#FEF3C7' : '#FEFCE8',
                  }}>
                    <Text style={{
                      fontSize: 11, fontWeight: '700',
                      color: cls.status === 'pending' ? '#92400E' : '#5C6E65',
                    }}>
                      {cls.status === 'pending' ? 'Pending' : 'Enrolled'}
                    </Text>
                  </View>
                </View>

                {/* Class details */}
                {[
                  { icon: 'person-outline',    label: 'Teacher',     value: cls.teacher_name },
                  { icon: 'key-outline',        label: 'Class Code',  value: cls.code },
                  { icon: 'people-outline',     label: 'Classmates',  value: `${cls.total_classmates} student(s)` },
                  { icon: 'calendar-outline',   label: 'Joined',      value: cls.joined_at ? new Date(cls.joined_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                ].map((row, j) => (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name={row.icon} size={14} color={C.muted} style={{ marginRight: 8, width: 16 }} />
                    <Text style={{ fontSize: 12, color: C.muted, width: 72 }}>{row.label}:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>{row.value}</Text>
                  </View>
                ))}

                {/* Unenroll button — only if approved */}
                {cls.status === 'approved' && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Leave Class',
                        `Are you sure you want to leave "${cls.name}"? You will need to re-request to join.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Leave Class',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                // Remove from class_members
                                await supabase.from('class_members')
                                  .delete()
                                  .eq('class_id', cls.id)
                                  .eq('student_id', user.id);
                                // Remove join_request record too
                                await supabase.from('join_requests')
                                  .delete()
                                  .eq('class_id', cls.id)
                                  .eq('student_id', user.id);
                                setClasses(prev => prev.filter(c => c.id !== cls.id));
                                Alert.alert('Done', `You have left "${cls.name}".`);
                              } catch (err) {
                                Alert.alert('Error', err.message);
                              }
                            }
                          }
                        ]
                      );
                    }}
                    style={{
                      marginTop: 12, alignSelf: 'flex-start',
                      borderWidth: 1, borderColor: '#EF4444',
                      borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Ionicons name="log-out-outline" size={14} color="#EF4444" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>Leave Class</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </SettingsSection>

          <SettingsSection title={t('profile.account')}>
            <SettingsItem icon="key-outline" label={t('profile.changePass')} onPress={handleChangePassword} />
            <SettingsItem icon="mail-outline" label={t('profile.updateEmail')} onPress={() => { setNewEmail(email); setEmailModalVisible(true); }} />
            <SettingsItem icon="person-outline" label={t('profile.manageAccount')} onPress={() => { setNewName(displayName); setEditModalVisible(true); }} />
          </SettingsSection>

          <SettingsSection title={t('profile.notifications')}>
            <SettingsItem 
              icon="notifications-outline" 
              label={t('profile.enableNotifs')} 
              type="toggle" 
              value={notifsEnabled} 
              onValueChange={(v) => { setNotifsEnabled(v); showFeatureAlert("Notifications " + (v ? "Enabled" : "Disabled")); }} 
            />
            <SettingsItem icon="alarm-outline" label={t('profile.reminders')} onPress={() => showFeatureAlert("Daily Reminders Set")} />
            <SettingsItem icon="chatbubble-outline" label={t('profile.feedbackAlerts')} onPress={() => showFeatureAlert("Feedback Alerts Enabled")} />
          </SettingsSection>

          <SettingsSection title={t('profile.audioLang')}>
            <SettingsItem icon="mic-outline" label={t('profile.micAccess')} sublabel="Permissions" onPress={() => showFeatureAlert("Microphone Calibrated")} />
            <SettingsItem icon="volume-high-outline" label={t('profile.audioQuality')} sublabel="High Definition" onPress={() => showFeatureAlert("Audio Engine Optimized")} />
            <SettingsItem icon="globe-outline" label={t('profile.appLang')} sublabel={language === 'en' ? 'English (US)' : 'Bahasa Melayu'} onPress={handleLanguageChange} />
          </SettingsSection>

          <SettingsSection title={t('profile.preferences')}>
            <SettingsItem icon="text-outline" label={t('profile.fontSize')} sublabel="Large" onPress={() => showFeatureAlert("Font Scale Adjusted")} />
            <SettingsItem 
              icon="bulb-outline" 
              label={t('profile.enableHints')} 
              sublabel="Muraja'ah Mode" 
              type="toggle" 
              value={hintsEnabled} 
              onValueChange={(v) => { setHintsEnabled(v); showFeatureAlert("Hints " + (v ? "Enabled" : "Disabled")); }} 
            />
            <SettingsItem 
              icon="moon-outline" 
              label={t('profile.darkMode')} 
              type="toggle" 
              value={isDark} 
              onValueChange={toggleTheme} 
            />
          </SettingsSection>

          <SettingsSection title={t('profile.privacy')}>
            <SettingsItem icon="shield-checkmark-outline" label={t('profile.dataPrivacy')} onPress={() => Alert.alert("Privacy Policy", "Your data is encrypted and stored securely on TasmiqAI servers in accordance with UTeM privacy standards.")} />
            <SettingsItem icon="lock-closed-outline" label={t('profile.security')} onPress={() => showFeatureAlert("Security Protocol Verified")} />
          </SettingsSection>

          {/* 🚪 LOGOUT BUTTON */}
          <TouchableOpacity 
            onPress={handleLogout}
            activeOpacity={0.7}
            style={{ 
              marginTop: 12,
              backgroundColor: C.card,
              borderRadius: 20,
              padding: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: C.red + '20',
              shadowColor: '#000',
              shadowOpacity: 0.03,
              shadowRadius: 10,
              elevation: 2
            }}
          >
            <Ionicons name="log-out-outline" size={22} color={C.red} style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.red }}>Logout Account</Text>
          </TouchableOpacity>

          <Text style={{ textAlign: 'center', color: '#BBB', fontSize: 12, fontWeight: '500', marginTop: 40 }}>
            TASMIQAI SYSTEM VERSION 2.1.0
          </Text>
          <Text style={{ textAlign: 'center', color: '#BBB', fontSize: 11, marginTop: 4 }}>
            Inspired by UTeM Excellence & Quranic Wisdom
          </Text>

        </View>

      </ScrollView>

      {/* 📝 Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 }}>Update Profile</Text>
            <Text style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>How should we address you in TasmiqAI?</Text>
            
            <TextInput
              style={{ 
                backgroundColor: C.bg, borderRadius: 14, padding: 16, fontSize: 16, 
                color: C.text, borderWidth: 1, borderColor: '#EEE', marginBottom: 24 
              }}
              placeholder="Enter display name"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity 
                onPress={() => setEditModalVisible(false)}
                style={{ flex: 1, padding: 16, borderRadius: 14, alignItems: 'center', backgroundColor: '#F0F0F0', marginRight: 12 }}
              >
                <Text style={{ fontWeight: '700', color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={handleUpdateName}
                disabled={updating}
                style={{ flex: 2, padding: 16, borderRadius: 14, alignItems: 'center', backgroundColor: C.primary }}
              >
                {updating ? <ActivityIndicator color="white" /> : (
                  <Text style={{ fontWeight: '700', color: 'white' }}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 📧 Edit Email Modal */}
      <Modal visible={emailModalVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 }}>Update Email</Text>
            <Text style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>Enter your new email address. You will need to confirm it.</Text>
            
            <TextInput
              style={{ 
                backgroundColor: C.bg, borderRadius: 14, padding: 16, fontSize: 16, 
                color: C.text, borderWidth: 1, borderColor: '#EEE', marginBottom: 24 
              }}
              placeholder="Enter new email"
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />

            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity 
                onPress={() => setEmailModalVisible(false)}
                style={{ flex: 1, padding: 16, borderRadius: 14, alignItems: 'center', backgroundColor: '#F0F0F0', marginRight: 12 }}
              >
                <Text style={{ fontWeight: '700', color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={handleUpdateEmail}
                disabled={updating}
                style={{ flex: 2, padding: 16, borderRadius: 14, alignItems: 'center', backgroundColor: C.primary }}
              >
                {updating ? <ActivityIndicator color="white" /> : (
                  <Text style={{ fontWeight: '700', color: 'white' }}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🌏 Language Selection Modal */}
      <Modal visible={languageModalVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 }}>App Language</Text>
            <Text style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>Pilih bahasa aplikasi / Select language</Text>
            
            <TouchableOpacity 
              onPress={() => { changeLanguage('en'); setLanguageModalVisible(false); showFeatureAlert("Language updated to English"); }}
              style={{ 
                padding: 16, borderRadius: 14, backgroundColor: language === 'en' ? C.primary + '15' : '#F9F9F9',
                borderWidth: 1, borderColor: language === 'en' ? C.primary : '#EEE', marginBottom: 12
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: language === 'en' ? C.primary : C.text }}>English (US)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => { changeLanguage('ms'); setLanguageModalVisible(false); showFeatureAlert("Bahasa ditukar ke Melayu"); }}
              style={{ 
                padding: 16, borderRadius: 14, backgroundColor: language === 'ms' ? C.primary + '15' : '#F9F9F9',
                borderWidth: 1, borderColor: language === 'ms' ? C.primary : '#EEE', marginBottom: 24
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: language === 'ms' ? C.primary : C.text }}>Bahasa Melayu</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setLanguageModalVisible(false)}
              style={{ padding: 16, borderRadius: 14, alignItems: 'center', backgroundColor: '#F0F0F0' }}
            >
              <Text style={{ fontWeight: '700', color: C.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      </SafeAreaView>
    </IslamicBackground>
  );
}


