const CACHE_NAME = 'bbs-cache-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=5',
  './main.js?v=5',
  'https://unpkg.com/ress@4.0.0/dist/ress.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.9.1/font/bootstrap-icons.css',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap'
];

// Install event: Cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
});

// Fetch event: Network first for API, Cache first for assets
self.addEventListener('fetch', event => {
  if (event.request.url.includes('api.php')) {
    return; // API requests are not cached
  }
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Push event: Show notification
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'New Notification';
  const options = {
    body: data.body || '',
    icon: data.icon || 'images/icons/icon.png',
    data: { url: data.url || './' }
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((windowClients) => {
    let matchingClient = null;

    for (let i = 0; i < windowClients.length; i++) {
      const windowClient = windowClients[i];
      if (windowClient.url.startsWith(self.location.origin)) {
        matchingClient = windowClient;
        break;
      }
    }

    if (matchingClient) {
      return matchingClient.focus().then(client => client.navigate(urlToOpen));
    } else {
      return clients.openWindow(urlToOpen);
    }
  });

  event.waitUntil(promiseChain);
});