// check-schedule.js
// Controlla se sul sito di Brera è comparso un nuovo PDF dell'orario e invia
// una push ai dispositivi registrati. Eseguito da GitHub Actions ogni 8 ore.
//
// La ricerca del PDF è allineata a src/services/breraTimetable.js: stessa
// pagina, stesso regex (spazi codificati come %20, "_", "+" o "-") e stessa
// normalizzazione dell'URL. Qui però servono entrambi i semestri, non solo
// quello corrente.

const { createClient } = require('@supabase/supabase-js');

const BRERA_BASE_URL = 'https://www.accademiadibrera.milano.it';
const TIMETABLE_PAGE_URL = `${BRERA_BASE_URL}/it/orario-lezioni`;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DEFAULT_SUPABASE_URL = 'https://ydztjjmlwdxbeskmpgpv.supabase.co';

const SETTINGS_KEYS = {
  PRIMO: 'last_primo_url',
  SECONDO: 'last_secondo_url',
};

const SEMESTER_LABELS = {
  it: { PRIMO: '1° Semestre', SECONDO: '2° Semestre' },
  en: { PRIMO: 'Semester 1', SECONDO: 'Semester 2' },
};

const NOTIFICATION_BODY = {
  it: 'È disponibile il nuovo PDF degli orari. Tocca per aprire il calendario.',
  en: 'A new timetable PDF is available. Tap to open the calendar.',
};

function notificationContent(semester, language) {
  const lang = language === 'en' ? 'en' : 'it';
  return {
    title: lang === 'en'
      ? `${SEMESTER_LABELS.en[semester]} timetable updated`
      : `Orario ${SEMESTER_LABELS.it[semester]} aggiornato`,
    body: NOTIFICATION_BODY[lang],
  };
}

let supabaseClient = null;

function assertServiceRoleKey(key) {
  if (key.startsWith('sb_secret_')) return;
  if (key.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_KEY non può essere la publishable key: serve la service_role key');
  }

  const parts = key.split('.');
  if (parts.length !== 3) return; // formato non JWT: lo valida Supabase

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role && payload.role !== 'service_role') {
      throw new Error('SUPABASE_KEY deve essere la service_role key, non la chiave anon');
    }
  } catch (error) {
    if (error.message.includes('service_role')) throw error;
  }
}

function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    // Deve essere la chiave service_role: lo script legge tutti i device e
    // aggiorna settings indipendentemente dalle policy RLS.
    const key = process.env.SUPABASE_KEY;
    if (!key) throw new Error('SUPABASE_KEY è obbligatoria');
    assertServiceRoleKey(key);
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

function toAbsoluteUrl(path) {
  const clean = path.replace(/&amp;/g, '&').trim().replace(/ /g, '%20');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  return `${BRERA_BASE_URL}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

async function fetchTimetableHtml() {
  const response = await fetch(TIMETABLE_PAGE_URL, {
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BreraCalendarBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} da ${TIMETABLE_PAGE_URL}`);
  return response.text();
}

function findTimetableUrl(html, semester) {
  const regex = new RegExp(
    `data-link-file\\s*=\\s*"([^"]*ORARIO(?:%20|\\s|_|\\+|-)+${semester}[^"]*\\.pdf[^"]*)"`,
    'i'
  );
  const match = regex.exec(html);
  return match ? toAbsoluteUrl(match[1]) : null;
}

// Stessa regola di semesterFor() nell'app: febbraio-agosto = secondo,
// settembre-gennaio = primo.
function isCurrentSemester(semester, date = new Date()) {
  const month = date.getMonth();
  const current = month >= 1 && month <= 7 ? 'SECONDO' : 'PRIMO';
  return semester === current;
}

async function getSetting(key) {
  const { data, error } = await getSupabase()
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function saveSetting(key, value) {
  const { error } = await getSupabase()
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

async function sendNotifications(semester, url) {
  // select('*') per non fallire se `language` non è ancora stata aggiunta:
  // in quel caso i device ricevono il testo italiano.
  const { data: devices, error } = await getSupabase()
    .from('devices')
    .select('*')
    .eq('notifications_active', true);
  if (error) throw error;

  const currentSemester = isCurrentSemester(semester);
  const recipients = (devices ?? [])
    .filter((device) => !device.only_current_semester || currentSemester)
    .map((device) => ({
      token: device.expo_push_token,
      language: device.language === 'en' ? 'en' : 'it',
    }))
    .filter((recipient) => recipient.token);

  if (recipients.length === 0) {
    console.log(`[${semester}] nessun device da notificare`);
    return 0;
  }

  const messages = recipients.map(({ token, language }) => ({
    to: token,
    sound: 'default',
    ...notificationContent(semester, language),
    data: {
      screen: 'calendar',
      semester: semester.toLowerCase(),
      url,
      language,
    },
  }));

  // L'API Expo accetta al massimo 100 messaggi per richiesta.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      throw new Error(`Expo Push API: HTTP ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const failed = (payload?.data ?? []).filter((ticket) => ticket.status === 'error');
    if (failed.length) {
      console.warn(`[${semester}] ${failed.length} notifiche rifiutate da Expo:`, failed.slice(0, 3));
    }
  }

  console.log(`[${semester}] notifiche inviate: ${recipients.length}`);
  return recipients.length;
}

async function checkSemester(html, semester) {
  const url = findTimetableUrl(html, semester);
  if (!url) {
    console.warn(`[${semester}] PDF non trovato nella pagina`);
    return;
  }

  const key = SETTINGS_KEYS[semester];
  const previousUrl = await getSetting(key);

  if (previousUrl === url) {
    console.log(`[${semester}] nessun aggiornamento`);
    return;
  }

  // Primo avvio: salva il valore iniziale senza notificare tutti i device.
  if (previousUrl === null) {
    await saveSetting(key, url);
    console.log(`[${semester}] baseline salvata, nessuna notifica`);
    return;
  }

  // Salva solo dopo un invio riuscito, così un errore push viene ritentato
  // al giro successivo.
  const sent = await sendNotifications(semester, url);
  await saveSetting(key, url);
  console.log(`[${semester}] nuovo PDF: ${url} (inviate ${sent})`);
}

async function runCheck() {
  const html = await fetchTimetableHtml();
  let failed = false;

  for (const semester of Object.keys(SETTINGS_KEYS)) {
    try {
      await checkSemester(html, semester);
    } catch (error) {
      failed = true;
      console.error(`[${semester}] errore:`, error?.message || error);
    }
  }

  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  runCheck().catch((error) => {
    console.error('Controllo orari fallito:', error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = { findTimetableUrl, toAbsoluteUrl, isCurrentSemester, notificationContent };
