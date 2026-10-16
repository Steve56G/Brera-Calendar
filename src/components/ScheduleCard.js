import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DAY_SHORT, LEVEL_HEX } from '../constants/schedule';

const ScheduleCard = React.memo(function ScheduleCard({ item, isFav, onToggle, changes, onShowChanges }) {
  const levelHex = LEVEL_HEX[item.level];
  const levelLabels = String(item.level || 'Non indicato').split(' + ').filter(Boolean);
  const fg = '#111827';

  return (
    <View style={[styles.card, { borderColor: levelHex || 'transparent' }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.subject, { flex: 1 }]}>{item.subject}</Text>
        <Pressable
          onPress={() => onToggle(item.id)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
        >
          <Text style={[styles.star, isFav && styles.starOn]}>{isFav ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      <View style={styles.badgeRow}>
        {levelLabels.map((level) => (
          <View key={`level-${level}`} style={[styles.badge, { backgroundColor: LEVEL_HEX[level] || '#E5E7EB' }]}>
            <Text style={[styles.badgeText, { color: fg }]}>{level}</Text>
          </View>
        ))}
        {item.tags.map((tag, index) => (
          <View key={index} style={[styles.badge, styles.badgeOutline]}>
            <Text style={[styles.badgeText, { color: '#374151' }]}>{tag}</Text>
          </View>
        ))}
      </View>

      {item.isAmbiguous && (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>⚠️ Possibile errore di lettura - Verificare sul PDF originale</Text>
          <Text style={styles.warnPage}>Pagina {item.pageNo} del PDF</Text>
          {item.ambiguityReasons.map((reason, index) => (
            <Text key={index} style={styles.warnReason}>• {reason}</Text>
          ))}
        </View>
      )}

      <Text style={styles.professor}>{item.professor || 'Docente non indicato'}</Text>

      <View style={styles.slots}>
        {item.days.length === 0 ? (
          <Text style={styles.noSlot}>Orario non rilevato nel PDF</Text>
        ) : (
          item.days.map((day) => (
            <View key={day.dayIndex} style={styles.slotRow}>
              <View style={styles.dayPill}>
                <Text style={styles.dayPillText}>{DAY_SHORT[day.dayIndex]}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {day.lessons.map((lesson, index) => (
                  <View key={`l${index}`}>
                    <Text style={styles.slotTime}>
                      {lesson.startLabel} – {lesson.endLabel}
                      <Text style={styles.kindText}>  Lezione</Text>
                    </Text>
                    {!!lesson.details && <Text style={styles.slotDetails}>{lesson.details}</Text>}
                  </View>
                ))}
                {day.ricevimenti.map((lesson, index) => (
                  <View key={`r${index}`}>
                    <Text style={styles.riTime}>
                      Ricevimento {lesson.startLabel} – {lesson.endLabel}
                    </Text>
                    {!!lesson.details && <Text style={styles.slotDetails}>{lesson.details}</Text>}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </View>

      {isFav && !!changes?.length && (
        <Pressable
          onPress={() => onShowChanges(item.id)}
          hitSlop={10}
          style={styles.changedBtn}
          accessibilityRole="button"
          accessibilityLabel="Dati cambiati rispetto al PDF precedente"
        >
          <Text style={styles.changedIcon}>⚠️</Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  changedBtn: { alignSelf: 'flex-end', marginTop: 8 },
  changedIcon: { fontSize: 22 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  star: { fontSize: 28, lineHeight: 30, color: '#9CA3AF' },
  starOn: { color: '#F59E0B' },
  subject: { fontSize: 16, fontWeight: '700', color: '#111827' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOutline: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  professor: { marginTop: 10, fontSize: 14, color: '#374151', fontWeight: '600' },
  slots: { marginTop: 10, gap: 8 },
  noSlot: { color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayPill: { backgroundColor: '#DBEAFE', borderRadius: 8, paddingVertical: 4, width: 44, alignItems: 'center' },
  dayPillText: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  slotTime: { fontSize: 14, color: '#111827', fontWeight: '600' },
  kindText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  warnBox: { marginTop: 10, backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 10, padding: 10 },
  warnTitle: { color: '#92400E', fontWeight: '700', fontSize: 13 },
  warnPage: { color: '#92400E', fontSize: 12, marginTop: 2 },
  warnReason: { color: '#92400E', fontSize: 12, marginTop: 2 },
  riTime: { fontSize: 13, color: '#B45309', fontWeight: '600' },
  slotDetails: { fontSize: 13, color: '#6B7280', marginTop: 1 },
});

export default ScheduleCard;
