var deferredPrompt;
var enableNotificationsButtons = document.querySelectorAll('.enable-notifications');

// Llave pública VAPID (la privada vive SOLO en el servidor, en la variable VAPID_PRIVATE_KEY)
var VAPID_PUBLIC_KEY = 'BD4cQoGCwdQ6IQf64xKQ9GynGuzVIrPIV-Jf7HMXKplNlTMbDSLR5ox8K6_BnyUMjloHJN_3PBjn9HO6YnSm4WU';
var SUBSCRIPTIONS_URL = 'https://proyecto-7c436-default-rtdb.firebaseio.com/subscriptions';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(function () {
            console.log('service worker registered');
        })
        .catch(function (err) {
            console.log('Error al registrar el service worker:', err);
        });
}

// ---------------------------------------------------------------------------
// Instalación de la PWA (Agregar a pantalla de inicio)
// ---------------------------------------------------------------------------
function getInstallArea() {
    return document.querySelector('#install-area');
}

window.addEventListener('beforeinstallprompt', function (event) {
    console.log('beforeinstallprompt disparado');
    // Evita el mini-banner automático; lo mostramos con nuestro botón
    event.preventDefault();
    deferredPrompt = event;
    var area = getInstallArea();
    if (area) {
        area.style.display = 'block';
    }
});

function promptInstall() {
    if (!deferredPrompt) {
        return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choiceResult) {
        console.log('Instalación:', choiceResult.outcome);
        var area = getInstallArea();
        if (area) {
            area.style.display = 'none';
        }
    });
    deferredPrompt = null;
}

window.addEventListener('appinstalled', function () {
    console.log('UTEQGram instalada');
    deferredPrompt = null;
    var area = getInstallArea();
    if (area) {
        area.style.display = 'none';
    }
});

var installButton = document.querySelector('#install-btn');
if (installButton) {
    installButton.addEventListener('click', promptInstall);
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Llave estable por endpoint para no guardar la misma suscripción dos veces
function subscriptionKey(endpoint) {
    var hash = 0;
    for (var i = 0; i < endpoint.length; i++) {
        hash = ((hash << 5) - hash + endpoint.charCodeAt(i)) | 0;
    }
    return 'sub' + (hash >>> 0).toString(36) + endpoint.length.toString(36);
}

function displayConfirmNotification() {
    var options = {
        body: '¡Te suscribiste correctamente a las notificaciones de UTEQGram!',
        icon: '/src/images/icons/icon-192x192.png',
        badge: '/src/images/icons/badge-96x96.png',
        image: '/src/images/sf-boat.jpg',
        dir: 'ltr',
        lang: 'es-MX',
        vibrate: [100, 50, 200],
        tag: 'confirm-notification',
        renotify: true,
        data: { url: '/' },
        actions: [
            { action: 'confirm', title: 'Ok', icon: '/src/images/icons/badge-96x96.png' },
            { action: 'cancel', title: 'Cancelar', icon: '/src/images/icons/badge-96x96.png' }
        ]
    };
    return navigator.serviceWorker.ready.then(function (swreg) {
        return swreg.showNotification('Notificaciones activadas', options);
    });
}

function configurePushSub() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // Sin Push API (p. ej. iOS sin instalar la app): solo notificaciones locales
        return displayConfirmNotification();
    }

    var reg;
    return navigator.serviceWorker.ready
        .then(function (swreg) {
            reg = swreg;
            return swreg.pushManager.getSubscription();
        })
        .then(function (sub) {
            if (sub) {
                return sub;
            }
            return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        })
        .then(function (sub) {
            var json = sub.toJSON();
            return fetch(SUBSCRIPTIONS_URL + '/' + subscriptionKey(json.endpoint) + '.json', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(json)
            });
        })
        .then(function (res) {
            if (!res.ok) {
                throw new Error('Firebase respondió ' + res.status + ' al guardar la suscripción');
            }
            return displayConfirmNotification();
        })
        .catch(function (err) {
            console.log('Error al configurar push:', err);
            // Aunque falle el push, las notificaciones locales siguen funcionando
            return displayConfirmNotification();
        });
}

function hideNotificationButtons() {
    for (var i = 0; i < enableNotificationsButtons.length; i++) {
        enableNotificationsButtons[i].style.display = 'none';
    }
}

function askForNotificationPermission() {
    Notification.requestPermission(function (result) {
        console.log('Permiso de notificaciones:', result);
        if (result !== 'granted') {
            console.log('No se otorgó permiso para notificaciones');
            return;
        }
        hideNotificationButtons();
        configurePushSub();
    });
}

if ('Notification' in window && 'serviceWorker' in navigator) {
    if (Notification.permission === 'granted') {
        hideNotificationButtons();
        // Por si la suscripción expiró o se borró, se vuelve a registrar en silencio
        navigator.serviceWorker.ready.then(function (swreg) {
            if (!('PushManager' in window)) return;
            return swreg.pushManager.getSubscription().then(function (sub) {
                if (!sub) {
                    configurePushSub();
                }
            });
        });
    } else {
        for (var i = 0; i < enableNotificationsButtons.length; i++) {
            enableNotificationsButtons[i].style.display = 'inline-block';
            enableNotificationsButtons[i].addEventListener('click', askForNotificationPermission);
        }
    }
} else {
    hideNotificationButtons();
}
