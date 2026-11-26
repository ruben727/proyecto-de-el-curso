importScripts('/src/js/idb.js');
importScripts('/src/js/utility.js');

var CACHE_STATIC_NAME = 'static-v17';
var CACHE_DYNAMIC_NAME = 'dynamic-v17';
var STATIC_FILES = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/src/images/icons/icon-192x192.png',
    '/src/images/icons/badge-96x96.png',
    '/src/js/app.js',
    '/src/js/feed.js',
    '/src/js/idb.js',
    '/src/js/utility.js',
    '/src/css/app.css',
    '/src/css/feed.css',
    '/src/css/help.css',
    '/src/js/material.min.js',
    '/src/images/main-image.jpg',
    '/src/images/sf-boat.jpg',
    'https://fonts.googleapis.com/css?family=Roboto:400,700',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.min.js'
];

self.addEventListener('install', function (event) {
    console.log('[Service Worker] Installing Service Worker ...', event);
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then(function (cache) {
                console.log('[Service Worker] Precaching App Shell');
                return cache.addAll(STATIC_FILES);
            })
    );
});

//

self.addEventListener('activate', function (event) {
    console.log('[Service Worker] Activating Service Worker ....', event);
    event.waitUntil(
        caches.keys()
            .then(function (keyList) {
                return Promise.all(keyList.map(function (key) {
                    if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
                        console.log('[Service Worker] Removing old cache.', key);
                        return caches.delete(key);
                    }
                }));
            })
    );
    return self.clients.claim();
});


//

function isInArray(string, array) {
    var cachePath;
    if (string.indexOf(self.origin) === 0) {
        // request targets domain where we serve the page from (i.e. NOT a CDN)
        cachePath = string.substring(self.origin.length);
    } else {
        cachePath = string; // store the full request (for CDNs)
    }
    return array.indexOf(cachePath) > -1;
}


self.addEventListener('fetch', function (event) {
    // Las peticiones POST (agregar post) van directo a la red, sin caché
    if (event.request.method !== 'GET') {
        return;
    }

    var url = 'https://proyecto-7c436-default-rtdb.firebaseio.com/post.json';

    if (event.request.url.indexOf(url) > -1) {
        event.respondWith(fetch(event.request)
            .then(function (res) {
                // Si Firebase responde con error (401, etc.) no se toca la caché local
                if (!res.ok) {
                    return res;
                }
                var clonedRes = res.clone();
                clearAllData('posts')
                    .then(function () {
                        return clonedRes.json();
                    })
                    .then(function (data) {
                        for (var key in data) {
                            if (!data[key] || typeof data[key] !== 'object' || !data[key].id) continue;
                            writeData('posts', data[key]);
                        }

                    });
                return res;
            })
        );
    } else if (isInArray(event.request.url, STATIC_FILES)) {
        event.respondWith(
            caches.match(event.request)
        );
    } else {
        event.respondWith(
            caches.match(event.request)
                .then(function (response) {
                    if (response) {
                        return response;
                    } else {
                        return fetch(event.request)
                            .then(function (res) {
                                return caches.open(CACHE_DYNAMIC_NAME)
                                    .then(function (cache) {
                                        cache.put(event.request.url, res.clone());
                                        return res;
                                    })
                            })
                            .catch(function (err) {
                                return caches.open(CACHE_STATIC_NAME)
                                    .then(function (cache) {
                                        if (event.request.headers.get('accept').includes('text/html')) {
                                            return cache.match('/offline.html');
                                        }
                                    });
                            });
                    }
                })
        );
    }
});




// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

// Aviso local cuando un post guardado sin conexión ya se publicó.
// Usa el mismo "tag" que el push del servidor, así no salen dos notificaciones del mismo post.
function showPostPublishedNotification(post) {
    if (!self.registration.showNotification || Notification.permission !== 'granted') {
        return;
    }
    return self.registration.showNotification('¡Tu post se publicó!', {
        body: post.title + ' — ' + post.location,
        icon: '/src/images/icons/icon-192x192.png',
        badge: '/src/images/icons/badge-96x96.png',
        tag: 'post-' + post.id,
        data: { url: '/' }
    });
}

// Push enviado desde el servidor (/api/send-push)
self.addEventListener('push', function (event) {
    console.log('[Service Worker] Push recibido', event);
    var data = { title: 'UTEQGram', content: '¡Hay novedades!', openUrl: '/' };
    if (event.data) {
        try {
            data = Object.assign(data, event.data.json());
        } catch (e) {
            data.content = event.data.text();
        }
    }
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.content,
            icon: '/src/images/icons/icon-192x192.png',
            badge: '/src/images/icons/badge-96x96.png',
            vibrate: [100, 50, 200],
            tag: data.tag,
            data: { url: data.openUrl }
        })
    );
});

// Al tocar la notificación: enfocar la app si ya está abierta, o abrirla
self.addEventListener('notificationclick', function (event) {
    var notification = event.notification;
    var action = event.action;
    console.log('[Service Worker] Notificación tocada', action);
    notification.close();

    if (action === 'cancel') {
        return;
    }

    var target = (notification.data && notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clis) {
                var client = clis.find(function (c) {
                    return c.visibilityState === 'visible';
                }) || clis[0];
                if (client) {
                    return client.focus();
                }
                return self.clients.openWindow(target);
            })
    );
});

self.addEventListener('notificationclose', function (event) {
    console.log('[Service Worker] Notificación cerrada', event);
});


// Si ya hay una sincronización en curso, se reutiliza la misma promesa
// (así no se sube el mismo post dos veces y nadie se queda sin esperar el resultado)
var syncInProgress = null;

function syncPosts() {
    if (syncInProgress) {
        return syncInProgress;
    }
    syncInProgress = doSyncPosts().then(function (result) {
        syncInProgress = null;
        return result;
    }, function (err) {
        syncInProgress = null;
        throw err;
    });
    return syncInProgress;
}

// Reintenta varias veces: justo al volver el internet la red todavía puede no estar lista
function syncPostsWithRetry(attempt) {
    attempt = attempt || 1;
    return syncPosts().catch(function (err) {
        if (attempt >= 5) {
            throw err;
        }
        console.log('[Service Worker] Reintentando sincronización (' + attempt + '/5) en 2s...');
        return new Promise(function (resolve) { setTimeout(resolve, 2000); })
            .then(function () { return syncPostsWithRetry(attempt + 1); });
    });
}

function doSyncPosts() {
    console.log('[Service Worker] Syncing new Posts');
    // Si falla se lanza el error para que el navegador reintente el sync más tarde
    return sendPendingPosts('[Service Worker] ', showPostPublishedNotification)
                .then(function (count) {
                    if (count === 0) {
                        return;
                    }
                    console.log('[Service Worker] ¡Sincronización completa!');
                    // Avisar a la página que ya se subieron los posts para que actualice el feed
                    // includeUncontrolled: también avisa a pestañas abiertas con Ctrl+Shift+R
                    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
                        clients.forEach(function (client) {
                            client.postMessage({ type: 'posts-synced' });
                        });
                    });
                });
}

self.addEventListener('sync', function (event) {
    console.log('[Service Worker] Background syncing', event);
    if (event.tag === 'sync-new-posts') {
        event.waitUntil(syncPosts());
    }
});

// La página avisa cuando regresa el internet para sincronizar de inmediato
self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'sync-now') {
        event.waitUntil(
            syncPostsWithRetry().catch(function (err) {
                console.log('[Service Worker] Todavía no se pudo sincronizar', err);
            })
        );
    }
});






// self.addEventListener('fetch', function (event) {
//     if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
//         return;
//     }

//     event.respondWith(
//         caches.match(event.request)
//             .then(function (response) {
//                 if (response) {
//                     return response;
//                 } else {
//                     return fetch(event.request)
//                         .then(function (res) {
//                             return caches.open(CACHE_DYNAMIC_NAME)
//                                 .then(function (cache) {
//                                     cache.put(event.request.url, res.clone());
//                                     return res;
//                                 });
//                         })
//                         .catch(function (err) {
//                         });
//                 }
//             })
//     );
// });