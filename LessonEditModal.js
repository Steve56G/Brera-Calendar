import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Alert,
  View,
} from 'react-native';
import CourseColorSelector from './CourseColorSelector';

const MIN_H = 8; // 08:00
const MAX_H = 19; // 19:00
const NOTE_BOX_H = 88;

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
 *  - lesson:  { subject, details (aula), note, start, end, startLabel, endLabel, ... }  (start/end in ore decimali)
 *  - onSave(updatedLesson): riceve la lezione con i campi aggiornati
 *  - onDelete(lesson): elimina solo la lezione selezionata
 *  - onCancel(): chiusura senza salvare
 */
export default function LessonEditModal({ visible, lesson, color, onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(() => lesson?.subject || '');
  const [room, setRoom] = useState(() => lesson?.details || '');
  const [note, setNote] = useState(() => lesson?.note || '');
  const [selectedColor, setSelectedColor] = useState(() => color || null);
  const [startT, setStartT] = useState(() => lesson?.startLabel || fmt(lesson?.start ?? MIN_H));
  const [endT, setEndT] = useState(() => lesson?.endLabel || fmt(lesson?.end ?? MIN_H));
  const [error, setError] = useState('');

  const handleSave = () => {
    const name = title.trim();
    const s = parseTime(startT);
    const e = parseTime(endT);
    if (!name) return setError('Inserisci un titolo.');
    if (s === null || e === null) return setError('Orario non valido: usa il formato HH:MM con minuti 00 o 30.');
    if (s < MIN_H || e > MAX_H) return setError(`L'orario deve essere compreso tra ${fmt(MIN_H)} e ${fmt(MAX_H)}.`);
    if (e <= s) return setError("L'orario di fine deve essere successivo a quello di inizio.");
    setError('');
    onSave({ ...lesson, subject: name, details: room.trim(), note, color: selectedColor, start: s, end: e, startLabel: fmt(s), endLabel: fmt(e) });
  };

  const confirmDelete = () => {
    Alert.alert(
      'Eliminare la lezione?',
      'Verrà rimossa solo questa lezione. Le altre lezioni del corso resteranno nel calendario.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: () => onDelete?.(lesson) },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.heading}>Modifica lezione</Text>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel="Annulla e chiudi">
              <Text style={styles.cancelText}>Annulla</Text>
            </Pressable>
          </View>

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

          <Text style={styles.label}>Note</Text>
          <View style={styles.noteBox}>
            <ScrollView
              style={styles.noteScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={[styles.noteInput]}
                value={note}
                onChangeText={setNote}
                placeholder="Aggiungi una nota"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </ScrollView>
          </View>

          <Text style={styles.label}>Colore del corso (tutte le lezioni)</Text>
          <CourseColorSelector color={selectedColor} onChange={setSelectedColor} />

          <View style={styles.timeRow}>
            <TimeField label="Inizio" value={startT} onChange={setStartT} />
            <TimeField label="Fine" value={endT} onChange={setEndT} />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { opacity: 0.8 }]} onPress={confirmDelete}>
              <Text style={styles.btnDangerText}>Elimina</Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 20, fontWeight: '800', color: '#111827' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#2563EB' },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16,
  },
  noteBox: {
    height: NOTE_BOX_H,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  noteScroll: { flex: 1 },
  noteInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827' },
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
  btnDanger: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  btnDangerText: { color: '#B91C1C', fontSize: 16, fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2563EB' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
