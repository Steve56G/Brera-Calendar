import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../i18n/LanguageProvider';

const COURSE_COLORS = ['#FCA5A5', '#86EFAC', '#93C5FD'];
const LIGHT_COLORS = [
  '#FECACA',
  '#FED7AA',
  '#FDE68A',
  '#FEF3C7',
  '#D9F99D',
  '#BBF7D0',
  '#A7F3D0',
  '#A5F3FC',
  '#BFDBFE',
  '#DDD6FE',
];
const HUES = Array.from({ length: 12 }, (_, index) => index * 30);
const TONES = [
  [0.55, 0.65],
  [0.75, 0.75],
  [0.9, 0.9],
  [1, 1],
];

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  const channels =
    hue < 60 ? [chroma, second, 0]
      : hue < 120 ? [second, chroma, 0]
        : hue < 180 ? [0, chroma, second]
          : hue < 240 ? [0, second, chroma]
            : hue < 300 ? [second, 0, chroma]
              : [chroma, 0, second];
  return `#${channels.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const PALETTE_COLORS = [
  ...new Set([
    ...COURSE_COLORS,
    ...HUES.flatMap((hue) => TONES.map(([saturation, value]) => hsvToHex(hue, saturation, value))),
    '#FFFFFF',
    '#D1D5DB',
    '#9CA3AF',
    '#6B7280',
    '#374151',
    '#111827',
  ]),
];

export default function CourseColorSelector({ color, onChange }) {
  const { t } = useTranslation();
  const [showPalette, setShowPalette] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lightColors}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={t('colors.lightColors')}
      >
        {LIGHT_COLORS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: color === option }}
            accessibilityLabel={t('colors.lightColor', { color: option })}
            onPress={() => onChange(option)}
            style={[styles.swatch, { backgroundColor: option }, color === option && styles.selected]}
          />
        ))}
      </ScrollView>
      <View style={styles.row}>
        {COURSE_COLORS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: color === option }}
            accessibilityLabel={t('colors.color', { color: option })}
            onPress={() => onChange(option)}
            style={[styles.swatch, { backgroundColor: option }, color === option && styles.selected]}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPalette ? t('colors.hideMore') : t('colors.showMore')}
          accessibilityState={{ expanded: showPalette }}
          onPress={() => setShowPalette((shown) => !shown)}
          style={[styles.moreButton, showPalette && styles.selected]}
        >
          <Text style={styles.moreText}>{showPalette ? '−' : '+'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: color == null }}
          accessibilityLabel={t('colors.defaultColor')}
          onPress={() => onChange(null)}
          style={[styles.defaultColor, color == null && styles.selected]}
        >
          <Text style={styles.defaultText}>{t('colors.default')}</Text>
        </Pressable>
      </View>

      {showPalette && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.palette}
          keyboardShouldPersistTaps="handled"
        >
          {PALETTE_COLORS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: color === option }}
              accessibilityLabel={t('colors.color', { color: option })}
              onPress={() => onChange(option)}
              style={[styles.swatch, { backgroundColor: option }, color === option && styles.selected]}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  lightColors: { alignItems: 'center', gap: 8, paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  palette: { alignItems: 'center', gap: 8, paddingTop: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#111827' },
  moreButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  moreText: { color: '#374151', fontSize: 20, lineHeight: 22, fontWeight: '500' },
  defaultColor: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  defaultText: { color: '#374151', fontSize: 11, fontWeight: '600' },
});



