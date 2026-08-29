import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator, Platform, RefreshControl, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { logoutUser } from '../../services/authService';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// --- Premium Component: Glass Card ---
function PremiumCard({ children, style, color, C }) {
  const shadowColor = color || '#0B6E4F';
  return (
    <View style={[{
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      padding: 20,
      shadowColor: shadowColor,
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.8)',
    }, style]}>
      {children}
    </View>
  );
}

// --- Premium Component: Stat Widget ---
function StatWidget({ icon, label, value, trend, color, C }) {
  return (
    <View style={{
      flex: 1,
      minWidth: isWeb && width > 800 ? 200 : '45%',
      margin: 8,
    }}>
      <PremiumCard color={color} C={C}>
        <View style={{
          width: 48, height: 48, borderRadius: 16,
          backgroundColor: color + '15',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <Text style={{ fontSize: 32, fontWeight: '900', color: '#064E3B' }}>{value}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280', marginTop: 4 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Ionicons name="trending-up" size={14} color={'#0B6E4F'} />
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#0B6E4F', marginLeft: 4 }}>{trend}</Text>
        </View>
      </PremiumCard>
    </View>
  );
}

export default function TeacherDashboard({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const [stats, setStats] = useState({ students: 0, pending: 0, completed: 0, atRisk: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      // 1. Get Students
      const { count: studentCount, error: stuErr } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student');

      // 2. Get Pending Recitations Count
      const { count: pendingCount, error: pendErr } = await supabase
        .from('recitations')
        .select('*', { count: 'exact', head: true })
        .eq('reviewed', false);

      // 3. Get Completed Recitations Count
      const { count: completedCount, error: compErr } = await supabase
        .from('recitations')
        .select('*', { count: 'exact', head: true })
        .eq('reviewed', true);

      // 4. Get Recent Recitations using snake_case column
      const { data: recentData } = await supabase
        .from('recitations')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(5);

      // Calculate at-risk from DB (avg_score < 70)
      const { count: atRiskCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student')
        .lt('avg_score', 70);

      if (recentData) {
        setRecent(recentData.map(d => ({
          ...d,
          studentName: d.student_name || d.studentName || 'Student',
          time: d.recorded_at
            ? new Date(d.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
        })));
      }

      setStats({
        students: studentCount || 0,
        pending:  pendingCount || 0,
        completed: completedCount || 0,
        atRisk:   atRiskCount || 0,
      });
    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFDF0', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={'#0B6E4F'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFDF0' }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={'#FFFDF0'} />
      <ScrollView 
        contentContainerStyle={{ padding: isWeb ? 40 : 20, maxWidth: 1200, alignSelf: 'center', width: '100%' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
      >
        
        {/* TOP BAR / NAVIGATION */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ backgroundColor: '#0B6E4F', width: 8, height: 32, borderRadius: 4 }} />
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#064E3B' }}>Tasmiq Staff</Text>
            </View>
            <Text style={{ fontSize: 15, color: '#6B7280', marginTop: 4, marginLeft: 18 }}>Academic Management Portal</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 2 }}>
              <Ionicons name="notifications-outline" size={24} color={'#064E3B'} />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={async () => await logoutUser()}
              style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: '#DC2626' + '10', flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ color: '#DC2626', fontWeight: '800' }}>Logout</Text>
              <Ionicons name="log-out-outline" size={18} color={'#DC2626'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* HERO SECTION / QUICK ACTIONS */}
        <View style={{ flexDirection: isWeb && width > 900 ? 'row' : 'column', gap: 24, marginBottom: 40 }}>
          <View style={{ flex: 2 }}>
            <PremiumCard style={{ backgroundColor: '#0B6E4F', height: 240, justifyContent: 'center', padding: 32 }} C={C}>
              <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Welcome back, Principal</Text>
              <Text style={{ fontSize: 36, color: '#FFFFFF', fontWeight: '900', marginTop: 8 }}>Ready to review{'\n'}today's recitations?</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('TeacherReview')}
                style={{ backgroundColor: '#D4AF37', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, alignSelf: 'flex-start', marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Start Reviewing</Text>
                <Ionicons name="arrow-forward" size={18} color={'#FFFFFF'} />
              </TouchableOpacity>
              <View style={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.1 }}>
                <Ionicons name="mic" size={200} color="white" />
              </View>
            </PremiumCard>
          </View>
          
          <View style={{ flex: 1, gap: 16 }}>
             <TouchableOpacity 
               onPress={() => navigation.navigate('TeacherStudents')}
               style={{ flex: 1 }}
             >
                <PremiumCard style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 24 }} C={C}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#C8B6E2' + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={28} color={'#C8B6E2'} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#064E3B' }}>Student Roster</Text>
                    <Text style={{ fontSize: 13, color: '#6B7280' }}>Manage all enrollments</Text>
                  </View>
                </PremiumCard>
             </TouchableOpacity>
             <PremiumCard style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 24 }} C={C}>
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#D4AF37' + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="stats-chart" size={28} color={'#D4AF37'} />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#064E3B' }}>Academic Reports</Text>
                  <Text style={{ fontSize: 13, color: '#6B7280' }}>Download monthly stats</Text>
                </View>
             </PremiumCard>
          </View>
        </View>

        {/* STATS GRID */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 32 }}>
          <StatWidget icon="people" label="Active Students" value={stats.students} trend="+12% this month" color={'#0B6E4F'} C={C} />
          <StatWidget icon="time" label="Pending Review" value={stats.pending} trend="Action required" color={'#DC2626'} C={C} />
          <StatWidget icon="checkmark-done-circle" label="Total Reviews" value={stats.completed} trend="+42 today" color={'#C8B6E2'} C={C} />
          <StatWidget icon="alert-circle" label="At-Risk Students" value={stats.atRisk} trend="Review flagged" color={'#D4AF37'} C={C} />
        </View>

        {/* RECENT SUBMISSIONS TABLE-LIKE VIEW */}
        <PremiumCard C={C}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#064E3B' }}>Recent Activity</Text>
            <TouchableOpacity onPress={() => navigation.navigate('TeacherReview')}>
              <Text style={{ color: '#0B6E4F', fontWeight: '800' }}>View All Submissions →</Text>
            </TouchableOpacity>
          </View>

          {recent.length > 0 ? recent.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => navigation.navigate('TeacherReview', { recitation: item })}
              style={{
                flexDirection: 'row', alignItems: 'center', paddingVertical: 18,
                borderBottomWidth: i < recent.length - 1 ? 1 : 0,
                borderBottomColor: '#F0F0F0',
              }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: '#FFFDF0', alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#0B6E4F' }}>
                  {(item.student_name || item.studentName || 'S')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#064E3B' }}>
                  {item.student_name || item.studentName || 'Student'}
                </Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{item.surah} • Ayah {item.ayah}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: item.score >= 85 ? '#0B6E4F' : item.score >= 70 ? '#D4AF37' : '#DC2626' }}>{item.score}%</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{item.time}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#DDD" style={{ marginLeft: 16 }} />
            </TouchableOpacity>
          )) : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Ionicons name="cafe-outline" size={48} color="#DDD" />
              <Text style={{ color: '#6B7280', marginTop: 12 }}>All submissions reviewed!</Text>
            </View>
          )}
        </PremiumCard>

      </ScrollView>
    </SafeAreaView>
  );
}
