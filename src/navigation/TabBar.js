import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function TabBar({ tab, onTabChange, favoriteCount }) {
  return (
    <View style={styles.tabBar}>
      <Pressable style={[styles.tabBtn, tab === 'list' && styles.tabBtnOn]} onPress={() => onTabChange('list')}>
        <Text style={[styles.tabText, tab === 'list' && styles.tabTextOn]}>Lista</Text>
      </Pressable>
      <Pressable style={[styles.tabBtn, tab === 'calendar' && styles.tabBtnOn]} onPress={() => onTabChange('calendar')}>
        <Text style={[styles.tabText, tab === 'calendar' && styles.tabTextOn]}>
          Calendario{favoriteCount ? `  ★ ${favoriteCount}` : ''}
        </Text>
      </Pressable>
      <Pressable style={[styles.tabBtn, tab === 'rooms' && styles.tabBtnOn]} onPress={() => onTabChange('rooms')}>
        <Text style={[styles.tabText, tab === 'rooms' && styles.tabTextOn]}>Aule</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', marginHorizontal: -16, paddingBottom: 6 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderTopWidth: 3, borderTopColor: 'transparent' },
  tabBtnOn: { borderTopColor: '#2563EB' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabTextOn: { color: '#2563EB' },
});
