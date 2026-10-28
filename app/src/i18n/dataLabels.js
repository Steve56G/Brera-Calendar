// Traduzione delle etichette generate dal parser e salvate insieme ai dati del calendario.
// I dati restano invariati (compatibili con quelli già salvati): si traducono solo in visualizzazione.
// Se un valore non è riconosciuto viene mostrato così com'è.

const LEVEL_KEYS = {
  Triennio: 'triennio',
  Biennio: 'biennio',
  Restauro: 'restauro',
  'Attività affini': 'affini',
  'Non indicato': 'none',
};

const REASON_KEYS = {
  'confine lezione/ricevimento incerto': 'uncertainBoundary',
  'celle sovrapposte con colori diversi': 'overlappingCells',
  'orario dedotto dal testo senza cella colorata': 'timeFromText',
  'sotto-box sovrapposti': 'overlappingSubBoxes',
  'sotto-box adiacenti con colori diversi': 'adjacentSubBoxes',
  'bordi di cella non allineati alla griglia oraria': 'misalignedBorders',
  'testo fuori dalla griglia oraria': 'textOutsideGrid',
  'testo sovrapposto nelle celle': 'overlappingText',
  'riga con molto testo: possibile unione di più materie': 'manyTextLines',
  'righe stimate dal testo (bordi di riga non trovati)': 'rowsFromText',
  'griglia oraria stimata dalle intestazioni dei giorni': 'gridFromHeaders',
  'fasce orarie sovrapposte': 'overlappingSlots',
  'lezione e ricevimento sovrapposti': 'lessonOfficeOverlap',
  'colore Triennio/Biennio/Restauro non univoco': 'ambiguousLevelColor',
  'colore Triennio/Biennio non univoco': 'ambiguousLevelColor',
};

// Confronto tollerante: maiuscole, spazi multipli e punto finale non contano
const canon = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
const REASON_BY_TEXT = Object.fromEntries(Object.entries(REASON_KEYS).map(([text, key]) => [canon(text), key]));

const PROFESSOR_TBD = 'Docente da nominare (bando)';

export const levelLabel = (t, level) => (LEVEL_KEYS[level] ? t(`levels.${LEVEL_KEYS[level]}`) : level);

export const reasonLabel = (t, reason) => {
  const key = REASON_BY_TEXT[canon(reason)];
  return key ? t(`reasons.${key}`) : reason;
};

export const professorLabel = (t, professor) => (professor === PROFESSOR_TBD ? t('card.professorTbd') : professor);

// "1° anno", "2° anno (1)", "1° e 2° anno" -> "Year 1", "Year 2 (1)", "Years 1 & 2"
export function tagLabel(t, tag) {
  const s = String(tag).trim();
  let m = /^(\d)\s*°\s*e\s*(\d)\s*°\s*anno(.*)$/i.exec(s);
  if (m) return t('tags.years', { a: m[1], b: m[2] }) + m[3];
  m = /^(\d)\s*°\s*anno(.*)$/i.exec(s);
  if (m) return t('tags.year', { n: m[1] }) + m[2];
  return String(tag);
}

// "Aula 6 · Sala Napoleonica" -> "Room 6 · Sala Napoleonica" (i nomi dei luoghi restano quelli del PDF)
export const roomText = (t, text) => String(text || '').replace(/\bAula\b/g, t('data.room'));

// Differenze trovate da "Aggiorna calendario": voci strutturate (o stringhe di versioni precedenti)
export function changeLabel(t, dayName, entry) {
  if (typeof entry === 'string') return entry;
  const none = t('changes.noLesson');
  switch (entry.type) {
    case 'professor':
      return t('changes.professor', { from: entry.from || '—', to: entry.to || '—' });
    case 'time':
      return t('changes.time', { day: dayName(entry.day), from: entry.from || none, to: entry.to || none });
    case 'room':
      return t('changes.room', { day: dayName(entry.day), from: roomText(t, entry.from) || '—', to: roomText(t, entry.to) || '—' });
    default:
      return '';
  }
}
