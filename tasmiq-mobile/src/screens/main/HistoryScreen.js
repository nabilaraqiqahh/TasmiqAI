import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabaseClient';
import { getRecitationHistory } from '../../services/recitationService';
import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';

function ScoreBadge({ score }) {
  const { colors: C } = useTheme();
  // Defensive check for missing or null score
  const safeScore = score ?? 0;
  const color = safeScore >= 90 ? C.primary : safeScore >= 75 ? C.accent : '#E05252';
  const bg = safeScore >= 90 ? C.primary + '18' : safeScore >= 75 ? C.accent + '18' : '#FFECEC';
  
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color }}>{safeScore}%</Text>
    </View>
  );
}

function formatDate(timestamp) {
  if (!timestamp) return 'Date unknown';
  
  try {
    const d = (timestamp && typeof timestamp.toDate === 'function') 
      ? timestamp.toDate() 
      : new Date(timestamp);
    
    if (isNaN(d.getTime())) return 'Invalid date';

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    // Safer time formatting without depending on Intl polyfills
    const pad = (n) => n < 10 ? '0'+n : n;
    const hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes} ${ampm}`;
    
    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch (e) {
    console.warn('Error formatting date:', e);
    return 'Format error';
  }
}

export default function HistoryScreen() {
  const { isDark, colors: C } = useTheme();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    let isMounted = true;
    
    const fetchHistory = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        
        if (user && isMounted) {
          const data = await getRecitationHistory(user.id);
          if (isMounted) {
            setHistory(Array.isArray(data) ? data : []);
          }
        }
      } catch (err) {
        console.error('History fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();
    return () => { isMounted = false; };
  }, []);

  const FILTERS = ['All', 'Recitation', "Muraja'ah"];
  const filtered = Array.isArray(history) 
    ? (filter === 'All' ? history : history.filter(h => h && h.type === filter))
    : [];

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.text }}>History</Text>
        <Text style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>Your past recitation sessions</Text>
      </View>

      {/* Filter Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 16 }}>
        {FILTERS.map((tab, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setFilter(tab)}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              backgroundColor: filter === tab ? C.primary : C.card,
              marginRight: 8,
              shadowColor: '#000', shadowOpacity: filter === tab ? 0.15 : 0.04,
              shadowRadius: 6, elevation: filter === tab ? 3 : 1,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: filter === tab ? '#FFFFFF' : C.muted }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ color: C.muted, marginTop: 12 }}>Loading history...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="mic-off-outline" size={48} color="#CCCCCC" />
              <Text style={{ color: C.muted, marginTop: 16, fontSize: 15 }}>No sessions yet.</Text>
              <Text style={{ color: '#AAAAAA', marginTop: 6, fontSize: 13 }}>Start your first recitation!</Text>
            </View>
          ) : (
            filtered.map((item, i) => {
              if (!item) return null; // Defensive check
              
              return (
                <TouchableOpacity
                  key={item.id || i}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: C.card, borderRadius: 16, padding: 18,
                    marginBottom: 12, flexDirection: 'row', alignItems: 'center',
                    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 }, elevation: 2,
                  }}
                >
                  <View style={{
                    width: 46, height: 46, borderRadius: 13,
                    backgroundColor: item.type === 'Recitation' ? C.primary + '15' : C.accent + '18',
                    alignItems: 'center', justifyContent: 'center', marginRight: 14,
                  }}>
                    <Ionicons
                      name={item.type === 'Recitation' ? 'mic-outline' : 'refresh-outline'}
                      size={20}
                      color={item.type === 'Recitation' ? C.primary : C.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 3 }}>{item.surah || 'Unnamed Session'}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>Ayah {item.ayah || '-'}  ·  {item.type || 'Recitation'}</Text>
                    <Text style={{ fontSize: 11, color: '#AAAAAA' }}>{formatDate(item.recordedAt)}</Text>
                  </View>
                  <ScoreBadge score={item.score} />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
      </SafeAreaView>
    </IslamicBackground>
  );
}
