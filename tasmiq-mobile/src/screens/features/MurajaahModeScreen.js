/**
 * MurajaahModeScreen — Quran Revision Module
 * - Reveal/hide ayahs for memory practice
 * - Ustaz audio playback per ayah
 * - Tracks review cycles and session duration
 * - Saves progress to DB automatically
 * - Finish Session requires all ayahs reviewed at least once
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ScrollView,
  StatusBar, Modal, FlatList, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import quranData from '../../data/quran_data.json';
import { supabase } from '../../services/supabaseClient';
import { getCurrentUser } from '../../services/authService';
import { API_URL } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const E  = '#0B6E4F';
const ED = '#064E3B';
const EL = '#D1FAE5';
const G  = '#D4AF37';
const BG = '#FEFCE8';

export default function MurajaahModeScreen({ navigation }) {
  const { isDark } = useTheme();

  // ── Surah selection ─────────────────────────────────────────
  const [surahIndex,   setSurahIndex]   = useState(0);
  const [surahModal,   setSurahModal]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');

  const surah      = quranData[surahIndex];
  const totalAyahs = surah?.count || 0;

  // ── Revision state ───────────────────────────────────────────
  // revealed:  { ayahNum: boolean }  — currently visible?
  // cycles:    { ayahNum: number  }  — reveal/hide cycle count
  const [revealed,   setRevealed]   = useState({});
  const [cycles,     setCycles]     = useState({});   // # of reveal cycles per ayah
  const [sessionId,  setSessionId]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);

  // ── Audio ────────────────────────────────────────────────────
  const [sound,        setSound]        = useState(null);
  const [playingAyah,  setPlayingAyah]  = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isLooping,    setIsLooping]    = useState(false);
  const [isSlowMode,   setIsSlowMode]   = useState(false);

  // ── Timer ────────────────────────────────────────────────────
  const startTimeRef  = useRef(Date.now());
  const [elapsed,     setElapsed]     = useState(0); // seconds
  const timerRef      = useRef(null);

  // ── Computed stats ───────────────────────────────────────────
  const reviewedCount = useMemo(
    () => Object.values(cycles).filter(c => c >= 1).length,
    [cycles]
  );
  const totalCycles = useMemo(
    () => Object.values(cycles).reduce((s, c) => s + c, 0),
    [cycles]
  );
  const progress = totalAyahs > 0 ? Math.round((reviewedCount / totalAyahs) * 100) : 0;
  const allReviewed = reviewedCount >= totalAyahs && totalAyahs > 0;

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Start timer ──────────────────────────────────────────────
  useEffect(() => {
    startTimeRef.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [surahIndex]);

  // ── Load saved progress ──────────────────────────────────────
  useFocusEffect(useCallback(() => {
    loadProgress();
    return () => {
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [surahIndex]));

  const loadProgress = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { setLoading(false); return; }

      const { data } = await supabase
        .from('murajaah_sessions')
        .select('*')
        .eq('student_id', user.id)
        .eq('surah', surahIndex + 1)
        .eq('status', 'in_progress')
        .order('session_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setSessionId(data.id);
        const savedCycles = data.ayah_reps || {};
        const parsed = {};
        Object.entries(savedCycles).forEach(([k, v]) => { parsed[parseInt(k)] = v; });
        setCycles(parsed);
        setElapsed(data.total_reps || 0); // reuse total_reps as elapsed seconds
      } else {
        setSessionId(null);
        setCycles({});
        setElapsed(0);
        startTimeRef.current = Date.now();
      }
    } catch (err) {
      console.warn('loadProgress:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Auto-save progress ───────────────────────────────────────
  const autoSave = async (newCycles, elapsedSec) => {
    try {
      const user = await getCurrentUser();
      if (!user?.id) return;
      const reviewed = Object.values(newCycles).filter(c => c >= 1).length;
      const pct = totalAyahs > 0 ? Math.round((reviewed / totalAyahs) * 100) : 0;

      if (sessionId) {
        await supabase.from('murajaah_sessions').update({
          ayah_reps:           newCycles,
          total_reps:          elapsedSec,  // store elapsed seconds here
          completed_ayahs:     reviewed,
          progress_percentage: pct,
          updated_at:          new Date().toISOString(),
        }).eq('id', sessionId);
      } else {
        const { data } = await supabase.from('murajaah_sessions').insert([{
          student_id:          user.id,
          surah:               surahIndex + 1,
          start_ayah:          1,
          end_ayah:            totalAyahs,
          ayah_reps:           newCycles,
          total_reps:          elapsedSec,
          completed_ayahs:     reviewed,
          progress_percentage: pct,
          status:              'in_progress',
          session_date:        new Date().toISOString(),
        }]).select().maybeSingle();
        if (data) setSessionId(data.id);
      }
    } catch (err) {
      console.warn('autoSave:', err?.message);
    }
  };

  // ── Toggle reveal ─────────────────────────────────────────────
  const toggleReveal = (ayahNum) => {
    const isNowRevealed = !revealed[ayahNum];
    setRevealed(prev => ({ ...prev, [ayahNum]: isNowRevealed }));

    // Only increment cycle when REVEALING (not hiding)
    if (isNowRevealed) {
      const newCycles = { ...cycles, [ayahNum]: (cycles[ayahNum] || 0) + 1 };
      setCycles(newCycles);
      autoSave(newCycles, elapsed);
    }
  };

  // ── Audio playback ────────────────────────────────────────────
  const playAudio = async (ayahNum) => {
    try {
      if (playingAyah === ayahNum && sound) {
        await sound.stopAsync();
        setPlayingAyah(null);
        return;
      }
      if (sound) await sound.unloadAsync();
      setAudioLoading(true);
      setPlayingAyah(ayahNum);

      const sp = (surahIndex + 1).toString().padStart(3, '0');
      const ap = ayahNum.toString().padStart(3, '0');
      const uri = `${API_URL}/audio/${sp}/${ap}.mp3`;

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping, rate: isSlowMode ? 0.75 : 1.0, shouldCorrectPitch: true },
        status => { if (status.didJustFinish && !isLooping) setPlayingAyah(null); }
      );
      setSound(newSound);
    } catch {
      Alert.alert('Audio Error', 'Could not load audio. Make sure the backend is running.');
      setPlayingAyah(null);
    } finally {
      setAudioLoading(false);
    }
  };

  const toggleLoop = async () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    if (sound && playingAyah) await sound.setIsLoopingAsync(newLoop).catch(() => {});
  };

  const toggleSpeed = async () => {
    const newSlow = !isSlowMode;
    setIsSlowMode(newSlow);
    if (sound && playingAyah) await sound.setRateAsync(newSlow ? 0.75 : 1.0, true).catch(() => {});
  };

  // ── Finish session ────────────────────────────────────────────
  const handleFinish = async () => {
    if (!allReviewed) {
      const missing = Array.from({ length: totalAyahs }, (_, i) => i + 1)
        .filter(a => !cycles[a] || cycles[a] < 1);
      Alert.alert(
        'Session Incomplete',
        `Please review all ayahs before finishing.\n\nNot yet reviewed: Ayah ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`,
        [{ text: 'Continue Revising' }]
      );
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) throw new Error('Not logged in');

      // Get class
      const { data: membership } = await supabase
        .from('class_members').select('class_id').eq('student_id', user.id).limit(1).maybeSingle();

      const pct = 100;
      clearInterval(timerRef.current);

      // Update murajaah session to completed
      if (sessionId) {
        await supabase.from('murajaah_sessions').update({
          ayah_reps:           cycles,
          total_reps:          totalCycles,
          completed_ayahs:     totalAyahs,
          progress_percentage: pct,
          status:              'completed',
          updated_at:          new Date().toISOString(),
        }).eq('id', sessionId);
      } else {
        await supabase.from('murajaah_sessions').insert([{
          student_id:          user.id,
          surah:               surahIndex + 1,
          start_ayah:          1,
          end_ayah:            totalAyahs,
          ayah_reps:           cycles,
          total_reps:          totalCycles,
          completed_ayahs:     totalAyahs,
          progress_percentage: pct,
          status:              'completed',
          session_date:        new Date().toISOString(),
        }]);
      }

      setDone(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save session.');
    } finally {
      setSaving(false);
    }
  };

  // ── Change surah ──────────────────────────────────────────────
  const changeSurah = (index) => {
    if (sound) sound.unloadAsync().catch(() => {});
    setSound(null); setPlayingAyah(null);
    setSurahIndex(parseInt(index) - 1);
    setSurahModal(false); setSearchQuery('');
    setRevealed({}); setCycles({}); setSessionId(null);
    startTimeRef.current = Date.now(); setElapsed(0);
  };

  // ── Verse list ────────────────────────────────────────────────
  const verses = useMemo(() => {
    if (!surah?.verse) return [];
    return Object.entries(surah.verse)
      .map(([k, text]) => ({ num: parseInt(k.split('_')[1]), text }))
      .sort((a, b) => a.num - b.num);
  }, [surah]);

  // ── COMPLETION SCREEN ─────────────────────────────────────────
  if (done) {
    const now = new Date();
    const mins = Math.floor(elapsed / 60);
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:BG }}>
        <ScrollView contentContainerStyle={{ flexGrow:1, justifyContent:'center', alignItems:'center', padding:32 }}>
          <View style={{ width:88, height:88, borderRadius:44, backgroundColor:EL, alignItems:'center', justifyContent:'center', marginBottom:20 }}>
            <Text style={{ fontSize:44 }}>✅</Text>
          </View>
          <Text style={{ fontSize:24, fontWeight:'900', color:ED, marginBottom:6, textAlign:'center' }}>Murajaah Completed!</Text>
          <Text style={{ fontSize:14, color:'#6B7280', textAlign:'center', marginBottom:28, lineHeight:20 }}>
            Excellent effort! Your revision has been saved.
          </Text>

          {/* Summary */}
          <View style={{ backgroundColor:'white', borderRadius:20, padding:24, width:'100%', marginBottom:24, borderWidth:1, borderColor:EL, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:3 }}>
            {[
              { label:'Surah',             value: surah.name },
              { label:'Total Ayahs',       value: `${totalAyahs} ayahs` },
              { label:'Ayahs Reviewed',    value: `${totalAyahs} / ${totalAyahs}` },
              { label:'Total Reveal Cycles', value: `${totalCycles} cycles` },
              { label:'Session Duration',  value: `${mins} min${mins !== 1 ? 's' : ''}` },
              { label:'Completion Date',   value: now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) },
              { label:'Completion Time',   value: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) },
            ].map((item, i, arr) => (
              <View key={i} style={{ flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth: i < arr.length-1 ? 1 : 0, borderBottomColor:'#F3F4F6' }}>
                <Text style={{ fontSize:13, color:'#6B7280', fontWeight:'600' }}>{item.label}</Text>
                <Text style={{ fontSize:13, fontWeight:'800', color:ED }}>{item.value}</Text>
              </View>
            ))}
          </View>

          {/* Progress display */}
          <View style={{ width:'100%', backgroundColor:'white', borderRadius:16, padding:20, marginBottom:24, borderWidth:1, borderColor:EL }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }}>
              <Text style={{ fontSize:13, fontWeight:'700', color:'#6B7280' }}>Overall Progress</Text>
              <Text style={{ fontSize:13, fontWeight:'900', color:E }}>100%</Text>
            </View>
            <View style={{ height:8, backgroundColor:EL, borderRadius:4 }}>
              <View style={{ height:8, width:'100%', backgroundColor:E, borderRadius:4 }} />
            </View>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:8 }}>
              <Text style={{ fontSize:12, color:'#6B7280' }}>{totalAyahs} of {totalAyahs} Ayahs Reviewed</Text>
              <Text style={{ fontSize:12, color:E, fontWeight:'700' }}>0 Remaining</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => {
              // Navigate back to the main tab navigator, then to Home tab
              navigation.navigate('MainTabs', { screen: 'Home' });
            }}
            style={{ width:'100%', padding:17, borderRadius:16, backgroundColor:E, alignItems:'center', marginBottom:10, shadowColor:E, shadowOpacity:0.3, shadowRadius:10, elevation:5 }}
          >
            <Text style={{ color:'white', fontSize:16, fontWeight:'900' }}>Return to Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setDone(false);
              setRevealed({});
              setCycles({});
              setSessionId(null);
              startTimeRef.current = Date.now();
              setElapsed(0);
            }}
            style={{ width:'100%', padding:14, borderRadius:16, alignItems:'center', borderWidth:1.5, borderColor:E }}
          >
            <Text style={{ color:E, fontSize:14, fontWeight:'700' }}>Start New Session</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── MAIN SCREEN ───────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex:1, backgroundColor:BG }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={BG} />

      {/* Header */}
      <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:18, paddingTop:14, paddingBottom:12, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#E5E7EB' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width:36, height:36, borderRadius:10, backgroundColor:EL, alignItems:'center', justifyContent:'center', marginRight:12 }}>
          <Ionicons name="arrow-back" size={19} color={ED} />
        </TouchableOpacity>
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:17, fontWeight:'900', color:ED }}>{surah.name}</Text>
          <Text style={{ fontSize:11, color:'#6B7280' }}>Guided Revision · Tap to reveal · {totalAyahs} Ayahs</Text>
        </View>
        <TouchableOpacity onPress={() => setSurahModal(true)} style={{ backgroundColor:EL, borderRadius:9, paddingHorizontal:11, paddingVertical:7 }}>
          <Text style={{ fontSize:12, fontWeight:'700', color:ED }}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Progress stats bar */}
      <View style={{ backgroundColor:'white', paddingHorizontal:18, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#E5E7EB' }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:5 }}>
          <Text style={{ fontSize:12, fontWeight:'700', color:'#6B7280' }}>Reviewed: {reviewedCount}/{totalAyahs}</Text>
          <View style={{ flexDirection:'row', gap:12 }}>
            <Text style={{ fontSize:12, color:'#6B7280' }}>⏱ {formatTime(elapsed)}</Text>
            <Text style={{ fontSize:12, fontWeight:'900', color:E }}>{progress}%</Text>
          </View>
        </View>
        <View style={{ height:5, backgroundColor:EL, borderRadius:3 }}>
          <View style={{ height:5, width:`${progress}%`, backgroundColor:E, borderRadius:3 }} />
        </View>
      </View>

      {/* Playback controls */}
      <View style={{ flexDirection:'row', paddingHorizontal:16, paddingVertical:10, gap:10 }}>
        <TouchableOpacity onPress={toggleLoop} style={{ flex:1, borderRadius:10, paddingVertical:9, alignItems:'center', backgroundColor: isLooping ? E : 'white', borderWidth:1, borderColor: isLooping ? E : '#E5E7EB' }}>
          <Ionicons name="repeat" size={16} color={isLooping ? 'white' : '#6B7280'} />
          <Text style={{ fontSize:10, fontWeight:'700', color: isLooping ? 'white' : '#6B7280', marginTop:2 }}>Loop</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSpeed} style={{ flex:1, borderRadius:10, paddingVertical:9, alignItems:'center', backgroundColor: isSlowMode ? G : 'white', borderWidth:1, borderColor: isSlowMode ? G : '#E5E7EB' }}>
          <Ionicons name="speedometer-outline" size={16} color={isSlowMode ? '#7A5C00' : '#6B7280'} />
          <Text style={{ fontSize:10, fontWeight:'700', color: isSlowMode ? '#7A5C00' : '#6B7280', marginTop:2 }}>{isSlowMode ? 'Slow' : 'Normal'}</Text>
        </TouchableOpacity>
        <View style={{ flex:3, backgroundColor:EL, borderRadius:10, paddingVertical:9, paddingHorizontal:12, justifyContent:'center' }}>
          <Text style={{ fontSize:11, color:ED, fontWeight:'600' }}>Tap ayah to reveal · Tap 🔊 to listen</Text>
        </View>
      </View>

      {/* Ayah list */}
      {loading ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={E} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding:14, paddingBottom:120 }} showsVerticalScrollIndicator={false}>
          {verses.map((v) => {
            const isRevealed = !!revealed[v.num];
            const cycleCount = cycles[v.num] || 0;
            const isPlaying  = playingAyah === v.num;
            const isLoading  = audioLoading && playingAyah === v.num;

            return (
              <TouchableOpacity key={v.num} onPress={() => toggleReveal(v.num)} activeOpacity={0.88}
                style={{ backgroundColor: cycleCount >= 1 ? `${E}08` : 'white', borderRadius:16, marginBottom:10, padding:16, borderWidth:1, borderColor: cycleCount >= 1 ? `${E}30` : '#E5E7EB', shadowColor:'#000', shadowOpacity:0.03, shadowRadius:5, elevation:1 }}>
                {/* Row: ayah number + review badge + audio */}
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:isRevealed ? 12 : 0 }}>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    <View style={{ width:30, height:30, borderRadius:15, backgroundColor: cycleCount >= 1 ? E : EL, alignItems:'center', justifyContent:'center' }}>
                      <Text style={{ fontSize:12, fontWeight:'900', color: cycleCount >= 1 ? 'white' : ED }}>{v.num}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize:12, color:'#6B7280', fontWeight:'600' }}>Ayah {v.num}</Text>
                      {cycleCount >= 1 && <Text style={{ fontSize:10, color:E, fontWeight:'700' }}>Reviewed {cycleCount}×</Text>}
                    </View>
                  </View>

                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    {/* Audio button */}
                    <TouchableOpacity onPress={e => { e.stopPropagation?.(); playAudio(v.num); }}
                      style={{ width:34, height:34, borderRadius:17, backgroundColor: isPlaying ? E : EL, alignItems:'center', justifyContent:'center' }}>
                      {isLoading ? <ActivityIndicator size="small" color={isPlaying ? 'white' : ED} />
                        : <Ionicons name={isPlaying ? 'stop' : 'play'} size={15} color={isPlaying ? 'white' : ED} />}
                    </TouchableOpacity>

                    {/* Reveal/hide indicator */}
                    <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                      <Ionicons name={isRevealed ? 'eye-outline' : 'eye-off-outline'} size={13} color={isRevealed ? E : '#9CA3AF'} />
                      <Text style={{ fontSize:11, fontWeight:'600', color: isRevealed ? E : '#9CA3AF' }}>
                        {isRevealed ? 'Hide' : 'Reveal'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Arabic verse text (shown when revealed) */}
                {isRevealed ? (
                  <Text style={{ fontSize:24, textAlign:'right', color:ED, lineHeight:44, direction:'rtl', fontWeight:'500', fontFamily:'serif' }}>
                    {v.text}
                  </Text>
                ) : (
                  <View style={{ alignItems:'center', paddingVertical:10 }}>
                    <Text style={{ fontSize:12, color:'#9CA3AF', fontStyle:'italic' }}>Hidden — try reciting from memory, then tap to check</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Finish Session button */}
      <View style={{ position:'absolute', bottom:0, left:0, right:0, padding:14, backgroundColor:'white', borderTopWidth:1, borderTopColor:'#E5E7EB', shadowColor:'#000', shadowOpacity:0.06, shadowRadius:8, elevation:6 }}>
        {!allReviewed && (
          <Text style={{ fontSize:12, color:'#6B7280', textAlign:'center', marginBottom:8 }}>
            {reviewedCount < totalAyahs ? `Review ${totalAyahs - reviewedCount} more ayah${totalAyahs - reviewedCount > 1 ? 's' : ''} to finish` : ''}
          </Text>
        )}
        <TouchableOpacity onPress={handleFinish} disabled={saving}
          style={{ padding:16, borderRadius:14, alignItems:'center', backgroundColor: allReviewed ? E : '#D1D5DB', shadowColor: allReviewed ? E : 'transparent', shadowOpacity: allReviewed ? 0.3 : 0, shadowRadius:10, elevation: allReviewed ? 5 : 0 }}>
          {saving ? <ActivityIndicator color="white" />
            : <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <Ionicons name={allReviewed ? 'checkmark-circle' : 'lock-closed'} size={19} color={allReviewed ? 'white' : '#9CA3AF'} />
                <Text style={{ color: allReviewed ? 'white' : '#9CA3AF', fontSize:15, fontWeight:'900' }}>
                  {allReviewed ? 'Finish Session' : `${reviewedCount}/${totalAyahs} Reviewed`}
                </Text>
              </View>}
        </TouchableOpacity>
      </View>

      {/* Surah picker */}
      <Modal visible={surahModal} animationType="slide" transparent>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor:'white', borderTopLeftRadius:28, borderTopRightRadius:28, height:'75%', padding:20 }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <Text style={{ fontSize:18, fontWeight:'900', color:ED }}>Select Surah</Text>
              <TouchableOpacity onPress={() => { setSurahModal(false); setSearchQuery(''); }}>
                <Ionicons name="close-circle" size={30} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:BG, borderRadius:12, paddingHorizontal:12, marginBottom:12, borderWidth:1, borderColor:'#E5E7EB' }}>
              <Ionicons name="search" size={15} color="#9CA3AF" />
              <TextInput placeholder="Search…" style={{ flex:1, padding:10, fontSize:14, color:'#1F2937' }} onChangeText={setSearchQuery} value={searchQuery} />
            </View>
            <FlatList
              data={quranData.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.index.includes(searchQuery))}
              keyExtractor={item => item.index}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => changeSurah(item.index)} style={{ flexDirection:'row', alignItems:'center', paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', gap:12 }}>
                  <View style={{ width:34, height:34, borderRadius:17, backgroundColor:EL, alignItems:'center', justifyContent:'center' }}>
                    <Text style={{ fontSize:12, fontWeight:'800', color:ED }}>{parseInt(item.index)}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontSize:14, fontWeight:'700', color:'#1F2937' }}>{item.name}</Text>
                    <Text style={{ fontSize:11, color:'#6B7280' }}>{item.count} ayahs</Text>
                  </View>
                  {surahIndex === parseInt(item.index) - 1 && <Ionicons name="checkmark-circle" size={19} color={E} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

