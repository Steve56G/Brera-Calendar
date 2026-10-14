import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const COURSE_COLORS = ['#FCA5A5', '#86EFAC', '#93C5FD'];

export default function CourseColorSelector({ color, onChange }) {
  return (
    <View style={styles.row}>
      {COURSE_COLORS.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityState={{ checked: color === option }}
          accessibilityLabel={`Colore ${option}`}
          onPress={() => onChange(option)}
          style={[styles.swatch, { backgroundColor: option }, color === option && styles.selected]}
        />
      ))}
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: color === null }}
        accessibilityLabel="Colore predefinito"
        onPress={() => onChange(null)}
        style={[styles.defaultColor, color === null && styles.selected]}
      >
        <Text style={styles.defaultText}>Predefinito</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#111827' },
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
