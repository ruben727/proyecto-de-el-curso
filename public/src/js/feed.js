var shareImageButton = document.querySelector('#share-image-button');
var createPostArea = document.querySelector('#create-post');
var closeCreatePostModalButton = document.querySelector('#close-create-post-modal-btn');
var sharedMomentsArea = document.querySelector('#shared-moments');
var form = document.querySelector('form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');
var videoPlayer = document.querySelector('#player');
var canvasElement = document.querySelector('#canvas');
var captureButton = document.querySelector('#capture-btn');
var switchCameraButton = document.querySelector('#switch-camera-btn');
var retakeButton = document.querySelector('#retake-btn');
var imagePickerArea = document.querySelector('#pick-image');
var imagePicker = document.querySelector('#image-picker');
var cameraMessage = document.querySelector('#camera-message');
var locationButton = document.querySelector('#location-btn');
var locationLoader = document.querySelector('#location-loader');

var picture = null;            // foto (data URL JPEG) que se va a publicar
var currentStream = null;
var facingMode = 'environment'; // cámara trasera por defecto
var MAX_IMAGE_WIDTH = 800;      // se reduce la foto para que pese poco en Firebase/IndexedDB

// ---------------------------------------------------------------------------
// Cámara
// ---------------------------------------------------------------------------
function showImagePicker(message) {
  if (message) {
    cameraMessage.textContent = message;
  }
  imagePickerArea.style.display = 'block';
  videoPlayer.style.display = 'none';
  captureButton.style.display = 'none';
  switchCameraButton.style.display = 'none';
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(function (track) {
      track.stop();
    });
    currentStream = null;
  }
  videoPlayer.srcObject = null;
}

function initializeMedia() {
  cameraMessage.textContent = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    // La cámara solo funciona en HTTPS (o localhost)
    showImagePicker('Tu navegador no permite usar la cámara aquí.');
    return;
  }

  stopCamera();
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  })
    .then(function (stream) {
      currentStream = stream;
      videoPlayer.srcObject = stream;
      videoPlayer.style.display = 'block';
      canvasElement.style.display = 'none';
      captureButton.style.display = 'inline-block';
      retakeButton.style.display = 'none';
      imagePickerArea.style.display = 'block';
      // Solo mostrar "cambiar cámara" si hay más de una
      return navigator.mediaDevices.enumerateDevices();
    })
    .then(function (devices) {
      var cams = devices.filter(function (d) { return d.kind === 'videoinput'; });
      switchCameraButton.style.display = cams.length > 1 ? 'inline-block' : 'none';
    })
    .catch(function (err) {
      console.log('No se pudo abrir la cámara:', err);
      showImagePicker('No se pudo acceder a la cámara (' + err.name + ').');
    });
}

// Dibuja una imagen/video en el canvas reduciéndola y guarda el resultado en "picture"
function drawToCanvas(source, srcWidth, srcHeight) {
  var scale = Math.min(1, MAX_IMAGE_WIDTH / srcWidth);
  canvasElement.width = Math.round(srcWidth * scale);
  canvasElement.height = Math.round(srcHeight * scale);
  var context = canvasElement.getContext('2d');
  context.drawImage(source, 0, 0, canvasElement.width, canvasElement.height);
  picture = canvasElement.toDataURL('image/jpeg', 0.7);
  canvasElement.style.display = 'block';
  retakeButton.style.display = 'inline-block';
}

captureButton.addEventListener('click', function () {
  if (!videoPlayer.videoWidth) {
    return;
  }
  drawToCanvas(videoPlayer, videoPlayer.videoWidth, videoPlayer.videoHeight);
  videoPlayer.style.display = 'none';
  captureButton.style.display = 'none';
  switchCameraButton.style.display = 'none';
  stopCamera();
});

retakeButton.addEventListener('click', function () {
  picture = null;
  imagePicker.value = '';
  canvasElement.style.display = 'none';
  retakeButton.style.display = 'none';
  initializeMedia();
});

switchCameraButton.addEventListener('click', function () {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  initializeMedia();
});

// Respaldo: elegir una foto de la galería o tomarla con la app de cámara nativa
imagePicker.addEventListener('change', function (event) {
  var file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  var img = new Image();
  var objectUrl = URL.createObjectURL(file);
  img.onload = function () {
    stopCamera();
    videoPlayer.style.display = 'none';
    captureButton.style.display = 'none';
    switchCameraButton.style.display = 'none';
    drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(objectUrl);
  };
  img.src = objectUrl;
});

// ---------------------------------------------------------------------------
// Geolocalización
// ---------------------------------------------------------------------------
if (!('geolocation' in navigator)) {
  locationButton.style.display = 'none';
}

locationButton.addEventListener('click', function () {
  locationButton.style.display = 'none';
  locationLoader.style.display = 'inline-block';

  navigator.geolocation.getCurrentPosition(function (position) {
    var lat = position.coords.latitude;
    var lng = position.coords.longitude;
    // Convertir coordenadas en nombre de lugar (OpenStreetMap). Si falla, se dejan las coordenadas.
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&accept-language=es&lat=' + lat + '&lon=' + lng)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var a = data.address || {};
        var place = [a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state]
          .filter(Boolean).join(', ');
        return place || data.display_name;
      })
      .catch(function () { return null; })
      .then(function (place) {
        locationInput.value = place || (lat.toFixed(5) + ', ' + lng.toFixed(5));
        locationInput.parentElement.classList.add('is-dirty');
        locationButton.style.display = 'inline-block';
        locationLoader.style.display = 'none';
      });
  }, function (err) {
    console.log('No se pudo obtener la ubicación:', err);
    locationButton.style.display = 'inline-block';
    locationLoader.style.display = 'none';
    alert('No se pudo obtener tu ubicación, escríbela manualmente.');
  }, { timeout: 10000, enableHighAccuracy: true });
});

// ---------------------------------------------------------------------------
// Modal de crear post
// ---------------------------------------------------------------------------
function openCreatePostModal() {
  createPostArea.style.transform = 'translateY(0)';
  initializeMedia();
}

function resetCreatePostForm() {
  picture = null;
  imagePicker.value = '';
  canvasElement.style.display = 'none';
  retakeButton.style.display = 'none';
  cameraMessage.textContent = '';
  titleInput.value = '';
  locationInput.value = '';
  titleInput.parentElement.classList.remove('is-dirty');
  locationInput.parentElement.classList.remove('is-dirty');
}

function closeCreatePostModal() {
  createPostArea.style.transform = 'translateY(100vh)';
  stopCamera();
  videoPlayer.style.display = 'none';
  captureButton.style.display = 'none';
  switchCameraButton.style.display = 'none';
  imagePickerArea.style.display = 'none';
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

function showToast(message) {
  var snackbarContainer = document.querySelector('#confirmation-toast');
  snackbarContainer.MaterialSnackbar.showSnackbar({ message: message });
}

// Envío directo (navegadores sin Background Sync, p. ej. iPhone/Firefox)
function sendData(post) {
  fetch(FIREBASE_BASE_URL + '/' + firebaseKeyFromId(post.id) + '.json', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(post)
  })
    .then(function (res) {
      if (!res.ok) {
        throw new Error('Firebase respondió ' + res.status);
      }
      console.log('Sent data', res);
      createCard(post);
      showToast('¡Post publicado!');
      notifyNewPost(post);
    })
    .catch(function (err) {
      console.log('Error while sending data', err);
      showToast('No se pudo publicar el post, intenta de nuevo.');
    });
}

form.addEventListener('submit', function (event) {
  event.preventDefault();

  if (titleInput.value.trim() === '' || locationInput.value.trim() === '') {
    alert('Por favor escribe un título y una ubicación');
    return;
  }

  // Se arma el post ANTES de cerrar/limpiar el formulario
  var post = {
    id: new Date().toISOString(),
    title: titleInput.value.trim(),
    location: locationInput.value.trim(),
    image: picture || DEFAULT_POST_IMAGE
  };

  closeCreatePostModal();
  resetCreatePostForm();

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then(function (sw) {
        return writeData('sync-posts', post)
          .then(function () {
            needsRefresh = true;
            return sw.sync.register('sync-new-posts');
          })
          .then(function () {
            showToast('¡Tu post se guardó y se publicará en cuanto haya conexión!');
            // Mostrar el post en el feed de inmediato, sin esperar a recargar
            createCard(post);
          })
          .catch(function (err) {
            // Si el navegador no deja usar Background Sync (NotAllowedError),
            // se quita de sync-posts y se envía directo a Firebase
            console.log('Background Sync no disponible, enviando directo:', err);
            deleteItemFromData('sync-posts', post.id);
            sendData(post);
          });
      });
  } else {
    sendData(post);
  }
});
