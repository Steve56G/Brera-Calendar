// parser.js
// Converte i dati grezzi del PDF (testo con coordinate + rettangoli colorati)
// in una matrice strutturata: scheduleMatrix = [{ subject, professor, level, tags, slots: [...] }]
//
// Layout atteso (come nel PDF di esempio):
//  - a sinistra: colonna MATERIE E DOCENTI (materia, docente, piccoli box livello)
//  - a destra: 6 blocchi (Lunedì..Sabato); ogni blocco ha l'asse orario in orizzontale,
//    11 celle da 1h (8-19), il Sabato 6 celle (8-14)
//  - le celle colorate indicano le ore occupate; il testo nella cella è l'aula/dettaglio

export const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

const DAY_RE = [/^LUNEDI/, /^MARTEDI/, /^MERCOLEDI/, /^GIOVEDI/, /^VENERDI/, /^SABATO/];
const HOUR_RE = /^(8|9|1[0-9])$/;
const LEVEL_DEFS = [
  { key: 'TRIENNIO', label: 'Triennio' },
  { key: 'BIENNIO', label: 'Biennio' },
  { key: 'ATTIVITA FORMATIVE AFFINI', label: 'Attività affini' },
];

// Colori ufficiali dei livelli (usati sia per riconoscere i box nel PDF sia per la UI)
export const LEVEL_HEX = { Triennio: '#99CC00', Biennio: '#99CCFF' };
const CANON_REFS = [
  { label: 'Triennio', color: [153, 204, 0] },
  { label: 'Biennio', color: [153, 204, 255] },
];
// riferimenti = colori canonici + colori trovati nella legenda del PDF
const buildRefs = (legend) => [...CANON_REFS, ...legend];
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
const snap = (v) => Math.round(v * 2) / 2;
const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

/* ------------------------------ Legenda livelli ------------------------------ */

function findLegend(pages) {
  const legend = [];
  for (const def of LEVEL_DEFS) {
    let best = null;
    for (const p of pages) {
      for (const it of p.items) {
        if (!it.n.startsWith(def.key)) continue;
        for (const r of p.rects) {
          if (!isColored(r.c)) continue;
          const w = r.x1 - r.x0, h = r.y1 - r.y0;
          if (w > 50 || h > 50) continue;
          const rcy = (r.y0 + r.y1) / 2;
          if (Math.abs(rcy - it.cy) > 12) continue;
          const d = Math.min(Math.abs(it.x0 - r.x1), Math.abs(r.x0 - it.x1));
          if (d < 40 && (!best || d < best.d)) best = { d, color: r.c };
        }
      }
    }
    if (best) legend.push({ label: def.label, color: best.color });
  }
  return legend;
}

function nearestLegend(color, legend, maxDist) {
  let best = null;
  for (const l of legend) {
    const d = dist(color, l.color);
    if (d < maxDist && (!best || d < best.d)) best = { d, l };
  }
  return best ? best.l : null;
}

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

// Classifica la riga come Triennio / Biennio con un sistema a voti:
//  - box nella 3ª colonna (piccolo, a destra della colonna sinistra): peso 3
//  - altri riquadri colorati nella colonna sinistra: peso 2
//  - celle colorate delle lezioni nei giorni: peso 1
function classifyLevel(rowRects, cells, refs, leftEnd, leftMinX) {
  const leftW = leftEnd - leftMinX;
  const votes = {};
  const vote = (color, w) => {
    const l = nearestLegend(color, refs, 55);
    if (l) votes[l.label] = (votes[l.label] || 0) + w;
  };
  rowRects.forEach((rc) => {
    if (!isColored(rc.c)) return;
    if ((rc.x0 + rc.x1) / 2 >= leftEnd) return;
    const w = rc.x1 - rc.x0;
    const third = w < leftW * 0.25 && rc.x1 >= leftEnd - leftW * 0.25;
    vote(rc.c, third ? 3 : 2);
  });
  cells.forEach((c) => c.color && vote(c.color, 1));
  const t = votes.Triennio || 0;
  const b = votes.Biennio || 0;
  if (t > b) return { label: 'Triennio' };
  if (b > t) return { label: 'Biennio' };
  if (t && t === b) return { label: 'Non indicato', conflict: true };
  if (votes['Attività affini']) return { label: 'Attività affini' };
  return null;
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
function blocksFromLabels(labels, hs) {
  if (labels.length < 6) return null;
  const sorted = [...labels].sort((a, b) => a.cx - b.cx);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].cx - sorted[i - 1].cx);
  const gs = [...gaps].sort((a, b) => a - b);
  const thr = Math.max(0.8, gs[Math.floor(gs.length * 0.9)] * 0.35);
  const clusters = [];
  sorted.forEach((l, i) => {
    if (i === 0 || gaps[i - 1] > thr) clusters.push([l]);
    else clusters[clusters.length - 1].push(l);
  });
  const val = (l) => parseInt(l.n, 10);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  let cells;
  if (labels.length / clusters.length >= 1.5) {
    // etichette "inizio/fine" impilate: un cluster = una cella
    cells = clusters.map((c) => ({ cx: mean(c.map((l) => l.cx)), h: Math.min(...c.map(val)) }));
  } else {
    // etichette affiancate: coppie consecutive = una cella
    if (clusters.length % 2) return null;
    cells = [];
    for (let i = 0; i < clusters.length; i += 2) {
      const a = clusters[i][0], b = clusters[i + 1][0];
      cells.push({ cx: (a.cx + b.cx) / 2, h: Math.min(val(a), val(b)) });
    }
  }
  const groups = [];
  cells.forEach((c, i) => {
    if (i === 0 || c.h <= cells[i - 1].h) groups.push([c]);
    else groups[groups.length - 1].push(c);
  });
  const good = groups.filter((g) => g.length >= 3);
  let dayIdx;
  if (good.length === hs.length) dayIdx = hs.map((h) => h.d);
  else if (good.length === 6) dayIdx = [0, 1, 2, 3, 4, 5];
  else return null;

  const blocks = good.map((g, j) => {
    const n = g.length;
    const mk = (n - 1) / 2;
    const mx = mean(g.map((c) => c.cx));
    let num = 0, den = 0;
    g.forEach((c, k) => { num += (k - mk) * (c.cx - mx); den += (k - mk) * (k - mk); });
    const sw = num / den;
    if (!(sw > 2)) return null;
    const L = mx - mk * sw - sw / 2;
    return { d: dayIdx[j], N: n, sw, L, R: L + n * sw, h0: g[0].h };
  });
  return blocks.every(Boolean) ? blocks : null;
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

function extractPage(p, legend, dbg) {
  const info = { page: p.n, items: p.items.length, rects: p.rects.length, days: 0, rows: 0, mode: '-' };
  dbg.push(info);

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
  info.days = hs.length;

  // 2) etichette orarie -> geometria di ogni blocco giorno
  const nums = p.items.filter((i) => HOUR_RE.test(i.n) && i.cy > topY && i.cy < topY + 70);
  if (!nums.length) { info.mode = 'etichette orarie non trovate'; return []; }
  const yMin = Math.min(...nums.map((i) => i.cy));
  const labels = nums.filter((i) => i.cy < yMin + 30);
  const headerBottom = Math.max(...labels.map((i) => i.y1)) + 1;

  let blocks = blocksFromLabels(labels, hs);
  info.grid = blocks ? 'etichette' : 'intestazioni';
  if (!blocks) {
    // ripiego: blocchi stimati dalla posizione delle intestazioni dei giorni
    blocks = hs
      .map((h, i) => {
        const lo = i === 0 ? -Infinity : (hs[i - 1].cx + h.cx) / 2;
        const hi = i === hs.length - 1 ? Infinity : (h.cx + hs[i + 1].cx) / 2;
        const ls = labels.filter((l) => l.cx >= lo && l.cx < hi);
        if (ls.length < 2) return null;
        const N = h.d === 5 ? 6 : 11;
        const mn = Math.min(...ls.map((l) => l.cx));
        const mx = Math.max(...ls.map((l) => l.cx));
        const sw = (mx - mn) / (N - 1);
        if (!(sw > 2)) return null;
        const L = mn - sw / 2;
        return { d: h.d, N, sw, L, R: L + N * sw, h0: 8 };
      })
      .filter(Boolean);
  }
  if (!blocks.length) { info.mode = 'blocchi giorno non calcolabili'; return []; }
  refineBlocks(blocks, p.rects, headerBottom);
  info.blocks = blocks.map((b) => `${DAYS[b.d]} ${b.h0}h x${b.N} L=${Math.round(b.L)} w=${Math.round(b.sw * 10) / 10}`);

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
    const orphans = {};
    dayItems.forEach((it) => {
      const blk = blockAt(it.cx);
      if (!blk) return;
      let best = null;
      subs.forEach((c) => {
        if (c.blk !== blk) return;
        const dd = it.cx < c.x0 ? c.x0 - it.cx : it.cx > c.x1 ? it.cx - c.x1 : 0;
        if (dd <= blk.sw * 0.3 && (!best || dd < best.dd)) best = { dd, c };
      });
      if (best) best.c.texts.push(it);
      else {
        const slot = Math.max(0, Math.min(blk.N - 1, Math.floor((it.cx - blk.L) / blk.sw)));
        const key = `${blk.d}:${slot}`;
        (orphans[key] = orphans[key] || { blk, slot, texts: [] }).texts.push(it);
      }
    });
    const orphanList = Object.values(orphans).sort((a, b) => a.blk.d - b.blk.d || a.slot - b.slot);
    let prevO = null;
    orphanList.forEach((o) => {
      const txt = o.texts.map((t) => t.s.trim()).join('|');
      if (prevO && prevO.blk === o.blk && o.slot === prevO.slot + 1 && prevO.txt === txt) {
        prevO.cell.x1 = o.blk.L + (o.slot + 1) * o.blk.sw;
        prevO.slot = o.slot;
      } else {
        const cell = { blk: o.blk, x0: o.blk.L + o.slot * o.blk.sw, x1: o.blk.L + (o.slot + 1) * o.blk.sw, color: null, texts: o.texts };
        subs.push(cell);
        prevO = { blk: o.blk, slot: o.slot, txt, cell };
      }
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

    level = classifyLevel(rowRects, cells, legend, leftEnd, leftMinX);
    if (level && level.conflict) reasons.push('colore Triennio/Biennio non univoco');

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

  info.rows = out.length;
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

  const legend = findLegend(pages);
  const refs = buildRefs(legend);
  const dbg = [];
  const raw = [];
  pages.forEach((p) => raw.push(...extractPage(p, refs, dbg)));

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

  return {
    scheduleMatrix,
    debug: { pages: dbg, legend, profX: Number.isFinite(profX) ? profX : null, rows: scheduleMatrix.length },
  };
}
