/* GDB2PNG mobil - interfata */
'use strict';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const CHEIE_STIL = 'gdb2png.stiluri', CHEIE_SET = 'gdb2png.setari';
const UI = { stiluri: null, bifate: {}, numere: {}, titluNumere: 'total', lucreaza: false, url: [] };

function citesteLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function scrieLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
function salveazaStiluri() { scrieLS(CHEIE_STIL, UI.stiluri); }
function setari() { return citesteLS(CHEIE_SET) || {}; }
function salveazaSetari() {
  scrieLS(CHEIE_SET, {
    zona: modZona(), uat: $('#selUat').value, xmin: $('#xmin').value, ymin: $('#ymin').value, xmax: $('#xmax').value, ymax: $('#ymax').value,
    margine: $('#margine').value, rez: $('input[name=rez]:checked').value, latime: $('#latime').value, scaraPng: $('#scaraPng').value, dpi: $('#dpi').value,
    formatPdf: $('#formatPdf').value, scaraPdf: $('#scaraPdf').value, ansamblu: $('#ansamblu').checked, bifate: UI.bifate
  });
}
const fmtNr = n => n === null || n === undefined ? '?' : n.toLocaleString('ro-RO');
const stil = n => stilStrat(UI.stiluri, n);
const editabil = n => (UI.stiluri[n] = UI.stiluri[n] || {});

function log(m) { const j = $('#jurnal'); j.textContent += m + '\n'; j.scrollTop = j.scrollHeight; console.log(m); }
function progres(f, m) { $('#progres').value = f; if (m) $('#stare').textContent = m; }

// ------------------------------------------------------------------ tab-uri
$$('nav button').forEach(b => b.onclick = () => {
  $$('nav button').forEach(x => x.classList.toggle('activ', x === b));
  $$('.tab').forEach(t => t.classList.toggle('activ', t.id === 'tab-' + b.dataset.tab));
  document.querySelector('main').classList.toggle('lat', b.dataset.tab === 'harta');
  window.scrollTo(0, 0);
  if (b.dataset.tab === 'harta') hartaActiva();
});
function mergiLa(tab) { $(`nav button[data-tab=${tab}]`).click(); }

// ------------------------------------------------------------------ simbolizare
function initStiluri() {
  UI.stiluri = citesteLS(CHEIE_STIL) || JSON.parse(JSON.stringify(STILURI_IMPLICITE));
  $('#infoStil').textContent = citesteLS(CHEIE_STIL) ? 'Simbolizare salvată în telefon.' : 'Simbolizarea implicită (din GDB2PNG Windows).';
}
$('#inStil').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (typeof j !== 'object' || Array.isArray(j)) throw new Error('format necunoscut');
    UI.stiluri = j; salveazaStiluri();
    $('#infoStil').textContent = `Simbolizare importată din ${f.name}.`;
    construiesteLista();
  } catch (err) { alert('Nu pot citi simbolizarea: ' + err.message); }
  e.target.value = '';
};
$('#btnExportStil').onclick = () => descarca(new Blob([JSON.stringify(UI.stiluri, null, 2)], { type: 'application/json' }), 'stiluri.json');
$('#btnResetStil').onclick = () => {
  if (!confirm('Reveniți la simbolizarea implicită? Modificările din telefon se pierd.')) return;
  UI.stiluri = JSON.parse(JSON.stringify(STILURI_IMPLICITE)); salveazaStiluri();
  $('#infoStil').textContent = 'Simbolizarea implicită (din GDB2PNG Windows).'; construiesteLista();
};

// ------------------------------------------------------------------ baza de date
$('#inGdb').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $('#infoGdb').classList.remove('err');
  $('#infoGdb').textContent = `Deschid ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`;
  $('#antet').textContent = 'Se încarcă…';
  try {
    await deschideGdb(f, log);
    const tot = GDB.straturi.reduce((s, x) => s + (x.total || 0), 0);
    $('#infoGdb').textContent = `${GDB.nume}\n${GDB.straturi.length} straturi, ${fmtNr(tot)} obiecte` + (GDB.uats.length ? `, ${GDB.uats.length} UAT-uri` : '\nFără LimitaUAT/DenumireUAT: zona se alege din extindere sau coordonate.');
    $('#antet').textContent = GDB.nume;
    const s = setari();
    UI.bifate = {};
    for (const x of GDB.straturi) UI.bifate[x.nume] = s.bifate && x.nume in s.bifate ? s.bifate[x.nume] : !!stil(x.nume).implicit;
    UI.numere = {}; UI.titluNumere = 'total';
    construiesteUat(); construiesteLista();
    if (modZona() !== 'tot') actualizeazaNumere();
    mergiLa('straturi');
  } catch (err) {
    $('#infoGdb').textContent = 'Eroare: ' + (err.message || err); $('#infoGdb').classList.add('err');
    $('#antet').textContent = 'Nicio bază de date încărcată';
  }
  e.target.value = '';
};

// ------------------------------------------------------------------ lista de straturi
const TIP_SCURT = t => t.replace(/^Multi/, '').replace('LineString', 'linie').replace('Polygon', 'poligon').replace('Point', 'punct').replace(/ ?Z$| ?M$| ?ZM$/, '');

function construiesteLista() {
  const box = $('#listaStraturi');
  if (!GDB.straturi.length) { box.innerHTML = '<p class="nota">Încărcați întâi o bază de date (tab-ul Date).</p>'; return; }
  const ord = GDB.straturi.slice().sort((a, b) => ((+stil(a.nume).ordine || 50) - (+stil(b.nume).ordine || 50)) || a.nume.localeCompare(b.nume));
  box.innerHTML = '';
  for (const s of ord) {
    const st = stil(s.nume), adn = st.tip === 'adnotare';
    const areUmpl = !adn && /Polygon|Point/i.test(s.tip);
    const d = document.createElement('div'); d.className = 'strat'; d.dataset.nume = s.nume;
    d.innerHTML = `
      <div class="sus"><input type="checkbox" ${UI.bifate[s.nume] ? 'checked' : ''}>
        <div class="nume">${s.nume} <span class="tip">${TIP_SCURT(s.tip)}</span></div><div class="nr"></div></div>
      <div class="jos">
        ${adn ? '' : `<input type="color" class="cul c-linie" value="${st.culoare || '#000000'}" title="Culoare linie">`}
        ${areUmpl ? `<div class="umpl"><input type="color" class="cul c-umpl" value="${st.umplere || '#C8C8C8'}" title="Umplere"><div class="x" ${st.umplere ? 'hidden' : ''}>∅</div><button class="sterge" title="Fără umplere" ${st.umplere ? '' : 'hidden'}>✕</button></div>` : ''}
        <button class="tbtn" title="Etichetă">T</button>
        ${adn ? '<span class="nota">adnotări ArcGIS</span>' : `<input type="number" class="grosime" step="0.25" min="0" value="${+(st.latime_px ?? 1)}" inputmode="decimal" title="Grosime (px)">
        <select class="stil">${Object.entries(STILURI_LINIE).map(([k, v]) => `<option value="${v}" ${((st.stil_linie || 'solid') === v) ? 'selected' : ''}>${k}</option>`).join('')}</select>`}
      </div>`;
    box.appendChild(d);
    d.querySelector('input[type=checkbox]').onchange = ev => { UI.bifate[s.nume] = ev.target.checked; salveazaSetari(); };
    const cl = d.querySelector('.c-linie'); if (cl) cl.oninput = ev => { editabil(s.nume).culoare = ev.target.value.toUpperCase(); salveazaStiluri(); };
    const cu = d.querySelector('.c-umpl');
    if (cu) {
      // pătratul de umplere este chiar selectorul de culoare (atingere directă - merge și pe iPhone)
      const x = d.querySelector('.umpl .x'), sterge = d.querySelector('.umpl .sterge');
      const seteaza = v => { editabil(s.nume).umplere = v; x.hidden = !!v; sterge.hidden = !v; salveazaStiluri(); };
      cu.oninput = cu.onchange = ev => seteaza(ev.target.value.toUpperCase());
      sterge.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); seteaza(null); };
      cu.addEventListener('contextmenu', ev => { ev.preventDefault(); seteaza(null); });
    }
    const tb = d.querySelector('.tbtn'); coloreazaT(tb, st);
    tb.onclick = () => adn ? null : deschideEticheta(s, tb);
    const gr = d.querySelector('.grosime'); if (gr) gr.onchange = ev => { const v = Math.max(0, +String(ev.target.value).replace(',', '.') || 0); editabil(s.nume).latime_px = v; salveazaStiluri(); };
    const sl = d.querySelector('.stil'); if (sl) sl.onchange = ev => { editabil(s.nume).stil_linie = ev.target.value; salveazaStiluri(); };
  }
  arataNumere();
}
function coloreazaT(b, st) {
  if (st.eticheta || st.tip === 'adnotare') { b.style.background = st.culoare_text || '#000'; b.style.color = '#fff'; }
  else { b.style.background = '#EEF0F2'; b.style.color = '#A0A7AF'; }
}
function arataNumere() {
  const zona = UI.titluNumere !== 'total';
  $('#antetZona').textContent = `Nr. obiecte: ${zona ? UI.titluNumere : 'total în GDB'}`;
  for (const d of $$('#listaStraturi .strat')) {
    const s = GDB.straturi.find(x => x.nume === d.dataset.nume);
    const n = zona ? UI.numere[s.nume] : s.total;
    const el = d.querySelector('.nr'); el.textContent = n === '…' ? '…' : fmtNr(n); el.classList.toggle('zero', !n);
  }
}

$$('[data-bif]').forEach(b => b.onclick = () => {
  for (const s of GDB.straturi) UI.bifate[s.nume] = b.dataset.bif === 'toate' ? true : b.dataset.bif === 'niciunul' ? false : !!stil(s.nume).implicit;
  salveazaSetari(); construiesteLista();
});
function scaleaza(f) {
  for (const s of GDB.straturi) { const st = stil(s.nume); if (st.tip !== 'adnotare' && st.latime_px !== undefined) editabil(s.nume).latime_px = Math.round(+st.latime_px * f * 100) / 100; }
  salveazaStiluri(); construiesteLista();
}
$('#btnLiniiMinus').onclick = () => scaleaza(0.75);
$('#btnLiniiPlus').onclick = () => scaleaza(1 / 0.75);
$('#btnContinue').onclick = () => { for (const [k, v] of Object.entries(UI.stiluri)) if (v && typeof v === 'object' && v.stil_linie && v.stil_linie !== 'solid') v.stil_linie = 'solid'; salveazaStiluri(); construiesteLista(); };

// ------------------------------------------------------------------ dialog eticheta
let ET = null;
function deschideEticheta(s, btn) {
  const st = stil(s.nume); ET = { s, btn };
  $('#etTitlu').textContent = `Etichetă – ${s.nume}`;
  $('#etText').value = st.eticheta || '';
  $('#etH').value = +(st.inaltime_text_m ?? 1.5); $('#etMin').value = +(st.text_minim_px ?? 5); $('#etDec').value = +(st.decalaj_linie_m ?? 0);
  $('#etCul').value = st.culoare_text || st.culoare || '#000000'; $('#etScurte').checked = !!st.eticheta_linii_scurte;
  const ch = $('#etCampuri'); ch.innerHTML = '';
  for (const c of s.campuri) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = c;
    b.onclick = () => { let t = $('#etText').value.trim(); if (t && !t.includes('{')) t = '{' + t + '}'; $('#etText').value = (t ? t + ' ' : '') + '{' + c + '}'; };
    ch.appendChild(b);
  }
  $('#modalEt').classList.add('vizibil');
}
function inchideEticheta() { $('#modalEt').classList.remove('vizibil'); ET = null; }
$('#etRenunta').onclick = inchideEticheta;
$('#modalEt').onclick = e => { if (e.target.id === 'modalEt') inchideEticheta(); };
$('#etFara').onclick = () => { delete editabil(ET.s.nume).eticheta; salveazaStiluri(); coloreazaT(ET.btn, stil(ET.s.nume)); inchideEticheta(); };
$('#etOk').onclick = () => {
  const t = $('#etText').value.trim(), lipsa = campuriDinEticheta(t).filter(c => !ET.s.campuri.includes(c));
  if (lipsa.length) { alert(`Câmpuri inexistente în ${ET.s.nume}: ${lipsa.join(', ')}`); return; }
  const ed = editabil(ET.s.nume);
  if (t) Object.assign(ed, { eticheta: t, inaltime_text_m: +$('#etH').value || 1.5, text_minim_px: +$('#etMin').value || 0, decalaj_linie_m: +$('#etDec').value || 0,
    culoare_text: $('#etCul').value.toUpperCase(), eticheta_linii_scurte: $('#etScurte').checked, prioritate_eticheta: ed.prioritate_eticheta ?? 50 });
  else delete ed.eticheta;
  salveazaStiluri(); coloreazaT(ET.btn, stil(ET.s.nume)); inchideEticheta();
};

// ------------------------------------------------------------------ zona
const modZona = () => $('input[name=zona]:checked').value;
function construiesteUat() {
  const sel = $('#selUat'), s = setari();
  sel.innerHTML = GDB.uats.map(u => `<option>${u}</option>`).join('');
  const are = GDB.uats.length > 0;
  sel.disabled = !are; $('#radUat').disabled = !are;
  $('#infoUat').textContent = are ? '' : 'UAT indisponibil: GDB-ul nu are stratul LimitaUAT cu câmpul DenumireUAT.';
  if (are && s.uat && GDB.uats.includes(s.uat)) sel.value = s.uat;
  if (!are && modZona() === 'uat') $('input[name=zona][value=tot]').checked = true;
}
$$('input[name=zona]').forEach(r => r.onchange = () => { salveazaSetari(); actualizeazaNumere(); });
$('#selUat').onchange = () => { $('input[name=zona][value=uat]').checked = true; salveazaSetari(); actualizeazaNumere(); };
['#xmin', '#ymin', '#xmax', '#ymax'].forEach(id => $(id).onchange = () => { if (modZona() === 'coord') { salveazaSetari(); actualizeazaNumere(); } });
$('#margine').onchange = salveazaSetari;
$('#btnNumara').onclick = () => actualizeazaNumere(true);

async function determinaZona() {
  const marg = +$('#margine').value || 0, mod = modZona();
  if (mod === 'uat') {
    const u = $('#selUat').value; if (!u) throw new Error('Alegeți un UAT.');
    const g = await geometrieUat(u);
    return { ext: [g.bb[0] - marg, g.bb[1] - marg, g.bb[2] + marg, g.bb[3] + marg], titlu: `UAT ${u}`, uat: g, nume: u };
  }
  if (mod === 'coord') {
    const v = ['#xmin', '#ymin', '#xmax', '#ymax'].map(id => parseFloat(String($(id).value).replace(',', '.')));
    if (v.some(isNaN)) throw new Error('Completați toate cele 4 coordonate Stereo 70.');
    const b = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
    return { ext: [b[0] - marg, b[1] - marg, b[2] + marg, b[3] + marg], titlu: 'Zona din coordonate', box: b };
  }
  const bif = straturiBifate(); if (!bif.length) throw new Error('Bifați cel puțin un strat.');
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of bif) { const e = (GDB.straturi.find(x => x.nume === n) || {}).extent; if (e && e.length === 4 && e[2] > e[0]) b = [Math.min(b[0], e[0]), Math.min(b[1], e[1]), Math.max(b[2], e[2]), Math.max(b[3], e[3])]; }
  if (!isFinite(b[0])) throw new Error('Straturile bifate nu au obiecte.');
  return { ext: [b[0] - marg, b[1] - marg, b[2] + marg, b[3] + marg], titlu: GDB.nume };
}
const straturiBifate = () => GDB.straturi.filter(s => UI.bifate[s.nume]).map(s => s.nume);

let TOKEN = 0;
async function actualizeazaNumere(manual) {
  if (!GDB.ds) { if (manual) alert('Încărcați întâi o bază de date.'); return; }
  const tok = ++TOKEN;
  if (modZona() === 'tot') { UI.titluNumere = 'total'; arataNumere(); $('#infoZona').textContent = 'Numerele sunt totalurile din GDB.'; return; }
  let z;
  try { z = await determinaZona(); } catch (e) { $('#infoZona').textContent = e.message; return; }
  UI.titluNumere = z.nume || 'coordonate';
  GDB.straturi.forEach(s => UI.numere[s.nume] = '…'); arataNumere();
  $('#infoZona').textContent = 'Număr obiectele din zonă…';
  const bbox = z.uat ? z.uat.bb : z.box;
  const inMasca = z.uat ? mascaPoligon(z.uat.inele, z.uat.bb) : null;
  const goale = [];
  for (let i = 0; i < GDB.straturi.length; i++) {
    if (tok !== TOKEN) return;
    const s = GDB.straturi[i], st = stil(s.nume);
    const cols = st.tip === 'adnotare' ? ['TextString', 'Angle', 'Height'] : campuriDinEticheta(st.eticheta);
    try {
      const ob = await citesteStrat(s.nume, z.ext, cols.filter(c => s.campuri.includes(c)));
      const inZona = ob.filter(o => o.bb[2] >= bbox[0] && o.bb[0] <= bbox[2] && o.bb[3] >= bbox[1] && o.bb[1] <= bbox[3] && (!inMasca || obiectInMasca(o, inMasca)));
      UI.numere[s.nume] = inZona.length;
      if (!inZona.length && UI.bifate[s.nume]) goale.push(s.nume);
    } catch (e) { UI.numere[s.nume] = null; }
    if (i % 4 === 3) arataNumere();
    $('#infoZona').textContent = `Număr obiectele din zonă… ${i + 1}/${GDB.straturi.length}`;
  }
  if (tok !== TOKEN) return;
  arataNumere();
  $('#infoZona').textContent = `Gata: ${z.titlu}.` + (goale.length ? `\nStraturi bifate fără obiecte în zonă: ${goale.join(', ')}` : '');
}

// ------------------------------------------------------------------ generare
function descarca(blob, nume) {
  const url = URL.createObjectURL(blob); UI.url.push(url);
  const a = document.createElement('a'); a.href = url; a.download = nume; document.body.appendChild(a); a.click(); a.remove();
  return url;
}
function legatura(blob, nume, text) {
  const url = URL.createObjectURL(blob); UI.url.push(url);
  const a = document.createElement('a'); a.href = url; a.download = nume; a.textContent = text; $('#rezultat').appendChild(a);
  if (navigator.canShare) {
    try {
      const f = new File([blob], nume, { type: blob.type });
      if (navigator.canShare({ files: [f] })) {
        const b = document.createElement('button'); b.className = 'btn mic'; b.textContent = `Partajează / Salvează în Fișiere: ${nume}`;
        b.onclick = () => navigator.share({ files: [f], title: nume }).catch(() => { }); $('#rezultat').appendChild(b);
      }
    } catch (e) { }
  }
}
function numeFisier(z, ext, sufix = '') {
  const baza = (z.nume ? `UAT_${z.nume}` : (GDB.nume || 'plan').replace(/\.gdb$/i, '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');
  return `${baza}${sufix}.${ext}`;
}
function blocheaza(da) { UI.lucreaza = da; ['#btnPng', '#btnPdf', '#btnNumara', '#inGdb'].forEach(id => $(id).disabled = da); }
function parametriPng() {
  return $('input[name=rez]:checked').value === 'latime' ? { latime: +$('#latime').value || 24000 } : { scara: +$('#scaraPng').value || 1000, dpi: +$('#dpi').value || 200 };
}

$('#btnDim').onclick = async () => {
  try { const z = await determinaZona(); const d = calculeazaDimensiuni(z.ext, ...Object.values(Object.assign({ latime: 0, scara: 0, dpi: 0 }, parametriPng())));
    $('#infoDim').textContent = `${d.w} × ${d.h} px (${Math.round(d.w * d.h / 1e6)} MP)\nZona: ${Math.round(z.ext[2] - z.ext[0])} × ${Math.round(z.ext[3] - z.ext[1])} m, ${(1 / d.ppm).toFixed(3)} m/pixel`;
  } catch (e) { $('#infoDim').textContent = 'Eroare: ' + e.message; }
};
$('#btnPlanse').onclick = async () => {
  try { const z = await determinaZona(); const p = planificaPdf(z.ext, $('#formatPdf').value, +$('#scaraPdf').value || 1000);
    $('#infoPlanse').textContent = `${p.format} ${p.orientare}, scara 1:${p.scara}: ` + (p.nx * p.ny === 1 ? 'o singură planșă' : `grilă ${p.nx} × ${p.ny} = ${p.nx * p.ny} planșe (cele goale se omit)`);
  } catch (e) { $('#infoPlanse').textContent = 'Eroare: ' + e.message; }
};

async function genereaza(tip) {
  if (UI.lucreaza) return;
  if (!GDB.ds) { alert('Încărcați întâi o bază de date (tab-ul Date).'); mergiLa('date'); return; }
  const bif = straturiBifate(); if (!bif.length) { alert('Bifați cel puțin un strat.'); mergiLa('straturi'); return; }
  salveazaSetari(); blocheaza(true); $('#rezultat').innerHTML = ''; $('#jurnal').textContent = ''; progres(0, 'Pregătesc…');
  UI.url.forEach(u => URL.revokeObjectURL(u)); UI.url = [];
  const t0 = performance.now();
  try {
    const z = await determinaZona();
    if (tip === 'png') {
      const r = await randeazaPng(bif, UI.stiluri, z.ext, parametriPng(), log, progres);
      const nume = numeFisier(z, 'png');
      legatura(r.blob, nume, `⬇ Descarcă ${nume} (${r.w} × ${r.h} px, ${(r.blob.size / 1e6).toFixed(1)} MB)`);
      legatura(new Blob([r.pgw], { type: 'text/plain' }), nume.replace(/\.png$/, '.pgw'), `⬇ Fișier de georeferențiere ${nume.replace(/\.png$/, '.pgw')}`);
    } else {
      const g = Math.max(0.05, (+$('#grosimePdf').value || 100) / 100);
      editabil('_general').pdf_factor_grosime = g; salveazaStiluri();
      const sc = +$('#scaraPdf').value || 1000;
      const r = await randeazaPdf(bif, UI.stiluri, z.ext, { format: $('#formatPdf').value, scara: sc, ansamblu: $('#ansamblu').checked, titlu: z.titlu, factorGrosime: g }, log, progres);
      const nume = numeFisier(z, 'pdf', `_1-${sc}`);
      legatura(r.blob, nume, `⬇ Descarcă ${nume} (${r.n} planșe ${r.plan.format}, ${(r.blob.size / 1e6).toFixed(1)} MB)`);
    }
    progres(1, `Gata în ${Math.round((performance.now() - t0) / 1000)} s.`);
  } catch (e) {
    progres(0, 'Eroare: ' + (e.message || e)); log(String(e && e.stack || e));
    alert('Eroare: ' + (e.message || e));
  } finally { blocheaza(false); }
}
$('#btnPng').onclick = () => genereaza('png');
$('#btnPdf').onclick = () => genereaza('pdf');

// ------------------------------------------------------------------ pornire
function restaureazaSetari() {
  const s = setari(), g = general(UI.stiluri);
  if (s.zona) { const r = $(`input[name=zona][value=${s.zona}]`); if (r) r.checked = true; }
  for (const k of ['xmin', 'ymin', 'xmax', 'ymax', 'margine']) if (s[k] !== undefined) $('#' + k).value = s[k];
  $('#latime').value = s.latime || g.latime_implicita_px; $('#scaraPng').value = s.scaraPng || g.scara_implicita; $('#dpi').value = s.dpi || g.dpi_implicit;
  if (s.rez) { const r = $(`input[name=rez][value=${s.rez}]`); if (r) r.checked = true; }
  $('#formatPdf').value = s.formatPdf || g.pdf_format_implicit || 'Auto'; $('#scaraPdf').value = s.scaraPdf || g.pdf_scara_implicita;
  $('#ansamblu').checked = s.ansamblu !== false; $('#grosimePdf').value = Math.round((+g.pdf_factor_grosime || 1) * 100);
}
['#latime', '#scaraPng', '#dpi', '#formatPdf', '#scaraPdf', '#ansamblu'].forEach(id => $(id).addEventListener('change', salveazaSetari));
$$('input[name=rez]').forEach(r => r.addEventListener('change', salveazaSetari));

initStiluri(); restaureazaSetari();
$('#versiune').textContent = `Versiunea ${VERSIUNE}`;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
initGdal().catch(e => log('GDAL: ' + e));   // incarca motorul GDAL in fundal


// ------------------------------------------------------------------ tab Harta: vizualizare cu marire din degete
const HR = { v: null, pachete: null, semn: '', ext: null, snap: null, snapV: null, ptr: new Map(), tmr: null, ultimTap: null, lucreaza: false };
const cvH = $('#harta'), ctxH = cvH.getContext('2d');
const dprH = () => Math.min(window.devicePixelRatio || 1, 3);

function dimensiuneHarta() {
  const box = $('#hartaBox');
  const h = window.innerHeight - $('header').offsetHeight - $('nav').offsetHeight;
  box.style.height = Math.max(240, h) + 'px';
  const W = box.clientWidth, H = box.clientHeight, d = dprH();
  if (cvH.width !== Math.round(W * d) || cvH.height !== Math.round(H * d)) { cvH.width = Math.round(W * d); cvH.height = Math.round(H * d); return true; }
  return false;
}
const WH = () => [$('#hartaBox').clientWidth, $('#hartaBox').clientHeight];
function mesajHarta(t) { $('#hMesaj').textContent = t || ''; $('#hMesaj').style.display = t ? 'flex' : 'none'; }

async function hartaActiva() {
  dimensiuneHarta();
  if (!GDB.ds) { mesajHarta('Încărcați întâi o bază de date (tab-ul Date).'); return; }
  const bif = straturiBifate();
  if (!bif.length) { mesajHarta('Bifați cel puțin un strat (tab-ul Straturi).'); return; }
  let z;
  try { z = await determinaZona(); } catch (e) { mesajHarta(e.message); return; }
  const semn = JSON.stringify([z.ext, bif, UI.stiluri]);
  if (semn !== HR.semn || !HR.pachete) {
    if (HR.lucreaza) return;
    HR.lucreaza = true; mesajHarta('');
    $('#hInfo').textContent = 'Citesc datele zonei…';
    try {
      HR.pachete = await incarcaPachete(bif, UI.stiluri, z.ext, (f, m) => { $('#hBara').style.transform = `scaleX(${f})`; $('#hInfo').textContent = m; });
    } catch (e) { mesajHarta('Eroare: ' + (e.message || e)); HR.lucreaza = false; return; }
    $('#hBara').style.transform = 'scaleX(0)';
    const zonaNoua = !HR.ext || HR.ext.join() !== z.ext.join();
    HR.ext = z.ext; HR.semn = semn; HR.titlu = z.titlu; HR.lucreaza = false;
    if (zonaNoua) { inchideFisa(false); ascundeRezultate(); }
    if (zonaNoua || !HR.v) incadreaza();
  }
  if (!HR.pachete.length) mesajHarta('Straturile bifate nu au obiecte în zona aleasă.'); else mesajHarta('');
  randeazaHarta();
}

function incadreaza() {
  const [W, H] = WH(), e = HR.ext;
  HR.v = { cx: (e[0] + e[2]) / 2, cy: (e[1] + e[3]) / 2, ppm: Math.min(W / (e[2] - e[0]), H / (e[3] - e[1])) * 0.96 };
}
function limiteaza() {
  const [W, H] = WH(), e = HR.ext; if (!e) return;
  const fit = Math.min(W / (e[2] - e[0]), H / (e[3] - e[1]));
  HR.v.ppm = Math.max(fit / 4, Math.min(HR.v.ppm, 400));            // max 400 px/m (detaliu de 2,5 mm)
}

function randeazaHarta() {
  if (!HR.pachete || !HR.v) return;
  dimensiuneHarta();
  const [W, H] = WH(), d = dprH();
  const t0 = performance.now();
  const r = randeazaVedere(ctxH, W, H, d, HR.v, HR.pachete, UI.stiluri);
  if (HR.sel) deseneazaSelectie(ctxH, W, H, d, HR.v, HR.sel.ob);
  // copia ultimei randari: se misca/scaleaza in timpul gesturilor
  if (!HR.snap) HR.snap = document.createElement('canvas');
  HR.snap.width = cvH.width; HR.snap.height = cvH.height;
  HR.snap.getContext('2d').drawImage(cvH, 0, 0);
  HR.snapV = Object.assign({}, HR.v);
  const scara = Math.round(1000 / (HR.v.ppm * 0.2646) / 10) * 10;
  $('#hInfo').textContent = `${HR.titlu || ''} · ≈ 1:${scara.toLocaleString('ro-RO')} · ${r.obiecte.toLocaleString('ro-RO')} obiecte · ${r.etichete} etichete · ${Math.round(performance.now() - t0)} ms`;
}

function deseneazaCopie() {
  if (!HR.snap || !HR.snapV) return;
  const [W, H] = WH(), d = dprH(), v = HR.v, s = HR.snapV, k = v.ppm / s.ppm;
  const sx0 = s.cx - W / 2 / s.ppm, sy0 = s.cy + H / 2 / s.ppm;
  const X = (sx0 - (v.cx - W / 2 / v.ppm)) * v.ppm, Y = ((v.cy + H / 2 / v.ppm) - sy0) * v.ppm;
  ctxH.setTransform(1, 0, 0, 1, 0, 0);
  ctxH.fillStyle = '#FFFFFF'; ctxH.fillRect(0, 0, cvH.width, cvH.height);
  ctxH.drawImage(HR.snap, X * d, Y * d, cvH.width * k, cvH.height * k);
}
let rafH = 0;
function miscare() { if (!rafH) rafH = requestAnimationFrame(() => { rafH = 0; deseneazaCopie(); }); }
function programeazaRandare(ms = 140) { clearTimeout(HR.tmr); HR.tmr = setTimeout(randeazaHarta, ms); }

function zoomLa(f, px, py) {                       // f = factor, (px,py) = punct ecran (CSS px)
  if (!HR.v) return;
  const [W, H] = WH(), v = HR.v;
  const mx = v.cx + (px - W / 2) / v.ppm, my = v.cy - (py - H / 2) / v.ppm;
  v.ppm *= f; limiteaza();
  v.cx = mx - (px - W / 2) / v.ppm; v.cy = my + (py - H / 2) / v.ppm;
}
const pozitie = ev => { const r = cvH.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

cvH.addEventListener('pointerdown', ev => {
  if (!HR.v) return;
  try { cvH.setPointerCapture(ev.pointerId); } catch (e) { }
  const p = pozitie(ev); HR.ptr.set(ev.pointerId, Object.assign(p, { x0: p.x, y0: p.y, t0: performance.now() }));
  clearTimeout(HR.tmr);
});
cvH.addEventListener('pointermove', ev => {
  if (!HR.ptr.has(ev.pointerId) || !HR.v) return;
  const prev = HR.ptr.get(ev.pointerId), p = pozitie(ev);
  if (HR.ptr.size === 1) {
    HR.v.cx -= (p.x - prev.x) / HR.v.ppm; HR.v.cy += (p.y - prev.y) / HR.v.ppm;
  } else if (HR.ptr.size === 2) {
    const [a, b] = [...HR.ptr.values()];
    const altul = a === prev ? b : a;
    const d0 = Math.hypot(prev.x - altul.x, prev.y - altul.y), d1 = Math.hypot(p.x - altul.x, p.y - altul.y);
    const m0 = { x: (prev.x + altul.x) / 2, y: (prev.y + altul.y) / 2 }, m1 = { x: (p.x + altul.x) / 2, y: (p.y + altul.y) / 2 };
    if (d0 > 0) zoomLa(d1 / d0, m0.x, m0.y);
    HR.v.cx -= (m1.x - m0.x) / HR.v.ppm; HR.v.cy += (m1.y - m0.y) / HR.v.ppm;
  }
  prev.x = p.x; prev.y = p.y;
  miscare();
});
function sfarsitPointer(ev) {
  const p = HR.ptr.get(ev.pointerId); if (!p) return;
  HR.ptr.delete(ev.pointerId);
  const tap = Math.hypot(p.x - p.x0, p.y - p.y0) < 8 && performance.now() - p.t0 < 300;
  if (tap && HR.ultimTap && performance.now() - HR.ultimTap.t < 350 && Math.hypot(p.x - HR.ultimTap.x, p.y - HR.ultimTap.y) < 30) {
    clearTimeout(HR.tmrTap); zoomLa(2, p.x, p.y); miscare(); HR.ultimTap = null;
  } else if (tap) {
    HR.ultimTap = { t: performance.now(), x: p.x, y: p.y };
    clearTimeout(HR.tmrTap); HR.tmrTap = setTimeout(() => identificaLa(p.x, p.y), 320);
  }
  if (!HR.ptr.size) programeazaRandare();
}
cvH.addEventListener('pointerup', sfarsitPointer);
cvH.addEventListener('pointercancel', sfarsitPointer);
cvH.addEventListener('wheel', ev => {
  if (!HR.v) return; ev.preventDefault();
  const p = pozitie(ev); zoomLa(Math.exp(-ev.deltaY * 0.0015), p.x, p.y); miscare(); programeazaRandare(220);
}, { passive: false });
$('#hPlus').onclick = () => { const [W, H] = WH(); zoomLa(2, W / 2, H / 2); miscare(); programeazaRandare(60); };
$('#hMinus').onclick = () => { const [W, H] = WH(); zoomLa(0.5, W / 2, H / 2); miscare(); programeazaRandare(60); };
$('#hTot').onclick = () => { if (HR.ext) { incadreaza(); randeazaHarta(); } };
$('#hReincarca').onclick = () => { HR.semn = ''; hartaActiva(); };
window.addEventListener('resize', () => { if ($('#tab-harta').classList.contains('activ') && dimensiuneHarta()) randeazaHarta(); });
// evita zoom-ul paginii din gesturi pe harta (Safari)
['gesturestart', 'gesturechange'].forEach(t => cvH.addEventListener(t, e => e.preventDefault()));


// ------------------------------------------------------------------ atingere pe obiect + cautare
const fmtVal = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('ro-RO', { maximumFractionDigits: 2 });
  return String(v).trim() || null;
};
function aratFisa(nume, props, incarca) {
  $('#hFisaTitlu').textContent = nume;
  const tb = $('#hFisaTabel'); tb.innerHTML = '';
  if (incarca) { tb.innerHTML = '<tr><td colspan="2">Citesc atributele…</td></tr>'; }
  else {
    let goale = 0;
    for (const [k, v] of Object.entries(props || {})) {
      const t = fmtVal(v); if (t === null) { goale++; continue; }
      const tr = document.createElement('tr'); tr.innerHTML = '<td></td><td></td>';
      tr.children[0].textContent = k; tr.children[1].textContent = t; tb.appendChild(tr);
    }
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="2">Obiectul nu are atribute completate.</td></tr>';
    if (goale) { const tr = document.createElement('tr'); tr.innerHTML = `<td colspan="2" style="color:#9AA4AF">${goale} câmpuri goale nu sunt afișate</td>`; tb.appendChild(tr); }
  }
  $('#hFisa').classList.add('vizibil');
}
function inchideFisa(redeseneaza = true) { $('#hFisa').classList.remove('vizibil'); if (HR.sel) { HR.sel = null; if (redeseneaza) randeazaHarta(); } }
$('#hInchideFisa').onclick = () => inchideFisa();
$('#hCentreaza').onclick = () => { if (HR.sel) zoomLaObiect(HR.sel.ob); };

async function identificaLa(px, py) {
  if (!HR.pachete || !HR.v) return;
  ascundeRezultate();
  const [W, H] = WH(), v = HR.v;
  const mx = v.cx + (px - W / 2) / v.ppm, my = v.cy - (py - H / 2) / v.ppm;
  const r = identifica(HR.pachete, mx, my, 10 / v.ppm);
  if (!r) { inchideFisa(); return; }
  HR.sel = { nume: r.p.nume, ob: r.o };
  randeazaHarta();
  aratFisa(r.p.nume, null, true);
  const tok = (HR.tokFisa = (HR.tokFisa || 0) + 1);
  try { const pr = await atributeObiect(r.p.nume, r.o); if (tok === HR.tokFisa) aratFisa(r.p.nume, pr); }
  catch (e) { if (tok === HR.tokFisa) aratFisa(r.p.nume, r.o.p); }
}

function zoomLaObiect(o) {
  const [W, H] = WH();
  const w = Math.max(o.bb[2] - o.bb[0], 40), h = Math.max(o.bb[3] - o.bb[1], 40);
  // fisa acopera jumatatea de jos: obiectul se pune in treimea de sus
  const ppm = Math.max(1.5, Math.min(12, Math.min(W / (w * 1.6), H * 0.45 / (h * 1.4))));
  HR.v = { cx: (o.bb[0] + o.bb[2]) / 2, cy: (o.bb[1] + o.bb[3]) / 2 - H * 0.18 / ppm, ppm };
  randeazaHarta();
}

function ascundeRezultate() { $('#hRez').classList.remove('vizibil'); }
function rezumat(r, cuv) {
  const p = r.ob.p, parti = [];
  const contine = v => cuv.some(w => v.toLowerCase().includes(w.toLowerCase()));
  for (const [k, v] of Object.entries(p)) { const t = fmtVal(v); if (t && contine(t) && !/^Shape_/i.test(k)) parti.push(`${k}: ${t}`); }
  const loc = fmtVal(p.Localitate) || fmtVal(p.LOCALITATE);
  return { princ: parti.slice(0, 3).join(' · ') || '(potrivire)', loc };
}
$('#hFormCauta').onsubmit = async ev => {
  ev.preventDefault();
  const text = $('#hCauta').value.trim(); $('#hCauta').blur();
  const box = $('#hRez');
  if (!text) { ascundeRezultate(); return; }
  if (!GDB.ds || !HR.ext) { alert('Încărcați o bază de date și deschideți harta unei zone.'); return; }
  const bif = straturiBifate();
  box.innerHTML = '<div class="cap">Caut…</div>'; box.classList.add('vizibil');
  const tok = (HR.tokCauta = (HR.tokCauta || 0) + 1);
  const rez = await cautaInGdb(text, bif, HR.ext);
  if (tok !== HR.tokCauta) return;
  const cuv = text.split(/\s+/).filter(Boolean);
  box.innerHTML = `<div class="cap"><span>${rez.length ? rez.length + (rez.length >= 120 ? '+' : '') + ' rezultate în zonă (straturile bifate)' : 'Niciun rezultat în zonă, în straturile bifate'}</span><button class="btn mic" id="hRezInchide">✕</button></div>`;
  $('#hRezInchide').onclick = ascundeRezultate;
  for (const r of rez) {
    const d = document.createElement('div'); d.className = 'r';
    const { princ, loc } = rezumat(r, cuv);
    d.innerHTML = '<b></b> <span></span><small></small>';
    d.children[0].textContent = r.nume; d.children[1].textContent = princ; d.children[2].textContent = loc || '';
    d.onclick = () => { ascundeRezultate(); HR.sel = { nume: r.nume, ob: r.ob }; zoomLaObiect(r.ob); aratFisa(r.nume, r.ob.p); };
    box.appendChild(d);
  }
};
$('#hCauta').addEventListener('focus', () => { if ($('#hRez').children.length) $('#hRez').classList.add('vizibil'); });
