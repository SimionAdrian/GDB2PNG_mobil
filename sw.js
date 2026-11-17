/* GDB2PNG mobil - lucru offline: fisierele aplicatiei se pastreaza in cache */
const CACHE = 'gdb2png-v1.1';
const FISIERE = ['./', 'index.html', 'app.js', 'motor.js', 'stiluri_implicite.js', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'lib/jspdf.umd.min.js', 'lib/fflate.min.js', 'lib/DejaVuSans.ttf', 'lib/gdal/gdal3.js', 'lib/gdal/gdal3WebAssembly.wasm.gz', 'lib/gdal/gdal3WebAssembly.data.gz'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FISIERE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
