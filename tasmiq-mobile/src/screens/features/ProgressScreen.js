import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import IslamicBackground from '../../components/IslamicBackground';
function ProgressBar({ label, value, color }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 14, color: C.text, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 14, color: color, fontWeight: '700' }}>{value}%</Text>
      </View>
      <View style={{ height: 8, backgroundColor: '#F0F0F0', borderRadius: 8 }}>
        <View style={{ width: `${value}%`, height: 8, backgroundColor: color, borderRadius: 8 }} />
      </View>
    </View>
  );
}

function StatCard({ icon, value, label, color }) {
  const { colors: C } = useTheme();
  return (
    <View style={{
      flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 18,
      alignItems: 'center', marginHorizontal: 5,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    }}>
      <View style={{
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: color + '18', alignItems: 'center',
        justifyContent: 'center', marginBottom: 10,
      }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const weekData = [
  { day: 'Mon', score: 70 },
  { day: 'Tue', score: 85 },
  { day: 'Wed', score: 60 },
  { day: 'Thu', score: 90 },
  { day: 'Fri', score: 88 },
  { day: 'Sat', score: 75 },
  { day: 'Sun', score: 82 },
];

const maxScore = 100;

export default function ProgressScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>My Progress</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Stats Row */}
        <View style={{ flexDirection: 'row', marginHorizontal: -5, marginBottom: 24 }}>
          <StatCard icon="mic" value="24" label="Sessions" color={C.primary} />
          <StatCard icon="star" value="85%" label="Avg Score" color={C.accent} />
          <StatCard icon="flame" value="7" label="Day Streak" color="#E0952F" />
        </View>

        {/* Weekly Chart */}
        <View style={{
          backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 20 }}>This Week's Scores</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 }}>
            {weekData.map((d, i) => (
              <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                <View style={{
                  width: 28,
                  height: (d.score / maxScore) * 100,
                  backgroundColor: d.score === Math.max(...weekData.map(x => x.score)) ? C.primary : C.primary + '50',
                  borderRadius: 6,
                  marginBottom: 8,
                }} />
                <Text style={{ fontSize: 11, color: C.muted }}>{d.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Skill Breakdown */}
        <View style={{
          backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 20 }}>Skill Breakdown</Text>
          <ProgressBar label="Tajwid Rules" value={88} color={C.primary} />
          <ProgressBar label="Makhraj (Articulation)" value={74} color="#4A90A4" />
          <ProgressBar label="Fluency & Rhythm" value={81} color={C.accent} />
          <ProgressBar label="Memorisation Accuracy" value={92} color="#7E57C2" />
        </View>

        {/* Surah Progress */}
        <View style={{
          backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 24,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 16 }}>Surah Progress</Text>
          {[
            { name: 'Al-Fatihah', ayahs: 7, done: 7 },
            { name: 'Al-Baqarah', ayahs: 286, done: 48 },
            { name: 'Al-Ikhlas', ayahs: 4, done: 4 },
          ].map((s, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, color: C.text, fontWeight: '600' }}>{s.name}</Text>
                <Text style={{ fontSize: 13, color: C.muted }}>{s.done}/{s.ayahs} ayahs</Text>
              </View>
              <View style={{ height: 6, backgroundColor: '#F0F0F0', borderRadius: 6 }}>
                <View style={{
                  width: `${(s.done / s.ayahs) * 100}%`,
                  height: 6, backgroundColor: s.done === s.ayahs ? C.primary : C.accent, borderRadius: 6,
                }} />
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
      </SafeAreaView>
    </IslamicBackground>
  );
}
