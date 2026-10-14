import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  institutionalEmail: '',
  studentId: '',
  degreeCourse: '',
};

const FIELDS = [
  { key: 'firstName', label: 'Nome' },
  { key: 'lastName', label: 'Cognome' },
  { key: 'institutionalEmail', label: 'Email istituzionale', keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'studentId', label: 'Matricola' },
  { key: 'degreeCourse', label: 'Corso di laurea' },
];

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Indietro">
        <Text style={styles.backText}>‹ Indietro</Text>
      </Pressable>
      <Text style={styles.headerTitle}>Profilo</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

export default function ProfileScreen({ visible, profile, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_PROFILE, ...(profile || {}) }));

  const save = () => {
    onSave({ ...EMPTY_PROFILE, ...form });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header onBack={onClose} />
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {FIELDS.map(({ key, label, keyboardType, autoCapitalize }) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[key] || ''}
                onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
                placeholder={label}
                placeholderTextColor="#9CA3AF"
                keyboardType={keyboardType || 'default'}
                autoCapitalize={autoCapitalize || 'words'}
                autoCorrect={key !== 'institutionalEmail'}
                returnKeyType="next"
              />
            </View>
          ))}
          <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={save}>
            <Text style={styles.saveText}>Salva profilo</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 56;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6', paddingTop: TOP, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { width: 90 },
  backText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  form: { gap: 14, paddingBottom: 20 },
  field: { gap: 6 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontSize: 16,
  },
  saveBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
