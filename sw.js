const CACHE_NAME = 'tribit-web-control-v3';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './styles/main.css',
    './js/main.js',
    './js/bluetooth.js',
    './js/dom.js',
    './js/presets.js',
    './js/protocol.js',
    './js/state.js',
    './js/ui.js',
    './js/speakers/base.js',
    './js/speakers/index.js',
    './js/speakers/xsound-plus-2.js',
    './assets/favicon.svg',
    './assets/material-symbols--battery-android-frame-question-sharp.svg',
    './assets/material-symbols--battery-android-frame-1-sharp.svg',
    './assets/material-symbols--battery-android-frame-2-sharp.svg',
    './assets/material-symbols--battery-android-frame-3-sharp.svg',
    './assets/material-symbols--battery-android-frame-4-sharp.svg',
    './assets/material-symbols--battery-android-frame-5-sharp.svg',
    './assets/material-symbols--battery-android-frame-6-sharp.svg',
    './assets/material-symbols--battery-android-frame-full-sharp.svg',
    './assets/material-symbols--save-as-outline.svg',
    './assets/material-symbols--delete-outline.svg',
    './assets/appicon.png',
    './assets/appicon-full.png'
];

const APP_SHELL_URLS = new Set(
    APP_SHELL.map((path) => new URL(path, self.location.origin + self.location.pathname).href)
);

function isAppShellRequest(request) {
    const url = new URL(request.url);
    return url.origin === self.location.origin && APP_SHELL_URLS.has(url.href);
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (!isAppShellRequest(event.request) && event.request.mode !== 'navigate') return;

    event.respondWith((async () => {
        try {
            const networkResponse = await fetch(event.request);
            if (networkResponse && networkResponse.ok && isAppShellRequest(event.request)) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
        } catch (error) {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) return cachedResponse;
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
            return Response.error();
        }
    })());
});
