// Simbolizarea implicita (preluata din GDB2PNG pentru Windows)
const STILURI_IMPLICITE = {
 "_info": "Stiluri pentru GDB2PNG. Culori in format #RRGGBB. Grosimile liniilor sunt in pixeli in imaginea finala. Inaltimea textului este in metri pe teren (textul se mareste/micsoreaza odata cu scara, ca in plan). 'implicit': true = stratul este bifat la pornire. 'ordine': straturile cu numar mai mic se deseneaza primele (dedesubt). Straturile din GDB care nu apar aici primesc stilul din '_implicit'. 'text_minim_px' la un strat = textul nu devine mai mic de atatia pixeli (ramane lizibil la scari mici); fara el, textul prea mic nu se afiseaza. 'prioritate_eticheta': la suprapunere ramane eticheta cu prioritatea mai mare. '_general.evita_suprapunerea': false = se afiseaza toate etichetele, chiar suprapuse. PDF: 1 px din acest fisier = 0,25 mm pe hartie; grosimile liniilor in PDF se inmultesc cu 'pdf_factor_grosime'. 'eticheta_linie_repetare_px': numele strazilor se repeta de-a lungul strazii la aproximativ atatia pixeli (in PDF: 1200 px = 300 mm). 'eticheta' poate fi un camp (ex. 'Denumire') sau un sablon cu campuri intre acolade (ex. '{Material} Dn{Diametru}'). 'decalaj_linie_m': eticheta paralela cu linia, deasupra ei la atatia metri.",
 "_general": {
  "fundal": "#FFFFFF",
  "font": "Arial",
  "text_minim_px": 3,
  "latime_implicita_px": 24000,
  "scara_implicita": 1000,
  "dpi_implicit": 200,
  "max_megapixeli": 1200,
  "evita_suprapunerea": true,
  "pdf_scara_implicita": 1000,
  "pdf_format_implicit": "Auto",
  "pdf_factor_grosime": 1.0,
  "pdf_max_planse": 300,
  "eticheta_linie_repetare_px": 1200
 },
 "_implicit": {
  "implicit": false,
  "ordine": 50,
  "culoare": "#606060",
  "latime_px": 0.75,
  "umplere": null,
  "marker": "o",
  "marime_marker_px": 5
 },
 "LimitaUAT": {
  "implicit": false,
  "ordine": 1,
  "culoare": "#000000",
  "latime_px": 2.25,
  "stil_linie": "solid",
  "umplere": null
 },
 "LimitaIntravilan": {
  "implicit": false,
  "ordine": 2,
  "culoare": "#7F7F7F",
  "latime_px": 1.5,
  "stil_linie": "solid",
  "umplere": null
 },
 "SpatiuVerde": {
  "implicit": true,
  "ordine": 5,
  "culoare": "#4E8F3A",
  "latime_px": 0.75
 },
 "Hidrografie": {
  "implicit": true,
  "ordine": 6,
  "culoare": "#2F7FD0",
  "latime_px": 1.12
 },
 "LimitaParcela": {
  "implicit": true,
  "ordine": 10,
  "culoare": "#8C8C8C",
  "latime_px": 0.75
 },
 "SanturiRigole": {
  "implicit": true,
  "ordine": 11,
  "culoare": "#5B9BD5",
  "latime_px": 0.75,
  "stil_linie": "solid"
 },
 "LimitaTrotuar": {
  "implicit": true,
  "ordine": 12,
  "culoare": "#B0B0B0",
  "latime_px": 0.75
 },
 "Constructii": {
  "implicit": true,
  "ordine": 20,
  "culoare": "#5A5A00",
  "latime_px": 1.2,
  "umplere": null
 },
 "Constructii_FrontStrada": {
  "implicit": false,
  "ordine": 21,
  "culoare": "#5A5A00",
  "latime_px": 0.9
 },
 "Constructii_SE": {
  "implicit": true,
  "ordine": 22,
  "culoare": "#000000",
  "latime_px": 1.5,
  "umplere": null
 },
 "Constructii_STA": {
  "implicit": true,
  "ordine": 23,
  "culoare": "#000000",
  "latime_px": 1.5,
  "umplere": null
 },
 "Imprejmuire_SE": {
  "implicit": true,
  "ordine": 24,
  "culoare": "#000000",
  "latime_px": 0.75,
  "stil_linie": "solid"
 },
 "Imprejmuire_STA": {
  "implicit": true,
  "ordine": 25,
  "culoare": "#000000",
  "latime_px": 0.75,
  "stil_linie": "solid"
 },
 "Carosabil": {
  "implicit": true,
  "ordine": 30,
  "culoare": "#FF0000",
  "latime_px": 1.5
 },
 "Poduri": {
  "implicit": true,
  "ordine": 31,
  "culoare": "#000000",
  "latime_px": 1.12
 },
 "CaleaFerata": {
  "implicit": true,
  "ordine": 32,
  "culoare": "#000000",
  "latime_px": 1.88,
  "stil_linie": "solid"
 },
 "AxStrada": {
  "implicit": true,
  "ordine": 33,
  "culoare": "#000000",
  "latime_px": 0.0,
  "eticheta": "Denumire",
  "inaltime_text_m": 3.0,
  "culoare_text": "#000000",
  "text_minim_px": 7,
  "prioritate_eticheta": 90
 },
 "Aductiune": {
  "implicit": false,
  "ordine": 40,
  "culoare": "#0050C8",
  "latime_px": 2.25
 },
 "ConductaApa": {
  "implicit": true,
  "ordine": 41,
  "culoare": "#0000FF",
  "latime_px": 2.0,
  "stil_linie": "solid",
  "eticheta": "{Material} Dn{Diametru}",
  "inaltime_text_m": 1.5,
  "text_minim_px": 5,
  "decalaj_linie_m": 0.8,
  "culoare_text": "#000000",
  "prioritate_eticheta": 50
 },
 "Bransament": {
  "implicit": false,
  "ordine": 42,
  "culoare": "#2F7FD0",
  "latime_px": 0.6,
  "eticheta": "{Material} {Diametru}",
  "inaltime_text_m": 1.5,
  "text_minim_px": 5.0,
  "decalaj_linie_m": 0.0,
  "culoare_text": "#FF0000",
  "eticheta_linii_scurte": true,
  "prioritate_eticheta": 50
 },
 "ConductaCanalizare": {
  "implicit": false,
  "ordine": 43,
  "culoare": "#8B4513",
  "latime_px": 1.2,
  "eticheta": "{Material} Dn{Diametru}",
  "inaltime_text_m": 1.5,
  "text_minim_px": 5,
  "decalaj_linie_m": 0.8,
  "culoare_text": "#8B4513",
  "prioritate_eticheta": 50
 },
 "ConductaRefulare": {
  "implicit": false,
  "ordine": 44,
  "culoare": "#C04000",
  "latime_px": 2.0,
  "stil_linie": "solid"
 },
 "Racord": {
  "implicit": false,
  "ordine": 45,
  "culoare": "#A0522D",
  "latime_px": 0.6,
  "eticheta": "{Material}",
  "inaltime_text_m": 1.5,
  "text_minim_px": 5.0,
  "decalaj_linie_m": 0.0,
  "culoare_text": "#A0522D",
  "eticheta_linii_scurte": true,
  "prioritate_eticheta": 50
 },
 "ColectorEvacuare": {
  "implicit": false,
  "ordine": 46,
  "culoare": "#8B4513",
  "latime_px": 1.88
 },
 "Vana": {
  "implicit": false,
  "ordine": 60,
  "culoare": "#000000",
  "marker": "D",
  "marime_marker_px": 7
 },
 "VanaConcesie": {
  "implicit": false,
  "ordine": 61,
  "culoare": "#000000",
  "marker": "d",
  "marime_marker_px": 6
 },
 "Hidrant": {
  "implicit": false,
  "ordine": 62,
  "culoare": "#E00000",
  "marker": "^",
  "marime_marker_px": 8
 },
 "Apometru": {
  "implicit": false,
  "ordine": 63,
  "culoare": "#0050C8",
  "marker": "s",
  "marime_marker_px": 5
 },
 "CaminApa": {
  "implicit": false,
  "ordine": 64,
  "culoare": "#0050C8",
  "marker": "o",
  "marime_marker_px": 7,
  "umplere": null
 },
 "CaminBransament": {
  "implicit": false,
  "ordine": 65,
  "culoare": "#0050C8",
  "marker": "o",
  "marime_marker_px": 5,
  "umplere": null
 },
 "CaminCanalizare": {
  "implicit": false,
  "ordine": 66,
  "culoare": "#8B4513",
  "marker": "o",
  "marime_marker_px": 7,
  "umplere": null,
  "eticheta": "{Z}",
  "inaltime_text_m": 1.5,
  "text_minim_px": 5.0,
  "decalaj_linie_m": 0.0,
  "culoare_text": "#8B4513",
  "eticheta_linii_scurte": true,
  "prioritate_eticheta": 50
 },
 "CaminRacord": {
  "implicit": false,
  "ordine": 67,
  "culoare": "#8B4513",
  "marker": "o",
  "marime_marker_px": 5,
  "umplere": null
 },
 "GuraScurgere": {
  "implicit": false,
  "ordine": 68,
  "culoare": "#8B4513",
  "marker": "s",
  "marime_marker_px": 5,
  "umplere": null
 },
 "Fiting": {
  "implicit": false,
  "ordine": 69,
  "culoare": "#404040",
  "marker": ".",
  "marime_marker_px": 4
 },
 "NumarPostal": {
  "implicit": true,
  "ordine": 80,
  "culoare": "#000000",
  "marker": "o",
  "marime_marker_px": 3,
  "umplere": null,
  "eticheta": "NrPostal",
  "inaltime_text_m": 2.0,
  "culoare_text": "#000000",
  "decalaj_text_m": [
   1.0,
   0.6
  ],
  "text_minim_px": 5,
  "prioritate_eticheta": 10
 },
 "ToponimieObiective": {
  "implicit": true,
  "ordine": 90,
  "culoare": "#000000",
  "marker": "",
  "marime_marker_px": 0,
  "eticheta": "Text",
  "inaltime_text_m": 2.5,
  "culoare_text": "#000000",
  "text_minim_px": 8,
  "prioritate_eticheta": 100
 },
 "Adnotare": {
  "implicit": true,
  "ordine": 95,
  "culoare_text": "#000000",
  "tip": "adnotare",
  "text_minim_px": 0
 },
 "PlansaA0_1000_X": {
  "implicit": false,
  "ordine": 3,
  "culoare": "#0000FF",
  "latime_px": 1.5,
  "eticheta": "NrPlansa",
  "inaltime_text_m": 20,
  "text_minim_px": 10
 },
 "ZonaProtectie": {
  "implicit": false,
  "ordine": 4,
  "culoare": "#FF8C00",
  "latime_px": 1.12,
  "stil_linie": "solid",
  "umplere": null
 }
};
