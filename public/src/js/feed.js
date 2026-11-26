var shareImageButton = document.querySelector('#share-image-button');
var createPostArea = document.querySelector('#create-post');
var closeCreatePostModalButton = document.querySelector('#close-create-post-modal-btn');
var sharedMomentsArea = document.querySelector('#shared-moments');
var form = document.querySelector('form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');


function openCreatePostModal() {
  // createPostArea.style.display = 'block';

  createPostArea.style.transform = 'translateY(0)';
  if (deferredPrompt) {
    deferredPrompt.prompt();

    deferredPrompt.userChoice.then(function (choiceResult) {
      console.log(choiceResult.outcome);

      if (choiceResult.outcome === 'dismissed') {
        console.log('User cancelled installation');
      } else {
        console.log('User added to home screen');
      }
    });

    deferredPrompt = null;
  }
}

function closeCreatePostModal() {
  //createPostArea.style.display = 'none';
  createPostArea.style.transform = 'translateY(100vh)';
}

shareImageButton.addEventListener('click', openCreatePostModal);

closeCreatePostModalButton.addEventListener('click', closeCreatePostModal);

function clearCards() {
  while (sharedMomentsArea.hasChildNodes()) {
    sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
  }
}

function createCard(data) {
  var cardWrapper = document.createElement('div');
  cardWrapper.className = 'shared-moment-card mdl-card mdl-shadow--2dp';
  var cardTitle = document.createElement('div');
  cardTitle.className = 'mdl-card__title';
  cardTitle.style.backgroundImage = 'url(' + data.image + ')';
  cardTitle.style.backgroundSize = 'cover';
  cardTitle.style.height = '180px';
  cardWrapper.appendChild(cardTitle);
  var cardTitleTextElement = document.createElement('h2');
  cardTitleTextElement.style.color = 'white';
  cardTitleTextElement.className = 'mdl-card__title-text';
  cardTitleTextElement.textContent = data.title;
  cardTitle.appendChild(cardTitleTextElement);
  var cardSupportingText = document.createElement('div');
  cardSupportingText.className = 'mdl-card__supporting-text';
  cardSupportingText.textContent = data.location;
  cardSupportingText.style.textAlign = 'center';
  cardWrapper.appendChild(cardSupportingText);
  componentHandler.upgradeElement(cardWrapper);
  sharedMomentsArea.appendChild(cardWrapper);
}

function updateUI(data) {
  clearCards();
  for (var i = 0; i < data.length; i++) {
    createCard(data[i]);
  }
}

var url = 'https://proyecto-7c436-default-rtdb.firebaseio.com/post.json';
var networkDataReceived = false;
var needsRefresh = false; // true cuando se guardó un post sin conexión

//Get es la que se pone por defecto por esta razón no se configura
// Devuelve una promesa: true si se pudo cargar desde la web, false si no
function loadPosts() {
  return fetch(url, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) {
        throw new Error('Firebase respondió ' + res.status + ' (revisa las reglas de la base de datos)');
      }
      return res.json();
    })
    .then(function (data) {
      networkDataReceived = true;
      console.log('From web', data);
      var dataArray = [];
      for (var key in data) {
        if (data[key] && typeof data[key] === 'object') {
          dataArray.push(data[key]);
        }
      }
      updateUI(dataArray);
      return true;
    })
    .catch(function (err) {
      console.log('No se pudieron cargar los posts desde la web:', err.message);
      return false;
    });
}

loadPosts();

// Cuando el service worker termina de sincronizar, se recarga el feed sin recargar la página
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'posts-synced') {
      console.log('Posts sincronizados, actualizando feed');
      loadPosts();
    }
  });

  function requestSyncNow() {
    navigator.serviceWorker.ready.then(function (sw) {
      if (sw.active) {
        sw.active.postMessage({ type: 'sync-now' });
      }
    });
  }

  // La página también sube los posts pendientes por su cuenta (no depende solo del service worker).
  // needsRefresh = hay posts guardados sin conexión que todavía no se ven desde Firebase.
  // Aunque el service worker los suba primero (y vacíe sync-posts), la página igual recarga el feed.
  var pageSyncRunning = false;
  function syncFromPage(forceRefresh) {
    if (pageSyncRunning || !navigator.onLine) {
      return Promise.resolve(false);
    }
    pageSyncRunning = true;
    return sendPendingPosts('[Página] ')
      .then(function (count) {
        if (count > 0 || needsRefresh || forceRefresh) {
          return loadPosts().then(function (ok) {
            if (!ok) {
              throw new Error('no se pudo recargar el feed');
            }
            needsRefresh = false;
            console.log('[Página] ¡Sincronización completa! Feed actualizado');
          });
        }
      })
      .then(function () {
        pageSyncRunning = false;
        return true;
      })
      .catch(function (err) {
        pageSyncRunning = false;
        console.log('[Página] Todavía no se pudo sincronizar:', err.message);
        return false;
      });
  }

  // Al volver el internet: reintentar cada 3s hasta lograrlo (máximo ~1 minuto)
  function syncWithRetry(attempt) {
    attempt = attempt || 1;
    syncFromPage(true).then(function (ok) {
      if (!ok && attempt < 20) {
        setTimeout(function () { syncWithRetry(attempt + 1); }, 3000);
      }
    });
  }

  window.addEventListener('offline', function () {
    console.log('Sin internet: los posts nuevos se guardarán en sync-posts');
  });

  window.addEventListener('online', function () {
    console.log('Internet de vuelta, sincronizando...');
    requestSyncNow();
    syncWithRetry();
  });

  // Revisión periódica por si el evento 'online' no se disparó
  setInterval(syncFromPage, 5000);

  // Si la página se abre con internet y quedaron posts pendientes de antes, subirlos
  if (navigator.onLine) {
    requestSyncNow();
    syncFromPage();
  }
}

if ('indexedDB' in window) {
  readAllData('posts')
    .then(function (data) {
      if (!networkDataReceived) {
        console.log('From cache', data);
        updateUI(data);
      }
    });
}

function sendData() {
  var post = {
    id: new Date().toISOString(),
    title: titleInput.value,
    location: locationInput.value,
    image: 'https://ctoevysqlxkikjtrpoho.supabase.co/storage/v1/object/public/imagenes/sf-boat.jpg'
  };
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(post)
  })
    .then(function (res) {
      console.log('Sent data', res);
      createCard(post);
    })
    .catch(function (err) {
      console.log('Error while sending data', err);
    });
}

form.addEventListener('submit', function (event) {
  event.preventDefault();

  if (titleInput.value.trim() === '' || locationInput.value.trim() === '') {
    alert('Please enter valid data!');
    return;
  }

  closeCreatePostModal();

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then(function (sw) {
        var post = {
          id: new Date().toISOString(),
          title: titleInput.value,
          location: locationInput.value
        };
        writeData('sync-posts', post)
          .then(function () {
            needsRefresh = true;
            return sw.sync.register('sync-new-posts');
          })
          .then(function () {
            var snackbarContainer = document.querySelector('#confirmation-toast');
            var data = { message: 'Your Post was saved for syncing!' };
            snackbarContainer.MaterialSnackbar.showSnackbar(data);
            // Mostrar el post en el feed de inmediato, sin esperar a recargar
            createCard({
              title: post.title,
              location: post.location,
              image: 'https://ctoevysqlxkikjtrpoho.supabase.co/storage/v1/object/public/imagenes/sf-boat.jpg'
            });
          })
          .catch(function (err) {
            // Si el navegador no deja usar Background Sync (NotAllowedError),
            // se quita de sync-posts y se envía directo a Firebase
            console.log('Background Sync no disponible, enviando directo:', err);
            deleteItemFromData('sync-posts', post.id);
            sendData();
          });
      });
  } else {
    sendData();
  }
});