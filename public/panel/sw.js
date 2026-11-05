/**
 * Service worker del panel (/panel/). Existe para que Chrome ofrezca
 * «Instalar app» y el panel aparezca en el menú «Compartir» de Android
 * (ver manifest.json). NO guarda nada en caché a propósito: el panel trae la
 * vitrina del último build, y una copia vieja te haría publicar sobre datos
 * que ya cambiaron. Solo pone una página clara cuando no hay señal.
 */
const SIN_SENAL = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin señal — KalidaPresio</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #140b21; color: #f0e8fa; font: 16px/1.55 system-ui, sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 420px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  p { color: #a897be; margin: 0 0 18px; }
  button { background: #ff8a3d; color: #23120a; border: 0; border-radius: 8px; padding: 12px 18px; font: inherit; font-weight: 700; cursor: pointer; }
</style></head>
<body><main>
  <h1>No hay señal</h1>
  <p>Lo que compartiste no se perdió: sigue en esta pantalla. Cuando vuelva la conexión, toca «Reintentar».</p>
  <button type="button" onclick="location.reload()">Reintentar</button>
</main></body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    // La página se pide a la red mientras el service worker despierta.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.mode !== 'navigate') return;
  evento.respondWith((async () => {
    try {
      return (await evento.preloadResponse) || (await fetch(evento.request));
    } catch {
      return new Response(SIN_SENAL, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  })());
});
