// Jameel Al Hindam – Service Worker (cache-first for static, network-first for API/data)
const CACHE = 'jameel-v11';
const STATIC = ['/', '/exec', '/exec.html', '/app/', '/app/index.html',
                '/favicon.svg', '/img/icon-192.png', '/img/icon-512.png',
                '/js/fb.js', '/js/config.js', '/js/jameel.js',
                '/tpl/Page.html', '/tpl/Order.html', '/tpl/Admin.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Firebase / external API: always network
  if (u.hostname !== location.hostname) return;
  // own addresses (one installed app each): /karigar/w/TOKEN/ = worker app; /a/KEY/, /o/KEY/, /t/TOKEN/ = exec.html
  const page = e.request.mode !== 'navigate' ? null
    : /^\/karigar\/w\/[0-9a-f]{32}\/?$/.test(u.pathname) ? '/karigar/index.html'
    : /^\/(a|o|t)\/[0-9a-f]{32}\/?$/.test(u.pathname) ? '/exec.html' : null;
  if (page) {
    e.respondWith(fetch(page, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(page, c)); }
      return r;
    }).catch(() => caches.match(page)));
    return;
  }
  // network first (always the newest code when online); the cached copy only when offline
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok && e.request.method === 'GET') { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(c => c || caches.match(u.pathname)))
  );
});
