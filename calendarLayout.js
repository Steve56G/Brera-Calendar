// calendarLayout.js
// Logica pura (senza React) per posizionare gli eventi di un giorno nel calendario.
// Gli eventi che si sovrappongono nel tempo vengono affiancati in sotto-colonne
// all'interno della colonna del giorno, invece di sovrapporsi graficamente.

export const START_H = 8;
export const END_H = 19;

/**
 * @param {Array<{start:number,end:number}>} events eventi di UN giorno (ore decimali, es. 10.5)
 * @returns {Array} eventi con { col, cols }: col = indice della sotto-colonna,
 *                  cols = numero di sotto-colonne del gruppo di sovrapposizione
 */
export function layoutDay(events) {
  const sorted = events
    .map((e) => ({ ...e, start: Math.max(START_H, e.start), end: Math.min(END_H, e.end) }))
    .filter((e) => e.end > e.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds = []; // fine dell'ultimo evento in ogni sotto-colonna
    cluster.forEach((ev) => {
      let c = colEnds.findIndex((end) => end <= ev.start);
      if (c < 0) {
        c = colEnds.length;
        colEnds.push(ev.end);
      } else colEnds[c] = ev.end;
      ev.col = c;
    });
    cluster.forEach((ev) => out.push({ ...ev, cols: colEnds.length }));
    cluster = [];
    clusterEnd = -Infinity;
  };

  sorted.forEach((ev) => {
    if (cluster.length && ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  });
  flush();
  return out;
}

/** Numero massimo di sotto-colonne necessarie in un giorno. */
export const maxCols = (laidOut) => laidOut.reduce((m, e) => Math.max(m, e.cols), 1);
