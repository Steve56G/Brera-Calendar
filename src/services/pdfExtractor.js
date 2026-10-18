// pdfExtractor.js
// Expo Go non include librerie native per leggere i PDF, quindi usiamo pdf.js
// dentro una WebView nascosta. La WebView estrae SOLO dati grezzi (testo con
// coordinate + rettangoli colorati) e li rimanda a React Native, dove li
// interpreta parser.js.
//
// NOTA: pdf.js viene scaricato dalla CDN -> serve connessione internet.
// Per l'uso offline, copia pdf.min.js / pdf.worker.min.js negli asset
// e inseriscili inline nell'HTML.

export const PDFJS_VERSION = '3.11.174';

export const extractorHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js"></script>
</head><body><script>
var send = function (o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
var r1 = function (n) { return Math.round(n * 10) / 10; };
function hexToRgb(h) {
  h = String(h).replace('#', '');
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}

async function extractRects(page, vp) {
  var OPS = pdfjsLib.OPS, U = pdfjsLib.Util;
  var ol = await page.getOperatorList();
  var ctm = [1, 0, 0, 1, 0, 0], stack = [], fill = [0, 0, 0];
  var shapes = [], poly = null, out = [], seen = {}, lines = [], seenL = {};

  function addLine(y, x0, x1) {
    if (x1 - x0 < 3) return;
    var k = r1(y) + '|' + r1(x0) + '|' + r1(x1);
    if (seenL[k]) return;
    seenL[k] = 1;
    lines.push({ y: r1(y), x0: r1(x0), x1: r1(x1) });
  }

  function addRect(x0, y0, x1, y1, doFill, doStroke) {
    var w = x1 - x0, h = y1 - y0;
    if (doStroke) { addLine(y0, x0, x1); addLine(y1, x0, x1); }
    if (!doFill) return;
    if (h < 2) { addLine((y0 + y1) / 2, x0, x1); return; }
    if (w < 2 || w > vp.width * 0.9) return;
    var k = [r1(x0), r1(y0), r1(x1), r1(y1), fill.join(',')].join('|');
    if (seen[k]) return;
    seen[k] = 1;
    out.push({ x0: r1(x0), y0: r1(y0), x1: r1(x1), y1: r1(y1), c: fill.slice() });
  }

  function flush(doFill, doStroke) {
    var m = U.transform(vp.transform, ctm);
    shapes.forEach(function (s) {
      if (s.r) {
        var a = U.applyTransform([s.r[0], s.r[1]], m);
        var b = U.applyTransform([s.r[0] + s.r[2], s.r[1] + s.r[3]], m);
        addRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), doFill, doStroke);
      } else if (s.p && s.p.length >= 2) {
        var xs = [], ys = [];
        s.p.forEach(function (pt) { var q = U.applyTransform(pt, m); xs.push(q[0]); ys.push(q[1]); });
        var mnx = Math.min.apply(null, xs), mxx = Math.max.apply(null, xs);
        var mny = Math.min.apply(null, ys), mxy = Math.max.apply(null, ys);
        var ok = xs.every(function (x) { return Math.abs(x - mnx) < 0.6 || Math.abs(x - mxx) < 0.6; }) &&
                 ys.every(function (y) { return Math.abs(y - mny) < 0.6 || Math.abs(y - mxy) < 0.6; });
        if (ok && s.p.length >= 4) addRect(mnx, mny, mxx, mxy, doFill, doStroke);
        else if (doStroke) {
          for (var q2 = 1; q2 < xs.length; q2++) {
            if (Math.abs(ys[q2] - ys[q2 - 1]) < 0.6) addLine((ys[q2] + ys[q2 - 1]) / 2, Math.min(xs[q2], xs[q2 - 1]), Math.max(xs[q2], xs[q2 - 1]));
          }
        }
      }
    });
    shapes = []; poly = null;
  }

  for (var i = 0; i < ol.fnArray.length; i++) {
    var fn = ol.fnArray[i], a = ol.argsArray[i];
    switch (fn) {
      case OPS.save: stack.push({ ctm: ctm.slice(), fill: fill.slice() }); break;
      case OPS.restore: if (stack.length) { var s = stack.pop(); ctm = s.ctm; fill = s.fill; } break;
      case OPS.transform: ctm = U.transform(ctm, a); break;
      case OPS.setFillRGBColor:
        fill = (typeof a[0] === 'string') ? hexToRgb(a[0]) : [Math.round(a[0]), Math.round(a[1]), Math.round(a[2])];
        break;
      case OPS.constructPath: {
        var ops = a[0], c = a[1], k = 0;
        for (var j = 0; j < ops.length; j++) {
          var op = ops[j];
          if (op === OPS.rectangle) { shapes.push({ r: [c[k], c[k + 1], c[k + 2], c[k + 3]] }); k += 4; }
          else if (op === OPS.moveTo) { poly = { p: [[c[k], c[k + 1]]] }; shapes.push(poly); k += 2; }
          else if (op === OPS.lineTo) { if (poly) poly.p.push([c[k], c[k + 1]]); k += 2; }
          else if (op === OPS.curveTo) { k += 6; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { k += 4; }
        }
        break;
      }
      case OPS.fill: case OPS.eoFill:
        flush(true, false); break;
      case OPS.fillStroke: case OPS.eoFillStroke:
      case OPS.closeFillStroke: case OPS.closeEOFillStroke:
        flush(true, true); break;
      case OPS.stroke: case OPS.closeStroke:
        flush(false, true); break;
      case OPS.endPath:
        shapes = []; poly = null; break;
    }
  }
  return { rects: out.slice(0, 30000), lines: lines.slice(0, 20000) };
}

window.runExtraction = async function (b64) {
  try {
    if (!window.pdfjsLib) { send({ type: 'error', code: 'pdfjsNotLoaded', message: 'pdf.js non caricato: serve una connessione internet.' }); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    send({ type: 'start', pages: pdf.numPages });
    var U = pdfjsLib.Util;
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var vp = page.getViewport({ scale: 1 });
      var tc = await page.getTextContent();
      var items = [];
      tc.items.forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var tr = U.transform(vp.transform, it.transform);
        var fs = Math.hypot(tr[0], tr[1]) || 1;
        var h = Math.hypot(tr[2], tr[3]) || fs;
        var w = it.width * vp.scale;
        var dx = tr[0] / fs, dy = tr[1] / fs;
        var ex = tr[4] + dx * w, ey = tr[5] + dy * w;
        var x0 = Math.min(tr[4], ex), x1 = Math.max(tr[4], ex), y0, y1;
        if (Math.abs(dy) < 0.5) { y0 = tr[5] - h; y1 = tr[5]; }
        else { y0 = Math.min(tr[5], ey); y1 = Math.max(tr[5], ey); var sx = dy * h * 0.5; x0 += sx; x1 += sx; }
        items.push({ s: it.str, x0: r1(x0), x1: r1(x1), y0: r1(y0), y1: r1(y1) });
      });
      var ex = await extractRects(page, vp);
      send({ type: 'page', page: { n: p, width: r1(vp.width), height: r1(vp.height), items: items, rects: ex.rects, lines: ex.lines } });
    }
    send({ type: 'done' });
  } catch (e) {
    send({ type: 'error', message: String((e && e.message) || e) });
  }
};
</script></body></html>`;



