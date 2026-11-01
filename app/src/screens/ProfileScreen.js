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
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n/LanguageProvider';
import FloatingTextInput from '../components/FloatingTextInput';

const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  institutionalEmail: '',
  studentId: '',
  degreeCourse: '',
};

const FIELDS = [
  { key: 'firstName', maxLength: 80 },
  { key: 'lastName', maxLength: 80 },
  {
    key: 'institutionalEmail',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    maxLength: 254,
  },
  { key: 'studentId', maxLength: 40 },
  { key: 'degreeCourse', maxLength: 120 },
];

function Header({ onBack }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <View style={styles.backContent}>
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </View>
      </Pressable>
      <Text style={styles.headerTitle}>{t('header.profile')}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

export default function ProfileScreen({ visible, profile, onClose, onSave }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => ({ ...EMPTY_PROFILE, ...(profile || {}) }));

  const save = () => {
    const cleanProfile = Object.fromEntries(
    Object.entries({ ...EMPTY_PROFILE, ...form }).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ])
    );

    onSave(cleanProfile);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView edges={['bottom']} style={styles.root}>
          <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Header onBack={onClose} />
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {FIELDS.map(({ key, keyboardType, autoCapitalize, maxLength }) => {
                const label = t(`profile.${key}`);
                const value = form[key] || '';

                return (
                  <FloatingTextInput
                    key={key}
                    label={label}
                    value={value}
                    onChangeText={(text) => setForm((current) => ({ ...current, [key]: text }))}
                    keyboardType={keyboardType || 'default'}
                    autoCapitalize={autoCapitalize || 'words'}
                    autoCorrect={key !== 'institutionalEmail'}
                    returnKeyType="next"
                    maxLength={maxLength}
                  />
                );
              })}
              <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={save}>
                <Text style={styles.saveText}>{t('profile.save')}</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 56;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { flex: 1, paddingTop: TOP, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn: { width: 90 },
  backContent: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  form: { gap: 16, paddingBottom: 24 },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});



