import React, { useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { useTranslation } from '../i18n/LanguageProvider';

const SUPPORT_URL = 'https://ko-fi.com/steven56';

function Header({ title, onBack }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <View style={styles.backContent}>
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </View>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

// Menu a tendina per la lingua dell'app (la scelta viene salvata in AsyncStorage dal LanguageProvider)
function LanguageSelector() {
  const { t, language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.languageBox}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('settings.language')}
      >
        <View>
          <Text style={styles.languageLabel}>{t('settings.language')}</Text>
          <Text style={styles.rowText}>{t(`languages.${language}`)}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#9CA3AF" />
      </Pressable>
      {open && (
        <View style={styles.options}>
          {SUPPORTED_LANGUAGES.map((code) => (
            <Pressable
              key={code}
              style={[styles.option, code === language && styles.optionOn]}
              onPress={() => {
                setLanguage(code);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: code === language }}
            >
              <Text style={[styles.optionText, code === language && styles.optionTextOn]}>{t(`languages.${code}`)}</Text>
              {code === language && <Ionicons name="checkmark" size={20} color="#2563EB" />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Props:
 *  - visible: boolean
 *  - onClose(): chiude le Impostazioni
 *  - onClearCalendar(): async, elimina i dati locali del calendario
 */
export default function SettingsScreen({ visible, onClose, onClearCalendar }) {
  const { t } = useTranslation();
  const [page, setPage] = useState('menu'); // 'menu' | 'general' | 'about'

  const goBack = () => (page === 'menu' ? onClose() : setPage('menu'));

  const confirmClear = () =>
    Alert.alert(
      t('settings.clearTitle'),
      t('settings.clearMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearConfirm'),
          style: 'destructive',
          onPress: async () => {
            await onClearCalendar();
            Alert.alert(t('common.done'), t('settings.clearDone'));
          },
        },
      ]
    );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack}>
      <SafeAreaProvider>
        <SafeAreaView edges={['bottom']} style={styles.root}>
          {page === 'menu' && (
            <>
              <Header title={t('header.settings')} onBack={goBack} />
              <View style={styles.list}>
                <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} onPress={() => setPage('general')}>
                  <Text style={styles.rowText}>{t('settings.general')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </Pressable>
                <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} onPress={() => setPage('about')}>
                  <Text style={styles.rowText}>{t('settings.about')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </Pressable>
              </View>
            </>
          )}

          {page === 'general' && (
            <>
              <Header title={t('settings.general')} onBack={goBack} />
              <View style={styles.list}>
                <Pressable style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]} onPress={confirmClear}>
                  <Text style={styles.dangerText}>{t('settings.clearCalendar')}</Text>
                </Pressable>
                <Text style={styles.note}>{t('settings.clearNote')}</Text>
                <LanguageSelector />
              </View>
            </>
          )}

          {page === 'about' && (
            <>
              <Header title={t('settings.about')} onBack={goBack} />
              <View style={styles.aboutCenter}>
                <Image source={require('../assets/logo_brera.png')} style={styles.logo} />
                <Text style={styles.appName}>{t('app.title')}</Text>
                <Text style={styles.version}>{t('settings.version', { version: Constants.expoConfig?.version || '1.0.0' })}</Text>
              </View>
              <View style={styles.supportArea}>
                <Text style={styles.supportNote}>{t('settings.supportNote')}</Text>
                <Pressable style={styles.supportBtn} onPress={() => Linking.openURL(SUPPORT_URL)} accessibilityRole="link">
                  <Text style={styles.supportText}>ko-fi</Text>
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 56;

const styles = StyleSheet.create({
  languageBox: { marginTop: 14 },
  languageLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 2 },
  options: { backgroundColor: '#fff', borderRadius: 14, marginTop: 6, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  optionOn: { backgroundColor: '#DBEAFE' },
  optionText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  optionTextOn: { color: '#1E3A8A' },
  root: { flex: 1, backgroundColor: '#F3F4F6', paddingTop: TOP, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { width: 90 },
  backContent: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  list: { gap: 10 },
  row: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  rowText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  dangerBtn: { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  note: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 4 },
  aboutCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  logo: { width: 96, height: 96, borderRadius: 22, marginBottom: 6 },
  appName: { fontSize: 24, fontWeight: '800', color: '#111827' },
  version: { fontSize: 14, color: '#6B7280' },
  supportArea: { alignItems: 'center' },
  supportNote: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginHorizontal: 16, marginBottom: 2 },
  supportBtn: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24, marginBottom: 28 },
  supportText: { color: '#2563EB', fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
});



