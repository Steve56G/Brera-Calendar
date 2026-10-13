import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DAYS, DAY_SHORT, LEVEL_HEX } from './parser';
import { END_H, START_H, layoutDay, maxCols } from './calendarLayout';

const HOUR_H = 64; // altezza di un'ora (px)
const GUTTER = 46; // larghezza colonna orari
const HEADER_H = 34;
const MIN_COL = 104; // larghezza minima di una colonna-giorno
const MIN_SUB = 76; // larghezza minima di una sotto-colonna (lezioni affiancate)
const HOURS = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i); // 8..19

const pad = (h) => `${String(h).padStart(2, '0')}:00`;

export default function CalendarView({ schedule, favorites, onToggle }) {
  const { width } = useWindowDimensions();
  const [showRi, setShowRi] = useState(false);

  const favRows = useMemo(() => schedule.filter((r) => favorites.has(r.id)), [schedule, favorites]);

  // eventi per giorno, già posizionati (col / cols)
  const perDay = useMemo(() => {
    const days = [[], [], [], [], [], []];
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
    return days.map(layoutDay);
  }, [favRows, showRi]);

  const baseW = Math.max(MIN_COL, (width - 32 - GUTTER) / 6);
  const dayW = perDay.map((evs) => Math.max(baseW, maxCols(evs) * MIN_SUB));
  const totalW = dayW.reduce((a, b) => a + b, 0);
  const bodyH = (END_H - START_H) * HOUR_H;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          {favRows.length} {favRows.length === 1 ? 'corso preferito' : 'corsi preferiti'}
        </Text>
        <Pressable onPress={() => setShowRi((v) => !v)} style={[styles.chip, showRi && styles.chipOn]} hitSlop={8}>
          <Text style={[styles.chipText, showRi && { color: '#92400E' }]}>Ricevimenti</Text>
        </Pressable>
      </View>

      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: LEVEL_HEX.Triennio }]} />
        <Text style={styles.legendText}>Triennio</Text>
        <View style={[styles.dot, { backgroundColor: LEVEL_HEX.Biennio }]} />
        <Text style={styles.legendText}>Biennio</Text>
      </View>

      {favRows.length === 0 && (
        <Text style={styles.hint}>
          Nessun corso nei preferiti. Tocca la stella ☆ su un corso nella lista: tutte le sue lezioni compariranno qui.
        </Text>
      )}
      {favRows.length > 0 && <Text style={styles.tip}>Tieni premuto un box per rimuovere il corso dai preferiti.</Text>}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row' }}>
          {/* colonna orari */}
          <View style={{ width: GUTTER }}>
            <View style={{ height: HEADER_H }} />
            <View style={{ height: bodyH + 12 }}>
              {HOURS.map((h) => (
                <Text key={h} style={[styles.hourLabel, { top: (h - START_H) * HOUR_H - 7 }]}>
                  {pad(h)}
                </Text>
              ))}
            </View>
          </View>

          {/* giorni */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: totalW }}>
              <View style={{ flexDirection: 'row', height: HEADER_H }}>
                {DAYS.map((d, i) => (
                  <View key={d} style={{ width: dayW[i], alignItems: 'center', justifyContent: 'center' }}>
                    <View style={styles.dayPill}>
                      <Text style={styles.dayPillText}>{DAY_SHORT[i]}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={{ height: bodyH }}>
                {/* linee orarie */}
                {HOURS.map((h) => (
                  <View key={h} style={[styles.hourLine, { top: (h - START_H) * HOUR_H }]} />
                ))}

                <View style={{ flexDirection: 'row', height: bodyH }}>
                  {perDay.map((evs, di) => (
                    <View key={di} style={[styles.dayCol, { width: dayW[di], height: bodyH }]}>
                      {evs.map((ev) => (
                        <EventBox key={ev.key} ev={ev} colW={dayW[di]} onRemove={onToggle} />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const pick = (s) => ({ start: s.start, end: s.end, startLabel: s.startLabel, endLabel: s.endLabel, details: s.details });

const EventBox = React.memo(function EventBox({ ev, colW, onRemove }) {
  const subW = colW / ev.cols;
  const h = (ev.end - ev.start) * HOUR_H - 2;
  const isRi = ev.kind === 'ricevimento';
  const levelHex = LEVEL_HEX[ev.level];
  const bg = isRi ? '#FEF3C7' : levelHex || '#E5E7EB';
  const border = isRi ? '#F59E0B' : levelHex || '#D1D5DB';
  const lines = Math.max(1, Math.floor((h - 18) / 13));
  return (
    <Pressable
      onLongPress={() => onRemove(ev.rowId)}
      delayLongPress={450}
      style={[
        styles.event,
        {
          left: ev.col * subW + 2,
          width: subW - 4,
          top: (ev.start - START_H) * HOUR_H + 1,
          height: h,
          backgroundColor: bg,
          borderColor: border,
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
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: '#374151', marginRight: 10 },
  hint: { color: '#6B7280', fontSize: 14, marginBottom: 10 },
  tip: { color: '#9CA3AF', fontSize: 11, marginBottom: 6 },
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
