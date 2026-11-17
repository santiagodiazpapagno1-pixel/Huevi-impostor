# Huevi Gol

Puzzles de fútbol por trazo con huevos de barrio. Todo el juego está en un solo archivo: `index.html` (HTML + CSS + JavaScript). Three.js y PeerJS se cargan por CDN.

## Cómo se juega

- El juego se congela cuando la pelota le llega a un huevo de tu equipo. Dibujá con el dedo o el mouse **desde la pelota**:
  - **hasta un compañero** (aro celeste, dentro de la zona verde) para pasarla,
  - **hasta el arco** para patear (la pelota va adonde soltás el dedo).
- La línea punteada muestra la trayectoria que va a salir.
- **Efecto:** curvá el trazo y la pelota dobla para ese lado. Así se pasa la barrera.
- **Fuerza:** un trazo largo y rápido sale fuerte; uno lento sale bombeado.
- **Por el aire:** terminá el trazo con un ganchito hacia arriba y el pase va alto, para cabecear.
- **Vaselina:** con el arquero adelantado, hacé un trazo corto y lento al arco.
- **Defensa:** las sombras rojas muestran hasta dónde llega cada defensor. La línea celeste marca el offside (en los niveles fáciles).
- **Si sale mal:** podés **rebobinar** al último congelado. La primera vez de cada nivel es gratis; después cuesta 30 pesitos. También podés **reintentar**, desde el checkpoint en los niveles de 2 goles.
- **Compu:** la rueda del mouse hace zoom (en el celu, pellizcá). La tecla **D** activa el modo debug: vectores, radios, punto previsto del arquero y FPS.

## Crear un nivel en JSON

Podés armarlo con el **Editor** (menú → Editor → Exportar) o escribirlo a mano y pegarlo en el editor con "Importar JSON":

```json
{
  "id": "mi-jugada", "name": "La pared del kiosco", "minute": 77,
  "ctx": "Perdemos 1 a 0. Tito pica al vacío.",
  "stadium": "barrio", "diff": 2, "offsideLine": true, "preview": 1,
  "stars": [{ "k": "angulo" }, { "k": "toques", "n": 2 }],
  "phases": [{
    "team": [
      { "id": "H", "x": -5, "z": 25, "num": 10 },
      { "id": "B", "x": 6, "z": 17, "num": 7, "run": [[4, 11, 1.6]] }
    ],
    "rivals": [{ "t": "d", "x": -2, "z": 19.5 }, { "t": "d", "x": 1.5, "z": 8.5, "mark": "B" }],
    "wall": 0,
    "gk": [0, 0.5],
    "zone": [[-3, 7], [12, 7], [12, 21], [-3, 21]]
  }]
}
```

- **Coordenadas:** en metros. `x` va a lo ancho (de -34 a 34) y `z` es la distancia a la línea del arco rival.
- **`team`:** tus huevos. `H` es el Huevi (el tuyo, con tu ropa) y arranca con la pelota. `run` es una corrida guionada: `[x, z, segundo]`.
- **`rivals`:** `t: "d"` es un defensor (opcional: `mark` con el id del compañero que marca, y `spd`, `rad` y `jump`); `t: "w"` es un jugador de barrera suelto.
- **`wall`:** cantidad de jugadores en la barrera automática, a 9,15 m de la pelota.
- **`gk`:** posición del arquero (opcional).
- **`zone`:** polígono donde se puede dar el pase.
- **`stadium`:** `potrero`, `barrio` o `estadio`.
- **`diff`:** de 1 a 4 (velocidad y radio de los defensores, reacción y alcance del arquero).
- **`preview`:** 1 muestra la previsualización completa; 0.4 muestra solo el primer 40 %.
- **`stars`:** los objetivos de la 2.ª y 3.ª estrella: `angulo`, `cabeza`, `volea`, `asistencia`, `tirolibre`, `toques` (con `n`), `vaselina`, `paloAdentro` o `efecto`.
- **Niveles de 2 goles:** poné dos fases en `phases` y entre gol y gol queda un checkpoint.

Para compartir un nivel, mandá el link `?nivel=...` que genera el botón **Exportar**.

## Invitar a un amigo

- **Reto (mismo escenario):** Con amigos → Mismo escenario. Jugás la jugada y mandás el link `?reto=...`. Tu amigo la juega cuando quiera, ve tu "fantasma" (la repetición de tu jugada) y te devuelve un link con la tabla actualizada. No hace falta servidor: todo viaja en el link.
- **En vivo (mano a mano o picado por turnos):** creá la sala y pasale el código de 4 letras, el link `?sala=XXXX` o el QR. En el mano a mano, la elección del arquero viaja cifrada (compromiso + revelación) para que nadie haga trampa.
- **Probar en una sola compu:** agregá `?red=local` a la URL y abrí dos pestañas.

## Determinismo

La pelota usa física propia con paso fijo de 1/120 s y un RNG con semilla (mulberry32). Por la red solo viajan `{nivel, semilla, trazos, resultado}`: cada cliente vuelve a simular la jugada. Para comprobarlo, ejecutá `HueviGol.Tests.determinism()` en la consola o usá el botón de Ajustes.
