import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import * as DocumentPicker from 'expo-document-picker';
import { WebView } from 'react-native-webview';
import { extractorHtml } from './pdfExtractor';
import { parseSchedule, norm, DAY_SHORT, LEVEL_HEX } from './parser';
import CalendarView from './CalendarView';
import { usePersistentState, setCodec, clearCalendarData } from './storage';
import SettingsScreen from './SettingsScreen';
import ProfileScreen from './ProfileScreen';

// SDK 54+: la vecchia API (readAsStringAsync, copyAsync...) sta in 'expo-file-system/legacy'.
// Su SDK precedenti il fallback usa il modulo principale.
let FileSystem;
try {
  FileSystem = require('expo-file-system/legacy');
} catch (_e) {
  FileSystem = require('expo-file-system');
}

const TIMEOUT_MS = 90000;

// Legge il PDF in base64 provando più strategie (il picker di solito ha già
// copiato il file nella cache, quindi la copia manuale non è sempre necessaria).
async function readPdfBase64(asset) {
  const uri = asset.uri;
  console.log('[orario] uri selezionato:', uri);
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

/* ------------------------------ Card ------------------------------ */

const ScheduleCard = React.memo(function ScheduleCard({ item, isFav, onToggle }) {
  // Triennio = verde fluo #99CC00, Biennio = blu #99CCFF
  const levelHex = LEVEL_HEX[item.level];
  const bg = levelHex || '#E5E7EB';
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
        <View style={[styles.badge, { backgroundColor: bg }]}>
          <Text style={[styles.badgeText, { color: fg }]}>{item.level}</Text>
        </View>
        {item.tags.map((t, i) => (
          <View key={i} style={[styles.badge, styles.badgeOutline]}>
            <Text style={[styles.badgeText, { color: '#374151' }]}>{t}</Text>
          </View>
        ))}
      </View>

      {item.isAmbiguous && (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>⚠️ Possibile errore di lettura - Verificare sul PDF originale</Text>
          <Text style={styles.warnPage}>Pagina {item.pageNo} del PDF</Text>
          {item.ambiguityReasons.map((r, i) => (
            <Text key={i} style={styles.warnReason}>• {r}</Text>
          ))}
        </View>
      )}

      <Text style={styles.professor}>{item.professor || 'Docente non indicato'}</Text>

      <View style={styles.slots}>
        {item.days.length === 0 ? (
          <Text style={styles.noSlot}>Orario non rilevato nel PDF</Text>
        ) : (
          item.days.map((d) => (
            <View key={d.dayIndex} style={styles.slotRow}>
              <View style={styles.dayPill}>
                <Text style={styles.dayPillText}>{DAY_SHORT[d.dayIndex]}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {d.lessons.map((s, i) => (
                  <View key={`l${i}`}>
                    <Text style={styles.slotTime}>
                      {s.startLabel} – {s.endLabel}
                      <Text style={styles.kindText}>  Lezione</Text>
                    </Text>
                    {!!s.details && <Text style={styles.slotDetails}>{s.details}</Text>}
                  </View>
                ))}
                {d.ricevimenti.map((s, i) => (
                  <View key={`r${i}`}>
                    <Text style={styles.riTime}>
                      Ricevimento {s.startLabel} – {s.endLabel}
                    </Text>
                    {!!s.details && <Text style={styles.slotDetails}>{s.details}</Text>}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
});

/* ------------------------------ App ------------------------------ */

export default function App() {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [fileName, setFileName, nameLoaded] = usePersistentState('fileName', '');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pdfB64, setPdfB64] = useState(null);
  const [schedule, setSchedule, scheduleLoaded] = usePersistentState('schedule', []);
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [tab, setTab] = useState('calendar'); // 'list' | 'calendar' -- il Calendario è la schermata iniziale
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
  const loaded = nameLoaded && scheduleLoaded && favLoaded && editsLoaded && courseColorsLoaded && profileLoaded;

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
    }
  }, [favorites, setFavorites, setEdits, setCourseColors]);

  const webRef = useRef(null);
  const pagesRef = useRef([]);
  const startedRef = useRef(false);
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

      setStatus('loading');
      setErrorMsg('');
      setProgress('Copia del file…');
      setFileName(asset.name || 'orario.pdf');

      const b64 = await readPdfBase64(asset);

      pagesRef.current = [];
      startedRef.current = false;
      setProgress('Lettura del PDF…');
      setPdfB64(b64); // monta la WebView nascosta

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => fail('Timeout: pdf.js non ha risposto. Controlla la connessione internet e riprova.'),
        TIMEOUT_MS
      );
    } catch (e) {
      fail(`Impossibile aprire il file: ${e?.message || e}`);
    }
  }, [fail, setFileName]);

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
        setProgress(`Lettura pagina 0/${msg.pages}…`);
        pagesRef.current.total = msg.pages;
      } else if (msg.type === 'page') {
        pagesRef.current.push(msg.page);
        setProgress(`Lettura pagina ${pagesRef.current.length}/${pagesRef.current.total || '?'}…`);
      } else if (msg.type === 'done') {
        clearTimeout(timerRef.current);
        setProgress('Analisi della griglia…');
        // piccolo rinvio per lasciar renderizzare l'indicatore
        setTimeout(() => {
          try {
            const { scheduleMatrix, debug } = parseSchedule([...pagesRef.current]);
            setSchedule(scheduleMatrix);
            setFavorites(new Set());
            setEdits({});
            setCourseColors({});
            setDebugInfo(debug);
            setPdfB64(null);
            setQuery('');
            setStatus('ready');
          } catch (err) {
            fail(`Errore nel parsing: ${err?.message || err}`);
          }
        }, 50);
      } else if (msg.type === 'error') {
        fail(msg.message || 'Errore sconosciuto durante la lettura del PDF.');
      }
    },
    [fail, setCourseColors, setEdits, setFavorites, setSchedule]
  );

  const filtered = useMemo(() => {
    const tokens = norm(deferredQuery).split(' ').filter(Boolean);
    if (!tokens.length) return schedule;
    return schedule.filter((r) => tokens.every((t) => r.searchText.includes(t)));
  }, [schedule, deferredQuery]);

  // elimina i dati locali del calendario e azzera lo stato in memoria
  const handleClearCalendar = useCallback(async () => {
    setSchedule([]);
    setFileName('');
    setFavorites(new Set());
    setEdits({});
    setCourseColors({});
    setStatus('idle');
    setQuery('');
    await clearCalendarData();
  }, [setSchedule, setFileName, setFavorites, setEdits, setCourseColors]);

  const renderItem = useCallback(
    ({ item }) => <ScheduleCard item={item} isFav={favorites.has(item.id)} onToggle={toggleFav} />,
    [favorites, toggleFav]
  );
  const keyExtractor = useCallback((item) => item.id, []);

  if (!loaded) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <View style={styles.header}>
        <Text style={styles.title}>Orario</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {visibleStatus === 'ready' && (
            <Pressable onPress={() => setShowDebug(true)} hitSlop={10}>
              <Text style={styles.debugLink}>Diagnostica</Text>
            </Pressable>
          )}
          {tab === 'list' && (
            <>
              <Pressable onPress={() => setShowProfile(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Apri profilo studente">
                <Text style={styles.debugLink}>Profilo</Text>
              </Pressable>
              <Pressable onPress={() => setShowSettings(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Apri impostazioni">
                <Text style={styles.debugLink}>Impostazioni</Text>
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
        <Text style={styles.primaryBtnText}>{visibleStatus === 'ready' ? 'Carica un altro PDF' : 'Seleziona PDF dell’orario'}</Text>
      </Pressable>

      {visibleStatus === 'idle' && (
        <View style={styles.center}>
          <Text style={styles.hint}>Importa il PDF dell’orario per cercare materie e docenti.</Text>
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
          <Text style={styles.errorTitle}>Qualcosa è andato storto</Text>
          <Text style={styles.hint}>{errorMsg}</Text>
        </View>
      )}

      {visibleStatus === 'ready' && (
        <>
          <TextInput
            style={styles.search}
            placeholder="Cerca materia o professore…"
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <Text style={styles.count}>
            {filtered.length} {filtered.length === 1 ? 'risultato' : 'risultati'}
            {filtered.some((r) => r.isAmbiguous) ? `  ·  ⚠️ ${filtered.filter((r) => r.isAmbiguous).length} da verificare` : ''}
            {fileName ? `  ·  ${fileName}` : ''}
          </Text>
          <FlatList
            data={filtered}
            renderItem={renderItem}
            extraData={favorites}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={8}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nessun risultato</Text>
                <Text style={styles.hint}>
                  {schedule.length === 0
                    ? 'Nel PDF non sono state riconosciute righe. Apri “Diagnostica” per i dettagli.'
                    : `Nessuna materia o docente corrisponde a “${query}”.`}
                </Text>
              </View>
            }
          />
        </>
      )}

        </>
      )}

      {tab === 'calendar' && <CalendarView schedule={schedule} favorites={favorites} onToggle={toggleFav} edits={edits} courseColors={courseColors} onEdit={editLesson} onSetCourseColor={setCourseColor} />}

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
            onError={() => fail('Errore di caricamento della WebView.')}
          />
        </View>
      )}

      <View style={styles.tabBar}>
        <Pressable style={[styles.tabBtn, tab === 'list' && styles.tabBtnOn]} onPress={() => setTab('list')}>
          <Text style={[styles.tabText, tab === 'list' && styles.tabTextOn]}>Lista</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'calendar' && styles.tabBtnOn]} onPress={() => setTab('calendar')}>
          <Text style={[styles.tabText, tab === 'calendar' && styles.tabTextOn]}>
            Calendario{favorites.size ? `  ★ ${favorites.size}` : ''}
          </Text>
        </Pressable>
      </View>

      <SettingsScreen key={`settings-${showSettings ? 'open' : 'closed'}`} visible={showSettings} onClose={() => setShowSettings(false)} onClearCalendar={handleClearCalendar} />
      <ProfileScreen
        key={`profile-${showProfile ? 'open' : 'closed'}`}
        visible={showProfile}
        profile={studentProfile}
        onClose={() => setShowProfile(false)}
        onSave={setStudentProfile}
      />

      <Modal visible={showDebug} animationType="slide" onRequestClose={() => setShowDebug(false)}>
        <View style={styles.modal}>
          <Text style={styles.title}>Diagnostica parsing</Text>
          <ScrollView style={{ flex: 1, marginVertical: 12 }}>
            <Text selectable style={styles.mono}>
              {debugInfo ? JSON.stringify(debugInfo, null, 2) : '—'}
            </Text>
            <Text selectable style={[styles.mono, { marginTop: 16 }]}>
              {'Esempio (prime 3 righe):\n' + JSON.stringify(schedule.slice(0, 3), null, 2)}
            </Text>
          </ScrollView>
          <Pressable style={styles.primaryBtn} onPress={() => setShowDebug(false)}>
            <Text style={styles.primaryBtnText}>Chiudi</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------ Stili ------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6', paddingTop: (StatusBar.currentHeight || 0) + 12, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#111827' },
  debugLink: { color: '#2563EB', fontWeight: '600' },
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
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  star: { fontSize: 28, lineHeight: 30, color: '#9CA3AF' },
  starOn: { color: '#F59E0B' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', marginHorizontal: -16, paddingBottom: 6 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderTopWidth: 3, borderTopColor: 'transparent' },
  tabBtnOn: { borderTopColor: '#2563EB' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabTextOn: { color: '#2563EB' },
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
  dayPillRi: { backgroundColor: '#FEF3C7' },
  dayPillText: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  slotTime: { fontSize: 14, color: '#111827', fontWeight: '600' },
  kindText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  warnBox: { marginTop: 10, backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 10, padding: 10 },
  warnTitle: { color: '#92400E', fontWeight: '700', fontSize: 13 },
  warnPage: { color: '#92400E', fontSize: 12, marginTop: 2 },
  warnReason: { color: '#92400E', fontSize: 12, marginTop: 2 },
  riTime: { fontSize: 13, color: '#B45309', fontWeight: '600' },
  slotDetails: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  hiddenWeb: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  modal: { flex: 1, backgroundColor: '#fff', padding: 16, paddingTop: (StatusBar.currentHeight || 0) + 16 },
  mono: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 11, color: '#111827' },
});
