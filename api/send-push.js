// Función serverless de Vercel: envía una notificación push a todos los suscriptores
// cuando se publica un post nuevo.
//
// Variables de entorno necesarias (Vercel → Settings → Environment Variables):
//   VAPID_PUBLIC_KEY   la misma llave pública que está en public/src/js/app.js
//   VAPID_PRIVATE_KEY  la llave privada (¡nunca subirla al repositorio!)
//   VAPID_SUBJECT      opcional, p. ej. "mailto:tu-correo@ejemplo.com"

// web-push v4 es un módulo ESM: se carga con import() dinámico desde CommonJS
let webpushPromise;
function loadWebPush() {
  webpushPromise = webpushPromise || import('web-push').then((m) => m.default || m);
  return webpushPromise;
}

const FIREBASE_DB = 'https://proyecto-7c436-default-rtdb.firebaseio.com';

// Igual que en public/src/js/utility.js
function firebaseKeyFromId(id) {
  return String(id).replace(/[.#$\[\]:]/g, '-');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Faltan las llaves VAPID en las variables de entorno' });
  }

  const id = req.body && req.body.id;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Falta el id del post' });
  }

  const postUrl = `${FIREBASE_DB}/post/${firebaseKeyFromId(id)}.json`;

  // El contenido se lee de Firebase (no del cliente) y solo se notifica una vez por post
  const postRes = await fetch(postUrl);
  const post = postRes.ok ? await postRes.json() : null;
  if (!post) {
    return res.status(404).json({ error: 'El post no existe' });
  }
  if (post.notified) {
    return res.status(200).json({ sent: 0, skipped: 'ya notificado' });
  }
  await fetch(postUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notified: true })
  });

  const webpush = await loadWebPush();
  const subject = process.env.VAPID_SUBJECT || `https://${req.headers.host}`;
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subsRes = await fetch(`${FIREBASE_DB}/subscriptions.json`);
  const subs = (subsRes.ok && (await subsRes.json())) || {};

  const payload = JSON.stringify({
    title: 'Nuevo post en UTEQGram',
    content: `${post.title} — ${post.location}`,
    openUrl: '/',
    tag: `post-${id}`
  });

  let sent = 0;
  await Promise.all(
    Object.entries(subs).map(async ([key, sub]) => {
      if (!sub || !sub.endpoint) return;
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err) {
        // 404/410 = la suscripción ya no existe (el usuario la quitó): se borra
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${FIREBASE_DB}/subscriptions/${key}.json`, { method: 'DELETE' });
        } else {
          console.error('Error enviando push', err.statusCode, err.body);
        }
      }
    })
  );

  return res.status(200).json({ sent });
};
