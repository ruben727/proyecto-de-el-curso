var deferredPrompt;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(function () {
            console.log('service worker registered');
        })
        .catch(function (err) {
            console.log('Error al registrar el service worker:', err);
        });
}
