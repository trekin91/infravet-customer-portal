var CACHE_NAME = 'infravet-shell-v6';
var SHELL_FILES = [
    './',
    './index.html',
    './css/variables.css',
    './css/reset.css',
    './css/base.css',
    './css/layout.css',
    './css/components.css',
    './css/auth.css',
    './css/dashboard.css',
    './css/animals.css',
    './css/appointments.css',
    './css/hospitalization.css',
    './css/documents.css',
    './css/profile.css',
    './css/install-prompt.css',
    './js/config.js',
    './js/utils.js',
    './js/api.js',
    './js/auth.js',
    './js/router.js',
    './js/notifications.js',
    './js/install-prompt.js',
    './js/pages/dashboard.js',
    './js/pages/animals.js',
    './js/pages/animal-detail.js',
    './js/pages/hospitalization.js',
    './js/pages/appointments.js',
    './js/pages/documents.js',
    './js/pages/profile.js',
    './js/pull-to-refresh.js',
    './js/app.js'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                return cache.addAll(SHELL_FILES);
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (cacheNames) {
                return Promise.all(
                    cacheNames
                        .filter(function (name) { return name !== CACHE_NAME; })
                        .map(function (name) { return caches.delete(name); })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

self.addEventListener('fetch', function (event) {
    var url = new URL(event.request.url);

    if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
        return;
    }

    if (url.pathname.startsWith('/mocks/')) {
        return;
    }

    if (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('/environment.js')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function (cachedResponse) {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then(function (networkResponse) {
                    if (networkResponse.ok && event.request.method === 'GET'
                        && url.origin === self.location.origin) {
                        var clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return networkResponse;
                });
            })
    );
});

function _validateUrl(url) {
    if (!url) return './';
    try {
        var parsed = new URL(url, self.location.origin);
        return parsed.origin === self.location.origin ? parsed.pathname : './';
    } catch (e) {
        return './';
    }
}

self.addEventListener('push', function (event) {
    var data = {};
    if (event.data) {
        try { data = event.data.json(); }
        catch (e) { data = { title: 'Infravet', body: event.data.text() }; }
    }

    var options = {
        body: data.body || '',
        icon: './assets/logo/web-app-manifest-192x192.png',
        badge: './assets/logo/favicon-96x96.png',
        tag: data.tag || 'infravet-notification',
        data: { url: _validateUrl(data.url) },
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Infravet', options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var targetUrl = _validateUrl(event.notification.data.url);

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clients) {
                for (var i = 0; i < clients.length; i++) {
                    if (clients[i].url.includes(self.location.origin)) {
                        clients[i].focus();
                        clients[i].postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
                        return;
                    }
                }
                return self.clients.openWindow(targetUrl);
            })
    );
});
