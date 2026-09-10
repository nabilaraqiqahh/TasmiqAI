import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { getRecitationHistory } from '../../services/recitationService';
import { getCurrentUser } from '../../services/authService';
import { supabase } from '../../services/supabaseClient';

// Design tokens
const P   = '#0B6E4F';
const PD  = '#064E3B';
const PL  = '#E8F5EE';
const G   = '#C8A84B';
const BG  = '#FFF9E8';
const RED = '#DC2626';

function formatDate(ts) {
  if (!ts) return 'Unknown date';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Invalid date';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// Map surah number -> name (static lookup using known totals)
const SURAH_NAMES = [
  'Al-Fatihah','Al-Baqarah','Ali Imran','An-Nisa','Al-Maidah','Al-Anam','Al-Araf','Al-Anfal','At-Tawbah','Yunus',
  'Hud','Yusuf','Ar-Rad','Ibrahim','Al-Hijr','An-Nahl','Al-Isra','Al-Kahf','Maryam','Ta-Ha',
  'Al-Anbiya','Al-Hajj','Al-Muminun','An-Nur','Al-Furqan','Ash-Shuara','An-Naml','Al-Qasas','Al-Ankabut','Ar-Rum',
  'Luqman','As-Sajdah','Al-Ahzab','Saba','Fatir','Ya-Sin','As-Saffat','Sad','Az-Zumar','Ghafir',
  'Fussilat','Ash-Shuraa','Az-Zukhruf','Ad-Dukhan','Al-Jathiyah','Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf',
  'Adh-Dhariyat','At-Tur','An-Najm','Al-Qamar','Ar-Rahman','Al-Waqiah','Al-Hadid','Al-Mujadilah','Al-Hashr','Al-Mumtahanah',
  'As-Saf','Al-Jumuah','Al-Munafiqun','At-Taghabun','At-Talaq','At-Tahrim','Al-Mulk','Al-Qalam','Al-Haqqah','Al-Maarij',
  'Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyamah','Al-Insan','Al-Mursalat','An-Naba','An-Naziat','Abasa',
  'At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Inshiqaq','Al-Buruj','At-Tariq','Al-Ala','Al-Ghashiyah','Al-Fajr','Al-Balad',
  'Ash-Shams','Al-Layl','Ad-Duha','Ash-Sharh','At-Tin','Al-Alaq','Al-Qadr','Al-Bayyinah','Az-Zalzalah','Al-Adiyat',
  'Al-Qariah','At-Takathur','Al-Asr','Al-Humazah','Al-Fil','Quraysh','Al-Maun','Al-Kawthar','Al-Kafirun','An-Nasr',
  'Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas',
];

// ─── Murajaah session card ────────────────────────────────────────────────────
function MurajaahCard({ session }) {
  const [expanded, setExpanded] = useState(false);
  const surahNum = session.surah;
  const surahName = SURAH_NAMES[surahNum - 1] || `Surah ${surahNum}`;
  const pct = session.progress_percentage ?? 0;
  const completed = session.completed_ayahs ?? 0;
  const startAyah = session.start_ayah ?? 1;
  const endAyah = session.end_ayah ?? '?';
  const totalAyahs = endAyah !== '?' ? endAyah - startAyah + 1 : '?';
  const totalReps = session.total_reps ?? 0;
  const isDone = session.status === 'completed';
  const ayahReps = session.ayah_reps || {};
  const reviewedAyahs = Object.entries(ayahReps).filter(([, v]) => v >= 1);
  const totalCycles = Object.values(ayahReps).reduce((s, c) => s + c, 0);

  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: isDone ? PL : '#FEF3C7',
      shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
    }}>
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={{
              width: 42, height: 42, borderRadius: 12,
              backgroundColor: isDone ? PL : '#FEF3C7',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="repeat" size={20} color={isDone ? P : G} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: PD }}>{surahName}</Text>
                <View style={{
                  backgroundColor: isDone ? PL : '#FEF3C7',
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: isDone ? PD : '#92400E' }}>
                    {isDone ? 'COMPLETED' : 'IN PROGRESS'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                Murajaah · Ayah {startAyah}–{endAyah}
              </Text>
              <Text style={{ fontSize: 11, color: '#D1D5DB', marginTop: 1 }}>
                {formatDate(session.session_date)}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: isDone ? P : G }}>{pct}%</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ marginTop: 10, height: 5, backgroundColor: '#F3F4F6', borderRadius: 4 }}>
          <View style={{ height: 5, borderRadius: 4, backgroundColor: isDone ? P : G, width: `${Math.min(pct, 100)}%` }} />
        </View>
      </TouchableOpacity>

      {/* Expanded details */}
      {expanded && (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {[
              { label: 'Ayahs Reviewed', val: `${completed} / ${totalAyahs}`, icon: 'checkmark-circle-outline' },
              { label: 'Total Cycles',   val: totalCycles,                    icon: 'refresh-outline' },
              { label: 'Session Time',   val: formatDuration(totalReps),      icon: 'time-outline' },
              { label: 'Status',         val: isDone ? 'Done ✅' : 'Ongoing 🔄', icon: 'flag-outline' },
            ].map(m => (
              <View key={m.label} style={{ backgroundColor: PL, padding: 10, borderRadius: 10, flex: 1, minWidth: '45%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <Ionicons name={m.icon} size={11} color={P} />
                  <Text style={{ fontSize: 10, color: '#6B7280' }}>{m.label}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: PD }}>{m.val}</Text>
              </View>
            ))}
          </View>

          {reviewedAyahs.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: P, marginBottom: 6 }}>Ayah Review Breakdown:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {reviewedAyahs.map(([ayah, reps]) => (
                  <View key={ayah} style={{
                    backgroundColor: reps >= 3 ? PD : reps >= 2 ? P : PL,
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: reps >= 2 ? '#fff' : PD }}>
                      Ayah {ayah} ×{reps}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6 }}>Darker = reviewed more times</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function HistoryScreen({ navigation }) {
  const [history,         setHistory]         = useState([]);
  const [murajaahHistory, setMurajaahHistory] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [activeTab,       setActiveTab]       = useState('Recitation');
  const [filter,          setFilter]          = useState('All');
  const [sortOrder,       setSortOrder]       = useState('desc');
  const [expandedId,      setExpandedId]      = useState(null);
  const [playingId,       setPlayingId]       = useState(null);

  const soundRef = useRef(null);

  useEffect(() => {
    loadHistory();
    return () => {
      if (soundRef.current) { soundRef.current.unloadAsync().catch(() => {}); }
    };
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const session = await getCurrentUser();
      if (!session?.id) return;
      // Load recitation history
      const data = await getRecitationHistory(session.id);
      setHistory(Array.isArray(data) ? data : []);
      // Load murajaah sessions
      const { data: mData } = await supabase
        .from('murajaah_sessions')
        .select('*')
        .eq('student_id', session.id)
        .order('session_date', { ascending: false });
      setMurajaahHistory(Array.isArray(mData) ? mData : []);
    } catch (err) {
      console.error('[HistoryScreen]', err);
    } finally {
      setLoading(false);
    }
  };

  const togglePlayAudio = async (item) => {
    if (!item.audio_url) {
      if (Platform.OS === 'web') { alert('No audio recording saved for this recitation.'); }
      else { Alert.alert('No Audio', 'No audio recording saved for this recitation.'); }
      return;
    }
    try {
      if (playingId === item.id && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingId(null); return;
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingId(item.id);
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.audio_url },
        { shouldPlay: true },
        (s) => { if (s.didJustFinish) setPlayingId(null); }
      );
      soundRef.current = sound;
    } catch (err) {
      console.error('[HistoryScreen] playback:', err);
      setPlayingId(null);
      if (Platform.OS === 'web') { alert('Could not play audio.'); }
      else { Alert.alert('Playback Error', 'Could not play audio.'); }
    }
  };

  const filteredRecitation = history
    .filter(item => {
      if (filter === 'All') return true;
      if (filter === 'Assessment') return !item.is_exercise;
      if (filter === 'Exercise')   return  item.is_exercise;
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.submitted_at || a.recorded_at || 0);
      const db = new Date(b.submitted_at || b.recorded_at || 0);
      return sortOrder === 'desc' ? db - da : da - db;
    });

  const filteredMurajaah = [...murajaahHistory].sort((a, b) => {
    const da = new Date(a.session_date || 0);
    const db = new Date(b.session_date || 0);
    return sortOrder === 'desc' ? db - da : da - db;
  });

  const getAttemptNumber = (item) => {
    if (!item.is_exercise) return null;
    const same = history
      .filter(r => r.is_exercise && r.surah_number === item.surah_number)
      .sort((a, b) => new Date(a.submitted_at || a.recorded_at || 0) - new Date(b.submitted_at || b.recorded_at || 0));
    const idx = same.findIndex(r => r.id === item.id);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={[P, PD]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1.5 }}>YOUR RECORDS</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginTop: 2 }}>History</Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="time" size={22} color={G} />
          </View>
        </View>

        {/* Tab switcher: Recitation | Murajaah */}
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 3, marginBottom: 12 }}>
          {['Recitation', 'Murajaah'].map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                backgroundColor: activeTab === tab ? '#FFFFFF' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === tab ? PD : 'rgba(255,255,255,0.75)' }}>
                {tab === 'Recitation' ? '🎙 Recitation' : '🔄 Murajaah'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recitation: filter + sort chips */}
        {activeTab === 'Recitation' && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {['All', 'Assessment', 'Exercise'].map(tab => (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilter(tab)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: filter === tab ? G : 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: filter === tab ? G : 'rgba(255,255,255,0.2)' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: filter === tab ? PD : 'rgba(255,255,255,0.85)' }}>
                  {tab === 'Exercise' ? 'AI Practice' : tab}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>
                {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Murajaah: sort only */}
        {activeTab === 'Murajaah' && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              onPress={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>
                {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={P} />
          <Text style={{ color: '#9CA3AF', marginTop: 12 }}>Loading history...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* ── MURAJAAH TAB ── */}
          {activeTab === 'Murajaah' && (
            <>
              {/* Summary stats row */}
              {murajaahHistory.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total Sessions', val: murajaahHistory.length, icon: 'repeat' },
                    { label: 'Completed',      val: murajaahHistory.filter(s => s.status === 'completed').length, icon: 'checkmark-circle' },
                    { label: 'In Progress',    val: murajaahHistory.filter(s => s.status !== 'completed').length, icon: 'time' },
                  ].map(s => (
                    <View key={s.label} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0' }}>
                      <Ionicons name={s.icon} size={20} color={P} />
                      <Text style={{ fontSize: 20, fontWeight: '900', color: PD, marginTop: 4 }}>{s.val}</Text>
                      <Text style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginTop: 2 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {filteredMurajaah.length === 0 ? (
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 36, alignItems: 'center', marginTop: 20 }}>
                  <Ionicons name="repeat-outline" size={48} color="#D1D5DB" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#9CA3AF', marginTop: 14 }}>No Murajaah Sessions Yet</Text>
                  <Text style={{ fontSize: 13, color: '#D1D5DB', textAlign: 'center', marginTop: 6 }}>
                    Start a Murajaah session to track your revision progress here.
                  </Text>
                </View>
              ) : filteredMurajaah.map(session => (
                <MurajaahCard key={session.id} session={session} />
              ))}
            </>
          )}

          {/* ── RECITATION TAB ── */}
          {activeTab === 'Recitation' && (
            <>
          {filteredRecitation.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 36, alignItems: 'center', marginTop: 20 }}>
              <Ionicons name="time-outline" size={48} color="#D1D5DB" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#9CA3AF', marginTop: 14 }}>No Recitations Found</Text>
              <Text style={{ fontSize: 13, color: '#D1D5DB', textAlign: 'center', marginTop: 6 }}>
                {filter === 'All' ? 'You have not submitted any recitations yet.' : `No ${filter.toLowerCase()} recitations found.`}
              </Text>
            </View>
          ) : filteredRecitation.map((item) => {
            const isExpanded = expandedId === item.id;
            const isPlaying  = playingId  === item.id;
            const attemptNo  = getAttemptNumber(item);
            const passed     = (item.score || 0) >= 70;

            return (
              <View key={item.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F0F0F0', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 }}>
                <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : item.id)} activeOpacity={0.7}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: item.is_exercise ? PL : '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={item.is_exercise ? 'sparkles' : 'ribbon'} size={20} color={item.is_exercise ? P : G} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: PD }}>
                            {item.surah || `Surah ${item.surah_number}`}
                          </Text>
                          {item.is_exercise && attemptNo && (
                            <View style={{ backgroundColor: P + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: P }}>#{attemptNo}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                          {item.is_exercise ? 'AI Practice' : 'Official Assessment'} · Ayah {item.ayah || `${item.start_verse}–${item.end_verse}`}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#D1D5DB', marginTop: 1 }}>
                          {formatDate(item.submitted_at || item.recorded_at)}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {item.is_exercise ? (
                        <View style={{ backgroundColor: passed ? PL : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: passed ? PD : '#92400E' }}>
                            {item.score || 0}%
                          </Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: item.status === 'approved' ? PL : item.status === 'repeat' ? '#FEE2E2' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: item.status === 'approved' ? PD : item.status === 'repeat' ? RED : '#92400E' }}>
                            {item.status === 'approved' ? 'PASS' : item.status === 'repeat' ? 'REPEAT' : 'PENDING'}
                          </Text>
                        </View>
                      )}
                      {item.audio_url && (
                        <TouchableOpacity
                          onPress={() => togglePlayAudio(item)}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isPlaying ? '#FEF3C7' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color={isPlaying ? G : P} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Expanded detail */}
                {isExpanded && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                    {item.is_exercise && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {[
                          { label: 'Memorization',  val: item.memorization_score },
                          { label: 'Pronunciation', val: item.pronunciation_score },
                          { label: 'Tajweed',       val: item.tajwid_score ?? item.tajeed_score },
                          { label: 'Fluency',       val: item.fluency_score },
                        ].filter(m => m.val != null).map(m => (
                          <View key={m.label} style={{ backgroundColor: PL, padding: 8, borderRadius: 8, flex: 1, minWidth: '44%' }}>
                            <Text style={{ fontSize: 10, color: '#6B7280' }}>{m.label}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: PD }}>{m.val}%</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {item.feedback && (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: P, marginBottom: 3 }}>
                          {item.is_exercise ? 'AI Feedback:' : 'Teacher Feedback:'}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#6B7280', lineHeight: 19 }}>{item.feedback}</Text>
                      </View>
                    )}
                    {!item.is_exercise && item.reviewed && (
                      <TouchableOpacity
                        onPress={() => navigation.navigate('TeacherEvaluation', { recitation: item })}
                        style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: P, paddingVertical: 10, borderRadius: 10 }}
                      >
                        <Ionicons name="ribbon-outline" size={16} color="white" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: 'white' }}>View Teacher Evaluation</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
