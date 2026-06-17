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
    'On Track': { bg: C.green + '20', text: C.green },
    'At Risk': { bg: C.red + '20', text: C.red },
    'Improving': { bg: C.primary + '20', text: C.primary },
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
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 0 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text }}>Student Database</Text>
          <Text style={{ fontSize: 13, color: C.muted }}>{filtered.length} students enrolled</Text>
        </View>
      </View>

      {/* Search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', margin: 20, marginBottom: 12, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput
          placeholder="Search by name..."
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: C.text }}
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close" size={18} color={C.muted} /></TouchableOpacity> : null}
      </View>

      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={{ padding: 20, paddingTop: 0 }} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStudents(); }} colors={[C.primary]} />}
        >
          {filtered.length > 0 ? filtered.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={{
                backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 12,
                flexDirection: 'row', alignItems: 'center',
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
              }}
            >
              {/* Avatar */}
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: C.lilac + '30', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: C.lilac }}>{s.displayName?.[0] ?? '?'}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 3 }}>{s.displayName || 'Unknown Student'}</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{s.level} • {s.lastActive}</Text>
                {/* Progress bar */}
                <View style={{ height: 5, backgroundColor: '#F0F0F0', borderRadius: 3, width: '85%' }}>
                  <View style={{ width: `${s.progress || 0}%`, height: 5, backgroundColor: C.primary, borderRadius: 3 }} />
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: (s.avgScore || 0) >= 80 ? C.green : (s.avgScore || 0) >= 65 ? C.gold : C.red }}>
                  {s.avgScore || 0}%
                </Text>
                <View style={{ backgroundColor: STATUS_COLORS[s.status]?.bg || '#99999920', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: STATUS_COLORS[s.status]?.text || '#999' }}>{s.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )) : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: C.muted }}>No students found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
