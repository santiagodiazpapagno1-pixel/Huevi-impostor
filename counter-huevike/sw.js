// Service worker: guarda todo el juego para que funcione sin internet después de la primera carga.
// Al cambiar cualquier archivo, subir la versión para que se descarguen los nuevos y se borren los viejos.
const CACHE = 'counter-huevike-v1';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/config.js', 'js/game.js', 'js/maps.js', 'js/physics.js', 'js/bots.js', 'js/models.js',
  'js/graphics.js', 'js/textures.js', 'js/audio.js', 'js/input.js', 'js/ui.js', 'js/net.js', 'js/victory.js',
  'vendor/three.module.min.js', 'vendor/peerjs.min.js',
  'vendor/jsm/objects/Sky.js', 'vendor/jsm/environments/RoomEnvironment.js', 'vendor/jsm/utils/BufferGeometryUtils.js',
  'vendor/jsm/postprocessing/EffectComposer.js', 'vendor/jsm/postprocessing/RenderPass.js', 'vendor/jsm/postprocessing/ShaderPass.js',
  'vendor/jsm/postprocessing/Pass.js', 'vendor/jsm/postprocessing/MaskPass.js', 'vendor/jsm/postprocessing/UnrealBloomPass.js',
  'vendor/jsm/postprocessing/OutputPass.js', 'vendor/jsm/shaders/CopyShader.js', 'vendor/jsm/shaders/LuminosityHighPassShader.js',
  'vendor/jsm/shaders/OutputShader.js', 'vendor/jsm/shaders/VignetteShader.js', 'vendor/jsm/shaders/FXAAShader.js',
  'assets/fonts/luckiest-guy.woff2', 'assets/fonts/rubik.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // el servidor de salas (PeerJS) siempre va por red
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : undefined))),
  );
});
