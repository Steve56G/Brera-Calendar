import React, { useMemo, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DAYS, DAY_SHORT, LEVEL_HEX } from '../constants/schedule';
import { END_H, START_H, layoutDay } from '../utils/calendarLayout';
import LessonEditModal from '../components/LessonEditModal';

const HOUR_H = 64; // altezza di un'ora (px)
const GUTTER = 46; // larghezza colonna orari
const HEADER_H = 34;
const DAY_GAP = 4;
const HOURS = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i); // 8..19

const pad = (h) => `${String(h).padStart(2, '0')}:00`;

export default function CalendarView({ schedule, favorites, onToggle, edits = {}, courseColors = {}, onEdit, onSetCourseColor }) {
  const { width } = useWindowDimensions();
  const [showRi, setShowRi] = useState(false);
  const [editing, setEditing] = useState(null); // evento aperto nel modal di modifica
  const [horizontalOffset] = useState(() => new Animated.Value(0));

  const favRows = useMemo(() => schedule.filter((r) => favorites.has(r.id)), [schedule, favorites]);

  // eventi per giorno, già posizionati (col / cols)
  const perDay = useMemo(() => {
    const days = DAYS.map(() => []);
    favRows.forEach((r) => {
      r.days.forEach((d) => {
        d.lessons.forEach((s, i) =>
          days[d.dayIndex].push({ key: `${r.id}-${d.dayIndex}-l${i}`, rowId: r.id, subject: r.subject, professor: r.professor, level: r.level, kind: 'lezione', ...pick(s) })
        );
        if (showRi) {
          d.ricevimenti.forEach((s, i) =>
            days[d.dayIndex].push({ key: `${r.id}-${d.dayIndex}-r${i}`, rowId: r.id, subject: r.subject, professor: r.professor, level: r.level, kind: 'ricevimento', ...pick(s) })
          );
        }
      });
    });
    Object.entries(edits).forEach(([key, edit]) => {
      if (!edit.created || edit.deleted || !Number.isInteger(edit.dayIndex) || !days[edit.dayIndex]) return;
      days[edit.dayIndex].push({
        ...edit,
        key,
        kind: 'lezione',
        custom: true,
        color: courseColors[edit.rowId],
      });
    });
    // applica le modifiche manuali (titolo/orario) prima di calcolare le sovrapposizioni
    return days.map((evs) =>
      layoutDay(
        evs
          .filter((e) => !edits[e.key]?.deleted)
          .map((e) => ({
            ...e,
            ...(edits[e.key] || {}),
            color: courseColors[e.rowId],
          }))
      )
    );
  }, [favRows, showRi, edits, courseColors]);

  const availableDaysW = width - 32 - GUTTER;
  const baseW = (availableDaysW - DAY_GAP * (DAYS.length - 1)) / DAYS.length;
  const dayW = DAYS.map(() => baseW);
  const totalW = dayW.reduce((a, b) => a + b, 0) + DAY_GAP * (DAYS.length - 1);
  const bodyH = (END_H - START_H) * HOUR_H;

  const addLesson = () => {
    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEditing({
      key,
      rowId: key,
      subject: '',
      professor: '',
      details: '',
      note: '',
      dayIndex: 0,
      start: START_H,
      end: START_H + 1,
      startLabel: pad(START_H),
      endLabel: pad(START_H + 1),
      kind: 'lezione',
      custom: true,
      isNew: true,
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          {favRows.length} {favRows.length === 1 ? 'corso preferito' : 'corsi preferiti'}
        </Text>
        <Pressable onPress={() => setShowRi((v) => !v)} style={[styles.chip, showRi && styles.chipOn]} hitSlop={8}>
          <Text style={[styles.chipText, showRi && { color: '#92400E' }]}>Ricevimenti</Text>
        </Pressable>
        <Pressable onPress={addLesson} style={styles.addLessonButton} accessibilityRole="button">
          <Text style={styles.addLessonText}>+ Lezione</Text>
        </Pressable>
      </View>

      {favRows.length === 0 && (
        <Text style={styles.hint}>
          Nessun corso nei preferiti. Tocca la stella ☆ su un corso nella lista: tutte le sue lezioni compariranno qui.
        </Text>
      )}
      {favRows.length > 0 && <Text style={styles.tip}>Tocca un box per modificarlo. Tieni premuto per rimuovere il corso dai preferiti.</Text>}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        stickyHeaderIndices={[0]}
      >
        <View style={styles.stickyDayHeader}>
          <View style={styles.stickyDaysArea}>
            <Animated.View
              style={[
                styles.stickyDaysContent,
                {
                  width: totalW,
                  transform: [
                    {
                      translateX: horizontalOffset.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {DAYS.map((d, i) => (
                <View key={d} style={{ width: dayW[i] + (i < DAYS.length - 1 ? DAY_GAP : 0), height: HEADER_H, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={[styles.dayPill, { width: dayW[i] - 12 }]}>
                    <Text style={styles.dayPillText}>{DAY_SHORT[i]}</Text>
                  </View>
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {/* colonna orari */}
          <View style={{ width: GUTTER, flexShrink: 0 }}>
            <View style={{ height: bodyH + 12 }}>
              {HOURS.map((h) => (
                <Text key={h} style={[styles.hourLabel, { top: (h - START_H) * HOUR_H - 7 }]}>
                  {pad(h)}
                </Text>
              ))}
            </View>
          </View>

          {/* giorni */}
          <Animated.ScrollView
            style={{ flex: 1 }}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: horizontalOffset } } }], { useNativeDriver: true })}
          >
            <View style={{ width: totalW }}>
              <View style={{ height: bodyH }}>
                {/* linee orarie */}
                {HOURS.map((h) => (
                  <View key={h} style={[styles.hourLine, { top: (h - START_H) * HOUR_H }]} />
                ))}

                <View style={{ flexDirection: 'row', height: bodyH }}>
                  {perDay.map((evs, di) => (
                    <View key={di} style={{ width: dayW[di] + (di < DAYS.length - 1 ? DAY_GAP : 0), height: bodyH }}>
                      <View style={[styles.dayCol, { width: dayW[di], height: bodyH }]}>
                        {evs.map((ev) => (
                          <EventBox key={ev.key} ev={ev} colW={dayW[di]} onRemove={onToggle} onEdit={setEditing} />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Animated.ScrollView>
        </View>
      </ScrollView>

      <LessonEditModal
        key={editing?.key ?? 'closed'}
        visible={!!editing}
        lesson={editing}
        color={courseColors[editing?.rowId]}
        isCustom={editing?.custom}
        onCancel={() => setEditing(null)}
        onDelete={(lesson) => {
          if (lesson.isNew) {
            setEditing(null);
            return;
          }
          onEdit?.(lesson.key, { ...(edits[lesson.key] || {}), deleted: true });
          setEditing(null);
        }}
        onSave={(u) => {
          const savedLesson = u.custom
            ? {
                created: true,
                rowId: u.rowId,
                dayIndex: u.dayIndex,
                subject: u.subject,
                professor: u.professor,
                details: u.details,
                note: u.note,
                start: u.start,
                end: u.end,
                startLabel: u.startLabel,
                endLabel: u.endLabel,
              }
            : { subject: u.subject, professor: u.professor, details: u.details, note: u.note, start: u.start, end: u.end, startLabel: u.startLabel, endLabel: u.endLabel };
          onEdit?.(u.key, savedLesson);
          onSetCourseColor?.(u.rowId, u.color);
          setEditing(null);
        }}
      />
    </View>
  );
}

const pick = (s) => ({ start: s.start, end: s.end, startLabel: s.startLabel, endLabel: s.endLabel, details: s.details });

const EventBox = React.memo(function EventBox({ ev, colW, onRemove, onEdit }) {
  const subW = colW / ev.cols;
  const h = (ev.end - ev.start) * HOUR_H - 2;
  const isRi = ev.kind === 'ricevimento';
  const levelHex = LEVEL_HEX[ev.level];
  const bg = isRi ? '#FEF3C7' : levelHex || '#E5E7EB';
  const border = isRi ? '#F59E0B' : levelHex || '#D1D5DB';
  const lines = Math.max(1, Math.floor((h - 18) / 13));
  return (
    <Pressable
      onPress={() => onEdit(ev)}
      onLongPress={!ev.custom ? () =>
        Alert.alert(
          'Rimuovere il corso dai preferiti?',
          `Vuoi rimuovere ${ev.subject} dai preferiti? Tutte le sue lezioni scompariranno dal calendario.`,
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Rimuovi', style: 'destructive', onPress: () => onRemove(ev.rowId) },
          ]
        ) : undefined}
      delayLongPress={450}
      style={[
        styles.event,
        {
          left: ev.col * subW + 2,
          width: subW - 4,
          top: (ev.start - START_H) * HOUR_H + 1,
          height: h,
          backgroundColor: ev.color || bg,
          borderColor: ev.color || border,
          borderStyle: isRi ? 'dashed' : 'solid',
        },
      ]}
    >
      <Text style={styles.evTitle} numberOfLines={lines}>
        {isRi ? 'Ricevimento · ' : ''}
        {ev.subject}
      </Text>
      {h > 44 && (
        <Text style={styles.evTime}>
          {ev.startLabel} – {ev.endLabel}
        </Text>
      )}
      {h > 62 && !!ev.details && (
        <Text style={styles.evDetails} numberOfLines={2}>
          {ev.details}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  count: { color: '#6B7280', fontSize: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  chipOn: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  addLessonButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#DBEAFE' },
  addLessonText: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  hint: { color: '#6B7280', fontSize: 14, marginBottom: 10 },
  tip: { color: '#9CA3AF', fontSize: 11, marginBottom: 6 },
  stickyDayHeader: {
    flexDirection: 'row',
    height: HEADER_H + 4,
    paddingLeft: GUTTER,
    zIndex: 10,
    elevation: 6,
  },
  stickyDaysArea: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  stickyDaysContent: { flexDirection: 'row', height: HEADER_H },
  hourLabel: { position: 'absolute', right: 6, fontSize: 11, color: '#6B7280', fontWeight: '600' },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#E5E7EB' },
  dayPill: { backgroundColor: '#DBEAFE', borderRadius: 8, paddingVertical: 4, width: 44, alignItems: 'center' },
  dayPillText: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  dayCol: { borderLeftWidth: 1, borderLeftColor: '#E5E7EB' },
  event: { position: 'absolute', borderRadius: 8, borderWidth: 2, padding: 4, overflow: 'hidden' },
  evTitle: { fontSize: 11, fontWeight: '700', color: '#111827' },
  evTime: { fontSize: 10, fontWeight: '600', color: '#111827', marginTop: 1 },
  evDetails: { fontSize: 10, color: '#374151', marginTop: 1 },
});
