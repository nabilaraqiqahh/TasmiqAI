import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StatusBar, Dimensions,
  ScrollView, Linking, ImageBackground, StyleSheet, Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../services/supabaseClient';

const { height } = Dimensions.get('window');

// ── Fetch real platform stats from Supabase ────────────────────────────────────
async function fetchStats() {
  try {
    const [usersRes, recRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('recitations').select('id', { count: 'exact', head: true }),
    ]);
    const students     = usersRes.count   ?? 0;
    const recitations  = recRes.count     ?? 0;

    // Avg score from recitations that have a score
    const { data: scored } = await supabase
      .from('recitations')
      .select('score')
      .not('score', 'is', null)
      .gt('score', 0)
      .limit(200);

    const scores     = (scored || []).map(r => r.score).filter(Boolean);
    const avgScore   = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    return { students, recitations, avgScore };
  } catch (e) {
    console.warn('[WelcomeScreen] stats fetch failed:', e.message);
    return { students: 0, recitations: 0, avgScore: 0 };
  }
}

export default function WelcomeScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const styles = getStyles(C);

  const [stats, setStats]       = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetchStats().then(s => {
      setStats(s);
      setStatsLoading(false);
    });
  }, []);

  // Format numbers nicely: 1234 → "1.2k"
  const fmt = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k+`;
    return n > 0 ? `${n}` : '—';
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <ImageBackground
          source={require('../../../assets/redesign/hero-bg.jpg')}
          style={styles.heroBackground}
          imageStyle={{ opacity: 0.55 }}
        >
          <View style={styles.overlay} />

          <View style={styles.heroContent}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Image
                  source={require('../../../assets/logo.jpg')}
                  style={{ width: 38, height: 38 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.logoText}>
                Tasmiq<Text style={{ color: C.accent }}>AI</Text>
              </Text>
            </View>

            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTag}>The Future of Tahfiz Education</Text>
              <Text style={styles.heroTitle}>Recite with Precision.{'\n'}Perfect with AI.</Text>
            </View>
          </View>
        </ImageBackground>

        {/* ── STATS BAR (real data) ─────────────────────────────────────── */}
        <View style={styles.statsBar}>
          {statsLoading ? (
            <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
          ) : (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{fmt(stats.students)}</Text>
                <Text style={styles.statLabel}>Students</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{fmt(stats.recitations)}</Text>
                <Text style={styles.statLabel}>Recitations</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{stats.avgScore > 0 ? `${stats.avgScore}%` : '—'}</Text>
                <Text style={styles.statLabel}>Avg Score</Text>
              </View>
            </>
          )}
        </View>

        {/* ── CONTENT ───────────────────────────────────────────────────── */}
        <View style={styles.contentSection}>
          <Text style={styles.welcomeText}>
            Your personal AI Quran recitation coach.{'\n'}Practice, improve, and get assessed with confidence.
          </Text>

          <View style={styles.btnContainer}>
            {/* Student login */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Login', { role: 'student' })}
              activeOpacity={0.85}
              style={styles.primaryBtn}
            >
              <Ionicons name="phone-portrait" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
              <Text style={styles.primaryBtnText}>Student Login</Text>
            </TouchableOpacity>

            {/* Create account */}
            <TouchableOpacity
              onPress={() => navigation.navigate('SignUp', { role: 'student' })}
              activeOpacity={0.85}
              style={styles.secondaryBtn}
            >
              <Ionicons name="person-add" size={20} color={C.primary} style={{ marginRight: 10 }} />
              <Text style={styles.secondaryBtnText}>Create Account</Text>
            </TouchableOpacity>

            {/* Teacher portal — opens production URL */}
            <TouchableOpacity
              onPress={() => Linking.openURL('https://tasmiqai.com')}
              style={styles.signUpBtn}
            >
              <Text style={styles.signUpText}>
                Teacher?{' '}
                <Text style={{ color: C.primary, fontWeight: '800' }}>Open Teacher Portal →</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── QUOTE ─────────────────────────────────────────────────── */}
          <View style={styles.quoteCard}>
            <Text style={styles.quoteArabic}>خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ</Text>
            <Text style={styles.quoteTranslation}>
              "The best among you are those who learn the Quran and teach it."
            </Text>
          </View>

          {/* ── FOOTER ────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>TASMIQAI · RECITE. IMPROVE. GROW.</Text>
            <Text style={styles.footerSubtext}>Inspired by UTeM & Islamic Heritage</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (C) => StyleSheet.create({
  heroBackground: {
    width: '100%',
    height: height * 0.45,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 78, 59, 0.75)',
  },
  heroContent: {
    padding: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 52,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  logoText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroTextContainer: {
    marginTop: 10,
  },
  heroTag: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 40,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -28,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 76,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900',
    color: C.primary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  contentSection: {
    padding: 24,
    paddingTop: 28,
  },
  welcomeText: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 10,
  },
  btnContainer: {
    gap: 12,
    marginBottom: 36,
  },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.primary + '25',
  },
  secondaryBtnText: {
    color: C.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  signUpBtn: {
    marginTop: 6,
    alignSelf: 'center',
  },
  signUpText: {
    color: C.muted,
    fontSize: 14,
  },
  quoteCard: {
    backgroundColor: 'rgba(11, 110, 79, 0.05)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 36,
    borderWidth: 1,
    borderColor: 'rgba(11, 110, 79, 0.1)',
  },
  quoteArabic: {
    fontSize: 26,
    color: C.primary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 42,
  },
  quoteTranslation: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '600',
    lineHeight: 22,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 20,
    opacity: 0.55,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1.2,
  },
  footerSubtext: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },
});
