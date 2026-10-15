// roomAvailability.js
// Costruisce, dai dati già estratti dal PDF (scheduleMatrix), l'occupazione di ogni aula.
// Non tocca il parser: le aule si ricavano dal testo `details` delle lezioni
// (es. "Aula 6 · anat. art 1", "Sala Napoleonica", "San Carpoforo").

import { norm } from './parser';
import { START_H, END_H } from './calendarLayout';

export const SLOT_HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i); // 8..18 (fino alle 19:00)

// luoghi noti dell'orario (legenda del PDF); l'ordine conta: i più specifici prima
const VENUES = [
  [/SALONE NAPOLEONICO/, () => 'Salone Napoleonico'],
  [/NAPOLEONICA/, () => 'Sala Napoleonica'],
  [/BASSETTI/, () => 'Sala Bassetti'],
  [/CITTERIO/, () => 'Palazzo Citterio'],
  [/GIARDINO/, () => 'Giardino'],
  [/PALCO/, () => 'Palcoscenico'],
  [/TEATRO/, () => 'Teatro'],
  [/BIBLIOTECA/, () => 'Biblioteca'],
  [/SAN CARPOFORO/, () => 'San Carpoforo'],
  [/SAN FEDELE/, () => 'San Fedele'],
  [/CIB/, () => 'CIB (Via Formentini 10)'],
  [/SCALO FARINI\s*(T\d)?/, (m) => (m[1] ? `Scalo Farini ${m[1]}` : 'Scalo Farini')],
  [/SEGRATE|CASCINA/, () => 'Laboratorio Segrate (Cascina Ovi)'],
];

/** Elenco (senza duplicati) delle aule/luoghi indicati nel testo dettagli di una lezione. */
export function extractRooms(details) {
  const rooms = new Set();
  const rest = [];
  String(details || '')
    .split(' · ')
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((t) => {
      if (/^Aula /.test(t)) {
        // "Aula 38A + 53" / "Aula 22/23" -> più aule
        t.slice(5)
          .split(/[+/,]/)
          .map((p) => p.replace(/\s+/g, '').toUpperCase())
          .filter((p) => /^\d{1,3}[A-Z]?$/.test(p))
          .forEach((p) => rooms.add(`Aula ${p}`));
      } else if (/^[A-Za-z]\d{1,2}[A-Za-z]?$/.test(t) && !/^T\d$/i.test(t)) {
        rooms.add(`Aula ${t.toUpperCase()}`); // es. B1
      } else {
        rest.push(t);
      }
    });

  let text = norm(rest.join(' '));
  VENUES.forEach(([re, name]) => {
    const m = re.exec(text);
    if (m) {
      rooms.add(name(m));
      text = text.replace(re, ' ');
    }
  });
  return [...rooms];
}

/**
 * @returns {{ rooms: string[], byRoom: { [room]: { [dayIndex]: { [hour]: Array<{subject, professor, startLabel, endLabel}> } } } }}
 * Uno slot [h, h+1) è occupato se almeno una lezione dell'aula lo interseca in quel giorno.
 */
export function buildRoomIndex(schedule) {
  const byRoom = {};
  schedule.forEach((r) =>
    r.days.forEach((d) =>
      d.lessons.forEach((s) => {
        extractRooms(s.details).forEach((room) => {
          const days = (byRoom[room] = byRoom[room] || {});
          const hours = (days[d.dayIndex] = days[d.dayIndex] || {});
          SLOT_HOURS.forEach((h) => {
            if (s.start < h + 1 && s.end > h) {
              (hours[h] = hours[h] || []).push({
                subject: r.subject,
                professor: r.professor,
                startLabel: s.startLabel,
                endLabel: s.endLabel,
              });
            }
          });
        });
      })
    )
  );
  const rooms = Object.keys(byRoom).sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
  return { rooms, byRoom };
}
