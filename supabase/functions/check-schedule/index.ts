import { withSupabase } from 'npm:@supabase/server@^1';

type Semester = 'PRIMO' | 'SECONDO';
type Language = 'it' | 'en';

interface SettingsRow {
  value: string | null;
}

interface DeviceRow {
  expo_push_token: string;
  only_current_semester: boolean | null;
  language: string | null;
}

interface Update {
  semester: Semester;
  key: string;
  url: string;
}

interface NotificationContent {
  title: string;
  body: string;
}

interface ExpoMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: {
    screen: 'list';
    semester: string;
    url: string;
    semesters: string[];
    language: Language;
  };
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

interface ExpoPushResponse {
  data?: ExpoTicket[];
}

const BRERA_BASE_URL = 'https://www.accademiadibrera.milano.it';
const TIMETABLE_PAGE_URL = `${BRERA_BASE_URL}/it/orario-lezioni`;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

const SEMESTERS: Semester[] = ['PRIMO', 'SECONDO'];

const SETTINGS_KEYS: Record<Semester, string> = {
  PRIMO: 'last_primo_url',
  SECONDO: 'last_secondo_url',
};

const SEMESTER_LABELS: Record<Language, Record<Semester, string>> = {
  it: { PRIMO: '1° Semestre', SECONDO: '2° Semestre' },
  en: { PRIMO: 'Semester 1', SECONDO: 'Semester 2' },
};

const NOTIFICATION_BODY: Record<Language, string> = {
  it: 'È disponibile il nuovo PDF degli orari',
  en: 'A new timetable PDF is available',
};

function normalizeLanguage(language: string | null | undefined): Language {
  return language === 'en' ? 'en' : 'it';
}

function toAbsoluteUrl(path: string): string {
  const clean = path.replace(/&amp;/g, '&').trim().replace(/ /g, '%20');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  return `${BRERA_BASE_URL}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

function findTimetableUrl(html: string, semester: Semester): string | null {
  const regex = new RegExp(
    `data-link-file\\s*=\\s*"([^"]*ORARIO(?:%20|\\s|_|\\+|-)+${semester}[^"]*\\.pdf[^"]*)"`,
    'i'
  );
  const match = regex.exec(html);
  if (!match?.[1]) return null;
  return toAbsoluteUrl(match[1]);
}

function isCurrentSemester(semester: Semester, date = new Date()): boolean {
  const month = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      month: 'numeric',
    }).format(date)
  );

  // Febbraio-agosto = secondo semestre; settembre-gennaio = primo.
  const current: Semester = month >= 2 && month <= 8 ? 'SECONDO' : 'PRIMO';
  return semester === current;
}

function notificationContent(semester: Semester, language: string | null): NotificationContent {
  const lang = normalizeLanguage(language);
  return {
    title: lang === 'en'
      ? `${SEMESTER_LABELS.en[semester]} timetable updated`
      : `Orario ${SEMESTER_LABELS.it[semester]} aggiornato`,
    body: NOTIFICATION_BODY[lang],
  };
}

function combinedNotificationContent(language: string | null): NotificationContent {
  const lang = normalizeLanguage(language);
  return {
    title: lang === 'en'
      ? 'Semester 1 and 2 timetables updated'
      : 'Orario primo e secondo semestre aggiornati',
    body: NOTIFICATION_BODY[lang],
  };
}

function notificationForDevice(
  device: DeviceRow,
  updates: Update[],
  currentSemester: Semester
): ExpoMessage | null {
  if (!device.expo_push_token) return null;

  const onlyCurrent = Boolean(device.only_current_semester);
  const relevant = onlyCurrent
    ? updates.filter((update) => update.semester === currentSemester)
    : updates;

  if (relevant.length === 0) return null;

  const primary = relevant.find((update) => update.semester === currentSemester) ?? relevant[0];
  if (!primary) return null;

  const language = normalizeLanguage(device.language);
  const content = !onlyCurrent && updates.length === 2
    ? combinedNotificationContent(language)
    : notificationContent(primary.semester, language);

  return {
    to: device.expo_push_token,
    sound: 'default',
    ...content,
    data: {
      screen: 'list',
      semester: primary.semester.toLowerCase(),
      url: primary.url,
      semesters: relevant.map((update) => update.semester.toLowerCase()),
      language,
    },
  };
}

async function fetchTimetableHtml(): Promise<string> {
  const response = await fetch(TIMETABLE_PAGE_URL, {
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BreraCalendarBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} da ${TIMETABLE_PAGE_URL}`);
  }

  return response.text();
}

export default {
  fetch: withSupabase({ auth: 'secret:secret_key_brera_calendar' }, async (_req, ctx) => {
    const db = ctx.supabaseAdmin;

    const getSetting = async (key: string): Promise<string | null> => {
      const { data, error } = await db
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) throw error;
      return (data as SettingsRow | null)?.value ?? null;
    };

    const saveSetting = async (key: string, value: string): Promise<void> => {
      const { error } = await db
        .from('settings')
        .upsert({ key, value }, { onConflict: 'key' });

      if (error) throw error;
    };

    const sendNotifications = async (updates: Update[]): Promise<number> => {
      const PAGE_SIZE = 1000;
      const devices: DeviceRow[] = [];
      
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
        .from('devices')
        .select('expo_push_token, only_current_semester, language')
        .eq('notifications_active', true)
        .order('expo_push_token')
        .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        devices.push(...((data ?? []) as DeviceRow[]));
        if (!data || data.length < PAGE_SIZE) break;
      }   

      const currentSemester: Semester = isCurrentSemester('PRIMO') ? 'PRIMO' : 'SECONDO';
      const messages = devices
        .map((device) => notificationForDevice(device, updates, currentSemester))
        .filter((message): message is ExpoMessage => message !== null);

      if (messages.length === 0) {
        console.log(`[${updates.map((update) => update.semester).join(',')}] nessun device da notificare`);
        return 0;
      }

      const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
        const chunk = messages.slice(i, i + EXPO_BATCH_SIZE);
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`Expo Push API: HTTP ${response.status} ${await response.text()}`);
        }

        const payload = (await response.json()) as ExpoPushResponse;
        const failed = (payload.data ?? []).filter((ticket) => ticket.status === 'error');

        if (failed.length > 0) {
          const errors = failed
            .map((ticket) => ticket.details?.error ?? ticket.message ?? 'unknown')
            .slice(0, 3);
          console.warn(`[Expo] ${failed.length} notifiche rifiutate`, errors);
        }
      }

      console.log(`[Expo] notifiche inviate: ${messages.length}`);
      return messages.length;
    };

    try {
      const html = await fetchTimetableHtml();
      const updates: Update[] = [];

      for (const semester of SEMESTERS) {
        const url = findTimetableUrl(html, semester);
        if (!url) {
          console.warn(`[${semester}] PDF non trovato nella pagina`);
          continue;
        }

        const key = SETTINGS_KEYS[semester];
        const previousUrl = await getSetting(key);

        if (previousUrl === url) {
          console.log(`[${semester}] nessun aggiornamento`);
          continue;
        }

        if (previousUrl === null) {
          await saveSetting(key, url);
          console.log(`[${semester}] baseline salvata, nessuna notifica`);
          continue;
        }

        updates.push({ semester, key, url });
      }

      let sent = 0;
      if (updates.length > 0) {
        sent = await sendNotifications(updates);

        for (const update of updates) {
          await saveSetting(update.key, update.url);
          console.log(`[${update.semester}] nuovo PDF: ${update.url}`);
        }
      }

      return Response.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        updates: updates.map(({ semester, url }) => ({ semester, url })),
        sent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[check-schedule] errore:', message);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }),
};
