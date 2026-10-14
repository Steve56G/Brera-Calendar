import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const MIN_H = 8; // 08:00
const MAX_H = 19; // 19:00

const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

// "HH:MM" -> ore decimali (solo minuti 00 o 30, come la griglia del calendario)
const parseTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min !== 0 && min !== 30) return null;
  return h + min / 60;
};

function TimeField({ label, value, onChange }) {
  const step = (delta) => {
    const cur = parseTime(value);
    if (cur === null) return;
    onChange(fmt(Math.min(MAX_H, Math.max(MIN_H, cur + delta))));
  };
  return (
    <View style={styles.timeCol}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={() => step(-0.5)} hitSlop={6} accessibilityLabel={`${label} -30 minuti`}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <TextInput
          style={styles.timeInput}
          value={value}
          onChangeText={onChange}
          keyboardType="numbers-and-punctuation"
          placeholder="HH:MM"
          placeholderTextColor="#9CA3AF"
          maxLength={5}
          selectTextOnFocus
        />
        <Pressable style={styles.stepBtn} onPress={() => step(0.5)} hitSlop={6} accessibilityLabel={`${label} +30 minuti`}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Props:
 *  - visible: boolean
 *  - lesson:  { subject, details (aula), start, end, startLabel, endLabel, ... }  (start/end in ore decimali)
 *  - onSave(updatedLesson): riceve la lezione con subject, details, start, end, startLabel, endLabel aggiornati
 *  - onCancel(): chiusura senza salvare
 */
export default function LessonEditModal({ visible, lesson, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('');
  const [startT, setStartT] = useState('');
  const [endT, setEndT] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && lesson) {
      setTitle(lesson.subject || '');
      setRoom(lesson.details || '');
      setStartT(lesson.startLabel || fmt(lesson.start));
      setEndT(lesson.endLabel || fmt(lesson.end));
      setError('');
    }
  }, [visible, lesson]);

  const handleSave = () => {
    const name = title.trim();
    const s = parseTime(startT);
    const e = parseTime(endT);
    if (!name) return setError('Inserisci un titolo.');
    if (s === null || e === null) return setError('Orario non valido: usa il formato HH:MM con minuti 00 o 30.');
    if (s < MIN_H || e > MAX_H) return setError(`L'orario deve essere compreso tra ${fmt(MIN_H)} e ${fmt(MAX_H)}.`);
    if (e <= s) return setError("L'orario di fine deve essere successivo a quello di inizio.");
    setError('');
    onSave({ ...lesson, subject: name, details: room.trim(), start: s, end: e, startLabel: fmt(s), endLabel: fmt(e) });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.heading}>Modifica lezione</Text>

          <Text style={styles.label}>Titolo</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Titolo della lezione"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            multiline={false}
          />

          <Text style={styles.label}>Aula</Text>
          <TextInput
            style={styles.input}
            value={room}
            onChangeText={setRoom}
            placeholder="Es. Aula 6"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
          />

          <View style={styles.timeRow}>
            <TimeField label="Inizio" value={startT} onChange={setStartT} />
            <TimeField label="Fine" value={endT} onChange={setEndT} />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.7 }]} onPress={onCancel}>
              <Text style={styles.btnGhostText}>Annulla</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]} onPress={handleSave}>
              <Text style={styles.btnPrimaryText}>Salva modifiche</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: 14 },
  heading: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16,
  },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 38, height: 44, borderRadius: 10, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700', color: '#1E3A8A' },
  timeInput: {
    flex: 1, height: 44, textAlign: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, fontSize: 16, fontWeight: '600', color: '#111827', paddingVertical: 0,
  },
  error: { color: '#B91C1C', fontSize: 13, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 22 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  btnGhostText: { color: '#374151', fontSize: 16, fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2563EB' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
