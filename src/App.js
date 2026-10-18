import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { extractorHtml } from './services/pdfExtractor';
import { parseSchedule, norm } from './utils/parser';
import ScheduleCard from './components/ScheduleCard';
import TabBar from './navigation/TabBar';
import CalendarScreen from './screens/CalendarScreen';
import RoomAvailabilityScreen from './screens/RoomAvailabilityScreen';
import { usePersistentState, setCodec, clearCalendarData } from './services/storage';
import SettingsScreen from './screens/SettingsScreen';
import ProfileScreen from './screens/ProfileScreen';
import { LanguageProvider, useTranslation } from './i18n/LanguageProvider';
import { mergeSchedules } from './services/updateMerge';

// SDK 54+: la vecchia API (readAsStringAsync, copyAsync...) sta in 'expo-file-system/legacy'.
// Su SDK precedenti il fallback usa il modulo principale.
let FileSystem;
try {
  FileSystem = require('expo-file-system/legacy');
} catch (_e) {
  FileSystem = require('expo-file-system');
}

const TIMEOUT_MS = 90000;

// Con un calendario già presente chiede come importare il nuovo PDF
const askImportMode = (t) =>
  new Promise((resolve) => {
    Alert.alert(
      t('importMode.title'),
      t('importMode.message'),
      [
        { text: t('importMode.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
        { text: t('importMode.replace'), style: 'destructive', onPress: () => resolve('replace') },
        { text: t('importMode.update'), onPress: () => resolve('update') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') }
    );
  });

// Legge il PDF in base64 provando più strategie (il picker di solito ha già
// copiato il file nella cache, quindi la copia manuale non è sempre necessaria).
async function readPdfBase64(asset) {
  const uri = asset.uri;
  const errors = [];

  // 1) lettura diretta (file:// in cache o content://)
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    errors.push(`lettura diretta: ${e?.message || e}`);
  }

  // 2) copia nella cache dell'app, poi lettura
  try {
    const dest = FileSystem.cacheDirectory + 'orario_import.pdf';
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: dest });
    return await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    errors.push(`copia in cache: ${e?.message || e}`);
  }

  // 3) fetch + FileReader
  try {
    const blob = await (await fetch(uri)).blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]);
      fr.onerror = () => reject(new Error('FileReader fallito'));
      fr.readAsDataURL(blob);
    });
  } catch (e) {
    errors.push(`fetch: ${e?.message || e}`);
  }

  throw new Error(errors.join(' | '));
}

/* ------------------------------ App ------------------------------ */

function AppContent() {
  const { t, change } = useTranslation();
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [fileName, setFileName, nameLoaded] = usePersistentState('fileName', '');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pdfB64, setPdfB64] = useState(null);
  const [schedule, setSchedule, scheduleLoaded] = usePersistentState('schedule', []);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [tab, setTab] = useState('calendar'); // 'list' | 'calendar' | 'rooms' -- il Calendario è la schermata iniziale
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [studentProfile, setStudentProfile, profileLoaded] = usePersistentState('studentProfile', {
    firstName: '',
    lastName: '',
    institutionalEmail: '',
    studentId: '',
    degreeCourse: '',
  });
  const [favorites, setFavorites, favLoaded] = usePersistentState('favorites', () => new Set(), setCodec);
  const [edits, setEdits, editsLoaded] = usePersistentState('edits', {}); // modifiche manuali alle lezioni, per chiave evento
  const [courseColors, setCourseColors, courseColorsLoaded] = usePersistentState('courseColors', {});
  const [changes, setChanges, changesLoaded] = usePersistentState('changes', {}); // differenze trovate in "Aggiorna calendario"
  const loaded = nameLoaded && scheduleLoaded && favLoaded && editsLoaded && courseColorsLoaded && changesLoaded && profileLoaded;

  const visibleStatus = status === 'idle' && loaded && schedule.length > 0 ? 'ready' : status;

  const editLesson = useCallback((key, patch) => setEdits((prev) => ({ ...prev, [key]: patch })), [setEdits]);
  const setCourseColor = useCallback((courseId, color) => {
    setCourseColors((prev) => {
      const next = { ...prev };
      if (color) next[courseId] = color;
      else delete next[courseId];
      return next;
    });
  }, [setCourseColors]);

  const toggleFav = useCallback((id) => {
    const removing = favorites.has(id);

    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Rimuovere un corso dai preferiti ripristina il suo stato originale:
    // elimina le modifiche alle lezioni e il colore personalizzato.
    if (removing) {
      const prefix = `${id}-`;
      setEdits((prev) => Object.fromEntries(
        Object.entries(prev).filter(([key]) => !key.startsWith(prefix))
      ));
      setCourseColors((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setChanges((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [favorites, setFavorites, setEdits, setCourseColors, setChanges]);

  const webRef = useRef(null);
  const pagesRef = useRef([]);
  const startedRef = useRef(false);
  const importModeRef = useRef('replace'); // 'replace' | 'update'
  const timerRef = useRef(null);

  const fail = useCallback((msg) => {
    clearTimeout(timerRef.current);
    setPdfB64(null);
    setErrorMsg(msg);
    setStatus('error');
  }, []);

  const pickPdf = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];

      let mode = 'replace';
      if (schedule.length > 0) {
        mode = await askImportMode(t);
        if (mode === 'cancel') return;
      }
      importModeRef.current = mode;

      setStatus('loading');
      setErrorMsg('');
      setProgress(t('import.copying'));
      setFileName(asset.name || 'orario.pdf');

      const b64 = await readPdfBase64(asset);

      pagesRef.current = [];
      startedRef.current = false;
      setProgress(t('import.reading'));
      setPdfB64(b64); // monta la WebView nascosta

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => fail(t('errors.timeout')),
        TIMEOUT_MS
      );
    } catch (e) {
      fail(t('errors.openFile', { message: e?.message || e }));
    }
  }, [fail, setFileName, schedule, t]);

  const onWebLoaded = useCallback(() => {
    if (startedRef.current || !pdfB64) return;
    startedRef.current = true;
    webRef.current?.injectJavaScript(`window.runExtraction(${JSON.stringify(pdfB64)}); true;`);
  }, [pdfB64]);

  const onWebMessage = useCallback(
    (e) => {
      let msg;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'start') {
        setProgress(t('import.readingPage', { current: 0, total: msg.pages }));
        pagesRef.current.total = msg.pages;
      } else if (msg.type === 'page') {
        pagesRef.current.push(msg.page);
        setProgress(t('import.readingPage', { current: pagesRef.current.length, total: pagesRef.current.total || '?' }));
      } else if (msg.type === 'done') {
        clearTimeout(timerRef.current);
        setProgress(t('import.analyzing'));
        // piccolo rinvio per lasciar renderizzare l'indicatore
        setTimeout(() => {
          try {
            const { scheduleMatrix } = parseSchedule([...pagesRef.current]);
            if (importModeRef.current === 'update') {
              if (!scheduleMatrix.length) throw new Error(t('errors.noRowsUpdate'));
              const merged = mergeSchedules(schedule, scheduleMatrix, favorites, edits, courseColors);
              setSchedule(scheduleMatrix);
              setFavorites(merged.favorites);
              setEdits(merged.edits);
              setCourseColors(merged.courseColors);
              setChanges(merged.changes);
              if (merged.missing) {
                Alert.alert(t('import.updatedTitle'), t('import.missingFavorites', { count: merged.missing }));
              }
            } else {
              setSchedule(scheduleMatrix);
              setFavorites(new Set());
              setEdits({});
              setCourseColors({});
              setChanges({});
            }
            setPdfB64(null);
            setQuery('');
            setStatus('ready');
          } catch (err) {
            fail(t('errors.parsing', { message: err?.message || err }));
          }
        }, 50);
      } else if (msg.type === 'error') {
        fail(msg.code ? t(`errors.${msg.code}`) : msg.message || t('errors.unknownRead'));
      }
    },
    [fail, schedule, favorites, edits, courseColors, setCourseColors, setEdits, setFavorites, setSchedule, setChanges, t]
  );

  const filtered = useMemo(() => {
    const tokens = norm(deferredQuery).split(' ').filter(Boolean);
    const matches = tokens.length
      ? schedule.filter((r) => tokens.every((t) => r.searchText.includes(t)))
      : schedule;
    return [
      ...matches.filter((r) => favorites.has(r.id)),
      ...matches.filter((r) => !favorites.has(r.id)),
    ];
  }, [schedule, deferredQuery, favorites]);

  // elimina i dati locali del calendario e azzera lo stato in memoria
  const handleClearCalendar = useCallback(async () => {
    setSchedule([]);
    setFileName('');
    setFavorites(new Set());
    setEdits({});
    setCourseColors({});
    setChanges({});
    setStatus('idle');
    setQuery('');
    await clearCalendarData();
  }, [setSchedule, setFileName, setFavorites, setEdits, setCourseColors, setChanges]);

  const showChanges = useCallback(
    (id) => {
      const list = changes[id];
      if (!list) return;
      Alert.alert(t('changes.title'), list.map(change).join('\n'), [
        { text: t('common.close'), style: 'cancel' },
        {
          text: t('changes.markVerified'),
          onPress: () =>
            setChanges((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            }),
        },
      ]);
    },
    [changes, setChanges, t, change]
  );

  const listExtra = useMemo(() => ({ favorites, changes }), [favorites, changes]);

  const renderItem = useCallback(
    ({ item }) => (
      <ScheduleCard item={item} isFav={favorites.has(item.id)} onToggle={toggleFav} changes={changes[item.id]} onShowChanges={showChanges} />
    ),
    [favorites, toggleFav, changes, showChanges]
  );
  const keyExtractor = useCallback((item) => item.id, []);

  if (!loaded) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <View style={styles.header}>
        <Text style={styles.title}>{t('app.title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {tab === 'list' && (
            <>
              <Pressable onPress={() => setShowProfile(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('header.openProfile')}>
                <Text style={styles.headerLink}>{t('header.profile')}</Text>
              </Pressable>
              <Pressable onPress={() => setShowSettings(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('header.openSettings')}>
                <Text style={styles.headerLink}>{t('header.settings')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {tab === 'list' && (
        <>
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, visibleStatus === 'loading' && { opacity: 0.6 }]}
        onPress={pickPdf}
        disabled={visibleStatus === 'loading'}
      >
        <Text style={styles.primaryBtnText}>{visibleStatus === 'ready' ? t('import.loadAnother') : t('import.select')}</Text>
      </Pressable>

      {visibleStatus === 'idle' && (
        <View style={styles.center}>
          <Text style={styles.hint}>{t('list.idleHint')}</Text>
        </View>
      )}

      {visibleStatus === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.hint}>{progress}</Text>
          {!!fileName && <Text style={styles.fileName}>{fileName}</Text>}
        </View>
      )}

      {visibleStatus === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{t('list.errorTitle')}</Text>
          <Text style={styles.hint}>{errorMsg}</Text>
        </View>
      )}

      {visibleStatus === 'ready' && (
        <>
          <TextInput
            style={styles.search}
            placeholder={t('list.searchPlaceholder')}
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <Text style={styles.count}>
            {t('list.results', { count: filtered.length })}
            {filtered.some((r) => r.isAmbiguous) ? `  ·  ⚠️ ${t('list.toVerify', { count: filtered.filter((r) => r.isAmbiguous).length })}` : ''}
            {fileName ? `  ·  ${fileName}` : ''}
          </Text>
          <FlatList
            data={filtered}
            renderItem={renderItem}
            extraData={listExtra}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={8}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t('list.noResults')}</Text>
                <Text style={styles.hint}>
                  {schedule.length === 0
                    ? t('list.noRowsRecognized')
                    : t('list.noMatch', { query })}
                </Text>
              </View>
            }
          />
        </>
      )}

        </>
      )}

      {tab === 'rooms' && <RoomAvailabilityScreen schedule={schedule} />}

      {tab === 'calendar' && <CalendarScreen schedule={schedule} favorites={favorites} onToggle={toggleFav} edits={edits} courseColors={courseColors} onEdit={editLesson} onSetCourseColor={setCourseColor} />}

      {/* WebView nascosta: esegue pdf.js solo durante l'importazione */}
      {pdfB64 && (
        <View style={styles.hiddenWeb} pointerEvents="none">
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html: extractorHtml, baseUrl: 'https://localhost' }}
            javaScriptEnabled
            domStorageEnabled
            onLoadEnd={onWebLoaded}
            onMessage={onWebMessage}
            onError={() => fail(t('errors.webview'))}
          />
        </View>
      )}

      <TabBar tab={tab} onTabChange={setTab} favoriteCount={favorites.size} />

      <SettingsScreen key={`settings-${showSettings ? 'open' : 'closed'}`} visible={showSettings} onClose={() => setShowSettings(false)} onClearCalendar={handleClearCalendar} />
      <ProfileScreen
        key={`profile-${showProfile ? 'open' : 'closed'}`}
        visible={showProfile}
        profile={studentProfile}
        onClose={() => setShowProfile(false)}
        onSave={setStudentProfile}
      />

    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

/* ------------------------------ Stili ------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6', paddingTop: (StatusBar.currentHeight || 0) + 12, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#111827' },
  headerLink: { color: '#2563EB', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  hint: { color: '#6B7280', fontSize: 15, textAlign: 'center' },
  fileName: { color: '#9CA3AF', fontSize: 12 },
  errorTitle: { color: '#B91C1C', fontSize: 18, fontWeight: '700' },
  search: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB',
  },
  count: { color: '#6B7280', fontSize: 12, marginVertical: 8 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  hiddenWeb: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});





