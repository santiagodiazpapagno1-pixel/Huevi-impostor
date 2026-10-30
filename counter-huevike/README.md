# Counter Huevike

Shooter 3D por equipos para el navegador, pensado para celular. El objetivo es llevar el huevo podrido a la base enemiga, instalarlo y defenderlo 60 segundos.

## Cómo jugarlo

- **Publicado en GitHub Pages:** `https://santiagodiazpapagno1-pixel.github.io/Huevi-impostor/counter-huevike/`. Funciona una vez que esta carpeta está en la rama que publica Pages.
- **En tu compu:** desde la raíz del repo ejecutá `python3 -m http.server 8000` y abrí `http://localhost:8000/counter-huevike/`. Abriendo el archivo con doble clic no funciona, porque los módulos de JavaScript necesitan un servidor.

## Instalarlo en el celular

- **Android (Chrome):** en el menú del juego tocá **📲 Instalar app**, o en el menú del navegador (⋮) elegí **Instalar app**.
- **iPhone (Safari):** tocá **Compartir** y después **Agregar a pantalla de inicio**. El juego también muestra estas instrucciones.

Una vez instalado se abre en pantalla completa. El modo solo funciona sin internet después de la primera carga.

## Multijugador online

Las salas usan WebRTC con [PeerJS](https://peerjs.com/):
- El dueño de la sala hace de servidor: simula la partida y los bots.
- Para encontrarse, los dispositivos usan el servidor público y gratuito de PeerJS (`0.peerjs.com`), así que hace falta internet.
- Si ese servidor no anda, se puede usar uno propio agregando `?servidor=https://tu-servidor:443/` a la dirección.

Limitaciones:
- Si el dueño se desconecta, la partida termina para todos.
- Si un invitado se desconecta, un bot ocupa su lugar.
- Con muchos jugadores, el celular del dueño hace más trabajo. Conviene que el dueño use wifi y un dispositivo potente.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `style.css` | Pantallas, HUD y controles táctiles |
| `js/main.js` | Menús, sala de espera, bucle principal, instalación |
| `js/game.js` | Reglas: huevo, rondas, armas, vida, reaparición, sincronización |
| `js/bots.js` | Inteligencia artificial |
| `js/maps.js` | Los 5 mapas |
| `js/physics.js` | Colisiones, disparos y navegación |
| `js/graphics.js` | Render, luces, cielo, postprocesado y efectos |
| `js/models.js`, `js/victory.js` | Modelos 3D y escena final con el Huevero Freyre |
| `js/audio.js` | Sonidos y música generados por código |
| `js/net.js` | Salas online |
| `sw.js`, `manifest.webmanifest`, `icons/` | App instalable y modo sin internet |
| `vendor/` | Three.js 0.160.0 y PeerJS 1.5.4 incluidos en el proyecto |

**Al modificar cualquier archivo**, subí la versión de `CACHE` en `sw.js` (por ejemplo `counter-huevike-v2`). Si no, los celulares que ya lo instalaron siguen usando la versión vieja.
