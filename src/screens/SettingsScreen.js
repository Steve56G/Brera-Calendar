import React, { useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

const APP_NAME = 'Orario';
const SUPPORT_URL = 'https://ko-fi.com/steven56';

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Indietro">
        <Text style={styles.backText}>‹ Indietro</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backBtn} />
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
  const [page, setPage] = useState('menu'); // 'menu' | 'general' | 'about'

  const goBack = () => (page === 'menu' ? onClose() : setPage('menu'));

  const confirmClear = () =>
    Alert.alert(
      'Pulire il calendario?',
      "Verranno eliminati l'orario importato, i corsi preferiti e tutte le modifiche alle lezioni. L'operazione non è reversibile.",
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Pulisci',
          style: 'destructive',
          onPress: async () => {
            await onClearCalendar();
            Alert.alert('Fatto', 'I dati del calendario sono stati eliminati.');
          },
        },
      ]
    );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack}>
      <View style={styles.root}>
        {page === 'menu' && (
          <>
            <Header title="Impostazioni" onBack={goBack} />
            <View style={styles.list}>
              <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} onPress={() => setPage('general')}>
                <Text style={styles.rowText}>Generale</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} onPress={() => setPage('about')}>
                <Text style={styles.rowText}>Informazioni</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </View>
          </>
        )}

        {page === 'general' && (
          <>
            <Header title="Generale" onBack={goBack} />
            <View style={styles.list}>
              <Pressable style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]} onPress={confirmClear}>
                <Text style={styles.dangerText}>Pulisci calendario</Text>
              </Pressable>
              <Text style={styles.note}>Elimina orario importato, corsi preferiti e modifiche ai corsi salvati su questo dispositivo.</Text>
            </View>
          </>
        )}

        {page === 'about' && (
          <>
            <Header title="Informazioni" onBack={goBack} />
            <View style={styles.aboutCenter}>
              <Image source={require('../assets/logo_brera.png')} style={styles.logo} />
              <Text style={styles.appName}>{APP_NAME}</Text>
              <Text style={styles.version}>Versione {Constants.expoConfig?.version || '1.0.0'}</Text>
            </View>
            <View style={styles.supportArea}>
              <Text style={styles.supportNote}>L&apos;app è completamente gratuita e open source, ma se vuoi darmi più di una pacca sulla spalla puoi offrirmi qualcosa su questo link!</Text>
              <Pressable style={styles.supportBtn} onPress={() => Linking.openURL(SUPPORT_URL)} accessibilityRole="link">
                <Text style={styles.supportText}>ko-fi</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
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
  list: { gap: 10 },
  row: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  rowText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  chevron: { fontSize: 22, color: '#9CA3AF' },
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
