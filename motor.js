/* GDB2PNG mobil - motorul de citire si desenare (aceeasi logica ca aplicatia Windows) */
'use strict';

const VERSIUNE = '1.3';
const PX_PDF_MM = 0.25;                 // 1 "px" din simbolizare = 0,25 mm pe hartie
const PT_PER_PX_PDF = PX_PDF_MM / 25.4 * 72;
const FORMATE_MM = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const SCARI_STANDARD = [500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000];
const PDF_MARGINE_MM = 10, PDF_CARTUS_MM = 14;
const DASHES_PX = { solid: null, dashed: [16, 8], dashdot: [22, 6, 3, 6], dotted: [2, 5], dashdotdot: [22, 5, 3, 5, 3, 5] };
const STILURI_LINIE = { 'continuă': 'solid', 'întreruptă': 'dashed', 'linie-punct': 'dashdot', 'punctată': 'dotted', 'linie-punct-punct': 'dashdotdot' };

// ------------------------------------------------------------------ stiluri

function general(stiluri) {
  return Object.assign({ fundal: '#FFFFFF', text_minim_px: 3, latime_implicita_px: 24000, scara_implicita: 1000,
    dpi_implicit: 200, max_megapixeli: 1200, evita_suprapunerea: true, pdf_scara_implicita: 1000,
    pdf_format_implicit: 'Auto', pdf_factor_grosime: 1.0, pdf_max_planse: 300, eticheta_linie_repetare_px: 1200 },
    stiluri._general || {});
}
function stilStrat(stiluri, nume) {
  return Object.assign({}, stiluri._implicit || { ordine: 50, culoare: '#606060', latime_px: 1, marker: 'o', marime_marker_px: 5 }, stiluri[nume] || {});
}
const RE_CAMP = /\{([^{}:]+)(?::([^{}]*))?\}/g;
function campuriDinEticheta(et) {
  if (!et) return [];
  if (et.includes('{')) { const r = []; for (const m of et.matchAll(RE_CAMP)) { const c = m[1].trim(); if (!r.includes(c)) r.push(c); } return r; }
  return [et.trim()];
}
function valText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') { if (!isFinite(v)) return ''; return Number.isInteger(v) ? String(v) : String(+v.toPrecision(6)); }
  return String(v).trim();
}
function textEticheta(et, props) {
  if (!et.includes('{')) { const t = valText(props[et.trim()]); return t || null; }
  let gol = true;
  const t = et.replace(RE_CAMP, (_, c) => { const v = valText(props[c.trim()]); if (v) gol = false; return v; });
  return gol ? null : t.split(/\s+/).filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ GDAL

const GDB = { Gdal: null, ds: null, nume: '', straturi: [], uats: [], cache: {} };

// fisierele mari ale motorului GDAL sunt comprimate (.gz) si se despacheteaza in browser
async function despacheteaza(url, tip) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Nu pot descărca ${url} (${r.status})`);
  let buf = await r.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) {          // inca e gzip (unele servere il despacheteaza singure)
    if (typeof DecompressionStream === 'function') buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    else buf = fflate.gunzipSync(new Uint8Array(buf)).buffer;
  }
  return URL.createObjectURL(new Blob([buf], { type: tip }));
}
let PROMIS_GDAL = null;
function initGdal() {
  if (!PROMIS_GDAL) PROMIS_GDAL = (async () => {
    const baza = new URL('lib/gdal/', location.href).href;
    const [wasm, data] = await Promise.all([despacheteaza(baza + 'gdal3WebAssembly.wasm.gz', 'application/wasm'),
                                            despacheteaza(baza + 'gdal3WebAssembly.data.gz', 'application/octet-stream')]);
    GDB.Gdal = await initGdalJs({ path: '', paths: { wasm, data, js: baza + 'gdal3.js' }, useWorker: true });
    return GDB.Gdal;
  })().catch(e => { PROMIS_GDAL = null; throw e; });
  return PROMIS_GDAL;
}

async function deschideGdb(file, log) {
  const Gdal = await initGdal();
  if (GDB.ds) { try { await Gdal.close(GDB.ds); } catch (e) { } }
  GDB.ds = null; GDB.cache = {}; GDB.straturi = []; GDB.uats = [];
  const r = await Gdal.open(file);
  if (!r.datasets.length) throw new Error('Fișierul nu conține un geodatabase (.gdb) valid.' + (r.errors.length ? ' ' + r.errors.map(e => e.message || e).join('; ') : ''));
  GDB.ds = r.datasets[0];
  GDB.nume = file.name.replace(/\.zip$/i, '');
  const info = await Gdal.ogrinfo(GDB.ds, ['-so', '-json']);
  const totaluri = {};
  try { (await Gdal.getInfo(GDB.ds)).layers.forEach(l => totaluri[l.name] = l.featureCount); } catch (e) { }
  for (const l of info.layers || []) {
    const gf = (l.geometryFields || [])[0];
    if (!gf || !gf.type || /^none$/i.test(gf.type)) continue;
    GDB.straturi.push({ nume: l.name, tip: gf.type, extent: gf.extent || null,
      campuri: (l.fields || []).map(f => f.name), tipuri: Object.fromEntries((l.fields || []).map(f => [f.name, f.type])),
      total: totaluri[l.name] ?? l.featureCount ?? null });
  }
  const lu = GDB.straturi.find(s => s.nume === 'LimitaUAT');
  if (lu && lu.campuri.includes('DenumireUAT')) {
    const gj = await ogrGeoJSON(['-sql', 'SELECT DISTINCT "DenumireUAT" FROM "LimitaUAT"']);
    GDB.uats = [...new Set(gj.features.map(f => f.properties.DenumireUAT).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro'));
  }
  log && log(`Am încărcat ${GDB.straturi.length} straturi din ${GDB.nume}` + (GDB.uats.length ? `; ${GDB.uats.length} UAT-uri` : ''));
}

async function ogrGeoJSON(args) {
  const Gdal = GDB.Gdal;
  const out = await Gdal.ogr2ogr(GDB.ds, ['-f', 'GeoJSON', '-dim', 'XY', '-lco', 'COORDINATE_PRECISION=3', ...args], 'tmp_gdb2png');
  const bytes = await Gdal.getFileBytes(out);
  return JSON.parse(new TextDecoder().decode(bytes));
}

// geometrie GeoJSON -> forma compacta {t:'P'|'L'|'A', parti:[Float64Array], bb, p}
function compacteaza(f) {
  const g = f.geometry; if (!g) return null;
  const parti = []; let t;
  const adauga = c => { const a = new Float64Array(c.length * 2); for (let i = 0; i < c.length; i++) { a[2 * i] = c[i][0]; a[2 * i + 1] = c[i][1]; } parti.push(a); };
  switch (g.type) {
    case 'Point': t = 'P'; adauga([g.coordinates]); break;
    case 'MultiPoint': t = 'P'; adauga(g.coordinates); break;
    case 'LineString': t = 'L'; adauga(g.coordinates); break;
    case 'MultiLineString': t = 'L'; g.coordinates.forEach(adauga); break;
    case 'Polygon': t = 'A'; g.coordinates.forEach(adauga); break;
    case 'MultiPolygon': t = 'A'; g.coordinates.forEach(p => p.forEach(adauga)); break;
    default: return null;
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const a of parti) for (let i = 0; i < a.length; i += 2) { const x = a[i], y = a[i + 1]; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  if (!isFinite(x1)) return null;
  return { t, parti, bb: [x1, y1, x2, y2], p: f.properties || {} };
}

function cuprinde(a, b) { return a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]; }

// citeste un strat in dreptunghiul bbox (cu cache pe zona curenta)
async function citesteStrat(nume, bbox, campuri) {
  const c = GDB.cache[nume];
  if (c && cuprinde(c.bbox, bbox) && campuri.every(x => c.campuri.includes(x))) {
    return c.ob.filter(o => o.bb[2] >= bbox[0] && o.bb[0] <= bbox[2] && o.bb[3] >= bbox[1] && o.bb[1] <= bbox[3]);
  }
  const s = GDB.straturi.find(x => x.nume === nume);
  const valide = campuri.filter(x => s && s.campuri.includes(x));
  const sel = valide.length ? valide.map(x => `"${x}"`).join(',') : 'FID';
  const gj = await ogrGeoJSON(['-spat', ...bbox.map(String), '-sql', `SELECT ${sel} FROM "${nume}"`]);
  const ob = [];
  for (const f of gj.features) { const o = compacteaza(f); if (o) ob.push(o); }
  GDB.cache[nume] = { bbox: bbox.slice(), campuri: valide, ob };
  return ob;
}

async function geometrieUat(nume) {
  const gj = await ogrGeoJSON(['-where', `"DenumireUAT" = '${nume.replace(/'/g, "''")}'`, 'LimitaUAT']);
  const inele = []; let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of gj.features) { const o = compacteaza(f); if (!o) continue; inele.push(...o.parti); bb = [Math.min(bb[0], o.bb[0]), Math.min(bb[1], o.bb[1]), Math.max(bb[2], o.bb[2]), Math.max(bb[3], o.bb[3])]; }
  if (!inele.length) throw new Error(`UAT-ul ${nume} nu a fost găsit în LimitaUAT.`);
  return { inele, bb };
}

// masca rasterizata a poligonului (test rapid "punct in UAT")
function mascaPoligon(inele, bb) {
  const N = 1024, W = bb[2] - bb[0], H = bb[3] - bb[1];
  const sc = N / Math.max(W, H), cw = Math.max(1, Math.ceil(W * sc)), ch = Math.max(1, Math.ceil(H * sc));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  ctx.beginPath();
  for (const a of inele) { for (let i = 0; i < a.length; i += 2) { const X = (a[i] - bb[0]) * sc, Y = (bb[3] - a[i + 1]) * sc; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); }
  ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.lineWidth = 2; ctx.stroke();
  const d = ctx.getImageData(0, 0, cw, ch).data;
  return (x, y) => { const X = Math.floor((x - bb[0]) * sc), Y = Math.floor((bb[3] - y) * sc); return X >= 0 && Y >= 0 && X < cw && Y < ch && d[(Y * cw + X) * 4 + 3] > 0; };
}
function obiectInMasca(o, inMasca) {
  for (const a of o.parti) for (let i = 0; i < a.length; i += 2) if (inMasca(a[i], a[i + 1])) return true;
  return false;
}

// ------------------------------------------------------------------ etichete

function unghiVertical(a) { a = ((a + 180) % 360 + 360) % 360 - 180; if (a > 90) a -= 180; else if (a <= -90) a += 180; return a; }

function eticheta(x, y, t, hpx, ppm, col, z, rot = 0, ha = 'center', va = 'center') {
  const linii = t.split('\n');
  const lat = Math.max(...linii.map(l => l.length)) * 0.62 * hpx * 1.35 / ppm;
  const inalt = linii.length * hpx * 1.5 / ppm;
  return { x, y, t, hpx, col, z, rot, ha, va, lat, inalt, raza: lat + 2 * hpx / ppm, prio: z, fix: false };
}

// taie o polilinie cu un dreptunghi -> parti (Liang-Barsky)
function taieLinie(a, b) {
  const parti = []; let cur = null;
  for (let i = 0; i + 3 < a.length; i += 2) {
    let x0 = a[i], y0 = a[i + 1], x1 = a[i + 2], y1 = a[i + 3];
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0 - b[0], b[2] - x0, y0 - b[1], b[3] - y0];
    let ok = true;
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) { if (q[k] < 0) { ok = false; break; } }
      else { const r = q[k] / p[k]; if (p[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
    }
    if (!ok) { cur = null; continue; }
    const ax = x0 + t0 * dx, ay = y0 + t0 * dy, bx = x0 + t1 * dx, by = y0 + t1 * dy;
    if (cur && t0 === 0) cur.push(bx, by); else { cur = [ax, ay, bx, by]; parti.push(cur); }
    if (t1 < 1) cur = null;
  }
  return parti;
}
function lungime(a) { let L = 0; for (let i = 0; i + 3 < a.length; i += 2) L += Math.hypot(a[i + 2] - a[i], a[i + 3] - a[i + 1]); return L; }
function punctLa(a, d) {
  for (let i = 0; i + 3 < a.length; i += 2) {
    const l = Math.hypot(a[i + 2] - a[i], a[i + 3] - a[i + 1]);
    if (d <= l || i + 4 >= a.length) { const f = l ? Math.min(1, Math.max(0, d / l)) : 0; return [a[i] + f * (a[i + 2] - a[i]), a[i + 1] + f * (a[i + 3] - a[i + 1])]; }
    d -= l;
  }
  return [a[0], a[1]];
}
function centroid(a) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < a.length - 2; i += 2) { const f = a[i] * a[i + 3] - a[i + 2] * a[i + 1]; A += f; cx += (a[i] + a[i + 2]) * f; cy += (a[i + 1] + a[i + 3]) * f; }
  if (Math.abs(A) < 1e-9) return [(a[0] + a[a.length - 2]) / 2, (a[1] + a[a.length - 1]) / 2];
  return [cx / (3 * A), cy / (3 * A)];
}

function calculeazaEtichete(ob, st, ppm, gen, bbox) {
  const et = st.eticheta; if (!et) return [];
  const hcfg = (+st.inaltime_text_m || 2) * ppm;
  let hpx = hcfg;
  if (+st.text_minim_px) hpx = Math.max(hpx, +st.text_minim_px);
  else if (hpx < gen.text_minim_px) return [];
  const factor = hcfg > 0 ? hpx / hcfg : 1, hm = hpx / ppm;
  const col = st.culoare_text || '#000000';
  const [dx0, dy0] = st.decalaj_text_m || [0, 0]; const dx = dx0 * factor, dy = dy0 * factor;
  let dlin = (+st.decalaj_linie_m || 0) * factor; if (dlin) dlin += hm * 0.5;
  const scurte = !!st.eticheta_linii_scurte, z = st._z + 0.5;
  const prio = +(st.prioritate_eticheta ?? st._z);
  const interval = (+gen.eticheta_linie_repetare_px || 1200) / ppm;
  const rez = [];
  for (const o of ob) {
    const t = textEticheta(et, o.p); if (!t) continue;
    if (o.t === 'P') {
      const x = o.parti[0][0], y = o.parti[0][1];
      if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) continue;
      rez.push((dx || dy) ? eticheta(x + dx, y + dy, t, hpx, ppm, col, z, 0, 'left', 'bottom') : eticheta(x, y, t, hpx, ppm, col, z));
    } else if (o.t === 'L') {
      let best = null, bl = 0;
      for (const a of o.parti) for (const p of taieLinie(a, bbox)) { const L = lungime(p); if (L > bl) { bl = L; best = p; } }
      if (!best) continue;
      const latM = t.length * 0.62 * hpx * 1.35 / ppm;
      if (bl < latM * 1.1 && !scurte) continue;
      const n = Math.max(1, Math.floor(bl / Math.max(interval, latM * 2)));
      for (let k = 0; k < n; k++) {
        const pos = bl * (k + 0.5) / n;
        const d = Math.max(Math.min(n === 1 ? bl * 0.05 : latM / 2, Math.max(hm, 1)), bl * 0.02, 1e-6);
        const m = punctLa(best, pos), A = punctLa(best, Math.max(0, pos - d)), B = punctLa(best, Math.min(bl, pos + d));
        const ang = unghiVertical(Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI);
        let mx = m[0], my = m[1];
        if (dlin) { const ra = ang * Math.PI / 180; mx -= Math.sin(ra) * dlin; my += Math.cos(ra) * dlin; }
        rez.push(eticheta(mx, my, t, hpx, ppm, col, z, ang));
      }
    } else {
      const c = centroid(o.parti[0]);
      if (c[0] < bbox[0] || c[0] > bbox[2] || c[1] < bbox[1] || c[1] > bbox[3]) continue;
      rez.push(eticheta(c[0], c[1], t, hpx, ppm, col, z));
    }
  }
  rez.forEach(e => e.prio = prio);
  return rez;
}

function calculeazaAdnotari(ob, st, ppm, gen) {
  const col = st.culoare_text || '#000000', minim = +st.text_minim_px || 0, rez = [];
  for (const o of ob) {
    const t = valText(o.p.TextString); if (!t) continue;
    let h = +o.p.Height;
    if (!(h > 0)) h = Math.min(o.bb[2] - o.bb[0], o.bb[3] - o.bb[1]) || 1;
    const hpx = Math.max(h * ppm, minim);
    if (hpx < gen.text_minim_px) continue;
    const e = eticheta((o.bb[0] + o.bb[2]) / 2, (o.bb[1] + o.bb[3]) / 2, t, hpx, ppm, col, st._z, unghiVertical(+o.p.Angle || 0));
    e.fix = true; rez.push(e);
  }
  return rez;
}

function cutie(e) {
  const w = e.lat, h = e.inalt;
  const x0 = { left: 0, center: -w / 2, right: -w }[e.ha], y0 = { bottom: 0, center: -h / 2, top: -h }[e.va] ?? -h / 2;
  const c = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
  const a = e.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  return c.map(([x, y]) => [e.x + x * ca - y * sa, e.y + x * sa + y * ca]);
}
function seIntersecteaza(A, B) {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const p1 = P[i], p2 = P[(i + 1) % 4], nx = p2[1] - p1[1], ny = p1[0] - p2[0];
    let a1 = Infinity, a2 = -Infinity, b1 = Infinity, b2 = -Infinity;
    for (const q of A) { const v = q[0] * nx + q[1] * ny; if (v < a1) a1 = v; if (v > a2) a2 = v; }
    for (const q of B) { const v = q[0] * nx + q[1] * ny; if (v < b1) b1 = v; if (v > b2) b2 = v; }
    if (a2 < b1 || b2 < a1) return false;
  }
  return true;
}
function eliminaSuprapuneri(et) {
  if (!et.length) return et;
  const ord = et.map((e, i) => i).sort((i, j) => (et[i].fix === et[j].fix ? et[j].prio - et[i].prio : (et[i].fix ? -1 : 1)));
  const lat = et.map(e => e.lat).sort((a, b) => a - b);
  const cel = Math.max(lat[Math.floor(lat.length / 2)] * 2, 1e-6);
  const grila = new Map(), pastrate = [];
  for (const i of ord) {
    const e = et[i], c = cutie(e);
    const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
    const cx1 = Math.floor(Math.min(...xs) / cel), cx2 = Math.floor(Math.max(...xs) / cel), cy1 = Math.floor(Math.min(...ys) / cel), cy2 = Math.floor(Math.max(...ys) / cel);
    const chei = []; for (let x = cx1; x <= cx2; x++) for (let y = cy1; y <= cy2; y++) chei.push(x + ',' + y);
    if (!e.fix && chei.length < 400) {
      let ciocnire = false; const vazute = new Set();
      for (const k of chei) { for (const [j, q] of grila.get(k) || []) { if (vazute.has(j)) continue; vazute.add(j); if (seIntersecteaza(c, q)) { ciocnire = true; break; } } if (ciocnire) break; }
      if (ciocnire) continue;
    }
    for (const k of chei) { if (!grila.has(k)) grila.set(k, []); grila.get(k).push([i, c]); }
    pastrate.push(e);
  }
  return pastrate;
}

// ------------------------------------------------------------------ incarcarea datelor pentru o zona

async function incarcaDate(straturi, stiluri, bbox, ppm, log, progres) {
  const gen = general(stiluri);
  const ord = straturi.slice().sort((a, b) => ((+stilStrat(stiluri, a).ordine || 50) - (+stilStrat(stiluri, b).ordine || 50)) || a.localeCompare(b));
  const pachete = []; let etichete = [], total = 0;
  for (let i = 0; i < ord.length; i++) {
    const nume = ord[i], st = stilStrat(stiluri, nume); st._z = +st.ordine || 50;
    const s = GDB.straturi.find(x => x.nume === nume); if (!s) continue;
    progres && progres(i / ord.length, `Citesc ${nume} (${i + 1}/${ord.length})`);
    const adn = st.tip === 'adnotare' || (s.campuri.includes('TextString') && s.campuri.includes('Angle'));
    try {
      if (adn) {
        const ob = await citesteStrat(nume, bbox, ['TextString', 'Angle', 'Height'].filter(c => s.campuri.includes(c)));
        const et = calculeazaAdnotari(ob, st, ppm, gen); etichete = etichete.concat(et); total += ob.length;
        log(`[${i + 1}/${ord.length}] ${nume}: ${ob.length} adnotări, ${et.length} afișate`);
        continue;
      }
      let sablon = st.eticheta; const cols = campuriDinEticheta(sablon);
      const lipsa = cols.filter(c => !s.campuri.includes(c));
      if (lipsa.length) { log(`   atenție: câmpurile ${lipsa.join(', ')} nu există în ${nume}`); sablon = null; }
      const ob = await citesteStrat(nume, bbox, sablon ? cols : []);
      const st2 = Object.assign({}, st, { eticheta: sablon });
      const et = sablon ? calculeazaEtichete(ob, st2, ppm, gen, bbox) : [];
      etichete = etichete.concat(et); total += ob.length;
      if (ob.length) pachete.push({ st, ob });
      log(`[${i + 1}/${ord.length}] ${nume}: ${ob.length} obiecte` + (sablon ? `, ${et.length} etichete` : '') + (ob.length ? '' : '   ← atenție: fără obiecte în zonă'));
    } catch (e) { log(`[${i + 1}/${ord.length}] ${nume}: EROARE ${e.message || e}`); }
  }
  if (gen.evita_suprapunerea && etichete.length) {
    const n0 = etichete.length; etichete = eliminaSuprapuneri(etichete);
    log(`Etichete: ${etichete.length} afișate, ${n0 - etichete.length} omise ca să nu se suprapună`);
  }
  return { pachete, etichete, total };
}

// ------------------------------------------------------------------ desenare generica (canvas sau PDF)
// "pen" = adaptor de desen; coordonatele de hartie se obtin prin pen.X(x), pen.Y(y)

function deseneazaZona(pen, date, zona, opt = {}) {
  const [x1, y1, x2, y2] = zona, marja = opt.marja || 0;
  for (const { st, ob } of date.pachete) {
    const sel = ob.filter(o => o.bb[2] >= x1 - marja && o.bb[0] <= x2 + marja && o.bb[3] >= y1 - marja && o.bb[1] <= y2 + marja);
    if (sel.length) pen.strat(st, sel, opt);
  }
  if (opt.etichete !== false) {
    const et = date.etichete.filter(e => e.x + e.raza >= x1 && e.x - e.raza <= x2 && e.y + e.raza >= y1 && e.y - e.raza <= y2);
    et.sort((a, b) => a.z - b.z);
    for (const e of et) pen.text(e);
  }
}

// ---- adaptor Canvas (PNG)
function penCanvas(ctx, ox, oy, ppm, fundal, scalaLinii = 1) {
  const X = x => (x - ox) * ppm, Y = y => (oy - y) * ppm;
  return {
    strat(st, ob, opt) {
      const lw = +(st.latime_px ?? 1) * scalaLinii, cul = st.culoare || '#000', umpl = st.umplere;
      const dash0 = DASHES_PX[(st.stil_linie || 'solid').toLowerCase()];
      const dash = dash0 && scalaLinii !== 1 ? dash0.map(v => v * Math.max(scalaLinii, 0.4)) : dash0;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const A = ob.filter(o => o.t === 'A'), L = ob.filter(o => o.t === 'L'), P = ob.filter(o => o.t === 'P');
      if (A.length && umpl) {
        ctx.fillStyle = umpl;
        for (const o of A) { ctx.beginPath(); for (const a of o.parti) { for (let i = 0; i < a.length; i += 2) { i ? ctx.lineTo(X(a[i]), Y(a[i + 1])) : ctx.moveTo(X(a[i]), Y(a[i + 1])); } ctx.closePath(); } ctx.fill('evenodd'); }
      }
      if (lw > 0 && (A.length || L.length)) {
        ctx.strokeStyle = cul; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
        ctx.beginPath(); let n = 0;
        for (const o of A.concat(L)) for (const a of o.parti) {
          for (let i = 0; i < a.length; i += 2) { i ? ctx.lineTo(X(a[i]), Y(a[i + 1])) : ctx.moveTo(X(a[i]), Y(a[i + 1])); }
          if (o.t === 'A') ctx.closePath();
          if (++n % 2000 === 0) { ctx.stroke(); ctx.beginPath(); }
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      const mk = st.marker ?? 'o', msz = +(st.marime_marker_px ?? 5) * Math.max(scalaLinii, 0.5);
      if (P.length && mk && msz > 0 && opt.puncte !== false) {
        ctx.setLineDash([]); ctx.lineWidth = Math.max(0.8, msz / 6); ctx.strokeStyle = cul; ctx.fillStyle = umpl || cul;
        const plin = !!umpl || '.,x+|_'.includes(mk);
        for (const o of P) for (const a of o.parti) for (let i = 0; i < a.length; i += 2) marker(ctx, mk, X(a[i]), Y(a[i + 1]), msz / 2, plin);
      }
    },
    text(e) {
      const fs = e.hpx * 1.35;
      ctx.save(); ctx.translate(X(e.x), Y(e.y)); ctx.rotate(-e.rot * Math.PI / 180);
      ctx.font = `${fs}px Arial, "DejaVu Sans", Helvetica, sans-serif`; ctx.fillStyle = e.col;
      ctx.textAlign = e.ha; ctx.textBaseline = e.va === 'center' ? 'middle' : (e.va === 'bottom' ? 'bottom' : 'top');
      const linii = e.t.split('\n');
      linii.forEach((l, k) => ctx.fillText(l, 0, (k - (linii.length - 1) / 2) * fs * 1.1));
      ctx.restore();
    }
  };
}
function marker(ctx, mk, x, y, r, plin) {
  ctx.beginPath();
  if (mk === 's') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (mk === '^') { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r, y + r * 0.6); ctx.lineTo(x - r, y + r * 0.6); ctx.closePath(); }
  else if (mk === 'D' || mk === 'd') { const rx = mk === 'd' ? r * 0.7 : r; ctx.moveTo(x, y - r); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + r); ctx.lineTo(x - rx, y); ctx.closePath(); }
  else ctx.arc(x, y, mk === '.' ? Math.max(r * 0.5, 0.8) : r, 0, Math.PI * 2);
  plin ? ctx.fill() : ctx.stroke();
}

// ------------------------------------------------------------------ PNG pe benzi

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf, crc = 0xFFFFFFFF) { for (let i = 0; i < buf.length; i++) crc = CRC_T[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8); return crc; }
function chunkPng(tip, date) {
  const b = new Uint8Array(12 + date.length), dv = new DataView(b.buffer);
  dv.setUint32(0, date.length); for (let i = 0; i < 4; i++) b[4 + i] = tip.charCodeAt(i);
  b.set(date, 8);
  dv.setUint32(8 + date.length, (crc32(b.subarray(4, 8 + date.length)) ^ 0xFFFFFFFF) >>> 0);
  return b;
}

function calculeazaDimensiuni(ext, latime, scara, dpi) {
  const W = ext[2] - ext[0], H = ext[3] - ext[1];
  if (W <= 0 || H <= 0) throw new Error('Zona are lățime sau înălțime zero.');
  const ppm = latime ? latime / W : dpi / 0.0254 / scara;
  return { ppm, w: Math.max(1, Math.round(W * ppm)), h: Math.max(1, Math.round(H * ppm)) };
}

async function randeazaPng(straturi, stiluri, ext, opt, log, progres) {
  const gen = general(stiluri);
  const { ppm, w, h } = calculeazaDimensiuni(ext, opt.latime, opt.scara, opt.dpi);
  const mp = w * h / 1e6;
  log(`Imagine: ${w} × ${h} px (${Math.round(mp)} MP), ${(1 / ppm).toFixed(3)} m/pixel`);
  if (mp > +gen.max_megapixeli) throw new Error(`Imaginea ar avea ${Math.round(mp)} megapixeli (limita: ${gen.max_megapixeli}). Micșorați zona sau lățimea.`);
  const xmin = ext[0], ymax = ext[1] + h / ppm, xmax = xmin + w / ppm, ymin = ext[1];
  const date = await incarcaDate(straturi, stiluri, [xmin, ymin, xmax, ymax], ppm, log, (f, m) => progres(f * 0.3, m));
  // benzi orizontale de cel mult ~40 MB, desenate pe dale de 4096 px (limite sigure si pe iPhone)
  const DALA = 4096, hb = Math.max(32, Math.min(h, Math.floor(40e6 / (3 * w)), Math.floor(16e6 / DALA)));
  const cv = document.createElement('canvas'); cv.width = Math.min(DALA, w); cv.height = hb;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const parti = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr.set([8, 2, 0, 0, 0], 8);
  parti.push(chunkPng('IHDR', ihdr));
  if (opt.scara && opt.dpi) { const p = new Uint8Array(9), d2 = new DataView(p.buffer); const v = Math.round(opt.dpi / 0.0254); d2.setUint32(0, v); d2.setUint32(4, v); p[8] = 1; parti.push(chunkPng('pHYs', p)); }
  const z = new fflate.Zlib({ level: 6 });
  z.ondata = (d) => { if (d.length) parti.push(chunkPng('IDAT', d)); };
  const fond = gen.fundal || '#FFFFFF';
  const nb = Math.ceil(h / hb);
  for (let k = 0; k < nb; k++) {
    const r0 = k * hb, hs = Math.min(hb, h - r0);
    const brut = new Uint8Array(hs * (w * 3 + 1));
    for (let tx = 0; tx < w; tx += DALA) {
      const tw = Math.min(DALA, w - tx);
      const ox = xmin + tx / ppm, oy = ymax - r0 / ppm;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = fond; ctx.fillRect(0, 0, cv.width, cv.height);
      const zona = [ox, oy - hs / ppm, ox + tw / ppm, oy];
      deseneazaZona(penCanvas(ctx, ox, oy, ppm, fond), date, zona, { marja: 10 / ppm });
      const img = ctx.getImageData(0, 0, tw, hs).data;
      for (let r = 0; r < hs; r++) {
        let di = r * (w * 3 + 1) + 1 + tx * 3, si = r * tw * 4;
        for (let c = 0; c < tw; c++, si += 4) { brut[di++] = img[si]; brut[di++] = img[si + 1]; brut[di++] = img[si + 2]; }
      }
      await new Promise(r => setTimeout(r, 0));
    }
    z.push(brut, k === nb - 1);
    progres(0.3 + 0.7 * (k + 1) / nb, `Desenez banda ${k + 1}/${nb}`);
  }
  parti.push(chunkPng('IEND', new Uint8Array(0)));
  const blob = new Blob(parti, { type: 'image/png' });
  const pgw = `${(1 / ppm).toFixed(10)}\n0.0\n0.0\n${(-1 / ppm).toFixed(10)}\n${(xmin + 0.5 / ppm).toFixed(4)}\n${(ymax - 0.5 / ppm).toFixed(4)}\n`;
  log(`Gata: ${w} × ${h} px, ${(blob.size / 1e6).toFixed(1)} MB (${date.total} obiecte, ${date.etichete.length} etichete)`);
  return { blob, pgw, w, h };
}

// ------------------------------------------------------------------ PDF

function zonaDesenMm(fmt, ori) {
  let [w, h] = FORMATE_MM[fmt]; if (ori === 'peisaj') [w, h] = [h, w];
  return { pw: w, ph: h, dw: w - 2 * PDF_MARGINE_MM, dh: h - 2 * PDF_MARGINE_MM - PDF_CARTUS_MM };
}
function numarPlanse(ext, fmt, ori, scara) {
  const { dw, dh } = zonaDesenMm(fmt, ori);
  return [Math.ceil((ext[2] - ext[0]) / (dw * scara / 1000) - 1e-9), Math.ceil((ext[3] - ext[1]) / (dh * scara / 1000) - 1e-9)];
}
function planificaPdf(ext, fmtAles, scara) {
  const formate = fmtAles === 'Auto' ? Object.keys(FORMATE_MM) : [fmtAles];
  for (const f of formate) for (const o of ['peisaj', 'portret']) { const [nx, ny] = numarPlanse(ext, f, o, scara); if (nx === 1 && ny === 1) return { format: f, orientare: o, scara, nx, ny }; }
  const f = formate[formate.length - 1];
  const v = ['peisaj', 'portret'].map(o => [...numarPlanse(ext, f, o, scara), o]).sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
  return { format: f, orientare: v[2], scara, nx: v[0], ny: v[1] };
}
function scaraAnsamblu(ext, fmt, ori) {
  const { dw, dh } = zonaDesenMm(fmt, ori);
  const nec = Math.max((ext[2] - ext[0]) / (dw / 1000), (ext[3] - ext[1]) / (dh / 1000));
  return SCARI_STANDARD.find(s => s >= nec) || Math.ceil(nec / 10000) * 10000;
}

let FONT_B64 = null;
async function fontPdf(pdf) {
  if (!FONT_B64) {
    const b = new Uint8Array(await (await fetch('lib/DejaVuSans.ttf')).arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    FONT_B64 = btoa(s);
  }
  pdf.addFileToVFS('DejaVuSans.ttf', FONT_B64); pdf.addFont('DejaVuSans.ttf', 'DejaVu', 'normal'); pdf.setFont('DejaVu');
}

function penPdf(pdf, mx0, my0, k, z, factorLinie) {
  // harta: x -> mx0 + (x - z0)*k ; y -> my0 + (z3 - y)*k  (mm, origine stanga-sus)
  const X = x => mx0 + (x - z[0]) * k, Y = y => my0 + (z[3] - y) * k;
  const mm = px => px * PX_PDF_MM;
  return {
    strat(st, ob, opt) {
      const lw = +(st.latime_px ?? 1) * (opt.factorLinie ?? factorLinie), cul = st.culoare || '#000000', umpl = st.umplere;
      const dash = DASHES_PX[(st.stil_linie || 'solid').toLowerCase()];
      const A = ob.filter(o => o.t === 'A'), L = ob.filter(o => o.t === 'L'), P = ob.filter(o => o.t === 'P');
      if (A.length && umpl) {
        pdf.setFillColor(umpl);
        for (const o of A) { for (const a of o.parti) { for (let i = 0; i < a.length; i += 2) i ? pdf.lineTo(X(a[i]), Y(a[i + 1])) : pdf.moveTo(X(a[i]), Y(a[i + 1])); pdf.close(); } pdf.fillEvenOdd(); }
      }
      if (lw > 0 && (A.length || L.length)) {
        pdf.setDrawColor(cul); pdf.setLineWidth(mm(lw)); pdf.setLineDashPattern(dash ? dash.map(mm) : [], 0);
        pdf.setLineCap('round'); pdf.setLineJoin('round');
        let n = 0;
        for (const o of A.concat(L)) for (const a of o.parti) {
          for (let i = 0; i < a.length; i += 2) i ? pdf.lineTo(X(a[i]), Y(a[i + 1])) : pdf.moveTo(X(a[i]), Y(a[i + 1]));
          if (o.t === 'A') pdf.close();
          if (++n % 1500 === 0) pdf.stroke();
        }
        pdf.stroke(); pdf.setLineDashPattern([], 0);
      }
      const mk = st.marker ?? 'o', msz = +(st.marime_marker_px ?? 5);
      if (P.length && mk && msz > 0 && opt.puncte !== false) {
        const r = mm(msz) / 2, plin = !!umpl || '.,x+|_'.includes(mk);
        pdf.setDrawColor(cul); pdf.setFillColor(umpl || cul); pdf.setLineWidth(mm(Math.max(0.8, msz / 6)) * factorLinie);
        const stil = plin ? 'F' : 'S';
        for (const o of P) for (const a of o.parti) for (let i = 0; i < a.length; i += 2) {
          const x = X(a[i]), y = Y(a[i + 1]);
          if (mk === 's') pdf.rect(x - r, y - r, 2 * r, 2 * r, stil);
          else if (mk === '^') pdf.triangle(x, y - r * 1.15, x + r, y + r * 0.6, x - r, y + r * 0.6, stil);
          else if (mk === 'D' || mk === 'd') { const rx = mk === 'd' ? r * 0.7 : r; pdf.moveTo(x, y - r); pdf.lineTo(x + rx, y); pdf.lineTo(x, y + r); pdf.lineTo(x - rx, y); pdf.close(); plin ? pdf.fill() : pdf.stroke(); }
          else pdf.circle(x, y, mk === '.' ? Math.max(r * 0.5, 0.1) : r, stil);
        }
      }
    },
    text(e) { textPdf(pdf, e.t, X(e.x), Y(e.y), e.hpx * PT_PER_PX_PDF * 1.35, e.col, e.rot, e.ha, e.va); }
  };
}
// text rotit, ancorat la (x,y) cu aliniere ha/va (mm, y in jos)
function textPdf(pdf, t, x, y, pt, col, rot = 0, ha = 'center', va = 'center') {
  pdf.setFontSize(pt); pdf.setTextColor(col);
  const fsmm = pt * 25.4 / 72, a = rot * Math.PI / 180;
  const u = [Math.cos(a), -Math.sin(a)], n = [-Math.sin(a), -Math.cos(a)];
  const linii = String(t).split('\n');
  linii.forEach((l, k) => {
    const w = pdf.getTextWidth(l);
    const ox = ha === 'center' ? -w / 2 : (ha === 'right' ? -w : 0);
    let oy = va === 'center' ? -0.35 * fsmm : (va === 'top' ? -0.75 * fsmm : 0.1 * fsmm);
    oy -= (k - (linii.length - 1) / 2) * fsmm * 1.1;
    pdf.text(l, x + ox * u[0] + oy * n[0], y + ox * u[1] + oy * n[1], { angle: rot });
  });
}

function cartus(pdf, pw, ph, titlu, detalii, scara) {
  const y = ph - PDF_MARGINE_MM - PDF_CARTUS_MM * 0.5;
  textPdf(pdf, titlu, PDF_MARGINE_MM, y, 13, '#000000', 0, 'left', 'center');
  textPdf(pdf, detalii, pw / 2, y, 9, '#000000', 0, 'center', 'center');
  const mPerMm = scara / 1000, tinta = 60 * mPerMm, pas = Math.pow(10, Math.floor(Math.log10(tinta)));
  const lung = [1, 2, 5].map(v => v * pas).filter(v => v <= tinta).pop(), lmm = lung / mPerMm;
  const x0 = pw - PDF_MARGINE_MM - lmm - 4, yb = ph - PDF_MARGINE_MM - 6.5;
  pdf.setLineWidth(0.15); pdf.setDrawColor('#000000');
  for (let k = 0; k < 4; k++) { pdf.setFillColor(k % 2 ? '#FFFFFF' : '#000000'); pdf.rect(x0 + k * lmm / 4, yb, lmm / 4, 2.5, 'FD'); }
  textPdf(pdf, '0', x0, yb - 1.5, 7, '#000000');
  textPdf(pdf, lung < 1000 ? `${lung} m` : `${lung / 1000} km`, x0 + lmm, yb - 1.5, 7, '#000000');
  textPdf(pdf, `Scara 1:${scara}`, x0 - 3, yb + 1.25, 9, '#000000', 0, 'right', 'center');
}

function coordonateRama(pdf, mx0, my0, dw, dh, z, scara) {
  let pas = Math.pow(10, Math.floor(Math.log10(scara / 10)));
  pas = [1, 2, 5, 10].map(v => v * pas).find(v => v * 1000 / scara >= 80) || pas * 10;
  const k = 1000 / scara;
  pdf.setDrawColor('#C8C8C8'); pdf.setLineWidth(0.07);
  for (let x = Math.ceil(z[0] / pas) * pas; x < z[2]; x += pas) {
    const X = mx0 + (x - z[0]) * k; pdf.line(X, my0, X, my0 + dh);
    textPdf(pdf, String(x), X, my0 - 1.5, 6, '#000000'); textPdf(pdf, String(x), X, my0 + dh + 2.5, 6, '#000000');
  }
  for (let y = Math.ceil(z[1] / pas) * pas; y < z[3]; y += pas) {
    const Y = my0 + (z[3] - y) * k; pdf.line(mx0, Y, mx0 + dw, Y);
    textPdf(pdf, String(y), mx0 - 1.8, Y, 6, '#000000', 90); textPdf(pdf, String(y), mx0 + dw + 1.8, Y, 6, '#000000', 90);
  }
}

// obiectul atinge efectiv dreptunghiul z? (nu doar dreptunghiul lui de incadrare)
function atingeZona(o, z) {
  for (const a of o.parti) {
    for (let i = 0; i < a.length; i += 2) if (a[i] >= z[0] && a[i] <= z[2] && a[i + 1] >= z[1] && a[i + 1] <= z[3]) return true;
    if (o.t !== 'P' && taieLinie(a, z).length) return true;
  }
  if (o.t === 'A') {                                   // poligon care acopera toata planșa
    const cx = (z[0] + z[2]) / 2, cy = (z[1] + z[3]) / 2; let in_ = false;
    for (const a of o.parti) for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2)
      if ((a[i + 1] > cy) !== (a[j + 1] > cy) && cx < (a[j] - a[i]) * (cy - a[i + 1]) / (a[j + 1] - a[i + 1]) + a[i]) in_ = !in_;
    return in_;
  }
  return false;
}

function clipDreptunghi(pdf, x, y, w, h) { pdf.saveGraphicsState(); pdf.rect(x, y, w, h, null); pdf.clip(); pdf.discardPath(); }

async function randeazaPdf(straturi, stiluri, ext, opt, log, progres) {
  const gen = general(stiluri);
  const plan = planificaPdf(ext, opt.format, opt.scara);
  const { format: fmt, orientare: ori, scara, nx, ny } = plan;
  const { pw, ph, dw, dh } = zonaDesenMm(fmt, ori);
  const latM = dw * scara / 1000, inaltM = dh * scara / 1000;
  const cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2, gx0 = cx - nx * latM / 2, gy1 = cy + ny * inaltM / 2;
  let planse = [];
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) planse.push({ r, c, z: [gx0 + c * latM, gy1 - (r + 1) * inaltM, gx0 + (c + 1) * latM, gy1 - r * inaltM] });
  const grila = [gx0, gy1 - ny * inaltM, gx0 + nx * latM, gy1];
  const ppm = (1000 / scara) / PX_PDF_MM, factor = opt.factorGrosime ?? (+gen.pdf_factor_grosime || 1);
  log(`PDF: ${fmt} ${ori}, scara 1:${scara}, ${nx} × ${ny} = ${nx * ny} planșe posibile`);
  const date = await incarcaDate(straturi, stiluri, grila, ppm, log, (f, m) => progres(f * 0.4, m));
  const areOb = z => date.pachete.some(({ ob }) => ob.some(o => o.bb[2] >= z[0] && o.bb[0] <= z[2] && o.bb[3] >= z[1] && o.bb[1] <= z[3] && atingeZona(o, z)));
  planse = planse.filter(p => areOb(p.z));
  if (planse.length > (+gen.pdf_max_planse || 300)) throw new Error(`Ar rezulta ${planse.length} planșe (limita ${gen.pdf_max_planse}). Alegeți o zonă mai mică sau o scară mai mică.`);
  planse.forEach((p, i) => p.nr = i + 1);
  const nrDe = {}; planse.forEach(p => nrDe[p.r + ',' + p.c] = p.nr);
  log(`Planșe cu conținut: ${planse.length}`);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'l' : 'p', compress: true });
  await fontPdf(pdf);
  const azi = new Date().toLocaleDateString('ro-RO');
  const titlu = opt.titlu || 'Plan';
  const ans = opt.ansamblu && planse.length > 1, prima = ans ? 2 : 1;   // numar de pagina jsPDF (1-based)
  const mx0 = PDF_MARGINE_MM, my0 = PDF_MARGINE_MM;
  if (ans) {
    progres(0.42, 'Desenez pagina de ansamblu');
    const sa = scaraAnsamblu(grila, fmt, ori), ka = 1000 / sa;
    const la = dw / ka, ha = dh / ka, ca = (grila[0] + grila[2]) / 2, cb = (grila[1] + grila[3]) / 2;
    const za = [ca - la / 2, cb - ha / 2, ca + la / 2, cb + ha / 2];
    clipDreptunghi(pdf, mx0, my0, dw, dh);
    deseneazaZona(penPdf(pdf, mx0, my0, ka, za, factor * 0.35), date, za, { etichete: false, puncte: false });
    pdf.restoreGraphicsState();
    pdf.setLineWidth(0.35); pdf.setDrawColor('#000000'); pdf.rect(mx0, my0, dw, dh, 'S');
    for (const p of planse) {
      const x = mx0 + (p.z[0] - za[0]) * ka, y = my0 + (za[3] - p.z[3]) * ka, w = (p.z[2] - p.z[0]) * ka, h = (p.z[3] - p.z[1]) * ka;
      pdf.setDrawColor('#0050C8'); pdf.setLineWidth(0.35); pdf.rect(x, y, w, h, 'S');
      const pt = Math.max(8, Math.min(40, w * 0.15 * 2.83));
      pdf.setFillColor('#FFFFFF'); const tw = pt * 0.2 * String(p.nr).length + 2;
      pdf.rect(x + w / 2 - tw / 2, y + h / 2 - pt * 0.22, tw, pt * 0.44, 'F');
      textPdf(pdf, String(p.nr), x + w / 2, y + h / 2, pt, '#0050C8');
      pdf.link(x, y, w, h, { pageNumber: prima + p.nr - 1 });
    }
    cartus(pdf, pw, ph, `${titlu} - plan de ansamblu (index planșe)`,
      `Atingeți o planșă pentru a o deschide (scara 1:${scara}).  |  ${planse.length} planșe ${fmt}  |  Stereo 70  |  ${azi}`, sa);
  }
  for (let i = 0; i < planse.length; i++) {
    const p = planse[i];
    if (ans || i > 0) pdf.addPage([pw, ph], pw > ph ? 'l' : 'p');
    progres(0.45 + 0.55 * i / planse.length, `Desenez planșa ${p.nr}/${planse.length}`);
    const k = 1000 / scara;
    clipDreptunghi(pdf, mx0, my0, dw, dh);
    deseneazaZona(penPdf(pdf, mx0, my0, k, p.z, factor), date, p.z, { marja: 2 });
    pdf.restoreGraphicsState();
    coordonateRama(pdf, mx0, my0, dw, dh, p.z, scara);
    pdf.setLineWidth(0.35); pdf.setDrawColor('#000000'); pdf.setLineDashPattern([], 0); pdf.rect(mx0, my0, dw, dh, 'S');
    const vec = [[-1, 0, 'N'], [1, 0, 'S'], [0, -1, 'V'], [0, 1, 'E']].filter(([dr, dc]) => nrDe[(p.r + dr) + ',' + (p.c + dc)]).map(([dr, dc, t]) => `${t}:${nrDe[(p.r + dr) + ',' + (p.c + dc)]}`);
    const det = [planse.length > 1 ? `Planșa ${p.nr} / ${planse.length}` : '', vec.length ? 'vecine ' + vec.join(' ') : '', 'Stereo 70 (EPSG:3844)', azi].filter(Boolean).join('  |  ');
    cartus(pdf, pw, ph, titlu, det, scara);
    if (ans) {
      textPdf(pdf, '▲ Plan de ansamblu', PDF_MARGINE_MM, ph - PDF_MARGINE_MM - 1.5, 8, '#0050C8', 0, 'left', 'center');
      pdf.link(PDF_MARGINE_MM, ph - PDF_MARGINE_MM - 4.5, 32, 4.5, { pageNumber: 1 });
    }
    await new Promise(r => setTimeout(r, 0));
  }
  if (ans) pdf.outline.add(null, 'Plan de ansamblu', { pageNumber: 1 });
  if (planse.length > 1) planse.forEach(p => pdf.outline.add(null, `Planșa ${p.nr}`, { pageNumber: prima + p.nr - 1 }));
  pdf.setProperties({ title: titlu, creator: `GDB2PNG mobil ${VERSIUNE}` });
  progres(0.98, 'Salvez PDF-ul');
  const blob = pdf.output('blob');
  log(`Gata: ${planse.length} planșe ${fmt} ${ori}, scara 1:${scara}, ${(blob.size / 1e6).toFixed(1)} MB`);
  return { blob, plan, n: planse.length };
}

// ------------------------------------------------------------------ vizualizare pe ecran (tab Harta)

// citeste geometriile straturilor (fara etichete precalculate); etichetele se calculeaza la fiecare vedere
async function incarcaPachete(straturi, stiluri, bbox, progres) {
  const ord = straturi.slice().sort((a, b) => ((+stilStrat(stiluri, a).ordine || 50) - (+stilStrat(stiluri, b).ordine || 50)) || a.localeCompare(b));
  const pachete = [];
  for (let i = 0; i < ord.length; i++) {
    const nume = ord[i], st = stilStrat(stiluri, nume); st._z = +st.ordine || 50;
    const s = GDB.straturi.find(x => x.nume === nume); if (!s) continue;
    progres && progres(i / ord.length, `Citesc ${nume} (${i + 1}/${ord.length})`);
    const adn = st.tip === 'adnotare' || (s.campuri.includes('TextString') && s.campuri.includes('Angle'));
    let cols = adn ? ['TextString', 'Angle', 'Height'] : campuriDinEticheta(st.eticheta);
    if (!adn && cols.some(c => !s.campuri.includes(c))) { st.eticheta = null; cols = []; }
    try {
      const ob = await citesteStrat(nume, bbox, cols.filter(c => s.campuri.includes(c)));
      if (ob.length) pachete.push({ st, ob, adn, nume });
    } catch (e) { console.warn(nume, e); }
  }
  return pachete;
}

// deseneaza vederea curenta: centru (cx, cy), ppm = pixeli CSS pe metru
function randeazaVedere(ctx, W, H, dpr, v, pachete, stiluri) {
  const gen = general(stiluri);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = gen.fundal || '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  const ox = v.cx - W / 2 / v.ppm, oy = v.cy + H / 2 / v.ppm;
  const vedere = [ox, oy - H / v.ppm, ox + W / v.ppm, oy], m = 20 / v.ppm;
  const inV = o => o.bb[2] >= vedere[0] - m && o.bb[0] <= vedere[2] + m && o.bb[3] >= vedere[1] - m && o.bb[1] <= vedere[3] + m;
  // grosimile din simbolizare sunt gandite pentru PNG-ul de ~3 px/m (24000 px pe un UAT);
  // pe ecran se subtiaza cand vedem de departe si se ingroasa putin de aproape
  const scala = Math.max(0.3, Math.min(1.6, Math.sqrt(v.ppm / 3)));
  const pen = penCanvas(ctx, ox, oy, v.ppm, null, scala);
  let etichete = [], n = 0;
  for (const p of pachete) {
    const ob = p.ob.filter(inV); if (!ob.length) continue;
    n += ob.length;
    if (p.adn) { etichete = etichete.concat(calculeazaAdnotari(ob, p.st, v.ppm, gen)); continue; }
    pen.strat(p.st, ob, { puncte: v.ppm >= 0.8 });   // de departe simbolurile punctuale se ascund (ar forma benzi)
    if (p.st.eticheta) etichete = etichete.concat(calculeazaEtichete(ob, p.st, v.ppm, gen, vedere));
  }
  if (gen.evita_suprapunerea) etichete = eliminaSuprapuneri(etichete);
  etichete.sort((a, b) => a.z - b.z).forEach(e => pen.text(e));
  return { obiecte: n, etichete: etichete.length, vedere };
}


// ------------------------------------------------------------------ cautare si identificare (tab Harta)

const CAMPURI_FARA_CAUTARE = /^(Shape_|FID|OBJECTID|GlobalID|Secvential|ID_)/i;
function campuriCautare(s) {
  const r = [];
  for (const c of s.campuri) {
    if (CAMPURI_FARA_CAUTARE.test(c)) continue;
    const t = (s.tipuri || {})[c] || 'String';
    if (/String/i.test(t)) r.push(`"${c}"`);
    else if (/^Integer/i.test(t)) r.push(`CAST("${c}" AS CHARACTER(32))`);
  }
  return r;
}

// cauta textul (toate cuvintele) in campurile text/intregi ale straturilor date, in zona bbox
async function cautaInGdb(text, straturi, bbox, maxPeStrat = 30, maxTotal = 120) {
  const cuv = text.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/'/g, "''").replace(/[%_]/g, ''));
  if (!cuv.length) return [];
  const rez = [];
  for (const nume of straturi) {
    const s = GDB.straturi.find(x => x.nume === nume); if (!s) continue;
    const cc = campuriCautare(s); if (!cc.length) continue;
    const where = cuv.map(w => '(' + cc.map(c => `${c} ILIKE '%${w}%'`).join(' OR ') + ')').join(' AND ');
    try {
      const gj = await ogrGeoJSON(['-spat', ...bbox.map(String), '-limit', String(maxPeStrat), '-sql', `SELECT * FROM "${nume}" WHERE ${where}`]);
      for (const f of gj.features) {
        const o = compacteaza(f); if (!o) continue;
        // potriviri exacte (ex. numar postal "24" fata de "124") primesc prioritate
        const vals = Object.values(o.p).map(v => valText(v).toLowerCase());
        const exact = cuv.filter(w => vals.includes(w.toLowerCase())).length;
        rez.push({ nume, ob: o, exact });
      }
    } catch (e) { console.warn('cautare', nume, e); }
    if (rez.length >= maxTotal) break;
  }
  return rez.sort((a, b) => b.exact - a.exact).slice(0, maxTotal);
}

// toate atributele unui obiect gasit pe harta (cache-ul pastreaza doar campurile etichetei)
async function atributeObiect(nume, o) {
  const e = 0.01, bb = [o.bb[0] - e, o.bb[1] - e, o.bb[2] + e, o.bb[3] + e];
  const gj = await ogrGeoJSON(['-spat', ...bb.map(String), '-sql', `SELECT * FROM "${nume}"`]);
  let best = null, bd = Infinity;
  for (const f of gj.features) {
    const c = compacteaza(f); if (!c) continue;
    const d = Math.abs(c.bb[0] - o.bb[0]) + Math.abs(c.bb[1] - o.bb[1]) + Math.abs(c.bb[2] - o.bb[2]) + Math.abs(c.bb[3] - o.bb[3]);
    if (d < bd) { bd = d; best = c; }
  }
  return best ? best.p : o.p;
}

function distSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inPoligon(px, py, o) {
  let in_ = false;
  for (const a of o.parti) for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2)
    if ((a[i + 1] > py) !== (a[j + 1] > py) && px < (a[j] - a[i]) * (py - a[i + 1]) / (a[j + 1] - a[i + 1]) + a[i]) in_ = !in_;
  return in_;
}
// obiectul de sub deget: intai puncte, apoi linii/contururi, apoi interior de poligon; stratul de deasupra are prioritate
function identifica(pachete, mx, my, tol) {
  const cand = [];
  for (const p of pachete) {
    if (p.adn) continue;
    for (const o of p.ob) {
      if (o.bb[0] > mx + tol * 2 || o.bb[2] < mx - tol * 2 || o.bb[1] > my + tol * 2 || o.bb[3] < my - tol * 2) continue;
      if (o.t === 'P') {
        for (const a of o.parti) for (let i = 0; i < a.length; i += 2) { const d = Math.hypot(a[i] - mx, a[i + 1] - my); if (d <= tol * 1.5) cand.push({ p, o, cls: 0, d }); }
      } else {
        let dm = Infinity;
        for (const a of o.parti) for (let i = 0; i + 3 < a.length; i += 2) dm = Math.min(dm, distSegment(mx, my, a[i], a[i + 1], a[i + 2], a[i + 3]));
        if (dm <= tol) cand.push({ p, o, cls: 1, d: dm });
        else if (o.t === 'A' && inPoligon(mx, my, o)) cand.push({ p, o, cls: 2, d: 0 });
      }
    }
  }
  cand.sort((a, b) => a.cls - b.cls || (b.p.st._z - a.p.st._z) || a.d - b.d);
  return cand[0] || null;
}

// evidentierea obiectului ales (peste harta)
function deseneazaSelectie(ctx, W, H, dpr, v, o) {
  if (!o) return;
  const ox = v.cx - W / 2 / v.ppm, oy = v.cy + H / 2 / v.ppm;
  const X = x => (x - ox) * v.ppm, Y = y => (oy - y) * v.ppm;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const cale = () => { ctx.beginPath(); for (const a of o.parti) { for (let i = 0; i < a.length; i += 2) i ? ctx.lineTo(X(a[i]), Y(a[i + 1])) : ctx.moveTo(X(a[i]), Y(a[i + 1])); if (o.t === 'A') ctx.closePath(); } };
  if (o.t === 'P') {
    for (const a of o.parti) for (let i = 0; i < a.length; i += 2) {
      ctx.beginPath(); ctx.arc(X(a[i]), Y(a[i + 1]), 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,200,255,0.30)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#00A6D6'; ctx.stroke();
    }
    return;
  }
  if (o.t === 'A') { cale(); ctx.fillStyle = 'rgba(0,200,255,0.22)'; ctx.fill('evenodd'); }
  cale(); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,200,255,0.45)'; ctx.stroke();
  cale(); ctx.lineWidth = 2; ctx.strokeStyle = '#00A6D6'; ctx.stroke();
}
