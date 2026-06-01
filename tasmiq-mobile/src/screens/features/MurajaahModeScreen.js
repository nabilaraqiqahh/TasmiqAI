import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, Modal, FlatList, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import quranData from '../../data/quran_data.json';
import { API_URL } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../services/supabaseClient';
import { saveRecitationResult } from '../../services/recitationService';
import IslamicBackground from '../../components/IslamicBackground';

export default function MurajaahModeScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const [surahModalVisible, setSurahModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Simulated AI selection (picks a random or weak surah)
  const initialSurahIndex = useMemo(() => Math.floor(Math.random() * quranData.length), []);
  const [selectedSurahIndex, setSelectedSurahIndex] = useState(initialSurahIndex);
  
  const [revealed, setRevealed] = useState({});
  const [refSound, setRefSound] = useState(null);
  const [playingAyah, setPlayingAyah] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Muraja'ah specific controls
  const [isLooping, setIsLooping] = useState(false);
  const [isSlowMode, setIsSlowMode] = useState(false);

  // Simulated Adaptive AI Recommendations
  const weakAyahs = useMemo(() => {
    const current = quranData[selectedSurahIndex];
    return [Math.ceil(current.count / 3), Math.ceil(current.count / 2)].filter(a => a <= current.count);
  }, [selectedSurahIndex]);

  const currentSurah = quranData[selectedSurahIndex];

  useEffect(() => {
    // Reveal first few ayahs as a guide
    const initialReveal = {};
    for (let i = 1; i <= Math.min(3, currentSurah.count); i++) {
      initialReveal[i] = true;
    }
    setRevealed(initialReveal);
  }, [selectedSurahIndex, currentSurah.count]);

  useEffect(() => {
    return () => {
      if (refSound) {
        refSound.unloadAsync();
      }
    };
  }, []);

  const playRefAudio = async (ayahNum) => {
    try {
      if (playingAyah === ayahNum && refSound) {
        await refSound.stopAsync();
        setPlayingAyah(null);
        return;
      }

      if (refSound) {
        await refSound.unloadAsync();
      }

      setIsLoadingAudio(true);
      setPlayingAyah(ayahNum);

      const surahPad = (selectedSurahIndex + 1).toString().padStart(3, '0');
      const ayahPad = ayahNum.toString().padStart(3, '0');
      const audioUrl = `${API_URL}/audio/${surahPad}/${ayahPad}.mp3`;

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { 
          shouldPlay: true,
          isLooping: isLooping,
          rate: isSlowMode ? 0.75 : 1.0,
          shouldCorrectPitch: true
        },
        (status) => {
          if (status.didJustFinish && !isLooping) {
            setPlayingAyah(null);
          }
        }
      ).catch(e => {
        throw new Error("Connection timeout");
      });

      setRefSound(sound);
    } catch (error) {
      console.error("Error playing reference audio:", error);
      Alert.alert(
        "Audio Error", 
        "Failed to load audio for Muraja'ah. Please try again."
      );
      setPlayingAyah(null);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const verses = useMemo(() => {
    return Object.entries(currentSurah.verse).map(([key, text]) => ({
      num: parseInt(key.split('_')[1]),
      text
    })).sort((a, b) => a.num - b.num);
  }, [currentSurah]);

  const toggleReveal = (num) => setRevealed(prev => ({ ...prev, [num]: !prev[num] }));

  const selectSurah = (index) => {
    if (refSound) {
      refSound.unloadAsync();
      setRefSound(null);
      setPlayingAyah(null);
    }
    setSelectedSurahIndex(parseInt(index) - 1);
    setSurahModalVisible(false);
    setSearchQuery('');
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (user) {
        await saveRecitationResult(user.id, {
          surah: currentSurah.name,
          ayah: 1,
          score: 100,
          tajwid: 100,
          makhraj: 100,
          feedback: "Completed Guided Muraja'ah session.",
          type: "Muraja'ah"
        });
      }
      navigation.navigate('Home');
    } catch (e) {
      console.error("Failed to save muraja'ah session:", e);
      navigation.navigate('Home');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Audio Speed
  const toggleSpeed = async () => {
    const newSpeed = !isSlowMode;
    setIsSlowMode(newSpeed);
    if (refSound && playingAyah) {
      await refSound.setRateAsync(newSpeed ? 0.75 : 1.0, true);
    }
  };

  // Toggle Loop
  const toggleLoop = async () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    if (refSound && playingAyah) {
      await refSound.setIsLoopingAsync(newLoop);
    }
  };

  return (
    <IslamicBackground variant="minimal">
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Muraja'ah Mode</Text>
          <Text style={{ fontSize: 13, color: C.muted }}>Guided Revision • Tap to reveal</Text>
        </View>
        <TouchableOpacity 
          onPress={() => setSurahModalVisible(true)}
          style={{
            backgroundColor: C.primary + '20', borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 8,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>Change</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* AI Selection Recommendation Panel */}
        <View style={{
          backgroundColor: C.lilac + '25', borderRadius: 18, padding: 20, marginBottom: 20,
          borderLeftWidth: 4, borderLeftColor: C.lilac,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="sparkles" size={16} color={C.lilac} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.lilac }}>TODAY'S REVISION TARGET</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 }}>{currentSurah.name}</Text>
          <Text style={{ fontSize: 14, color: C.muted, lineHeight: 22 }}>
            AI suggests reviewing this surah to strengthen your long-term memorization. 
            {weakAyahs.length > 0 && ` Focus specifically on Ayah ${weakAyahs.join(' and ')}.`}
          </Text>
        </View>

        {/* Global Playback Controls */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <TouchableOpacity 
            onPress={toggleLoop}
            style={{
              flex: 1, backgroundColor: isLooping ? C.primary : C.card, 
              borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginRight: 10,
              borderWidth: 1, borderColor: isLooping ? C.primary : C.border,
            }}
          >
            <Ionicons name="repeat" size={20} color={isLooping ? '#FFF' : C.muted} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: isLooping ? '#FFF' : C.muted, marginTop: 4 }}>Loop Active</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={toggleSpeed}
            style={{
              flex: 1, backgroundColor: isSlowMode ? C.accent : C.card, 
              borderRadius: 14, paddingVertical: 12, alignItems: 'center',
              borderWidth: 1, borderColor: isSlowMode ? C.accent : C.border,
            }}
          >
            <Ionicons name="speedometer-outline" size={20} color={isSlowMode ? '#B59100' : C.muted} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: isSlowMode ? '#B59100' : C.muted, marginTop: 4 }}>
              {isSlowMode ? 'Slow (0.75x)' : 'Normal (1.0x)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Verse Cards */}
        {verses.map((v) => {
          const isWeak = weakAyahs.includes(v.num);
          return (
            <TouchableOpacity 
              key={v.num} 
              onPress={() => toggleReveal(v.num)}
              activeOpacity={0.9}
              style={{
                backgroundColor: C.card, borderRadius: 18, padding: 20, marginBottom: 14,
                shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
                borderWidth: isWeak ? 1.5 : 0, borderColor: isWeak ? C.lilac : 'transparent'
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: revealed[v.num] ? 16 : 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    backgroundColor: isWeak ? C.lilac + '20' : C.primary + '15', borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 4, marginRight: 10
                  }}>
                    <Text style={{ fontSize: 12, color: isWeak ? C.lilac : C.primary, fontWeight: '700' }}>
                      Ayah {v.num} {isWeak ? '⭐' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => playRefAudio(v.num)}
                    style={{
                      width: 32, height: 32, borderRadius: 16, backgroundColor: playingAyah === v.num ? C.primary : C.bg,
                      alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {isLoadingAudio && playingAyah === v.num ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name={playingAyah === v.num ? "stop" : "play"} size={16} color={playingAyah === v.num ? "#FFF" : C.primary} />
                    )}
                  </TouchableOpacity>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name={revealed[v.num] ? 'eye-outline' : 'eye-off-outline'} size={14} color={revealed[v.num] ? C.muted : C.primary} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: revealed[v.num] ? C.muted : C.primary }}>
                    {revealed[v.num] ? 'Hide' : 'Reveal'}
                  </Text>
                </View>
              </View>

              {revealed[v.num] ? (
                <Text style={{ fontSize: 24, textAlign: 'right', color: C.text, lineHeight: 44 }}>
                  {v.text}
                </Text>
              ) : (
                <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, color: C.muted, fontStyle: 'italic' }}>Hidden — Try reciting from memory</Text>
                </View>
              )}
              
              {/* Adaptive Suggestion under weak ayahs */}
              {isWeak && revealed[v.num] && (
                <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="information-circle" size={16} color={C.lilac} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 12, color: C.muted, flex: 1 }}>AI Suggestion: Pay extra attention to Makhraj and Ikhfa here.</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={{
            backgroundColor: C.primary, borderRadius: 16,
            paddingVertical: 18, alignItems: 'center', marginTop: 10,
            shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
          }}
          activeOpacity={0.85}
          onPress={handleFinish}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Finish Session</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Surah Modal */}
      <Modal visible={surahModalVisible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Select Surah</Text>
              <TouchableOpacity onPress={() => setSurahModalVisible(false)}>
                <Ionicons name="close" size={28} color={C.text} />
              </TouchableOpacity>
            </View>
            
            <View style={{ backgroundColor: C.bg, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 16 }}>
              <Ionicons name="search" size={20} color={C.muted} />
              <TextInput 
                placeholder="Search Surah..." 
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 16, color: C.text }}
              />
            </View>

            <FlatList 
              data={quranData.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.index.includes(searchQuery))}
              keyExtractor={item => item.index}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  onPress={() => selectSurah(item.index)}
                  style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center' }}
                >
                  <View style={{ backgroundColor: C.primary + '15', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 15 }}>
                    <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>{parseInt(item.index)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: C.muted }}>{item.count} Verses</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#CCCCCC" />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      </SafeAreaView>
    </IslamicBackground>
  );
}
