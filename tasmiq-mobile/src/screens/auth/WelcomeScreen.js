import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StatusBar, 
  Dimensions, 
  ScrollView, 
  Linking,
  ImageBackground,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

import { useTheme } from '../../context/ThemeContext';

export default function WelcomeScreen({ navigation }) {
  const { isDark, colors: C } = useTheme();
  const styles = getStyles(C);
  
  const openTeacherLogin = () => {
    Linking.openURL('http://localhost:5173/login'); 
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
      
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        
        {/* HERO SECTION */}
        <ImageBackground 
          source={require('../../../assets/redesign/hero-bg.jpg')}
          style={styles.heroBackground}
          imageStyle={{ opacity: 0.55 }}
        >
          <View style={styles.overlay} />

          <View style={styles.heroContent}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Ionicons name="book" size={32} color="#FFFFFF" />
              </View>
              <Text style={styles.logoText}>Tasmiq<Text style={{ color: C.accent }}>AI</Text></Text>
            </View>

            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTag}>The Future of Tahfiz Education</Text>
              <Text style={styles.heroTitle}>Recite with Precision.{"\n"}Perfect with AI.</Text>
            </View>
          </View>
        </ImageBackground>

        {/* STATS BAR */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>500+</Text>
            <Text style={styles.statLabel}>Students</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>30k+</Text>
            <Text style={styles.statLabel}>Recitations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>98%</Text>
            <Text style={styles.statLabel}>Accuracy</Text>
          </View>
        </View>

        {/* CONTENT SECTION */}
        <View style={styles.contentSection}>
          <Text style={styles.welcomeText}>Welcome to the next generation of Quranic excellence. Start your journey today.</Text>
          
          <View style={styles.btnContainer}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login', { role: 'student' })}
              activeOpacity={0.85}
              style={styles.primaryBtn}
            >
              <Ionicons name="phone-portrait" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
              <Text style={styles.primaryBtnText}>Tasmiq Mobile App</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openTeacherLogin}
              activeOpacity={0.85}
              style={styles.secondaryBtn}
            >
              <Ionicons name="laptop" size={20} color={C.primary} style={{ marginRight: 10 }} />
              <Text style={styles.secondaryBtnText}>Teacher Web Portal</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => navigation.navigate('SignUp', { role: 'student' })}
              style={styles.signUpBtn}
            >
              <Text style={styles.signUpText}>
                New to TasmiqAI? <Text style={{ color: C.primary, fontWeight: '800' }}>Create Account</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* QUOTE SECTION */}
          <View style={styles.quoteCard}>
            <Text style={styles.quoteArabic}>خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ</Text>
            <Text style={styles.quoteTranslation}>"The best among you are those who learn the Quran and teach it."</Text>
          </View>

          {/* FOOTER */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>POWERED BY TARTEEL AI</Text>
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
    backgroundColor: 'rgba(26, 82, 40, 0.72)',
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
    width: 50,
    height: 50,
    backgroundColor: C.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  logoText: {
    fontSize: 28,
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
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -30,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  contentSection: {
    padding: 24,
    paddingTop: 30,
  },
  welcomeText: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 35,
    paddingHorizontal: 10,
  },
  btnContainer: {
    gap: 12,
    marginBottom: 40,
  },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
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
    borderColor: 'rgba(26, 82, 40, 0.15)',
  },
  secondaryBtnText: {
    color: C.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  signUpBtn: {
    marginTop: 8,
    alignSelf: 'center',
  },
  signUpText: {
    color: C.muted,
    fontSize: 14,
  },
  quoteCard: {
    backgroundColor: 'rgba(148, 97, 74, 0.05)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(148, 97, 74, 0.1)',
  },
  quoteArabic: {
    fontSize: 28,
    color: C.primary,
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.9,
  },
  quoteTranslation: {
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 20,
    opacity: 0.6,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1,
  },
  footerSubtext: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },
});
