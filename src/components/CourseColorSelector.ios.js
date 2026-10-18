import React from 'react';
import { Host, ColorPicker } from '@expo/ui/swift-ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../i18n/LanguageProvider';

const COURSE_COLORS = ['#FCA5A5', '#86EFAC', '#93C5FD'];

export default function CourseColorSelector({ color, onChange }) {
  const { t } = useTranslation();
  return (
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
      <Host style={styles.pickerHost}>
        <ColorPicker selection={color || COURSE_COLORS[0]} onSelectionChange={onChange} />
      </Host>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: color === null }}
        accessibilityLabel={t('colors.defaultColor')}
        onPress={() => onChange(null)}
        style={[styles.defaultColor, color === null && styles.selected]}
      >
        <Text style={styles.defaultText}>{t('colors.default')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#111827' },
  pickerHost: { width: 44, height: 44 },
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



