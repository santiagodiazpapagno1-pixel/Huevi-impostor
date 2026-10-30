// Configuración general, catálogo de armas y frases de Counter Huevike.

export const VERSION = '1.0.0';

export const RULES = {
  roundTime: 300,          // 5 minutos por ronda
  plantTime: 60,           // cuenta regresiva del huevo instalado
  defuseTime: 5,           // segundos manteniendo el botón
  respawnTime: 7,          // reaparición
  halfTime: 150,           // cada mitad de la ronda 3 decisiva
  suddenDeathTime: 120,
  intermission: 6,         // pausa entre rondas
  plantRadius: 4.2,        // radio de la zona de instalación (centro de la base)
  defuseRadius: 2.4,
  pickupRadius: 2.2,
  maxHp: 100,
  regenDelay: 6,           // segundos sin daño antes de regenerar
  regenRate: 4,            // vida por segundo (lento a propósito)
  medkitHeal: 50,
  medkitRespawn: 25,
  weaponRespawn: 30,
  maxWeapons: 3,
  minTeam: 4,
  maxTeam: 11,
};

export const PLAYER = {
  radius: 0.42,
  height: 1.6,
  eye: 1.38,
  speed: 6.2,
  accel: 40,
  airControl: 0.35,
  jump: 7.2,
  gravity: 22,
  step: 0.55,
};

// Catálogo de armas. Cada una tiene un rol claro para que ninguna domine en todas las distancias.
//  dmg: daño por bala/perdigón, rate: segundos entre disparos, mag: cargador, reserve: munición extra,
//  reload: tiempo de recarga, spread: imprecisión (rad), range: alcance efectivo (m), falloff: daño mínimo a distancia,
//  recoil: patada de cámara (rad), pellets: proyectiles por disparo, head: multiplicador de cabeza, move: velocidad relativa.
export const WEAPONS = {
  pistola: {
    name: 'Pistola Yema-9', short: 'PISTOLA', dmg: 24, rate: 0.26, mag: 12, reserve: Infinity, reload: 1.2,
    spread: 0.012, range: 45, falloff: 0.6, recoil: 0.018, pellets: 1, head: 2, move: 1.0, auto: false,
    color: 0x3a3f46, accent: 0xf4c542, sound: { pitch: 1.25, body: 0.5, len: 0.12 },
  },
  smg: {
    name: 'Subfusil Batidora', short: 'SUBFUSIL', dmg: 15, rate: 0.075, mag: 30, reserve: 120, reload: 1.9,
    spread: 0.034, range: 28, falloff: 0.45, recoil: 0.011, pellets: 1, head: 1.6, move: 1.05, auto: true,
    color: 0x2b2f36, accent: 0x5fd3ff, sound: { pitch: 1.5, body: 0.35, len: 0.08 },
  },
  rifle: {
    name: 'Rifle Cascarón AR', short: 'RIFLE', dmg: 25, rate: 0.11, mag: 25, reserve: 100, reload: 2.3,
    spread: 0.016, range: 70, falloff: 0.7, recoil: 0.016, pellets: 1, head: 2, move: 0.95, auto: true,
    color: 0x4b4636, accent: 0xff8a3d, sound: { pitch: 1.0, body: 0.7, len: 0.14 },
  },
  escopeta: {
    name: 'Escopeta Omelette', short: 'ESCOPETA', dmg: 13, rate: 0.85, mag: 6, reserve: 24, reload: 2.7,
    spread: 0.085, range: 14, falloff: 0.2, recoil: 0.06, pellets: 8, head: 1.4, move: 0.95, auto: false,
    color: 0x5a3b26, accent: 0xd8d8d8, sound: { pitch: 0.7, body: 1.0, len: 0.25 },
  },
  francotirador: {
    name: 'Francotirador Huevo Duro', short: 'SNIPER', dmg: 90, rate: 1.35, mag: 5, reserve: 15, reload: 3.1,
    spread: 0.0015, range: 140, falloff: 0.9, recoil: 0.09, pellets: 1, head: 2.2, move: 0.85, auto: false,
    hipSpread: 0.07, color: 0x2e3b2a, accent: 0xb6ff5c, sound: { pitch: 0.6, body: 1.2, len: 0.35 },
  },
  ametralladora: {
    name: 'Ametralladora Gallinero', short: 'AMETRALL.', dmg: 20, rate: 0.095, mag: 60, reserve: 120, reload: 4.2,
    spread: 0.042, range: 50, falloff: 0.6, recoil: 0.013, pellets: 1, head: 1.6, move: 0.8, auto: true,
    color: 0x333333, accent: 0xff4d4d, sound: { pitch: 0.85, body: 0.9, len: 0.13 },
  },
  revolver: {
    name: 'Revólver Frito .44', short: 'REVÓLVER', dmg: 55, rate: 0.6, mag: 6, reserve: 30, reload: 2.4,
    spread: 0.008, range: 55, falloff: 0.65, recoil: 0.05, pellets: 1, head: 2, move: 1.0, auto: false,
    color: 0x6b6b6b, accent: 0xe8c07a, sound: { pitch: 0.8, body: 1.0, len: 0.2 },
  },
};

export const PICKUP_WEAPONS = ['smg', 'rifle', 'escopeta', 'francotirador', 'ametralladora', 'revolver'];

export const MAP_LIST = [
  { id: 'ciudad', name: 'Ciudad abandonada', desc: 'Calles rotas, autos quemados y callejones.' },
  { id: 'selva', name: 'Selva', desc: 'Senderos, ruinas y vegetación cerrada.' },
  { id: 'desierto', name: 'Desierto', desc: 'Fortalezas, torres y rocas bajo el sol.' },
  { id: 'flotante', name: 'Ciudad flotante', desc: 'Plataformas y puentes entre las nubes.' },
  { id: 'montana', name: 'Montaña', desc: 'Desniveles, senderos y búnkeres.' },
];

export const MODES = {
  solo: { name: 'Solo contra la IA', online: false },
  coop: { name: 'Amigos contra la IA', online: true },
  privada: { name: 'Sala privada de amigos', online: true },
};

// Colores por rol: azul defiende, rojo ataca.
export const ROLE_COLORS = { atk: 0xe8413c, def: 0x2f7cf6 };
export const ROLE_CSS = { atk: '#ff5249', def: '#3d8bff' };

export const PHRASES = {
  kill: ['HUEVO MENOS, SEGUÍ ASÍ', 'ENTRÓ COMO TROMPADA', 'LA SINTIÓ TODA', 'A LA SARTÉN', 'QUEDÓ REVUELTO', 'CÁSCARA AL PISO'],
  headshot: ['¡A LA YEMA!', '¡JUSTO EN LA CÁSCARA!', '¡TIRO A LA YEMA, CRACK!'],
  streak: { 2: 'DOBLETE', 3: 'TRIPLETE: TORTILLA', 4: 'MAPLE COMPLETO', 5: 'IMPARABLE, SOS UNA GALLINA DE ORO', 7: 'LEYENDA DE LA HUEVERÍA' },
  planted: '¡HUEVO PODRIDO INSTALADO!',
  defused: '¡HUEVO DESACTIVADO! ZAFAMOS',
  defusedEnemy: 'NOS DESACTIVARON EL HUEVO',
  pickedMine: 'TENÉS EL HUEVO PODRIDO',
  pickedTeam: 'UN COMPAÑERO TIENE EL HUEVO',
  pickedEnemy: 'EL RIVAL TIENE EL HUEVO',
  dropped: 'EL HUEVO QUEDÓ EN EL PISO',
  exploded: '¡PUM! OLOR A PODRIDO EN TODA LA BASE',
  last30: 'ÚLTIMOS 30 SEGUNDOS',
  last10: '¡10 SEGUNDOS!',
  roundWin: (a, b) => `${a}-${b}, DALE QUE VA`,
  roundLose: 'MAL AHÍ, PERO PONGAN HUEVO QUE SE PUEDE',
  roundDraw: 'EMPATE EN LA RONDA, NADIE SUMA',
  matchWin: 'ESTE EQUIPO SÍ TIENE HUEVOS, ¡FELICITACIONES MUCHACHOS!',
  matchLose: 'HOY NO SE DIO, PERO LA REVANCHA ES SAGRADA. ¡A ENTRENAR ESOS HUEVOS!',
  suddenDeath: 'MUERTE SÚBITA: LA PRIMERA ELIMINACIÓN GANA',
  overtime: 'TIEMPO EXTRA: EL HUEVO SIGUE ACTIVO',
  died: ['TE HICIERON PURÉ', 'TE DEJARON DURO', 'TE ROMPIERON LA CÁSCARA'],
};

export const BOT_NAMES = [
  'Yemita', 'Clarita', 'Cascarudo', 'Pochi', 'Revuelto', 'Pasado x Agua', 'Huevón', 'Tortillero',
  'Kinder', 'Duro', 'Frito', 'Poché', 'Mollet', 'Codorniz', 'Gallo Claudio', 'Pollito', 'Maple',
  'Omelette', 'Benedict', 'Gema', 'Rancherito', 'Cocoliso', 'Huevardo', 'Ovoide',
];

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
