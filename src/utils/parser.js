// parser.js
// Converte i dati grezzi del PDF (testo con coordinate + rettangoli colorati)
// in una matrice strutturata: scheduleMatrix = [{ subject, professor, level, tags, slots: [...] }]
//
import { DAYS, LEVEL_HEX } from '../constants/schedule';

// Layout atteso (come nel PDF di esempio):
//  - a sinistra: colonna MATERIE E DOCENTI (materia, docente, piccoli box livello)
//  - a destra: 6 blocchi (Lunedì..Sabato); ogni blocco ha l'asse orario in orizzontale,
//    11 celle da 1h (8-19), il Sabato 6 celle (8-14)
//  - le celle colorate indicano le ore occupate; il testo nella cella è l'aula/dettaglio

const DAY_RE = [/^LUNEDI/, /^MARTEDI/, /^MERCOLEDI/, /^GIOVEDI/, /^VENERDI/, /^SABATO/];
const HOUR_RE = /^(8|9|1[0-9])$/;
// Colori ufficiali dei livelli (usati sia per riconoscere i box nel PDF sia per la UI)
const CANON_REFS = [
  { label: 'Triennio', color: [153, 204, 0] },
  { label: 'Biennio', color: [153, 204, 255] },
  { label: 'Restauro', color: [255, 153, 204] },
];
const LOCATION_CODES = {
  SN: 'Salone Napoleonico',
  SC: 'San Carpoforo',
  SF: 'San Fedele',
  B: 'Biblioteca',
  P: 'Palcoscenico',
  CIB: 'CIB (Via Formentini 10)',
};

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isWhite = (c) => c[0] > 240 && c[1] > 240 && c[2] > 240;
const isBlack = (c) => Math.max(c[0], c[1], c[2]) < 50;
const isColored = (c) => !isWhite(c) && !isBlack(c);

function nearestLegend(color, legend, maxDist) {
  let best = null;
  for (const item of legend) {
    const d = dist(color, item.color);
    if (d < maxDist && (!best || d < best.d)) best = { d, l: item };
  }
  return best ? best.l : null;
}
// La griglia del PDF Brera ha celle da un'ora: non produrre mai mezze ore.
const snap = (v) => Math.round(v);
const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

/* ------------------------------ Righe (colonna sinistra) ------------------------------ */

function groupLines(items, tol = 2.5) {
  const sorted = [...items].sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const lines = [];
  sorted.forEach((it) => {
    const l = lines[lines.length - 1];
    if (l && Math.abs(it.cy - l.cy) <= tol) {
      l.items.push(it);
      l.cy = (l.cy * (l.items.length - 1) + it.cy) / l.items.length;
    } else lines.push({ cy: it.cy, items: [it] });
  });
  lines.forEach((l) => l.items.sort((a, b) => a.x0 - b.x0));
  return lines;
}

// Fallback: nessun rettangolo-riga trovato -> raggruppiamo il testo per righe.
function textRows(left) {
  const rows = [];
  groupLines(left).forEach((line) => {
    const txt = line.items.map((i) => i.s.trim()).join(' ').trim();
    const cont =
      rows.length &&
      /^(\(|[a-zà-ú]|\d\s?°|\d+\s?ore|ore\b|per\b|solo\b|settimane|corso|lezioni|il corso|dal\b|a partire|annuale)/.test(txt);
    const y0 = Math.min(...line.items.map((i) => i.y0));
    const y1 = Math.max(...line.items.map((i) => i.y1));
    if (cont) {
      const r = rows[rows.length - 1];
      r.items.push(...line.items);
      r.y0 = Math.min(r.y0, y0);
      r.y1 = Math.max(r.y1, y1);
    } else rows.push({ items: [...line.items], y0, y1 });
  });
  return rows;
}

// Il livello del corso è codificato dal colore della terza colonna stretta,
// immediatamente a sinistra della griglia settimanale. Il rettangolo può essere
// unito graficamente alla prima cella oraria se ha lo stesso colore.
function classifyLevel(rowRects, leftEnd, leftMinX) {
  const leftW = leftEnd - leftMinX;
  if (!(leftW > 0)) return null;

  // La terza colonna è stretta. Una cella con due livelli può però essere
  // divisa in due metà affiancate: la soglia deve quindi accettare anche
  // rettangoli che coprono circa metà della larghezza del marker.
  const markerWidth = leftW * 0.07;
  const markerLeft = leftEnd - markerWidth;
  const markerRight = leftEnd;
  const markerSpan = markerRight - markerLeft;
  const markerRects = rowRects
    .filter((rc) => {
      if (!isColored(rc.c)) return false;
      const overlap = Math.min(rc.x1, markerRight) - Math.max(rc.x0, markerLeft);
      return overlap >= markerSpan * 0.3;
    })
    .sort((a, b) => {
      const startA = Math.abs(a.x0 - markerLeft);
      const startB = Math.abs(b.x0 - markerLeft);
      if (startA !== startB) return startA - startB;
      const overlapA = Math.min(a.x1, markerRight) - Math.max(a.x0, markerLeft);
      const overlapB = Math.min(b.x1, markerRight) - Math.max(b.x0, markerLeft);
      return overlapB - overlapA;
    });

  if (!markerRects.length) return null;

  // Raccoglie tutti i colori canonici che occupano la terza colonna. In questo
  // modo riconosce sia le metà affiancate sia quelle sovrapposte verticalmente.
  // Gli sfondi delle colonne materia/docente restano esclusi perché non coprono
  // una parte significativa del marker.
  const levels = [];
  markerRects.forEach((rc) => {
    const level = nearestLegend(rc.c, CANON_REFS, 55);
    if (level && !levels.some((item) => item.label === level.label)) levels.push(level);
  });

  if (!levels.length) return null;
  // Ordine deterministico dei tag, indipendente dall'ordine dei rettangoli nel PDF.
  levels.sort((a, b) => CANON_REFS.findIndex((item) => item.label === a.label) - CANON_REFS.findIndex((item) => item.label === b.label));
  return {
    label: levels.map((level) => level.label).join(' + '),
    labels: levels.map((level) => level.label),
  };
}


// Classifica il corso aggregando i colori delle singole lezioni nella griglia
// settimanale. Le celle solo testo (senza riempimento) non aggiungono livelli:
// quando sono presenti lezioni colorate, contano esclusivamente quei colori.
function classifyLessonLevels(subs) {
  const weights = new Map();

  subs.forEach((cell) => {
    if (cell.kind !== 'lezione' || !Array.isArray(cell.color)) return;

    const level = nearestLegend(cell.color, CANON_REFS, 55);
    if (!level) return;

    // La larghezza è proporzionale alla durata della lezione; ogni durata
    // positiva contribuisce al livello corrispondente.
    const weight = Math.max(0, cell.x1 - cell.x0);
    if (weight > 0) weights.set(level.label, (weights.get(level.label) || 0) + weight);
  });

  // Non scegliere un solo colore dominante: ogni livello presente nelle
  // lezioni colorate diventa un tag. L'ordine è sempre Triennio, Biennio, Restauro.
  const labels = CANON_REFS
    .filter((level) => (weights.get(level.label) || 0) > 0)
    .map((level) => level.label);

  if (!labels.length) return null;
  return { label: labels.join(' + '), labels };
}

const YEAR_TAG_RE = /\d\s*°.*anno|anno\s*\(?\d\)?$/i;

// Righe dalle linee orizzontali (bordi di cella) che attraversano la colonna sinistra.
// Un bordo = una riga della tabella: una materia su 2 righe di testo resta quindi una sola riga.
function borderRows(p, left, leftMinX, leftEnd, headerBottom) {
  const lo = leftMinX - 3, hi = leftEnd + 3, leftW = leftEnd - leftMinX;
  const ls = (p.lines || [])
    .filter((l) => l.y > headerBottom - 2 && l.x1 > lo && l.x0 < hi)
    .sort((a, b) => a.y - b.y);
  const clusters = [];
  ls.forEach((l) => {
    const c = clusters[clusters.length - 1];
    const seg = [Math.max(l.x0, lo), Math.min(l.x1, hi)];
    if (c && l.y - c.ys[c.ys.length - 1] <= 1.2) { c.ys.push(l.y); c.segs.push(seg); }
    else clusters.push({ ys: [l.y], segs: [seg] });
  });
  let seps = [];
  clusters.forEach((c) => {
    const segs = c.segs.sort((a, b) => a[0] - b[0]);
    let cov = 0, end = -Infinity;
    segs.forEach(([a, b]) => {
      if (b <= end) return;
      cov += b - Math.max(a, end);
      end = b;
    });
    if (cov >= leftW * 0.6) seps.push(c.ys.reduce((a, b) => a + b, 0) / c.ys.length);
  });
  seps = seps.filter((y, i) => i === 0 || y - seps[i - 1] >= 4 || ((seps[i] = seps[i - 1]), false));
  if (seps.length < 3) return null;

  const bands = [];
  const top = Math.min(...left.map((i) => i.y0));
  const bottom = Math.max(...left.map((i) => i.y1));
  if (top < seps[0] - 1) bands.push([headerBottom, seps[0]]);
  for (let i = 0; i < seps.length - 1; i++) bands.push([seps[i], seps[i + 1]]);
  if (bottom > seps[seps.length - 1] + 1) bands.push([seps[seps.length - 1], bottom + 2]);

  const covered = left.filter((i) => bands.some((b) => i.cy >= b[0] && i.cy < b[1])).length;
  if (covered / left.length < 0.9) return null;
  const rows = bands
    .map((b) => ({ items: left.filter((i) => i.cy >= b[0] && i.cy < b[1]), y0: b[0], y1: b[1], band: [b[0], b[1]] }))
    .filter((r) => r.items.length);
  return rows.length >= 3 ? rows : null;
}

/* ------------------------------ Griglia oraria ------------------------------ */

// Ricostruisce la griglia dalle etichette orarie (8,9,...19) che si ripetono per ogni giorno.
// Non dipende dalla posizione delle intestazioni dei giorni: i giorni si separano
// quando la sequenza delle ore ricomincia (19 -> 8).
// Stima la larghezza di una colonna usando le distanze fra le etichette.
// I salti dovuti a numeri mancanti (circa 2*sw) vengono esclusi.
function estimateSlotWidth(labels) {
  const xs = [];
  [...labels].sort((a, b) => a.cx - b.cx).forEach((l) => {
    const last = xs[xs.length - 1];
    if (last && Math.abs(l.cx - last.cx) <= 1.2) {
      last.values.push(l.cx);
      last.cx = last.values.reduce((sum, x) => sum + x, 0) / last.values.length;
    } else xs.push({ cx: l.cx, values: [l.cx] });
  });
  const gaps = [];
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i].cx - xs[i - 1].cx;
    if (gap >= 4 && gap <= 22) gaps.push(gap);
  }
  const withinDay = gaps.filter((gap) => gap <= 17.5);
  const source = withinDay.length >= 3 ? withinDay : gaps;
  if (source.length < 3) return null;
  const sw = median(source);
  return sw > 2 ? sw : null;
}

// Ricostruisce ogni giorno associando l'etichetta al suo valore numerico, non
// accoppiando le etichette vicine. Se manca, per esempio, il 15, il 16 resta
// quindi nella sua colonna reale invece di slittare a sinistra.
function blocksFromLabels(labels, hs) {
  if (labels.length < 6 || hs.length < 3) return null;
  const globalSw = estimateSlotWidth(labels);
  if (!globalSw) return null;

  // Le due righe dell'intestazione sono: 8..18 e 9..19. Scegliamo i due
  // gruppi verticali più popolati per ignorare eventuali numeri nel contenuto.
  const yGroups = [];
  [...labels].sort((a, b) => a.cy - b.cy).forEach((l) => {
    const last = yGroups[yGroups.length - 1];
    if (last && Math.abs(l.cy - last.cy) <= 2.5) {
      last.items.push(l);
      last.cy = last.items.reduce((sum, item) => sum + item.cy, 0) / last.items.length;
    } else yGroups.push({ cy: l.cy, items: [l] });
  });
  const rows = [...yGroups]
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 2)
    .sort((a, b) => a.cy - b.cy);
  if (!rows.length) return null;

  const pointsByDay = new Map(hs.map((h) => [h.d, []]));
  labels.forEach((l) => {
    let rowIndex;
    if (rows.length >= 2) {
      rowIndex = Math.abs(l.cy - rows[0].cy) <= Math.abs(l.cy - rows[1].cy) ? 0 : 1;
      if (Math.abs(l.cy - rows[rowIndex].cy) > 3.5) return;
    } else {
      // Se nel PDF è presente una sola riga, il 19 identifica la riga inferiore.
      rowIndex = labels.some((item) => item.n === '19') ? 1 : 0;
    }

    const value = parseInt(l.n, 10);
    const slot = value - (rowIndex === 0 ? 8 : 9);
    if (!Number.isFinite(slot)) return;

    let best = null;
    hs.forEach((h) => {
      const N = h.d === 5 ? 6 : 11;
      if (slot < 0 || slot >= N) return;
      const expectedX = h.cx + (slot - (N - 1) / 2) * globalSw;
      const error = Math.abs(l.cx - expectedX);
      if (!best || error < best.error) best = { h, slot, error };
    });
    if (best && best.error <= globalSw * 0.85) {
      pointsByDay.get(best.h.d).push({ slot: best.slot, cx: l.cx });
    }
  });

  const blocks = hs.map((h) => {
    const N = h.d === 5 ? 6 : 11;
    const points = pointsByDay.get(h.d) || [];
    const distinctSlots = new Set(points.map((p) => p.slot));
    let sw = globalSw;
    if (points.length >= 4 && distinctSlots.size >= 2) {
      const meanSlot = points.reduce((sum, p) => sum + p.slot, 0) / points.length;
      const meanX = points.reduce((sum, p) => sum + p.cx, 0) / points.length;
      const den = points.reduce((sum, p) => sum + (p.slot - meanSlot) ** 2, 0);
      const fitted = den > 0
        ? points.reduce((sum, p) => sum + (p.slot - meanSlot) * (p.cx - meanX), 0) / den
        : globalSw;
      // Evita che pochi testi anomali deformino la larghezza della griglia.
      if (fitted >= globalSw * 0.8 && fitted <= globalSw * 1.2) sw = fitted;
    }
    const L = points.length
      ? median(points.map((p) => p.cx - (p.slot + 0.5) * sw))
      : h.cx - (N * sw) / 2;
    return { d: h.d, N, sw, L, R: L + N * sw, h0: 8 };
  });
  return blocks.length >= 3 ? blocks : null;
}

// Affina l'allineamento orizzontale usando i bordi dei rettangoli colorati: i bordi
// di cella cadono su multipli esatti della larghezza di slot.
function refineBlocks(blocks, rects, headerBottom) {
  blocks.forEach((b) => {
    let sx = 0, sy = 0, n = 0;
    rects.forEach((r) => {
      if (!isColored(r.c) || r.y0 <= headerBottom) return;
      const cx = (r.x0 + r.x1) / 2;
      if (cx < b.L || cx > b.R || r.x1 - r.x0 < b.sw * 0.5) return;
      [r.x0, r.x1].forEach((e) => {
        const ph = ((e - b.L) / b.sw) * 2 * Math.PI;
        sx += Math.cos(ph);
        sy += Math.sin(ph);
        n++;
      });
    });
    if (n >= 6 && Math.hypot(sx, sy) / n > 0.6) {
      const shift = Math.atan2(sy, sx) / (2 * Math.PI);
      b.L += shift * b.sw;
      b.R += shift * b.sw;
    }
  });
}

// Se una cella colorata contiene un "RI" ma è più larga di uno slot (lezione + ricevimento
// con lo stesso colore), la divide: lo slot del "RI" diventa il ricevimento.
function splitAtRI(cells, dayItems, blockAt, reasons) {
  for (let idx = 0; idx < cells.length; idx++) {
    const c = cells[idx];
    const blk = c.blk, sw = blk.sw;
    if (c.x1 - c.x0 <= sw * 1.2) continue;
    const inside = dayItems.filter((it) => it.cx >= c.x0 && it.cx <= c.x1 && blockAt(it.cx) === blk);
    const ri = inside.filter((it) => it.n === 'RI');
    if (!ri.length) continue;
    const oth = inside.filter((it) => it.n !== 'RI');
    const cRi = ri.reduce((t, it) => t + it.cx, 0) / ri.length;
    const cOth = oth.length ? (Math.min(...oth.map((i) => i.x0)) + Math.max(...oth.map((i) => i.x1))) / 2 : null;
    const right = cRi > (c.x0 + c.x1) / 2; // ricevimento nella metà destra del box
    const b1 = right ? 2 * cRi - c.x1 : 2 * cRi - c.x0;
    const b2 = cOth === null ? null : right ? 2 * cOth - c.x0 : 2 * cOth - c.x1;
    let b = b1;
    if (b2 !== null) {
      if (Math.abs(b1 - b2) <= sw * 0.75) b = (b1 + b2) / 2;
      else if (reasons) reasons.push('confine lezione/ricevimento incerto');
    }
    b = blk.L + snap((b - blk.L) / sw) * sw;
    const lesson = right ? [c.x0, b] : [b, c.x1];
    const rcv = right ? [b, c.x1] : [c.x0, b];
    if (lesson[1] - lesson[0] < sw * 0.5 || rcv[1] - rcv[0] < sw * 0.5) continue;
    const parts = [
      { ...c, x0: lesson[0], x1: lesson[1], texts: [] },
      { ...c, x0: rcv[0], x1: rcv[1], texts: [] },
    ].sort((p, q) => p.x0 - q.x0);
    cells.splice(idx, 1, ...parts);
    idx++;
  }
}

// Struttura per giorno: { dayIndex, day, lessons: [...], ricevimenti: [...] }
function buildDays(slots) {
  const byDay = {};
  slots.forEach((s) => {
    const d = (byDay[s.dayIndex] = byDay[s.dayIndex] || { dayIndex: s.dayIndex, day: s.day, lessons: [], ricevimenti: [] });
    (s.kind === 'ricevimento' ? d.ricevimenti : d.lessons).push({ ...s });
  });
  const mergeTouching = (arr) => {
    arr.sort((a, b) => a.start - b.start);
    const out = [];
    arr.forEach((s) => {
      const p = out[out.length - 1];
      if (p && s.start <= p.end) {
        p.end = Math.max(p.end, s.end);
        p.endLabel = fmtHour(p.end);
        if (s.details && !p.details.includes(s.details)) p.details = [p.details, s.details].filter(Boolean).join(' · ');
      } else out.push(s);
    });
    return out;
  };
  return Object.values(byDay)
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((d) => ({ ...d, lessons: mergeTouching(d.lessons), ricevimenti: mergeTouching(d.ricevimenti) }));
}

/* ------------------------------ Pagina ------------------------------ */

function extractPage(p) {
  const info = { mode: '-', grid: '-' };

  // 1) intestazioni dei giorni
  const heads = [];
  p.items.forEach((it) => {
    const d = DAY_RE.findIndex((r) => r.test(it.n));
    if (d >= 0 && it.n.length <= 12) heads.push({ d, cx: it.cx, cy: it.cy });
  });
  if (heads.length < 3) { info.mode = 'nessuna intestazione giorni'; return []; }
  const topY = Math.min(...heads.map((h) => h.cy));
  const hs = [];
  heads
    .filter((h) => Math.abs(h.cy - topY) < 20)
    .sort((a, b) => a.cx - b.cx)
    .forEach((h) => { if (!hs.some((x) => x.d === h.d)) hs.push(h); });
  if (hs.length < 3) { info.mode = 'intestazioni insufficienti'; return []; }

  // 2) etichette orarie -> geometria di ogni blocco giorno
  const nums = p.items.filter((i) => HOUR_RE.test(i.n) && i.cy > topY && i.cy < topY + 70);
  if (!nums.length) { info.mode = 'etichette orarie non trovate'; return []; }
  const yMin = Math.min(...nums.map((i) => i.cy));
  const labels = nums.filter((i) => i.cy < yMin + 30);
  const headerBottom = Math.max(...labels.map((i) => i.y1)) + 1;

  let blocks = blocksFromLabels(labels, hs);
  info.grid = blocks ? 'etichette' : 'intestazioni';
  if (!blocks) {
    // Ripiego: geometria stimata dal centro dell'intestazione del giorno e
    // dalla larghezza comune delle celle, senza dipendere dalle etichette mancanti.
    const sw = estimateSlotWidth(labels);
    if (sw) {
      blocks = hs.map((h) => {
        const N = h.d === 5 ? 6 : 11;
        const L = h.cx - (N * sw) / 2;
        return { d: h.d, N, sw, L, R: L + N * sw, h0: 8 };
      });
    } else {
      blocks = hs
        .map((h) => {
          const N = h.d === 5 ? 6 : 11;
          const dayLabels = labels.filter((l) => {
            const slot = parseInt(l.n, 10) - (l.cy < yMin + 15 ? 8 : 9);
            if (slot < 0 || slot >= N) return false;
            const expectedX = h.cx + (slot - (N - 1) / 2) * 14.5;
            return Math.abs(l.cx - expectedX) < 14.5;
          });
          if (dayLabels.length < 2) return null;
          const mn = Math.min(...dayLabels.map((l) => l.cx));
          const mx = Math.max(...dayLabels.map((l) => l.cx));
          const swLocal = (mx - mn) / Math.max(1, N - 1);
          if (!(swLocal > 2)) return null;
          const L = h.cx - (N * swLocal) / 2;
          return { d: h.d, N, sw: swLocal, L, R: L + N * swLocal, h0: 8 };
        })
        .filter(Boolean);
    }
  }
  if (!blocks.length) { info.mode = 'blocchi giorno non calcolabili'; return []; }
  refineBlocks(blocks, p.rects, headerBottom);

  const leftEnd = Math.min(...blocks.map((b) => b.L)) - 1;
  const blockAt = (x) => blocks.find((b) => x >= b.L - b.sw * 0.5 && x <= b.R + b.sw * 0.5);

  // 3) righe della colonna sinistra
  const left = p.items.filter((i) => i.cx < leftEnd && i.cy > headerBottom);
  if (!left.length) { info.mode = 'colonna sinistra vuota'; return []; }
  const leftMinX = Math.min(...left.map((i) => i.x0));
  const leftW = leftEnd - leftMinX;

  let bands = p.rects
    .filter((r) => {
      const h = r.y1 - r.y0;
      return r.y0 > headerBottom - 1 && r.x1 <= leftEnd + 4 && r.x1 - r.x0 > leftW * 0.3 && h >= 5 && h <= 70;
    })
    .map((r) => [r.y0, r.y1])
    .sort((a, b) => a[0] - b[0]);
  const clean = [];
  bands.forEach((b) => {
    const prev = clean[clean.length - 1];
    if (!prev || b[0] >= prev[1] - 1) clean.push(b);
  });
  bands = clean;
  const covered = left.filter((i) => bands.some((b) => i.cy >= b[0] && i.cy <= b[1])).length;

  let rowsRaw = borderRows(p, left, leftMinX, leftEnd, headerBottom);
  if (rowsRaw) {
    info.mode = 'bordi';
  } else if (bands.length >= 3 && covered / left.length >= 0.85) {
    info.mode = 'rettangoli';
    rowsRaw = bands
      .map((b) => ({ items: left.filter((i) => i.cy >= b[0] && i.cy <= b[1]), y0: b[0], y1: b[1], band: [b[0], b[1]] }))
      .filter((r) => r.items.length);
  } else {
    info.mode = 'testo';
    rowsRaw = textRows(left);
    const cys = rowsRaw.map((r) => (r.y0 + r.y1) / 2);
    const n = rowsRaw.length;
    rowsRaw.forEach((r, i) => {
      const halfPrev = i > 0 ? (cys[i] - cys[i - 1]) / 2 : n > 1 ? (cys[1] - cys[0]) / 2 : 8;
      const halfNext = i < n - 1 ? (cys[i + 1] - cys[i]) / 2 : halfPrev;
      r.band = [cys[i] - halfPrev, cys[i] + halfNext];
    });
  }

  // 4) per ogni riga: livello, celle orarie
  const out = [];
  rowsRaw.forEach((r) => {
    const [b0, b1] = r.band;

    // livello: tag (1° anno...) + colore del box adiacente
    const tags = [];
    let affini = false;
    const items = r.items.filter((it) => {
      const s = it.s.trim();
      if (s === 'A' && it.x1 - it.x0 < 12) { affini = true; return false; }
      if (YEAR_TAG_RE.test(s) && s.length < 25) { tags.push(s); return false; }
      return true;
    });

    const rowRects = p.rects.filter((rc) => {
      const cy = (rc.y0 + rc.y1) / 2;
      return cy >= b0 && cy < b1 && cy > headerBottom;
    });
    let level = null;

    const reasons = [];

    // 1) sotto-box colorati; quelli quasi coincidenti (stesso rettangolo disegnato due volte) diventano uno solo
    const colored = rowRects
      .filter((rc) => isColored(rc.c) && (rc.x0 + rc.x1) / 2 >= leftEnd && rc.y1 - rc.y0 >= 4)
      .map((rc) => ({ ...rc, blk: blockAt((rc.x0 + rc.x1) / 2) }))
      .filter((rc) => rc.blk && rc.x1 - rc.x0 >= rc.blk.sw * 0.5 && rc.x1 - rc.x0 <= rc.blk.N * rc.blk.sw * 1.05);

    const subs = [];
    blocks.forEach((blk) => {
      colored
        .filter((c) => c.blk === blk)
        .sort((a, b) => a.x0 - b.x0)
        .forEach((c) => {
          const cw = c.x1 - c.x0;
          const twin = subs.find((q) => {
            if (q.blk !== blk) return false;
            const qw = q.x1 - q.x0;
            const ov = Math.min(q.x1, c.x1) - Math.max(q.x0, c.x0);
            return ov > Math.min(qw, cw) * 0.8 && Math.max(qw, cw) < Math.min(qw, cw) * 1.3;
          });
          if (twin) {
            if (dist(twin.color, c.c) >= 40) reasons.push('celle sovrapposte con colori diversi');
            twin.x0 = Math.min(twin.x0, c.x0);
            twin.x1 = Math.max(twin.x1, c.x1);
          } else subs.push({ blk, x0: c.x0, x1: c.x1, color: c.c, texts: [] });
        });
    });

    // 2) testo nei sotto-box (aule, note); il testo fuori da celle colorate diventa cella "solo testo"
    const dayItems = p.items.filter((i) => i.cx >= leftEnd && i.cy > headerBottom && i.cy >= b0 && i.cy < b1);
    splitAtRI(subs, dayItems, blockAt, reasons);
    // Il testo senza riempimento può occupare più celle orarie. Usiamo i suoi
    // estremi X per ricostruire l'intervallo, invece di assegnarlo solo all'ora
    // del centro del testo.
    const orphans = [];
    const textSlotRange = (it, blk) => {
      const centerSlot = Math.max(0, Math.min(blk.N - 1, Math.floor((it.cx - blk.L) / blk.sw)));
      const rel0 = (it.x0 - blk.L) / blk.sw;
      const rel1 = (it.x1 - blk.L) / blk.sw;
      if (rel1 - rel0 < 0.55) return { start: centerSlot, end: centerSlot + 1 };
      let start = Math.floor(rel0 + 0.05);
      let end = Math.ceil(rel1 - 0.05);
      start = Math.max(0, Math.min(blk.N - 1, start));
      end = Math.max(start + 1, Math.min(blk.N, end));
      return { start, end };
    };

    dayItems.forEach((it) => {
      const blk = blockAt(it.cx);
      if (!blk) return;
      let best = null;
      subs.forEach((c) => {
        if (c.blk !== blk) return;
        const dd = it.cx < c.x0 ? c.x0 - it.cx : it.cx > c.x1 ? it.cx - c.x1 : 0;
        if (dd <= blk.sw * 0.3 && (!best || dd < best.dd)) best = { dd, c };
      });
      if (best) {
        best.c.texts.push(it);
        return;
      }

      const range = textSlotRange(it, blk);
      const overlaps = orphans.filter((o) => o.blk === blk && range.start < o.end && range.end > o.start);
      if (!overlaps.length) {
        orphans.push({ blk, start: range.start, end: range.end, texts: [it] });
      } else {
        const base = overlaps[0];
        base.start = Math.min(base.start, range.start);
        base.end = Math.max(base.end, range.end);
        base.texts.push(it);
        overlaps.slice(1).forEach((other) => {
          base.start = Math.min(base.start, other.start);
          base.end = Math.max(base.end, other.end);
          base.texts.push(...other.texts);
          orphans.splice(orphans.indexOf(other), 1);
        });
      }
    });

    orphans.forEach((o) => {
      subs.push({
        blk: o.blk,
        x0: o.blk.L + o.start * o.blk.sw,
        x1: o.blk.L + o.end * o.blk.sw,
        color: null,
        texts: o.texts,
      });
    });
    if (subs.some((c) => !c.color)) reasons.push('orario dedotto dal testo senza cella colorata');

    // 3) tipo di ogni sotto-box: ricevimento se contiene "RI", altrimenti lezione
    subs.forEach((c) => { c.kind = c.texts.some((t) => t.n === 'RI') ? 'ricevimento' : 'lezione'; });

    // 4) unione dei sotto-box adiacenti/ravvicinati dello stesso tipo (lezione con lezione, ricevimento con ricevimento)
    const cells = [];
    blocks.forEach((blk) => {
      ['lezione', 'ricevimento'].forEach((kind) => {
        let cur = null;
        subs
          .filter((c) => c.blk === blk && c.kind === kind)
          .sort((a, b) => a.x0 - b.x0)
          .forEach((c) => {
            if (cur && c.x0 - cur.x1 < blk.sw * 0.35) {
              if (c.x0 < cur.x1 - blk.sw * 0.3) reasons.push('sotto-box sovrapposti');
              if (cur.color && c.color && dist(cur.color, c.color) >= 40) reasons.push('sotto-box adiacenti con colori diversi');
              cur.x1 = Math.max(cur.x1, c.x1);
              cur.texts.push(...c.texts);
              cur.color = cur.color || c.color;
            } else {
              cur = { ...c, texts: [...c.texts] };
              cells.push(cur);
            }
          });
      });
    });

    // 5) euristiche di validazione
    cells.forEach((c) => {
      if (!c.color) return;
      const a = (c.x0 - c.blk.L) / c.blk.sw;
      const b = (c.x1 - c.blk.L) / c.blk.sw;
      if (Math.abs(a - snap(a)) > 0.22 || Math.abs(b - snap(b)) > 0.22) reasons.push('bordi di cella non allineati alla griglia oraria');
    });
    if (dayItems.some((it) => !blockAt(it.cx))) reasons.push('testo fuori dalla griglia oraria');
    for (let i = 0; i < dayItems.length; i++) {
      for (let j = i + 1; j < dayItems.length; j++) {
        const u = dayItems[i], v = dayItems[j];
        if (u.s === v.s) continue;
        const ox = Math.min(u.x1, v.x1) - Math.max(u.x0, v.x0);
        const oy = Math.min(u.y1, v.y1) - Math.max(u.y0, v.y0);
        if (ox > 0 && oy > 0 && ox > 0.5 * Math.min(u.x1 - u.x0, v.x1 - v.x0) && oy > 0.5 * Math.min(u.y1 - u.y0, v.y1 - v.y0)) {
          reasons.push('testo sovrapposto nelle celle');
        }
      }
    }
    if (groupLines(items).length >= 4) reasons.push('riga con molto testo: possibile unione di più materie');
    if (info.mode === 'testo') reasons.push('righe stimate dal testo (bordi di riga non trovati)');
    if (info.grid === 'intestazioni') reasons.push('griglia oraria stimata dalle intestazioni dei giorni');

    // Prima usa i colori delle lezioni della settimana. Il marker della terza
    // colonna resta un fallback quando non esistono lezioni con colore leggibile.
    level = classifyLessonLevels(subs) || classifyLevel(rowRects, leftEnd, leftMinX);

    const slots = cells
      .map((c) => {
        const { blk } = c;
        let start = blk.h0 + snap((c.x0 - blk.L) / blk.sw);
        let end = blk.h0 + snap((c.x1 - blk.L) / blk.sw);
        start = Math.max(blk.h0, start);
        end = Math.min(blk.h0 + blk.N, end);
        if (end <= start) end = Math.min(blk.h0 + blk.N, start + 1);
        const toks = [...c.texts].sort((a, b) => a.x0 - b.x0).map((t) => t.s.trim()).filter(Boolean);
        const ricevimento = toks.some((t) => norm(t) === 'RI');
        const details = toks
          .filter((t) => norm(t) !== 'RI')
          .map((t) => {
            const code = LOCATION_CODES[norm(t)];
            if (code) return code;
            if (/^\d[\dA-Za-z\s+\/,.\-]{0,7}$/.test(t)) return `Aula ${t}`;
            return t;
          });
        return {
          dayIndex: blk.d,
          day: DAYS[blk.d],
          start,
          end,
          startLabel: fmtHour(start),
          endLabel: fmtHour(end),
          kind: ricevimento ? 'ricevimento' : 'lezione',
          details: [...new Set(details)].join(' · '),
          color: c.color,
        };
      })
      .sort((a, b) => a.dayIndex - b.dayIndex || a.start - b.start);

    const perDay = {};
    slots.forEach((sl) => (perDay[sl.dayIndex] = perDay[sl.dayIndex] || []).push(sl));
    Object.values(perDay).forEach((arr) => {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[i].start < arr[j].end && arr[j].start < arr[i].end) {
            reasons.push(arr[i].kind === arr[j].kind ? 'fasce orarie sovrapposte' : 'lezione e ricevimento sovrapposti');
          }
        }
      }
    });

    out.push({ pageNo: p.n, items, tags, affini, level, slots, reasons: [...new Set(reasons)] });
  });

  return out;
}

/* ------------------------------ Entry point ------------------------------ */

export function parseSchedule(rawPages) {
  const pages = rawPages.map((p) => ({
    ...p,
    items: p.items
      .map((i) => ({ ...i, cx: (i.x0 + i.x1) / 2, cy: (i.y0 + i.y1) / 2, n: norm(i.s) }))
      .filter((i) => i.n),
  }));

  const raw = [];
  pages.forEach((p) => raw.push(...extractPage(p)));

  // calibrazione colonna "professore": mediana dell'x iniziale dell'ultimo gruppo dopo un grande spazio
  const cands = [];
  raw.forEach((r) =>
    groupLines(r.items).forEach((l) => {
      if (l.items.length >= 2) {
        const a = l.items[l.items.length - 1], b = l.items[l.items.length - 2];
        if (a.x0 - b.x1 > 10) cands.push(a.x0);
      }
    })
  );
  const profX = cands.length ? median(cands) : Infinity;

  const scheduleMatrix = [];
  raw.forEach((r, idx) => {
    const subj = [], prof = [];
    groupLines(r.items).forEach((l) => {
      if (l.items.length >= 2) {
        let gi = -1, gmax = 10;
        for (let k = 1; k < l.items.length; k++) {
          const g = l.items[k].x0 - l.items[k - 1].x1;
          if (g > gmax) { gmax = g; gi = k; }
        }
        if (gi > 0) {
          subj.push(...l.items.slice(0, gi));
          prof.push(...l.items.slice(gi));
          return;
        }
      }
      l.items.forEach((it) => (it.x0 >= profX - 20 ? prof : subj).push(it));
    });
    const join = (arr) => arr.map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
    let subject = join(subj);
    let professor = join(prof);
    if (!subject && professor) { subject = professor; professor = ''; }
    if (!subject) return;
    if (['MATERIE E LEZIONI', 'MATERIE E DOCENTI'].includes(norm(subject))) return;
    if (/^(BANDO|\*|DOCENTE DA NOMINARE.*)$/i.test(professor)) professor = 'Docente da nominare (bando)';

    scheduleMatrix.push({
      id: `${r.pageNo}-${idx}`,
      subject,
      professor,
      level: r.level ? r.level.label : r.affini ? 'Attività affini' : 'Non indicato',
      levelColor: LEVEL_HEX[r.level ? r.level.label : ''] || null,
      tags: r.tags,
      slots: r.slots,
      days: buildDays(r.slots),
      pageNo: r.pageNo,
      isAmbiguous: r.reasons.length > 0,
      ambiguityReasons: r.reasons,
      searchText: norm(`${subject} ${professor}`),
    });
  });

  return { scheduleMatrix };
}
