import React, { useEffect, useRef, useState } from 'react';
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
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import CourseColorSelector from './CourseColorSelector';
import { DAYS } from '../constants/schedule';
import { useTranslation } from '../i18n/LanguageProvider';

const MIN_H = 8; // 08:00
const MAX_H = 19; // 19:00
const NOTE_BOX_MIN_H = 88;
const NOTE_BOX_MAX_H = 124;
const NOTE_INPUT_PADDING = 24;

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
  const { t } = useTranslation();
  const step = (delta) => {
    const cur = parseTime(value);
    if (cur === null) return;
    onChange(fmt(Math.min(MAX_H, Math.max(MIN_H, cur + delta))));
  };
  return (
    <View style={styles.timeCol}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={() => step(-0.5)} hitSlop={6} accessibilityLabel={t('lesson.minus30', { label })}>
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
        <Pressable style={styles.stepBtn} onPress={() => step(0.5)} hitSlop={6} accessibilityLabel={t('lesson.plus30', { label })}>
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
export default function LessonEditModal({ visible, lesson, color, isCustom = false, onSave, onDelete, onCancel }) {
  const { t, dayName, dayShort } = useTranslation();
  const [title, setTitle] = useState(() => lesson?.subject || '');
  const [professor, setProfessor] = useState(() => lesson?.professor || '');
  const [room, setRoom] = useState(() => lesson?.details || '');
  const [note, setNote] = useState(() => lesson?.note || '');
  const [noteBoxHeight, setNoteBoxHeight] = useState(NOTE_BOX_MIN_H);
  const [noteTextHeight, setNoteTextHeight] = useState(44);
  const [noteEditing, setNoteEditing] = useState(false);
  const noteInputRef = useRef(null);
  const [selectedColor, setSelectedColor] = useState(() => color || null);
  const [dayIndex, setDayIndex] = useState(() => lesson?.dayIndex ?? 0);
  const [startT, setStartT] = useState(() => lesson?.startLabel || fmt(lesson?.start ?? MIN_H));
  const [endT, setEndT] = useState(() => lesson?.endLabel || fmt(lesson?.end ?? MIN_H));
  const [error, setError] = useState('');

  useEffect(() => {
    if (noteEditing) noteInputRef.current?.focus();
  }, [noteEditing]);

  const handleSave = () => {
    const name = title.trim();
    const s = parseTime(startT);
    const e = parseTime(endT);
    if (!name) return setError(t('lesson.errTitle'));
    if (s === null || e === null) return setError(t('lesson.errTimeFormat'));
    if (s < MIN_H || e > MAX_H) return setError(t('lesson.errTimeRange', { min: fmt(MIN_H), max: fmt(MAX_H) }));
    if (e <= s) return setError(t('lesson.errTimeOrder'));
    setError('');
    onSave({ ...lesson, subject: name, professor: professor.trim(), details: room.trim(), note, color: selectedColor, dayIndex, start: s, end: e, startLabel: fmt(s), endLabel: fmt(e) });
  };

  const confirmDelete = () => {
    Alert.alert(
      t('lesson.deleteTitle'),
      t('lesson.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => onDelete?.(lesson) },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <SafeAreaProvider>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.modalHeader}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <Text style={styles.heading}>{t('lesson.heading')}</Text>
              <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('lesson.cancelClose')}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.fieldsScroll}
            contentContainerStyle={styles.fieldsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {isCustom && (
              <>
                <Text style={styles.label}>{t('lesson.day')}</Text>
                <View style={styles.daysRow}>
                  {DAYS.map((day, index) => (
                    <Pressable
                      key={day}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: dayIndex === index }}
                      accessibilityLabel={dayName(index)}
                      onPress={() => setDayIndex(index)}
                      style={[styles.dayButton, dayIndex === index && styles.dayButtonSelected]}
                    >
                      <Text style={[styles.dayButtonText, dayIndex === index && styles.dayButtonTextSelected]}>{dayShort(index)}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>{t('lesson.title')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('lesson.titlePlaceholder')}
              placeholderTextColor="#9CA3AF"
              returnKeyType="done"
              multiline={false}
            />

            <Text style={styles.label}>{t('lesson.professor')}</Text>
            <TextInput
              style={styles.input}
              value={professor}
              onChangeText={setProfessor}
              placeholder={t('lesson.professorPlaceholder')}
              placeholderTextColor="#9CA3AF"
              returnKeyType="done"
            />

            <Text style={styles.label}>{t('lesson.room')}</Text>
            <TextInput
              style={styles.input}
              value={room}
              onChangeText={setRoom}
              placeholder={t('lesson.roomPlaceholder')}
              placeholderTextColor="#9CA3AF"
              returnKeyType="done"
            />

            <Text style={styles.label}>{t('lesson.notes')}</Text>
            <View style={[styles.noteBox, { height: noteBoxHeight }]}>
              <ScrollView
                style={styles.noteScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <TextInput
                  ref={noteInputRef}
                  style={[styles.noteInput, { height: noteTextHeight }]}
                  value={note}
                  onChangeText={setNote}
                  onContentSizeChange={({ nativeEvent }) => {
                    const contentHeight = Math.ceil(nativeEvent.contentSize.height + NOTE_INPUT_PADDING);
                    const nextBoxHeight = Math.min(NOTE_BOX_MAX_H, Math.max(NOTE_BOX_MIN_H, contentHeight));
                    setNoteTextHeight((currentHeight) => currentHeight === contentHeight ? currentHeight : contentHeight);
                    setNoteBoxHeight((currentHeight) => currentHeight === nextBoxHeight ? currentHeight : nextBoxHeight);
                  }}
                  placeholder={t('lesson.notePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  editable={noteEditing}
                  scrollEnabled={false}
                  textAlignVertical="top"
                  onBlur={() => setNoteEditing(false)}
                />
                {!noteEditing && (
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setNoteEditing(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('lesson.editNotes')}
                  />
                )}
              </ScrollView>
            </View>

            <Text style={styles.label}>{isCustom ? t('lesson.colorLesson') : t('lesson.colorCourse')}</Text>
            <CourseColorSelector color={selectedColor} onChange={setSelectedColor} />

            <View style={styles.timeRow}>
              <TimeField label={t('lesson.start')} value={startT} onChange={setStartT} />
              <TimeField label={t('lesson.end')} value={endT} onChange={setEndT} />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { opacity: 0.8 }]} onPress={confirmDelete}>
              <Text style={styles.btnDangerText}>{t('common.delete')}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]} onPress={handleSave}>
              <Text style={styles.btnPrimaryText}>{t('lesson.save')}</Text>
            </Pressable>
          </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '90%', flexShrink: 1, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  modalHeader: { flexShrink: 0 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 20, fontWeight: '800', color: '#111827' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#2563EB' },
  fieldsScroll: { flexShrink: 1 },
  fieldsContent: { paddingBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16,
  },
  daysRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  dayButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  dayButtonSelected: { backgroundColor: '#DBEAFE', borderColor: '#2563EB' },
  dayButtonText: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  dayButtonTextSelected: { color: '#1D4ED8' },
  noteBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  noteScroll: { flex: 1 },
  noteInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 20, color: '#111827' },
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
  actions: { flexDirection: 'row', gap: 12, marginTop: 16, flexShrink: 0 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDanger: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  btnDangerText: { color: '#B91C1C', fontSize: 16, fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2563EB' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});



