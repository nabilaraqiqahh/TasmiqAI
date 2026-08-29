import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

export default function TeacherStudents({ navigation }) {
  const { isDark, colors: C } = useTheme();
  
  const STATUS_COLORS = {
    'On Track': { bg: '#0B6E4F' + '20', text: '#0B6E4F' },
    'At Risk': { bg: '#DC2626' + '20', text: '#DC2626' },
    'Improving': { bg: '#0B6E4F' + '20', text: '#0B6E4F' },
    'Inactive': { bg: '#99999920', text: '#999999' },
  };

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'student')
        .order('full_name', { ascending: true });
        
      if (error) throw error;
      
      const studentsData = (data || []).map(s => ({
        id:         s.uid,
        ...s,
        displayName: s.full_name || s.display_name || s.email,
        avgScore:   s.avg_score || 0,
        status:     (s.avg_score || 0) < 60 ? 'At Risk'
                  : (s.avg_score || 0) > 85 ? 'On Track'
                  : 'Improving',
        level:      s.level || 'Intermediate',
        lastActive: s.last_login
          ? new Date(s.last_login).toLocaleDateString()
          : 'Recently',
      }));
      
      setStudents(studentsData);
    } catch (error) {
      console.error("Load students error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const filtered = students.filter(s =>
    (s.displayName || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFDF0' }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={'#FFFDF0'} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 0 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14 }}>
          <Ionicons name="arrow-back" size={24} color={'#064E3B'} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#064E3B' }}>Student Database</Text>
          <Text style={{ fontSize: 13, color: '#6B7280' }}>{filtered.length} students enrolled</Text>
        </View>
      </View>

      {/* Search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', margin: 20, marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}>
        <Ionicons name="search" size={18} color={'#6B7280'} />
        <TextInput
          placeholder="Search by name..."
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: '#064E3B' }}
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close" size={18} color={'#6B7280'} /></TouchableOpacity> : null}
      </View>

      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={'#0B6E4F'} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={{ padding: 20, paddingTop: 0 }} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStudents(); }} colors={['#0B6E4F']} />}
        >
          {filtered.length > 0 ? filtered.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={{
                backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 12,
                flexDirection: 'row', alignItems: 'center',
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
              }}
            >
              {/* Avatar */}
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#C8B6E2' + '30', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#C8B6E2' }}>{s.displayName?.[0] ?? '?'}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#064E3B', marginBottom: 3 }}>{s.displayName || 'Unknown Student'}</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>{s.level} • {s.lastActive}</Text>
                {/* Progress bar */}
                <View style={{ height: 5, backgroundColor: '#F0F0F0', borderRadius: 3, width: '85%' }}>
                  <View style={{ width: `${s.progress || 0}%`, height: 5, backgroundColor: '#0B6E4F', borderRadius: 3 }} />
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: (s.avgScore || 0) >= 80 ? '#0B6E4F' : (s.avgScore || 0) >= 65 ? '#D4AF37' : '#DC2626' }}>
                  {s.avgScore || 0}%
                </Text>
                <View style={{ backgroundColor: STATUS_COLORS[s.status]?.bg || '#99999920', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: STATUS_COLORS[s.status]?.text || '#999' }}>{s.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )) : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: '#6B7280' }}>No students found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
