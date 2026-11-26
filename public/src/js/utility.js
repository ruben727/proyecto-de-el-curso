var dbPromise = idb.open('posts-store', 2, function (db) {
    if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore('posts', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('sync-posts')) {
        db.createObjectStore('sync-posts', { keyPath: 'id' });
    }
});

function writeData(st, data) {
    return dbPromise
        .then(function (db) {
            var tx = db.transaction(st, 'readwrite');
            var store = tx.objectStore(st);
            store.put(data);
            return tx.complete;
        });
};

function readAllData(st) {
    return dbPromise
        .then(function (db) {
            var tx = db.transaction(st, 'readonly');
            var store = tx.objectStore(st);
            return store.getAll();
        });
};

function clearAllData(st) {
    return dbPromise
        .then(function (db) {
            var tx = db.transaction(st, 'readwrite');
            var store = tx.objectStore(st);
            store.clear();
            return tx.complete;
        });
}

var FIREBASE_BASE_URL = 'https://proyecto-7c436-default-rtdb.firebaseio.com/post';
var DEFAULT_POST_IMAGE = 'https://ctoevysqlxkikjtrpoho.supabase.co/storage/v1/object/public/imagenes/sf-boat.jpg';

// Firebase no permite . # $ [ ] en las llaves, se reemplazan por -
function firebaseKeyFromId(id) {
    return String(id).replace(/[.#$\[\]:]/g, '-');
}

// Sube todos los posts de 'sync-posts' a Firebase y los borra de IndexedDB.
// Usa PUT con el id del post como llave: si la página y el service worker
// lo suben al mismo tiempo, se sobrescribe el mismo registro (no se duplica).
// Devuelve cuántos posts se subieron. Lanza error si alguno falla.
// Pide al servidor (función de Vercel /api/send-push) que mande una notificación push
// a todos los suscriptores. El servidor ignora el aviso si ese post ya se notificó.
function notifyNewPost(post) {
    return fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id })
    })
        .then(function (res) {
            if (!res.ok) {
                console.log('No se pudo enviar el push (' + res.status + ')');
            }
        })
        .catch(function (err) {
            console.log('No se pudo enviar el push', err);
        });
}

// onSent (opcional): se llama con cada post subido correctamente
function sendPendingPosts(logPrefix, onSent) {
    logPrefix = logPrefix || '';
    return readAllData('sync-posts')
        .then(function (data) {
            if (data.length === 0) {
                return 0;
            }
            console.log(logPrefix + 'Posts pendientes por sincronizar: ' + data.length);
            return Promise.all(data.map(function (dt) {
                return fetch(FIREBASE_BASE_URL + '/' + firebaseKeyFromId(dt.id) + '.json', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        id: dt.id,
                        title: dt.title,
                        location: dt.location,
                        image: dt.image || DEFAULT_POST_IMAGE
                    })
                })
                    .then(function (res) {
                        if (!res.ok) {
                            throw new Error('Firebase respondió ' + res.status);
                        }
                        console.log(logPrefix + 'Post sincronizado con Firebase: ' + dt.title);
                        notifyNewPost(dt);
                        if (onSent) {
                            onSent(dt);
                        }
                        return deleteItemFromData('sync-posts', dt.id);
                    });
            }))
                .then(function () {
                    return data.length;
                });
        });
}

function deleteItemFromData(st, id) {
    return dbPromise
        .then(function (db) {
            var tx = db.transaction(st, 'readwrite');
            var store = tx.objectStore(st);
            store.delete(id);
            return tx.complete;
        })
        .then(function () {
            console.log('Item deleted!');
        });
}