// breraTimetable.js
// Recupero automatico dell'ultimo orario PDF dal sito dell'Accademia di Brera (solo fetch nativo).

const BRERA_BASE_URL = 'https://www.accademiadibrera.milano.it';
const TIMETABLE_PAGE_URL = `${BRERA_BASE_URL}/it/orario-lezioni`;

export class TimetableError extends Error {
  // code: 'network' | 'http' | 'notFound' | 'notPdf'
  constructor(code, detail) {
    super(`${code}${detail !== undefined ? `: ${detail}` : ''}`);
    this.code = code;
    this.detail = detail;
  }
}

// Febbraio-agosto: secondo semestre; settembre-gennaio: primo semestre dell'anno accademico.
// (Un semplice "prima/dopo il 1° febbraio" cercherebbe il secondo semestre anche da ottobre a dicembre.)
export function semesterFor(date = new Date()) {
  const month = date.getMonth(); // 0 = gennaio
  return month >= 1 && month <= 7 ? 'SECONDO' : 'PRIMO';
}

async function fetchWithTimeout(url, ms, read) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new TimetableError('http', response.status);
    return await read(response);
  } catch (e) {
    throw e instanceof TimetableError ? e : new TimetableError('network', e?.message);
  } finally {
    clearTimeout(timer);
  }
}

function toAbsoluteUrl(path) {
  const clean = path.replace(/&amp;/g, '&').trim().replace(/ /g, '%20');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  return `${BRERA_BASE_URL}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

/** Cerca nella pagina degli orari il PDF del semestre corrente e ne restituisce l'URL completo. */
export async function findLatestTimetableUrl(date = new Date()) {
  const semester = semesterFor(date);
  const html = await fetchWithTimeout(TIMETABLE_PAGE_URL, 20000, (response) => response.text());
  // Come da specifica, con separatore tra ORARIO e PRIMO/SECONDO esteso anche a "_", "+" e "-"
  // (i file caricati sul sito hanno gli spazi sostituiti da "_").
  const regex = new RegExp(`data-link-file\\s*=\\s*"([^"]*ORARIO(?:%20|\\s|_|\\+|-)+${semester}[^"]*\\.pdf[^"]*)"`, 'i');
  const match = regex.exec(html);
  if (!match) throw new TimetableError('notFound', semester);
  return toAbsoluteUrl(match[1]);
}

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('FileReader'));
    reader.readAsDataURL(blob);
  });

/** Scarica il PDF e lo restituisce in base64 (stesso formato della selezione manuale). */
export async function downloadPdfBase64(url) {
  const base64 = await fetchWithTimeout(url, 60000, async (response) => blobToBase64(await response.blob()));
  if (!base64.startsWith('JVBERi')) throw new TimetableError('notPdf'); // "%PDF-" in base64
  return base64;
}

export function fileNameFromUrl(url) {
  const last = url.split('?')[0].split('/').pop() || '';
  try {
    return decodeURIComponent(last) || 'orario-brera.pdf';
  } catch {
    return last || 'orario-brera.pdf';
  }
}

/** Messaggio per l'utente (tradotto) a partire da un errore del recupero automatico. */
export function timetableErrorMessage(t, error) {
  switch (error?.code) {
    case 'http':
      return t('errors.siteHttp', { status: error.detail });
    case 'notFound':
      return t('errors.timetableNotFound', { semester: t(`semesters.${error.detail}`) });
    case 'notPdf':
      return t('errors.notPdf');
    case 'network':
      return t('errors.network');
    default:
      return t('errors.downloadFailed', { message: error?.message || error });
  }
}
