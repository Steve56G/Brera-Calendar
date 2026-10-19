// migrations.js
// Retrocompatibilità: i dati salvati sul dispositivo da versioni precedenti dell'app vengono
// normalizzati quando si caricano (usePersistentState → decode), senza intervento dell'utente.
// Ogni funzione è difensiva: un dato mancante o in un vecchio formato non deve mai bloccare l'app.

import { DAYS } from '../constants/schedule';
import { norm } from '../utils/parser';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const byStart = (a, b) => a.start - b.start;

// Versioni più vecchie salvavano solo `slots` (senza `days`): ricostruisce i giorni
function daysFromSlots(slots) {
  const byDay = {};
  slots.forEach((s) => {
    if (!isObject(s) || !Number.isInteger(s.dayIndex)) return;
    const day = (byDay[s.dayIndex] = byDay[s.dayIndex] || {
      dayIndex: s.dayIndex,
      day: DAYS[s.dayIndex] || '',
      lessons: [],
      ricevimenti: [],
    });
    (s.kind === 'ricevimento' ? day.ricevimenti : day.lessons).push({ ...s });
  });
  return Object.values(byDay)
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => ({ ...day, lessons: day.lessons.sort(byStart), ricevimenti: day.ricevimenti.sort(byStart) }));
}

function migrateRow(row, index) {
  if (!isObject(row)) return null;
  const slots = Array.isArray(row.slots) ? row.slots : [];
  const days = Array.isArray(row.days)
    ? row.days
        .filter((d) => isObject(d) && Number.isInteger(d.dayIndex))
        .map((d) => ({
          ...d,
          lessons: Array.isArray(d.lessons) ? d.lessons : [],
          ricevimenti: Array.isArray(d.ricevimenti) ? d.ricevimenti : [],
        }))
    : daysFromSlots(slots);
  const subject = text(row.subject);
  const professor = text(row.professor);
  return {
    ...row,
    id: row.id != null ? String(row.id) : `legacy-${index}`,
    subject,
    professor,
    level: text(row.level) || 'Non indicato',
    tags: Array.isArray(row.tags) ? row.tags : [],
    slots,
    days,
    pageNo: Number.isFinite(row.pageNo) ? row.pageNo : null,
    isAmbiguous: row.isAmbiguous === true,
    ambiguityReasons: Array.isArray(row.ambiguityReasons) ? row.ambiguityReasons : [],
    searchText: text(row.searchText) || norm(`${subject} ${professor}`),
  };
}

export function migrateSchedule(value) {
  if (!Array.isArray(value)) return [];
  return value.map(migrateRow).filter(Boolean);
}

// Modifiche manuali: le lezioni create a mano devono avere `rowId` (usato per il colore)
export function migrateEdits(value) {
  if (!isObject(value)) return {};
  const out = {};
  Object.entries(value).forEach(([key, patch]) => {
    if (!isObject(patch)) return;
    out[key] = patch.created && !patch.rowId ? { ...patch, rowId: key } : patch;
  });
  return out;
}

export function migrateCourseColors(value) {
  if (!isObject(value)) return {};
  const out = {};
  Object.entries(value).forEach(([key, color]) => {
    if (typeof color === 'string') out[key] = color;
  });
  return out;
}

// Le differenze di "Aggiorna calendario" erano frasi italiane: le riconvertiamo in voci strutturate
// (traducibili). Le frasi non riconosciute restano com'erano.
const DAY_RE = DAYS.join('|');
const none = (s) => (s === '—' || s === 'nessuna lezione' ? '' : s);

function migrateChange(entry) {
  if (isObject(entry)) return entry;
  if (typeof entry !== 'string') return null;
  let m = /^Professore: ([\s\S]*) → ([\s\S]*)$/.exec(entry);
  if (m) return { type: 'professor', from: none(m[1]), to: none(m[2]) };
  m = new RegExp(`^Aula (${DAY_RE}): ([\\s\\S]*) → ([\\s\\S]*)$`).exec(entry);
  if (m) return { type: 'room', day: DAYS.indexOf(m[1]), from: none(m[2]), to: none(m[3]) };
  m = new RegExp(`^(${DAY_RE}): ([\\s\\S]*) → ([\\s\\S]*)$`).exec(entry);
  if (m) return { type: 'time', day: DAYS.indexOf(m[1]), from: none(m[2]), to: none(m[3]) };
  return entry;
}

export function migrateChanges(value) {
  if (!isObject(value)) return {};
  const out = {};
  Object.entries(value).forEach(([id, list]) => {
    if (Array.isArray(list)) out[id] = list.map(migrateChange).filter((e) => e !== null);
  });
  return out;
}
