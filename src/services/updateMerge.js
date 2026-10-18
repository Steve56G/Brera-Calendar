// updateMerge.js
// "Aggiorna calendario": porta preferiti, modifiche e colori dal vecchio orario al nuovo.
// - i corsi preferiti si abbinano per nome (a parità di nome si preferisce lo stesso docente);
// - professore, aula e orari della lezione vengono aggiornati solo se nel nuovo PDF sono
//   diversi da quelli del PDF precedente; note, colore e titolo scelti dall'utente restano;
// - per ogni preferito con dati diversi restituisce l'elenco delle differenze (avviso ⚠️).

import { norm } from '../utils/parser';
import { DAYS } from '../constants/schedule';

const sameProf = (a, b) => norm(a || '') === norm(b || '');
const lessonsOf = (row, d, kind) => {
  const day = row.days.find((x) => x.dayIndex === d);
  return (kind === 'l' ? day?.lessons : day?.ricevimenti) || [];
};
const fmtList = (list) => list.map((l) => `${l.startLabel}–${l.endLabel}`).join(', ');

function diffRows(oldRow, newRow) {
  const out = [];
  if (!sameProf(oldRow.professor, newRow.professor)) {
    out.push({ type: 'professor', from: oldRow.professor || '', to: newRow.professor || '' });
  }
  for (let d = 0; d < DAYS.length; d++) {
    const o = lessonsOf(oldRow, d, 'l');
    const n = lessonsOf(newRow, d, 'l');
    if (!o.length && !n.length) continue;
    const timesChanged = o.length !== n.length || o.some((s, i) => s.start !== n[i].start || s.end !== n[i].end);
    if (timesChanged) out.push({ type: 'time', day: d, from: fmtList(o), to: fmtList(n) });
    const od = o.map((s) => s.details || '').join(' / ');
    const nd = n.map((s) => s.details || '').join(' / ');
    if (od !== nd) out.push({ type: 'room', day: d, from: od, to: nd });
  }
  return out;
}

/**
 * @returns {{ favorites:Set, edits:Object, courseColors:Object, changes:Object, missing:number }}
 *   changes: { [idNuovoCorso]: string[] }  -- differenze rispetto al PDF precedente
 *   missing: numero di preferiti non trovati nel nuovo PDF
 */
export function mergeSchedules(oldSchedule, newSchedule, favorites, edits, courseColors) {
  const nextFav = new Set();
  const nextEdits = {};
  const nextColors = {};
  const changes = {};
  const claimed = new Set();
  let missing = 0;

  oldSchedule
    .filter((r) => favorites.has(r.id))
    .forEach((old) => {
      const cands = newSchedule.filter((n) => !claimed.has(n.id) && norm(n.subject) === norm(old.subject));
      if (!cands.length) {
        missing++;
        return;
      }
      const match = cands.find((n) => sameProf(n.professor, old.professor)) || cands[0];
      claimed.add(match.id);
      nextFav.add(match.id);
      if (courseColors[old.id]) nextColors[match.id] = courseColors[old.id];

      const diffs = diffRows(old, match);
      if (diffs.length) changes[match.id] = diffs;

      const prefix = `${old.id}-`;
      Object.entries(edits).forEach(([key, patch]) => {
        if (!key.startsWith(prefix)) return;
        const m = /^(\d)-([lr])(\d+)$/.exec(key.slice(prefix.length));
        if (!m) return;
        const d = Number(m[1]);
        const kind = m[2];
        const i = Number(m[3]);
        const oldS = lessonsOf(old, d, kind)[i];
        const newS = lessonsOf(match, d, kind)[i];
        if (!newS) return; // la lezione non esiste più nel nuovo PDF
        const p = { ...patch };
        if (oldS && (oldS.start !== newS.start || oldS.end !== newS.end)) {
          p.start = newS.start;
          p.end = newS.end;
          p.startLabel = newS.startLabel;
          p.endLabel = newS.endLabel;
        }
        if (oldS && (oldS.details || '') !== (newS.details || '')) p.details = newS.details;
        if (!sameProf(old.professor, match.professor)) p.professor = match.professor;
        nextEdits[`${match.id}-${d}-${kind}${i}`] = p;
      });
    });

  return { favorites: nextFav, edits: nextEdits, courseColors: nextColors, changes, missing };
}



