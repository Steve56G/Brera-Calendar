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

// Abbina le lezioni del vecchio PDF a quelle del nuovo (stesso corso): prima per giorno e posizione,
// poi quelle spostate di giorno con lo stesso orario, infine l'unica rimasta per parte.
// Restituisce { "giorno-tipoIndice" (vecchio) -> { d, i } (posizione nel nuovo PDF) }.
function pairLessons(oldRow, newRow) {
  const pairs = {};
  const list = (row, kind) =>
    row.days.flatMap((day) => lessonsOf(row, day.dayIndex, kind).map((s, i) => ({ d: day.dayIndex, i, s })));
  ['l', 'r'].forEach((kind) => {
    const O = list(oldRow, kind);
    const N = list(newRow, kind);
    const used = new Set();
    const id = (x) => `${x.d}-${x.i}`;
    const link = (o, n) => {
      pairs[`${o.d}-${kind}${o.i}`] = { d: n.d, i: n.i };
      used.add(id(n));
    };
    const rest = [];
    O.forEach((o) => {
      const n = N.find((x) => x.d === o.d && x.i === o.i);
      if (n) link(o, n);
      else rest.push(o);
    });
    const rest2 = [];
    rest.forEach((o) => {
      const n = N.find((x) => !used.has(id(x)) && x.s.start === o.s.start && x.s.end === o.s.end);
      if (n) link(o, n);
      else rest2.push(o);
    });
    const restN = N.filter((x) => !used.has(id(x)));
    if (rest2.length === 1 && restN.length === 1) link(rest2[0], restN[0]);
  });
  return pairs;
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

      const pairs = pairLessons(old, match);
      const prefix = `${old.id}-`;
      Object.entries(edits).forEach(([key, patch]) => {
        if (!key.startsWith(prefix)) return;
        const m = /^(\d)-([lr])(\d+)$/.exec(key.slice(prefix.length));
        if (!m) return;
        const d = Number(m[1]);
        const kind = m[2];
        const i = Number(m[3]);
        const oldS = lessonsOf(old, d, kind)[i];
        const target = pairs[`${d}-${kind}${i}`];
        if (!target) return; // la lezione non esiste più nel nuovo PDF
        const newS = lessonsOf(match, target.d, kind)[target.i];
        const p = { ...patch };
        // Se nel nuovo PDF cambiano giorno o orario, il calendario si aggiorna per intero (giorno e ora),
        // anche se l'utente aveva spostato la lezione; se non cambiano restano le sue modifiche.
        if (oldS && (oldS.start !== newS.start || oldS.end !== newS.end || target.d !== d)) {
          p.dayIndex = target.d;
          p.start = newS.start;
          p.end = newS.end;
          p.startLabel = newS.startLabel;
          p.endLabel = newS.endLabel;
        }
        if (oldS && (oldS.details || '') !== (newS.details || '')) p.details = newS.details;
        if (!sameProf(old.professor, match.professor)) p.professor = match.professor;
        nextEdits[`${match.id}-${target.d}-${kind}${target.i}`] = p;
      });
    });

  // Le lezioni create a mano (Calendario → + Lezione) non dipendono dal PDF: restano invariate,
  // insieme al loro colore.
  Object.entries(edits).forEach(([key, patch]) => {
    if (!patch?.created || patch.deleted) return;
    nextEdits[key] = patch;
    if (courseColors[patch.rowId]) nextColors[patch.rowId] = courseColors[patch.rowId];
  });

  return { favorites: nextFav, edits: nextEdits, courseColors: nextColors, changes, missing };
}
