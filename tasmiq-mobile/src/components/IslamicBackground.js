import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * IslamicBackground
 * 
 * Renders subtle Islamic geometric motifs behind content.
 * Uses pure View-based shapes — no SVG library required.
 * 
 * Props:
 *  - variant: 'full' | 'top' | 'bottom' | 'minimal' (default: 'full')
 *  - opacity: number (default: 1 — internal opacities are already subtle)
 */
export default function IslamicBackground({ variant = 'full', opacity = 1, children }) {
  const { isDark, colors: C } = useTheme();
  const motifColor = isDark ? C.accent : C.primary;
  const motifGold = isDark ? '#B89C4A' : '#D4AF37';

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* ── DECORATIVE LAYER ─────────────────────────────────────── */}
      <View style={[styles.decoLayer, { opacity }]} pointerEvents="none">

        {/* ─── TOP MIHRAB ARCH ─────────────────────────────────── */}
        {(variant === 'full' || variant === 'top') && (
          <>
            {/* Large top arch */}
            <View style={[styles.mihrabArch, {
              borderColor: motifColor,
              top: -SCREEN_H * 0.12,
              left: SCREEN_W * 0.1,
            }]} />
            {/* Inner arch ring */}
            <View style={[styles.mihrabArchInner, {
              borderColor: motifGold,
              top: -SCREEN_H * 0.10,
              left: SCREEN_W * 0.17,
            }]} />
          </>
        )}

        {/* ─── 8-POINTED STAR (top-right) ──────────────────────── */}
        {(variant === 'full' || variant === 'top' || variant === 'minimal') && (
          <View style={[styles.starContainer, { top: 60, right: -12 }]}>
            <EightPointStar size={70} color={motifGold} opacity={isDark ? 0.08 : 0.06} />
          </View>
        )}

        {/* ─── CRESCENT (top-left) ─────────────────────────────── */}
        {(variant === 'full' || variant === 'top') && (
          <View style={[styles.crescentOuter, {
            top: 100, left: 20,
            borderColor: motifGold,
          }]}>
            <View style={[styles.crescentCutout, {
              backgroundColor: C.bg,
            }]} />
          </View>
        )}

        {/* ─── GEOMETRIC DIAMOND LATTICE (center) ──────────────── */}
        {(variant === 'full') && (
          <View style={[styles.latticeContainer]}>
            {[0, 1, 2, 3, 4].map(row => (
              <View key={row} style={styles.latticeRow}>
                {[0, 1, 2, 3, 4, 5].map(col => (
                  <View
                    key={col}
                    style={[styles.latticeDiamond, {
                      borderColor: motifColor,
                      opacity: isDark ? 0.04 : 0.035,
                      marginLeft: row % 2 === 0 ? 0 : 30,
                    }]}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ─── BOTTOM ARABESQUE BORDER ─────────────────────────── */}
        {(variant === 'full' || variant === 'bottom') && (
          <View style={[styles.bottomBorder]}>
            {/* Scalloped arch row */}
            <View style={styles.scallopRow}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.scallopArch, {
                    borderColor: motifGold,
                    opacity: isDark ? 0.07 : 0.06,
                  }]}
                />
              ))}
            </View>
            {/* Thin decorative line */}
            <View style={[styles.decoLine, {
              backgroundColor: motifGold,
              opacity: isDark ? 0.06 : 0.05,
            }]} />
          </View>
        )}

        {/* ─── 8-POINTED STAR (bottom-left) ────────────────────── */}
        {(variant === 'full' || variant === 'bottom') && (
          <View style={[styles.starContainer, { bottom: 120, left: -18 }]}>
            <EightPointStar size={90} color={motifColor} opacity={isDark ? 0.06 : 0.04} />
          </View>
        )}

        {/* ─── CORNER ORNAMENTS ────────────────────────────────── */}
        {(variant === 'full' || variant === 'top') && (
          <>
            <CornerOrnament position="topRight" color={motifGold} isDark={isDark} />
            <CornerOrnament position="topLeft" color={motifColor} isDark={isDark} />
          </>
        )}
        {(variant === 'full' || variant === 'bottom') && (
          <>
            <CornerOrnament position="bottomRight" color={motifColor} isDark={isDark} />
            <CornerOrnament position="bottomLeft" color={motifGold} isDark={isDark} />
          </>
        )}
      </View>

      {/* ── CONTENT LAYER ────────────────────────────────────────── */}
      {children}
    </View>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * 8-Pointed Star — built from two overlapping rotated squares
 */
function EightPointStar({ size = 60, color = '#D4AF37', opacity = 0.06 }) {
  const squareSize = size * 0.65;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity }}>
      <View style={{
        position: 'absolute',
        width: squareSize, height: squareSize,
        borderWidth: 1.5,
        borderColor: color,
        transform: [{ rotate: '0deg' }],
      }} />
      <View style={{
        position: 'absolute',
        width: squareSize, height: squareSize,
        borderWidth: 1.5,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Center circle */}
      <View style={{
        width: squareSize * 0.45,
        height: squareSize * 0.45,
        borderRadius: squareSize * 0.225,
        borderWidth: 1,
        borderColor: color,
      }} />
    </View>
  );
}


/**
 * Corner ornament — nested quarter-circle arcs
 */
function CornerOrnament({ position, color, isDark }) {
  const baseOpacity = isDark ? 0.06 : 0.045;
  const posStyle = {
    topRight: { top: 0, right: 0 },
    topLeft: { top: 0, left: 0, transform: [{ scaleX: -1 }] },
    bottomRight: { bottom: 0, right: 0, transform: [{ scaleY: -1 }] },
    bottomLeft: { bottom: 0, left: 0, transform: [{ scaleX: -1 }, { scaleY: -1 }] },
  }[position];

  return (
    <View style={[styles.cornerWrap, posStyle]}>
      {[60, 45, 30].map((r, i) => (
        <View key={i} style={{
          position: 'absolute',
          top: -r,
          right: -r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: 1,
          borderColor: color,
          opacity: baseOpacity - i * 0.01,
        }} />
      ))}
    </View>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  decoLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },

  /* Mihrab arch */
  mihrabArch: {
    position: 'absolute',
    width: SCREEN_W * 0.8,
    height: SCREEN_W * 0.8,
    borderRadius: SCREEN_W * 0.4,
    borderWidth: 1.5,
    opacity: 0.06,
  },
  mihrabArchInner: {
    position: 'absolute',
    width: SCREEN_W * 0.65,
    height: SCREEN_W * 0.65,
    borderRadius: SCREEN_W * 0.325,
    borderWidth: 1,
    opacity: 0.04,
  },

  /* Crescent */
  crescentOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    opacity: 0.07,
  },
  crescentCutout: {
    position: 'absolute',
    top: -6,
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  /* Diamond lattice */
  latticeContainer: {
    position: 'absolute',
    top: SCREEN_H * 0.3,
    left: -20,
    right: -20,
  },
  latticeRow: {
    flexDirection: 'row',
    marginBottom: -6,
  },
  latticeDiamond: {
    width: 26,
    height: 26,
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
    marginHorizontal: 14,
    marginVertical: 6,
  },

  /* Bottom border */
  bottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  scallopRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: -12,
  },
  scallopArch: {
    width: 36,
    height: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    marginHorizontal: -1,
  },
  decoLine: {
    height: 1,
    marginTop: 0,
  },

  /* Stars */
  starContainer: {
    position: 'absolute',
  },

  /* Corner ornament */
  cornerWrap: {
    position: 'absolute',
    width: 60,
    height: 60,
    overflow: 'hidden',
  },
});
