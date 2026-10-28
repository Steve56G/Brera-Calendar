import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DAYS } from '../constants/schedule';
import { useTranslation } from '../i18n/LanguageProvider';
import { norm } from '../utils/parser';
import { buildRoomIndex, SLOT_HOURS } from '../services/roomAvailability';

const pad = (h) => `${String(h).padStart(2, '0')}:00`;
const todayIndex = () => {
  const d = new Date().getDay(); // 0 = domenica
  return d === 0 ? 0 : Math.min(d - 1, 5);
};

/* ------------------------------ Ricerca aula ------------------------------ */

function RoomSearch({ query, onQuery, rooms, selected, onSelect }) {
  const { t, room: roomText } = useTranslation();
  return (
    <View>
      <TextInput
        style={styles.search}
        placeholder={t('rooms.searchPlaceholder')}
        placeholderTextColor="#9CA3AF"
        value={query}
        onChangeText={onQuery}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      <Text style={styles.count}>
        {t('rooms.count', { count: rooms.length })}
      </Text>
      <FlatList
        horizontal
        data={rooms}
        keyExtractor={(r) => r}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)} style={[styles.chip, item === selected && styles.chipOn]}>
            <Text style={[styles.chipText, item === selected && styles.chipTextOn]}>{roomText(item)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.hint}>{t('rooms.noMatch')}</Text>}
      />
    </View>
  );
}

/* ------------------------------ Selettore giorno ------------------------------ */

function DaySelector({ day, onDay }) {
  const { dayName, dayShort } = useTranslation();
  return (
    <View style={styles.dayRow}>
      {DAYS.map((d, i) => (
        <Pressable
          key={d}
          onPress={() => onDay(i)}
          style={[styles.dayPill, i === day && styles.dayPillOn]}
          accessibilityLabel={dayName(i)}
        >
          <Text style={[styles.dayPillText, i === day && styles.dayPillTextOn]}>{dayShort(i)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ------------------------------ Griglia oraria ------------------------------ */

function HourGrid({ slots }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
      {slots.map(({ h, lessons }) => (
        <View key={h} style={styles.hourRow}>
          <Text style={styles.hourLabel}>{pad(h)}</Text>
          <View style={styles.slotArea}>
            {lessons.length > 0 && (
              <View style={styles.busyBox}>
                <Text style={styles.busyTitle} numberOfLines={1}>
                  {lessons[0].subject}
                  {lessons.length > 1 ? `  +${lessons.length - 1}` : ''}
                </Text>
                <Text style={styles.busyTime}>
                  {lessons[0].startLabel} – {lessons[0].endLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/* ------------------------------ Schermata ------------------------------ */

export default function RoomAvailabilityScreen({ schedule }) {
  const { t, dayName, room: roomText } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [day, setDay] = useState(todayIndex);

  const index = useMemo(() => buildRoomIndex(schedule), [schedule]);

  const matches = useMemo(() => {
    const tokens = norm(query).split(' ').filter(Boolean);
    if (!tokens.length) return index.rooms;
    return index.rooms.filter((r) => tokens.every((tok) => norm(r).includes(tok) || norm(roomText(r)).includes(tok)));
  }, [index, query, roomText]);

  const room = selected && index.byRoom[selected] ? selected : null;

  const slots = useMemo(
    () => SLOT_HOURS.map((h) => ({ h, lessons: (room && index.byRoom[room][day]?.[h]) || [] })),
    [index, room, day]
  );
  const busy = slots.filter((s) => s.lessons.length).length;

  if (!index.rooms.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>
          {schedule.length ? t('rooms.noneDetected') : t('rooms.importHint')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <RoomSearch query={query} onQuery={setQuery} rooms={matches} selected={room} onSelect={setSelected} />
      <DaySelector day={day} onDay={setDay} />

      {!room ? (
        <View style={styles.center}>
          <Text style={styles.hint}>{t('rooms.selectHint')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.summary}>
            {roomText(room)} · {dayName(day)} · {t('rooms.busyHours', { count: busy })}, {t('rooms.freeHours', { count: slots.length - busy })}
          </Text>
          <HourGrid slots={slots} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB',
  },
  count: { color: '#6B7280', fontSize: 12, marginVertical: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  chipOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextOn: { color: '#fff' },
  dayRow: { flexDirection: 'row', gap: 6, marginVertical: 12 },
  dayPill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#DBEAFE' },
  dayPillOn: { backgroundColor: '#2563EB' },
  dayPillText: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  dayPillTextOn: { color: '#fff' },
  summary: { color: '#6B7280', fontSize: 12, marginBottom: 8 },
  hourRow: { flexDirection: 'row', alignItems: 'stretch', height: 52, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  hourLabel: { width: 46, fontSize: 11, fontWeight: '600', color: '#6B7280', paddingTop: 4 },
  slotArea: { flex: 1, paddingVertical: 2 },
  busyBox: { flex: 1, backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' },
  busyTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  busyTime: { color: '#DBEAFE', fontSize: 11, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  hint: { color: '#6B7280', fontSize: 14, textAlign: 'center' },
});



