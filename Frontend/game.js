// =====================================================================
// LEVEL 1 – Spiel-Logik
// Kollisions-/Hazard-Daten wurden automatisch aus assets/level.png erkannt
// (Farbanalyse: brauner/gruener Boden = Plattform, violett = Zacken).
// Wenn ihr das Level in eurem Editor aendert, exportiert erneut als PNG
// und lasst die Collision-Daten unten neu generieren (fragt einfach nach).
// =====================================================================

const GROUND_RECTS_RAW = [[2, 386, 156, 94], [18, 178, 92, 28], [114, 322, 92, 28], [210, 274, 92, 28], [226, 370, 188, 110], [450, 258, 156, 28], [450, 418, 252, 62], [786, 402, 172, 78], [818, 146, 92, 28], [834, 258, 92, 28], [930, 210, 92, 28], [994, 274, 284, 206]];
const SPIKE_RECTS_RAW = [[166, 424, 18, 28], [198, 424, 18, 28], [422, 440, 18, 28], [502, 232, 18, 24], [710, 440, 18, 28], [758, 440, 18, 28], [966, 184, 18, 24], [966, 440, 18, 28]];
const SECRET_TRIGGER_RAW = [798, 46, 132, 100];

// Gegner-Platzierung: type = Eintrag aus ENEMY_TYPES, x = Startposition,
// y = Oberkante der Plattform (beides in level.png-Koordinaten). Die passende
// Plattform wird automatisch gesucht, der Gegner patrouilliert genau auf deren Breite.
const ENEMY_SPAWNS = [
  { type: "zombie",         x: 620,  y: 418 }, // breite Plattform in der Mitte (x 450–702)
  { type: "skeleton",       x: 256,  y: 274 }, // schwebende Plattform links (x 210–302)
  { type: "skeletonShield", x: 1150, y: 274 }, // grosse Plattform ganz rechts (x 994–1278)
  { type: "axeZombie",      x: 880,  y: 402 }, // Plattform mit den Baeumen (x 786–958), jagt den Spieler
];

// --- Asset-Loader ---------------------------------------------------
const allImages = [];
let ready = 0;
function loadImg(src) {
  const img = new Image();
  img.onload = onReady;
  img.onerror = () => { console.warn("Bild nicht gefunden:", src); onReady(); };
  img.src = src;
  allImages.push(img);
  return img;
}
function assetsReady() { return ready >= allImages.length; }

const levelImg = loadImg("assets/level.png");
const secretImg = loadImg("assets/secret-room.png");
const bgImg = loadImg("assets/background.png");

// Charakter: 4 Sprite-Sheets, je 6 Frames nebeneinander (Idle/Run x Rechts/Links).
// Die Haende kommen von der Pistole (die Pistolen-Sprites enthalten die Haende).
const CHAR_FRAMES = 6;
const idleRightImg = loadImg("assets/characters/idle_right.png");
const idleLeftImg = loadImg("assets/characters/idle_left.png");
const runRightImg = loadImg("assets/characters/run_right.png");
const runLeftImg = loadImg("assets/characters/run_left.png");

// --- Pistole ---------------------------------------------------------
// Pro Richtung drei Sheets: idle-and-run (6), shoot (3), Reload (11).
// Alle Koordinaten unten sind in Sprite-Pixeln (vor dem 2x-Hochskalieren):
//   grip      = Punkt im Pistolen-Frame, der an die Hand-Position des Koerpers kommt
//   muzzle    = Muendung im idle-Frame (dort startet die Kugel)
//   shootOff / reloadOff = Versatz der anderen Sheets, damit sie deckungsgleich
//               mit dem idle-Frame sitzen (die Frames sind unterschiedlich gross)
// Werte per Pixelanalyse aus den PNGs ermittelt.
const PISTOL_PATH = "assets/weapons/pistol/";
function pistolSheet(dir, anim, frames) {
  return { img: loadImg(`${PISTOL_PATH}Pistol_${dir}_${anim}-Sheet${frames}.png`), frames };
}
function pistolDir(file, cfg) {
  return {
    ...cfg,
    idle: pistolSheet(file, "idle-and-run", 6),
    shoot: pistolSheet(file, "shoot", 3),
    reload: pistolSheet(file, "Reload", 11),
  };
}
const GUN_DIRS = {
  right: pistolDir("side",      { grip: [3, 5], muzzle: [8, 1.5],   shootOff: [0, 0],  reloadOff: [-3, -1] }),
  left:  pistolDir("side-left", { grip: [4, 5], muzzle: [0, 1.5],   shootOff: [-2, 0], reloadOff: [-1, -1] }),
  up:    pistolDir("up",        { grip: [2, 7], muzzle: [2.5, 0.5], shootOff: [0, 0],  reloadOff: [-12, -1] }),
  down:  pistolDir("down",      { grip: [2, 3], muzzle: [2.5, 9],   shootOff: [0, 0],  reloadOff: [-4, -3] }),
};
// Hand-Position am Koerper (Sprite-Pixel): x je nach Blickrichtung, y = 4px ueber den Fuessen
const HAND_X_RIGHT = 9, HAND_X_LEFT = 0, HAND_Y_FROM_BOTTOM = 4;

const MAG_SIZE = 8;          // Schuss pro Magazin
const SHOT_COOLDOWN = 14;    // Frames zwischen zwei Schuessen
const SHOOT_ANIM_TICKS = 3;  // Frames pro Schuss-Animationsbild
const RELOAD_ANIM_TICKS = 5; // Frames pro Nachlade-Animationsbild (11 Bilder ≈ 0,9 s)
const BULLET_SPEED = 9;
const BULLET_RANGE = 270;    // ≈ eine breite Plattform: nah ran muss man, aber nicht direkt davor

// --- Kugeln ------------------------------------------------------------
const BULLET_PATH = "assets/bullets/";
const bulletImg = loadImg(`${BULLET_PATH}Pistol-bullet_Bullet.png`);
const casingImg = loadImg(`${BULLET_PATH}Pistol-bullet_Casting.png`);

// --- Gegner-Typen -------------------------------------------------------
// Alle Gegner-Sheets: Frames a 64x64 nebeneinander, Figur schaut im Original
// nach LINKS, Fuesse stehen im Frame auf y=48.
const ENEMY_FRAME = 64, ENEMY_FEET_Y = 48;
// Zeichen-Groesse aller Gegner (1 = Original). 1.5 -> ca. 46px hoch, Spieler ist 32px.
// Tipp: 2 ergibt die schaerfsten Pixel (ganzzahlig), ist aber deutlich groesser.
const ENEMY_SCALE = 1.5;

function anim(path, frames, ticks, loop) { return { img: loadImg(path), frames, ticks, loop }; }
const Z = "assets/enemies/zombie/";
const SK = "assets/enemies/skeleton/";

const zombieWalk = anim(`${Z}Zombie_Default_Walk.png`, 6, 8, true);
// Das Skelett hat kein eigenes Death-Sheet -> es zeigt kurz den Hurt-Frame und
// zerfaellt dann in Knochen-Splitter (crumble).
const skeletonHurt = anim(`${SK}Skeleton_Default_Hurt.png`, 2, 6, false);
const skeletonDeath = { ...skeletonHurt, ticks: 8 };

// Werte in Sprite-Pixeln (werden mit ENEMY_SCALE multipliziert):
//   w/h          = Hitbox
//   attackGap    = Abstand Koerper-zu-Koerper, ab dem er zuschlaegt
//   attackReach  = wie weit der Schlag vor den Koerper reicht
//   attackHitFrame = in welchem Frame der Attack-Animation der Treffer zaehlt
const ENEMY_TYPES = {
  zombie: {
    anims: {
      idle: anim(`${Z}Zombie_Default_Idle.png`, 6, 10, true),
      walk: zombieWalk,
      chase: zombieWalk,
      attack: anim(`${Z}Zombie_Default_Attack1.png`, 6, 6, false),
      hurt: anim(`${Z}Zombie_Default_Hurt.png`, 6, 4, false),
      dead: anim(`${Z}Zombie_Default_Dead.png`, 6, 8, false),
    },
    w: 16, h: 30, hp: 3,
    patrolSpeed: 0.5, chaseSpeed: 0.9, aggroRange: 130,
    attackGap: 4, attackReach: 14, attackHitFrame: 2, attackCooldown: 45,
    hitColor: "#7fbf6a", shield: false, crumble: false,
  },
  // Skelett mit Schwert: schneller, rennt beim Verfolgen, groessere Reichweite
  skeleton: {
    anims: {
      idle: anim(`${SK}Skeleton_Default_Idle_Sword.png`, 6, 10, true),
      walk: anim(`${SK}MP_Skeleton_Default_Walk_Sword.png`, 6, 8, true),
      chase: anim(`${SK}Skeleton_Default_Run_Sword.png`, 6, 5, true),
      attack: anim(`${SK}Skeleton_Default_Attack_Sword.png`, 6, 6, false),
      hurt: skeletonHurt,
      dead: skeletonDeath,
    },
    w: 14, h: 30, hp: 3,
    patrolSpeed: 0.6, chaseSpeed: 1.4, aggroRange: 150,
    attackGap: 9, attackReach: 20, attackHitFrame: 2, attackCooldown: 40,
    hitColor: "#e8e4d8", shield: false, crumble: true,
  },
  // Skelett mit Schild: langsamer, blockt Kugeln von vorne (ausser beim Zuschlagen)
  skeletonShield: {
    anims: {
      idle: anim(`${SK}Skeleton_Default_Idle_Sword_Shield.png`, 6, 10, true),
      walk: anim(`${SK}MP_Skeleton_Default_Walk_Sword_Shield.png`, 6, 8, true),
      chase: anim(`${SK}Skeleton_Default_X_Sword_Shield.png`, 6, 6, true),
      attack: anim(`${SK}Skeleton_Default_Attack_Sword_Shield.png`, 6, 7, false),
      hurt: skeletonHurt,
      dead: skeletonDeath,
    },
    w: 16, h: 30, hp: 4,
    patrolSpeed: 0.45, chaseSpeed: 1.0, aggroRange: 150,
    attackGap: 9, attackReach: 20, attackHitFrame: 2, attackCooldown: 55,
    hitColor: "#e8e4d8", shield: true, crumble: true,
  },
};
// Axt-Zombie ("Jaeger"): eigene Sheets pro Blickrichtung (Side = rechts,
// Side-left = links), Frames sind eng zugeschnitten und unterschiedlich breit.
// anchor = x-Position des Kopfes im ersten Frame (Sprite-Pixel), daran wird
// das Sprite ueber der Hitbox ausgerichtet, damit es beim Animationswechsel
// nicht springt. Fuesse stehen immer am unteren Frame-Rand.
const AXE = "assets/enemies/zombie-axe/";
function axeAnim(name, frames, ticks, loop, anchorR, anchorL) {
  return {
    r: { img: loadImg(`${AXE}Zombie_Axe_Side_${name}-Sheet${frames}.png`), frames, ticks, loop, anchor: anchorR },
    l: { img: loadImg(`${AXE}Zombie_Axe_Side-left_${name}-Sheet${frames}.png`), frames, ticks, loop, anchor: anchorL },
  };
}
const axeWalk = axeAnim("Walk", 8, 8, true, 11.5, 8.5);
// Second-Attack = Axt-Wurf (9 Frames, in Frame 3 fliegt die Axt los).
// Die Frames 4–8 zeigen ihn OHNE Axt -> daraus werden "unbewaffnet stehen"
// (Frame 4) und "unbewaffnet laufen" (Frames 5–8 als Schleife).
const axeThrowSheet = axeAnim("Second-Attack", 9, 5, false, 16.5, 9.5);
function subAnim(src, start, frames, ticks, loop, anchorR, anchorL) {
  return {
    r: { ...src.r, start, frames, sheetFrames: 9, ticks, loop, anchor: anchorR },
    l: { ...src.l, start, frames, sheetFrames: 9, ticks, loop, anchor: anchorL },
  };
}
ENEMY_TYPES.axeZombie = {
  hunter: true,   // eigene Physik: Schwerkraft, springt, verlaesst seine Plattform
  scale: 3,       // ganzzahlig -> scharfe Pixel, ca. 54px hoch (andere Gegner ~46px)
  anims: {
    idle: axeAnim("Idle", 6, 10, true, 11.7, 9.3),
    walk: axeWalk,
    chase: { r: { ...axeWalk.r, ticks: 5 }, l: { ...axeWalk.l, ticks: 5 } },
    attack: axeAnim("First-Attack", 7, 6, false, 12.5, 11.5),
    throw: axeThrowSheet,
    unarmedIdle: subAnim(axeThrowSheet, 4, 1, 10, true, 18.5, 7.5),
    unarmedWalk: subAnim(axeThrowSheet, 5, 4, 7, true, 18.5, 7.5),
    dead: axeAnim("First-Death", 6, 8, false, 11.7, 14.3),
  },
  w: 8, h: 17, hp: 8,
  patrolSpeed: 0.5, chaseSpeed: 1.6,
  aggroRange: 300,   // ab hier nimmt er die Jagd auf ...
  loseRange: 560,    // ... und gibt erst bei so viel Abstand wieder auf
  jumpForce: -12.6, jumpSpeed: 2.6, jumpCooldown: 40,
  attackGap: 3, attackReach: 9, attackHitFrame: 4, attackCooldown: 50,
  // Axt-Wurf: nur aus mittlerer Distanz und ungefaehr auf gleicher Hoehe
  throwMinDist: 100, throwMaxDist: 240, throwReleaseFrame: 3,
  throwCooldown: 200,     // Frames nach dem Aufheben, bis er wieder wirft
  unarmedMaxTicks: 420,   // spaetestens dann hat er wieder eine Axt
  lostAxeTicks: 150,      // Axt in Abgrund gefallen -> so lange unbewaffnet, dann neue Axt
  hitColor: "#8a2b35", shield: false, crumble: false,
};

// --- Wurfaxt (Projektil) ---
// Thrown = drehende Axt im Flug, Landing = einschlagen mit Staub, Landed = steckt im Boden.
// Landed passt genau auf den letzten Landing-Frame (Versatz landedOff, Sprite-Pixel).
const THROWN_AXE = {
  r: {
    thrown: { img: loadImg(`${AXE}Axe_Side_Thrown-Sheet9.png`), frames: 9 },
    landing: { img: loadImg(`${AXE}Axe_Side_Landing-Sheet5.png`), frames: 5 },
    landed: loadImg(`${AXE}Axe_Side_Landed.png`),
    landedOff: [0, 4],
  },
  l: {
    thrown: { img: loadImg(`${AXE}Axe_Side-left_Thrown-Sheet9.png`), frames: 9 },
    landing: { img: loadImg(`${AXE}Axe_Side-left_Landing-Sheet5.png`), frames: 5 },
    landed: loadImg(`${AXE}Axe_Side-left_Landed.png`),
    landedOff: [6, 4],
  },
};
const AXE_SCALE = 3;
const AXE_SPEED = 5;           // horizontale Fluggeschwindigkeit
const AXE_GRAVITY = 0.2;       // Bogen
const AXE_SPIN_TICKS = 3, AXE_LANDING_TICKS = 4;
const AXE_HITBOX = 22;

const ENEMY_EDGE_PAUSE = 50; // kurz stehen bleiben an der Plattformkante

// --- Canvas / Fokus ----------------------------------------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const stage = document.getElementById("stage");
const focusNotice = document.getElementById("focusNotice");
focusNotice.addEventListener("click", () => { stage.focus(); focusNotice.style.display = "none"; });
stage.addEventListener("blur", () => { focusNotice.style.display = "flex"; });
stage.addEventListener("click", () => stage.focus());
stage.focus();

const W = canvas.width, H = canvas.height;
const GRAVITY = 0.6;
const MOVE_SPEED = 3.3;
const JUMP_FORCE = -11.5;
const DOUBLE_JUMP_FORCE = -9.8;
const GROUND_FRICTION = 0.78;

let LEVEL_Y_OFFSET = 60;
let LEVEL_WIDTH = 1280;
let GROUND = [], SPIKES = [], SECRET_TRIGGER = null;
function toRect([x, y, w, h]) { return { x, y: y + LEVEL_Y_OFFSET, w, h }; }

let enemies = [], bullets = [], particles = [], axes = [];

function onReady() {
  ready++;
  if (assetsReady()) {
    LEVEL_Y_OFFSET = H - levelImg.naturalHeight;
    LEVEL_WIDTH = levelImg.naturalWidth;
    GROUND = GROUND_RECTS_RAW.map(toRect);
    SPIKES = SPIKE_RECTS_RAW.map(toRect);
    SECRET_TRIGGER = toRect(SECRET_TRIGGER_RAW);
    player.x = 24;
    player.y = GROUND[0].y - player.h;
    spawnEnemies();
  }
}

// --- Spieler ---
// Hitbox-Groesse an die Sprite-Proportionen angepasst (Sprite ist ~10x17px,
// 2x hochskaliert gezeichnet -> 20x34).
const SPRITE_SCALE = 2;
const player = {
  x: 24, y: 0, w: 20, h: 34,
  vx: 0, vy: 0,
  grounded: false, facing: 1,
  jumpsUsed: 0,
  lives: 5, maxLives: 5,
  invulnFrames: 0,
  inSecretRoom: false, returnX: 24, returnY: 0,
};

const gun = {
  ammo: MAG_SIZE,
  state: "idle",     // "idle" | "shoot" | "reload"
  tick: 0,
  cooldown: 0,
  flash: 0,
  dir: "right",      // welche Pistolen-Sheets gerade benutzt werden
  angle: 0,          // exakter Zielwinkel zur Maus (Kugel fliegt genau so)
  aimHold: 0,        // nach einem Schuss kurz zur Maus schauen, auch beim Laufen
};
const AIM_HOLD_TICKS = 25;

// --- Geheimraum-Geometrie (aus secret-room.png per Farberkennung ermittelt) ---
// Boden-Oberkante bei y=34, Raum-Innenbereich x=34..221, schmale "Oeffnung"
// (der Schacht nach unten) bei x=112..143 -- nur dort fuehrt S/Pfeil-runter
// zurueck ins Hauptlevel.
const SECRET_FLOOR_Y = 34;
const SECRET_LEFT = 38;
const SECRET_RIGHT = 217;
const SECRET_OPENING = { xMin: 108, xMax: 147 };

let cameraX = 0;
let gameOver = false;
let jumpKeyWasDown = false;

// --- Eingabe: Tastatur ---
const keys = {};
const controlKeys = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "r"]);
stage.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (controlKeys.has(k)) e.preventDefault();
});
stage.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

// --- Eingabe: Maus (Zielen + Schiessen) ---
// Mausposition in Canvas-Pixeln; der Canvas wird per CSS skaliert, darum umrechnen.
const mouse = { x: 0, y: 0, down: false, active: false, moved: false };
let shotQueued = false;
function updateMousePos(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
  mouse.active = true;
}
stage.addEventListener("mousemove", (e) => { updateMousePos(e); mouse.moved = true; });
stage.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest("#message") || e.target === focusNotice) return;
  stage.focus();
  updateMousePos(e);
  mouse.down = true;
  shotQueued = true; // kurze Klicks zwischen zwei Frames gehen so nicht verloren
});
window.addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
stage.addEventListener("blur", () => { mouse.down = false; });

setTimeout(() => { document.getElementById("hint").style.opacity = "0"; }, 6000);

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function pointInRect(px, py, r) {
  return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

function resolveGroundCollisions() {
  player.x += player.vx;
  for (const r of GROUND) {
    if (rectsOverlap(player, r)) {
      if (player.vx > 0) player.x = r.x - player.w;
      else if (player.vx < 0) player.x = r.x + r.w;
    }
  }
  player.y += player.vy;
  player.grounded = false;
  for (const r of GROUND) {
    if (rectsOverlap(player, r)) {
      if (player.vy > 0) { player.y = r.y - player.h; player.vy = 0; player.grounded = true; player.jumpsUsed = 0; }
      else if (player.vy < 0) { player.y = r.y + r.h; player.vy = 0; }
    }
  }
}

function takeDamage(knockDir) {
  if (player.invulnFrames > 0) return;
  player.lives--;
  player.invulnFrames = 70;
  player.vx = knockDir * 5;
  player.vy = -6;
  if (player.lives <= 0) triggerGameOver();
}

function triggerGameOver() { gameOver = true; showMessage("Game Over – keine Leben mehr."); }
function showMessage(text) {
  document.getElementById("message-text").textContent = text;
  document.getElementById("message").style.display = "block";
}
document.getElementById("message-btn").addEventListener("click", restart);
function restart() {
  document.getElementById("message").style.display = "none";
  player.x = 24; player.y = GROUND[0].y - player.h;
  player.vx = 0; player.vy = 0; player.lives = 5; player.invulnFrames = 90;
  player.inSecretRoom = false; player.jumpsUsed = 0;
  gun.ammo = MAG_SIZE; gun.state = "idle"; gun.tick = 0; gun.cooldown = 0; gun.flash = 0;
  bullets = []; particles = [];
  spawnEnemies();
  gameOver = false;
  stage.focus();
}

function enterSecretRoom() {
  player.returnX = player.x; player.returnY = player.y;
  player.inSecretRoom = true;
  player.x = secretImg.naturalWidth / 2 - player.w / 2;
  player.y = 40; player.vx = 0; player.vy = 0;
}
function exitSecretRoom() {
  player.inSecretRoom = false;
  player.x = player.returnX; player.y = player.returnY;
  player.vx = 0; player.vy = 0; player.grounded = true; player.jumpsUsed = 0;
}

// =====================================================================
// GEGNER (Zombie, Skelett, Skelett mit Schild)
// =====================================================================
function findPlatform(x, topY) {
  const r = GROUND.find(g => x >= g.x && x <= g.x + g.w && Math.abs(g.y - (topY + LEVEL_Y_OFFSET)) <= 6);
  if (!r) console.warn("Keine Plattform fuer Gegner gefunden bei", x, topY);
  return r;
}

function createEnemy(spawn) {
  const t = ENEMY_TYPES[spawn.type];
  const plat = findPlatform(spawn.x, spawn.y);
  if (!t || !plat) return null;
  const S = t.scale || ENEMY_SCALE;
  const w = Math.round(t.w * S), h = Math.round(t.h * S);
  return {
    type: spawn.type, t, S,
    spawnX: spawn.x - w / 2, spawnY: plat.y - h,
    vx: 0, vy: 0, grounded: true, aggro: false, jumpCooldown: 0,
    flash: 0, maxHp: t.hp,
    hasAxe: true, axe: null, throwCooldown: 60, unarmedTicks: 0, released: false,
    x: spawn.x - w / 2, y: plat.y - h, w, h,
    plat,
    minX: plat.x + 4, maxX: plat.x + plat.w - w - 4,
    dir: -1,                // -1 = links (so sind die Sprites gezeichnet), 1 = rechts
    hp: t.hp,
    state: "walk", animTick: 0,
    pauseTicks: 0, attackCooldown: 0, knockVx: 0, hitDone: false,
    deadTicks: 0, alpha: 1, removed: false,
  };
}

function spawnEnemies() {
  enemies = ENEMY_SPAWNS.map(createEnemy).filter(Boolean);
  axes = [];
}

function setEnemyState(e, state) {
  if (e.state !== state) { e.state = state; e.animTick = 0; e.hitDone = false; }
}
function getAnim(e, state = e.state) {
  const a = e.t.anims[state];
  return e.t.hunter ? a[e.dir > 0 ? "r" : "l"] : a;
}
function enemyFrame(e) {
  const a = getAnim(e);
  const f = Math.floor(e.animTick / a.ticks);
  return (a.start || 0) + (a.loop ? f % a.frames : Math.min(f, a.frames - 1));
}
function enemyAnimDone(e) {
  const a = getAnim(e);
  return !a.loop && e.animTick >= a.frames * a.ticks;
}
function clampToPlatform(e) {
  e.x = Math.max(e.minX, Math.min(e.x, e.maxX));
}

function updateEnemy(e) {
  if (e.t.hunter) { updateHunter(e); return; }
  const t = e.t, S = e.S;
  e.animTick++;
  if (e.flash > 0) e.flash--;

  if (e.state === "dead") {
    if (enemyAnimDone(e)) {
      e.deadTicks++;
      // Zombie-Leiche liegt kurz, Skelett zerfaellt sofort
      const lieTicks = t.crumble ? 0 : 120;
      if (e.deadTicks > lieTicks) e.alpha -= t.crumble ? 1 / 12 : 1 / 60;
      if (e.alpha <= 0) e.removed = true;
    }
    return;
  }
  if (e.attackCooldown > 0) e.attackCooldown--;

  // Rueckstoss (Treffer oder Schild-Block) laeuft unabhaengig vom Zustand aus
  if (e.knockVx) {
    e.x += e.knockVx; e.knockVx *= 0.8;
    if (Math.abs(e.knockVx) < 0.05) e.knockVx = 0;
    clampToPlatform(e);
  }

  // Spieler "in der Naehe": horizontal ueber der Plattform und hoechstens
  // etwas darueber (z. B. im Sprung) -- nicht auf anderen Plattformen.
  const playerBottom = player.y + player.h;
  const playerNear =
    !player.inSecretRoom &&
    player.x + player.w > e.plat.x && player.x < e.plat.x + e.plat.w &&
    playerBottom <= e.plat.y + 2 && playerBottom >= e.plat.y - 90;
  const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
  const gap = Math.abs(dx) - (e.w + player.w) / 2;

  if (e.state === "hurt") {
    if (enemyAnimDone(e)) setEnemyState(e, "idle");
    return;
  }

  if (e.state === "attack") {
    if (enemyFrame(e) >= t.attackHitFrame && !e.hitDone) {
      e.hitDone = true;
      const r = t.attackReach * S;
      const reach = { x: e.dir < 0 ? e.x - r : e.x + e.w - 4, y: e.y + 4, w: r + 4, h: e.h - 8 };
      if (rectsOverlap(player, reach)) takeDamage(e.dir);
    }
    if (enemyAnimDone(e)) { e.attackCooldown = t.attackCooldown; setEnemyState(e, "idle"); }
    return;
  }

  // Verfolgen, wenn der Spieler auf seiner Plattform ist
  if (playerNear && Math.abs(dx) < t.aggroRange) {
    e.dir = dx >= 0 ? 1 : -1;
    e.pauseTicks = 0;
    if (gap < t.attackGap * S) {
      setEnemyState(e, e.attackCooldown === 0 ? "attack" : "idle");
      return;
    }
    const before = e.x;
    e.x += e.dir * t.chaseSpeed;
    clampToPlatform(e);
    setEnemyState(e, e.x === before ? "idle" : "chase"); // an der Kante: stehen bleiben
    return;
  }

  // Patrouille: hin und her, an jeder Kante kurz warten und umdrehen
  if (e.pauseTicks > 0) {
    setEnemyState(e, "idle");
    e.pauseTicks--;
    if (e.pauseTicks === 0) e.dir *= -1;
    return;
  }
  setEnemyState(e, "walk");
  e.x += e.dir * t.patrolSpeed;
  if (e.x <= e.minX && e.dir < 0) { e.x = e.minX; e.pauseTicks = ENEMY_EDGE_PAUSE; }
  else if (e.x >= e.maxX && e.dir > 0) { e.x = e.maxX; e.pauseTicks = ENEMY_EDGE_PAUSE; }
}

// --- Jaeger-KI (Axt-Zombie) -------------------------------------------
function solidAt(x, y) { return GROUND.some(r => pointInRect(x, y, r)); }

// Wie die Spieler-Kollision, nur fuer Gegner
function moveWithCollisions(e) {
  let hitWall = false;
  e.x += e.vx;
  for (const r of GROUND) {
    if (rectsOverlap(e, r)) {
      if (e.vx > 0) e.x = r.x - e.w;
      else if (e.vx < 0) e.x = r.x + r.w;
      hitWall = true;
    }
  }
  e.y += e.vy;
  e.grounded = false;
  for (const r of GROUND) {
    if (rectsOverlap(e, r)) {
      if (e.vy > 0) { e.y = r.y - e.h; e.vy = 0; e.grounded = true; }
      else if (e.vy < 0) { e.y = r.y + r.h; e.vy = 0; }
    }
  }
  e.x = Math.max(0, Math.min(e.x, LEVEL_WIDTH - e.w));
  return hitWall;
}

// Sprung/Fall vorher "im Kopf" durchspielen: landet er auf einer Plattform
// (true) oder faellt er in einen Abgrund (false)? Verhindert, dass der Jaeger
// sich in Luecken stuerzt, durch die er nicht passt.
function landsSafely(e, vy0, vx) {
  const sim = { x: e.x, y: e.y, w: e.w, h: e.h, vx, vy: vy0, grounded: false };
  let doubleJumped = false;
  for (let i = 0; i < 120; i++) {
    sim.vy = Math.min(sim.vy + GRAVITY, 16);
    sim.vx = vx;
    const hitWall = moveWithCollisions(sim);
    if (hitWall && !sim.grounded && !doubleJumped) { sim.vy = e.t.jumpForce * 0.85; doubleJumped = true; }
    if (sim.grounded && i > 0) return true;
    if (sim.y > H) return false;
  }
  return false;
}

function hunterJump(e) {
  e.vy = e.t.jumpForce;
  e.grounded = false;
  e.jumpCooldown = e.t.jumpCooldown;
  e.airVx = e.dir * e.t.jumpSpeed;
  e.doubleJumped = false;
}

// Laeuft auf ein Ziel zu (Spieler oder die eigene Axt) und springt dabei
// ueber Waende, auf hoehere Plattformen und ueber Luecken.
function seek(e, targetX, targetBottom, speed) {
  const ecx = e.x + e.w / 2;
  const dx = targetX - ecx;
  const dy = targetBottom - (e.y + e.h);   // > 0: Ziel liegt tiefer
  if (Math.abs(dx) > 4) e.dir = dx > 0 ? 1 : -1;
  if (!e.grounded) return e.dir * speed;

  const fx = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
  const wallAhead = solidAt(fx, e.y + e.h - 6) || solidAt(fx, e.y + e.h / 2);
  const edgeAhead = !solidAt(fx, e.y + e.h + 4);
  const targetAbove = dy < -40 && Math.abs(dx) < 50;   // Ziel steht direkt ueber ihm
  const targetBelow = dy > 30;
  // Wand -> drueberspringen, Ziel direkt drueber -> hochspringen,
  // Kante -> rueberspringen (ausser das Ziel ist unten, dann einfach runterfallen)
  const wantsJump = wallAhead || targetAbove || (edgeAhead && !targetBelow);
  if (wantsJump && e.jumpCooldown === 0 && landsSafely(e, e.t.jumpForce, e.dir * e.t.jumpSpeed)) {
    hunterJump(e);
    return e.dir * speed;
  }
  // An der Kante: nur weiterlaufen/runterfallen, wenn unten auch Boden kommt
  if (edgeAhead && !(targetBelow && landsSafely(e, 0, e.dir * speed))) return 0;
  if (wallAhead) return 0;
  return Math.abs(dx) > 4 ? e.dir * speed : 0;
}

function throwAxe(e) {
  const handX = e.x + e.w / 2 + e.dir * 10;
  const handY = e.y + 8;
  // Bogen so berechnen, dass die Axt ungefaehr auf Brusthoehe beim Spieler ankommt
  const dist = Math.abs((player.x + player.w / 2) - handX);
  const t = Math.max(8, dist / AXE_SPEED);
  const dyTarget = (player.y + player.h * 0.4) - handY;
  const vy = Math.max(-6, Math.min(3, (dyTarget - 0.5 * AXE_GRAVITY * t * t) / t));
  const axe = {
    x: handX, y: handY, vx: e.dir * AXE_SPEED, vy, dir: e.dir,
    state: "fly", tick: 0, owner: e, hitPlayer: false, groundY: 0, alpha: 1, removed: false,
  };
  axes.push(axe);
  e.axe = axe;
  e.hasAxe = false;
  e.unarmedTicks = 0;
}

function updateHunter(e) {
  const t = e.t;
  e.animTick++;
  if (e.flash > 0) e.flash--;
  if (e.attackCooldown > 0) e.attackCooldown--;
  if (e.jumpCooldown > 0) e.jumpCooldown--;
  if (e.throwCooldown > 0) e.throwCooldown--;

  e.vy = Math.min(e.vy + GRAVITY, 16);

  if (e.state === "dead") {
    e.vx = e.knockVx; e.knockVx *= 0.8;
    moveWithCollisions(e);
    if (enemyAnimDone(e)) {
      e.deadTicks++;
      if (e.deadTicks > 120) e.alpha -= 1 / 60;
      if (e.alpha <= 0) e.removed = true;
    }
    return;
  }

  const S = e.S;
  const pcx = player.x + player.w / 2, ecx = e.x + e.w / 2;
  const dx = pcx - ecx;
  const playerBottom = player.y + player.h;
  const dy = playerBottom - (e.y + e.h);
  const gap = Math.abs(dx) - (e.w + player.w) / 2;
  const sameLevel = Math.abs(dy) < 30;

  // Jagd starten/beenden
  if (player.inSecretRoom || Math.abs(dx) > t.loseRange) e.aggro = false;
  else if (Math.abs(dx) < t.aggroRange && Math.abs(dy) < 170) e.aggro = true;

  let targetVx = 0;

  if (e.state === "attack") {
    // Nahkampf: Axt-Hieb
    if (enemyFrame(e) >= t.attackHitFrame && !e.hitDone) {
      e.hitDone = true;
      const r = t.attackReach * S;
      const reach = { x: e.dir < 0 ? e.x - r : e.x + e.w - 4, y: e.y + 6, w: r + 4, h: e.h - 10 };
      if (rectsOverlap(player, reach)) takeDamage(e.dir);
    }
    if (enemyAnimDone(e)) { e.attackCooldown = t.attackCooldown; setEnemyState(e, "idle"); }

  } else if (e.state === "throw") {
    // Fernkampf: in Frame 3 verlaesst die Axt die Hand
    if (enemyFrame(e) >= t.throwReleaseFrame && !e.released) { e.released = true; throwAxe(e); }
    if (enemyAnimDone(e)) setEnemyState(e, "unarmedIdle");

  } else if (!e.hasAxe) {
    // Ohne Axt: zurueck zur Axt laufen und aufheben
    e.unarmedTicks++;
    const a = e.axe;
    const lost = !a || a.removed;
    if (e.unarmedTicks > t.unarmedMaxTicks || (lost && e.unarmedTicks > t.lostAxeTicks)) {
      // Axt verloren (z. B. in einen Abgrund gefallen) -> nach kurzer Zeit "neue Axt"
      e.hasAxe = true; e.axe = null; e.throwCooldown = t.throwCooldown;
      if (a) a.removed = true;
      setEnemyState(e, "idle");
    } else if (lost) {
      // ohne Axt weiter hinterher, aber kein Angriff moeglich
      targetVx = e.aggro ? seek(e, pcx, playerBottom, t.chaseSpeed) : 0;
      setEnemyState(e, targetVx ? "unarmedWalk" : "unarmedIdle");
    } else if (a.state === "fly") {
      setEnemyState(e, "unarmedIdle");          // erst mal zuschauen, wo sie landet
    } else {
      const atAxe = Math.abs(a.x - ecx) < 10 && Math.abs(a.groundY - (e.y + e.h)) < 8 && e.grounded;
      if (atAxe) {
        a.removed = true; e.axe = null; e.hasAxe = true;
        e.throwCooldown = t.throwCooldown;
        setEnemyState(e, "idle");
      } else {
        targetVx = seek(e, a.x, a.groundY, t.chaseSpeed);
        setEnemyState(e, targetVx ? "unarmedWalk" : "unarmedIdle");
      }
    }

  } else if (e.aggro) {
    if (Math.abs(dx) > 4) e.dir = dx > 0 ? 1 : -1;
    const inReach = gap < t.attackGap * S && sameLevel;
    const canThrow = e.grounded && e.throwCooldown === 0 && Math.abs(dy) < 50 &&
      Math.abs(dx) > t.throwMinDist && Math.abs(dx) < t.throwMaxDist;
    if (inReach) {
      if (e.grounded && e.attackCooldown === 0) setEnemyState(e, "attack");
      else setEnemyState(e, "idle");
    } else if (canThrow) {
      e.released = false;
      setEnemyState(e, "throw");
    } else {
      targetVx = seek(e, pcx, playerBottom, t.chaseSpeed);
      setEnemyState(e, targetVx || !e.grounded ? "chase" : "idle");
    }

  } else {
    // Patrouille auf der aktuellen Plattform, bis er den Spieler bemerkt
    if (e.pauseTicks > 0) {
      setEnemyState(e, "idle");
      if (--e.pauseTicks === 0) e.dir *= -1;
    } else {
      setEnemyState(e, "walk");
      targetVx = e.dir * t.patrolSpeed;
      const fx = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
      if (e.grounded && (!solidAt(fx, e.y + e.h + 4) || solidAt(fx, e.y + e.h / 2))) {
        targetVx = 0; e.pauseTicks = ENEMY_EDGE_PAUSE;
      }
    }
  }

  // im Sprung die Sprungweite halten, am Boden normal laufen
  const baseVx = e.grounded ? targetVx : (e.airVx ?? targetVx);
  if (e.grounded) e.airVx = null;
  e.vx = baseVx + e.knockVx;
  e.knockVx *= 0.8;
  if (Math.abs(e.knockVx) < 0.05) e.knockVx = 0;
  const hitWall = moveWithCollisions(e);
  // Doppelsprung wie der Spieler: prallt er im Sprung gegen eine Kante, springt er nochmal
  if (hitWall && !e.grounded && !e.doubleJumped && e.state !== "dead") {
    e.vy = e.t.jumpForce * 0.85;
    e.doubleJumped = true;
  }

  // In einen Abgrund gefallen -> zurueck zum Startpunkt
  if (e.y > H + 60) {
    e.x = e.spawnX; e.y = e.spawnY; e.vx = 0; e.vy = 0;
    e.aggro = false; e.hasAxe = true;
    if (e.axe) e.axe.removed = true;
    e.axe = null;
    setEnemyState(e, "idle");
  }
}

function updateAxes() {
  for (const a of axes) {
    a.tick++;
    if (a.state === "fly") {
      a.vy += AXE_GRAVITY;
      a.x += a.vx; a.y += a.vy;
      const hb = { x: a.x - AXE_HITBOX / 2, y: a.y - AXE_HITBOX / 2, w: AXE_HITBOX, h: AXE_HITBOX };
      if (!a.hitPlayer && !player.inSecretRoom && rectsOverlap(hb, player)) {
        takeDamage(a.dir);
        a.hitPlayer = true;
        a.vx *= -0.25; a.vy = -2;           // prallt am Spieler ab und faellt runter
      }
      const tipY = a.y + 10;
      for (const r of GROUND) {
        if (!pointInRect(a.x, tipY, r)) continue;
        if (a.vy > 0 && tipY - a.vy <= r.y + 2) {
          a.state = "landing"; a.tick = 0; a.groundY = r.y;   // von oben -> steckt im Boden
          spawnSparks(a.x, r.y, "#c9c2b0", 4);
        } else {
          a.vx = -a.vx * 0.3; a.x += a.vx * 3;               // gegen eine Wand -> abprallen
        }
        break;
      }
      if (a.y > H + 60 || a.x < -60 || a.x > LEVEL_WIDTH + 60) a.removed = true;
    } else if (a.state === "landing") {
      if (a.tick >= 5 * AXE_LANDING_TICKS) a.state = "landed";
    } else if (a.owner.state === "dead") {
      a.alpha -= 1 / 90;                       // Besitzer tot -> Axt verschwindet langsam
      if (a.alpha <= 0) a.removed = true;
    }
  }
  axes = axes.filter(a => !a.removed);
}

// Gibt true zurueck, wenn die Kugel verbraucht ist (Treffer oder Block)
function hitEnemy(e, b) {
  if (e.state === "dead") return false;
  const fromDir = b.vx >= 0 ? 1 : -1;   // Richtung, in die die Kugel fliegt
  const steep = Math.abs(b.vy) > Math.abs(b.vx) * 1.3;

  // Schild: blockt flache Schuesse von vorne -- nicht beim Zuschlagen,
  // nicht von hinten und nicht steil von oben
  const facingBullet = e.dir === -fromDir;
  if (e.t.shield && facingBullet && !steep && e.state !== "attack" && e.state !== "hurt") {
    e.knockVx = fromDir * 1.2;
    spawnSparks(b.x, b.y, "#c9c9d6", 6);
    return true;
  }

  e.hp--;
  e.flash = 6;
  spawnSparks(b.x, b.y, e.t.hitColor, 4);
  if (e.hp <= 0) {
    setEnemyState(e, "dead");
    e.knockVx = fromDir * 1.5;
    if (e.t.crumble) spawnDebris(e.x + e.w / 2, e.y + e.h / 2, e.t.hitColor, 14);
  } else if (e.t.hunter) {
    // Jaeger hat keine Hurt-Animation: nur Aufblitzen + Rueckstoss, und er ist sofort sauer
    e.knockVx = fromDir * 1.8;
    e.aggro = true;
    if (e.state !== "attack") e.dir = -fromDir;
  } else {
    setEnemyState(e, "hurt");
    e.knockVx = fromDir * 2.2;
    e.dir = -fromDir;                    // dreht sich zum Schuetzen um
  }
  return true;
}

// =====================================================================
// WAFFE + KUGELN
// =====================================================================
function chestPoint() {
  return { x: player.x + player.w / 2, y: player.y + player.h - HAND_Y_FROM_BOTTOM * SPRITE_SCALE };
}

// Blickrichtung ("letzte Eingabe gewinnt"):
// - A/D drehen den Charakter sofort in Laufrichtung
// - im Stehen dreht er sich zur Maus, sobald die Maus bewegt wird
// - beim Schiessen (und kurz danach) schaut er immer zur Maus,
//   so kann man z. B. nach rechts laufen und kurz nach hinten schiessen
function updateAim() {
  if (gun.aimHold > 0) gun.aimHold--;
  const moveDir = (keys["d"] || keys["arrowright"] ? 1 : 0) - (keys["a"] || keys["arrowleft"] ? 1 : 0);
  const aiming = mouse.down || shotQueued || gun.aimHold > 0;

  if (!mouse.active) {
    if (moveDir !== 0) player.facing = moveDir;
    gun.dir = player.facing > 0 ? "right" : "left";
    gun.angle = player.facing > 0 ? 0 : Math.PI;
    return;
  }
  const c = chestPoint();
  let dx = mouse.x + cameraX - c.x;
  const dy = mouse.y - c.y;

  if (aiming) player.facing = dx >= 0 ? 1 : -1;
  else if (moveDir !== 0) player.facing = moveDir;
  else if (mouse.moved) player.facing = dx >= 0 ? 1 : -1;
  mouse.moved = false;

  // Maus liegt "hinter" dem Charakter (beim Laufen): Waffe zeigt nach vorne
  if (Math.sign(dx) !== player.facing) dx = Math.abs(dx) * player.facing;
  gun.angle = Math.atan2(dy, dx);
  // Steil nach oben/unten -> up/down-Sheets, sonst seitlich
  if (Math.abs(dy) > Math.abs(dx) * 1.3) gun.dir = dy < 0 ? "up" : "down";
  else gun.dir = player.facing > 0 ? "right" : "left";
}

// Linke obere Ecke des Pistolen-idle-Frames in Welt-/Bildschirm-Koordinaten
function gunOrigin(px, py, scale) {
  const cfg = GUN_DIRS[gun.dir];
  const S = SPRITE_SCALE * scale;
  const charFrameW = (idleRightImg.naturalWidth / CHAR_FRAMES) || 10;
  const spriteLeft = px + (player.w * scale - charFrameW * S) / 2;
  const handX = player.facing > 0 ? HAND_X_RIGHT : HAND_X_LEFT;
  return {
    cfg, S,
    x: spriteLeft + (handX - cfg.grip[0]) * S,
    y: py + player.h * scale - (HAND_Y_FROM_BOTTOM + cfg.grip[1]) * S,
  };
}

function startReload() {
  if (gun.state === "reload" || gun.ammo === MAG_SIZE) return;
  gun.state = "reload"; gun.tick = 0;
}

function fire() {
  const o = gunOrigin(player.x, player.y, 1);
  const mx = o.x + o.cfg.muzzle[0] * o.S;
  const my = o.y + o.cfg.muzzle[1] * o.S;
  bullets.push({
    x: mx, y: my,
    vx: Math.cos(gun.angle) * BULLET_SPEED, vy: Math.sin(gun.angle) * BULLET_SPEED,
    angle: gun.angle, dist: 0, dead: false,
  });
  // Huelse fliegt nach hinten-oben raus
  particles.push({
    type: "casing", x: o.x + 4 * o.S, y: o.y + 2 * o.S,
    vx: -player.facing * (1 + Math.random() * 1.2), vy: -2.2 - Math.random() * 1.5,
    life: 150, maxLife: 150,
  });
  gun.ammo--;
  gun.cooldown = SHOT_COOLDOWN;
  gun.flash = 3;
  gun.aimHold = AIM_HOLD_TICKS;
  gun.state = "shoot"; gun.tick = 0;
}

function updateGun() {
  if (gun.cooldown > 0) gun.cooldown--;
  if (gun.flash > 0) gun.flash--;

  if (gun.state === "shoot") {
    gun.tick++;
    if (gun.tick >= 3 * SHOOT_ANIM_TICKS) {
      gun.state = "idle";
      if (gun.ammo === 0) startReload();   // leer -> automatisch nachladen
    }
  } else if (gun.state === "reload") {
    gun.tick++;
    if (gun.tick >= 11 * RELOAD_ANIM_TICKS) { gun.ammo = MAG_SIZE; gun.state = "idle"; }
  }

  if (keys["r"]) startReload();

  const wantsShot = shotQueued || mouse.down;
  shotQueued = false;
  if (wantsShot && gun.state !== "reload" && gun.cooldown === 0) {
    if (gun.ammo > 0) fire();
    else startReload();
  }
}

function updateBullets() {
  const SUB = 3; // in kleinen Schritten bewegen, damit nichts "durchtunnelt"
  for (const b of bullets) {
    for (let i = 0; i < SUB && !b.dead; i++) {
      b.x += b.vx / SUB; b.y += b.vy / SUB;
      b.dist += BULLET_SPEED / SUB;
      if (b.dist > BULLET_RANGE || b.x < 0 || b.x > LEVEL_WIDTH || b.y < 0 || b.y > H) { b.dead = true; break; }
      if (GROUND.some(r => pointInRect(b.x, b.y, r))) { b.dead = true; spawnSparks(b.x, b.y, "#d4d06d", 3); break; }
      for (const e of enemies) {
        if (e.state !== "dead" && pointInRect(b.x, b.y, e) && hitEnemy(e, b)) { b.dead = true; break; }
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
}

function spawnSparks(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      type: "spark", color, x, y,
      vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.8) * 2.5,
      life: 10 + Math.random() * 6, maxLife: 16,
    });
  }
}

// Knochen-Splitter: fallen wie Huelsen auf die Plattform und bleiben kurz liegen
function spawnDebris(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      type: "debris", color,
      x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 30,
      vx: (Math.random() - 0.5) * 3.5, vy: -1 - Math.random() * 3,
      life: 100 + Math.random() * 60, maxLife: 160,
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.life--;
    if (p.type === "spark") { p.x += p.vx; p.y += p.vy; p.vy += 0.15; continue; }
    // Huelse/Splitter: Schwerkraft, auf Plattformen aufkommen, kurz abprallen, liegen bleiben
    p.vy += 0.25;
    p.x += p.vx; p.y += p.vy;
    for (const r of GROUND) {
      if (p.vy > 0 && pointInRect(p.x, p.y, r)) {
        p.y = r.y - 1;
        if (p.vy > 1.5) { p.vy *= -0.35; p.vx *= 0.6; }
        else { p.vy = 0; p.vx *= 0.7; }
      }
    }
  }
  particles = particles.filter(p => p.life > 0 && p.y < H + 20);
}

// =====================================================================
// UPDATE
// =====================================================================
function update() {
  if (gameOver || !assetsReady()) return;
  if (player.invulnFrames > 0) player.invulnFrames--;

  if (player.inSecretRoom) {
    const left = keys["a"] || keys["arrowleft"];
    const right = keys["d"] || keys["arrowright"];
    if (left) { player.x -= MOVE_SPEED; player.facing = -1; }
    if (right) { player.x += MOVE_SPEED; player.facing = 1; }
    // Nur innerhalb der tatsaechlichen Raumwaende bewegen, fest auf dem Boden stehen
    player.x = Math.max(SECRET_LEFT, Math.min(player.x, SECRET_RIGHT - player.w));
    player.y = SECRET_FLOOR_Y - player.h;
    gun.dir = player.facing > 0 ? "right" : "left";
    shotQueued = false; // im Geheimraum wird nicht geschossen

    const playerCenterX = player.x + player.w / 2;
    const atOpening = playerCenterX > SECRET_OPENING.xMin && playerCenterX < SECRET_OPENING.xMax;
    if (atOpening && (keys["s"] || keys["arrowdown"])) exitSecretRoom();
    updateHUD();
    return;
  }

  const left = keys["a"] || keys["arrowleft"];
  const right = keys["d"] || keys["arrowright"];
  if (left) { player.vx -= MOVE_SPEED * 0.3; player.facing = -1; }
  if (right) { player.vx += MOVE_SPEED * 0.3; player.facing = 1; }
  player.vx *= GROUND_FRICTION;
  player.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.vx));

  const jumpKeyDown = keys[" "] || keys["w"] || keys["arrowup"];
  const jumpPressed = jumpKeyDown && !jumpKeyWasDown;
  jumpKeyWasDown = jumpKeyDown;

  if (jumpPressed) {
    if (player.grounded) {
      player.vy = JUMP_FORCE; player.grounded = false; player.jumpsUsed = 1;
    } else if (player.jumpsUsed === 1) {
      player.vy = DOUBLE_JUMP_FORCE; player.jumpsUsed = 2;
      if (SECRET_TRIGGER && rectsOverlap(player, SECRET_TRIGGER)) { enterSecretRoom(); return; }
    }
  }

  player.vy += GRAVITY;
  player.vy = Math.min(player.vy, 16);

  resolveGroundCollisions();

  for (const s of SPIKES) {
    if (rectsOverlap(player, s)) { takeDamage(player.vx >= 0 ? -1 : 1); break; }
  }

  if (player.y > H + 60) {
    takeDamage(0);
    if (!gameOver) { player.x = 24; player.y = GROUND[0].y - player.h; player.vx = 0; player.vy = 0; }
  }

  player.x = Math.max(0, Math.min(player.x, LEVEL_WIDTH - player.w));
  cameraX = Math.max(0, Math.min(player.x - W / 2, LEVEL_WIDTH - W));

  updateAim();
  updateGun();
  updateBullets();
  for (const e of enemies) updateEnemy(e);
  enemies = enemies.filter(e => !e.removed);
  updateAxes();
  updateParticles();
  updateHUD();
}

// --- HUD: Herzen + Munition (nur neu bauen, wenn sich etwas aendert) ---
const hudHearts = document.getElementById("hearts");
const hudAmmo = document.getElementById("ammo");
const ammoIcons = [];
for (let i = 0; i < MAG_SIZE; i++) {
  const img = document.createElement("img");
  img.src = `${BULLET_PATH}Pistol-bullet_Whole.png`;
  img.alt = "";
  hudAmmo.appendChild(img);
  ammoIcons.push(img);
}
const reloadLabel = document.createElement("span");
reloadLabel.className = "reload-label";
reloadLabel.textContent = "Nachladen …";
hudAmmo.appendChild(reloadLabel);

let lastHudKey = "";
function updateHUD() {
  const key = `${player.lives}|${gun.ammo}|${gun.state === "reload"}`;
  if (key === lastHudKey) return;
  lastHudKey = key;
  hudHearts.innerHTML = "";
  for (let i = 0; i < player.maxLives; i++) {
    const span = document.createElement("span");
    span.textContent = i < player.lives ? "♥" : "♡";
    span.style.color = i < player.lives ? "#e8453c" : "rgba(255,255,255,0.4)";
    hudHearts.appendChild(span);
  }
  ammoIcons.forEach((img, i) => img.classList.toggle("spent", i >= gun.ammo));
  reloadLabel.style.visibility = gun.state === "reload" ? "visible" : "hidden";
}

// =====================================================================
// DRAW
// =====================================================================
const FOG_TOP = 20, FOG_FULL = 140;
function fogWash(maxAlpha) {
  const g = ctx.createLinearGradient(0, FOG_TOP, 0, FOG_FULL);
  g.addColorStop(0, "rgba(210, 228, 222, 0)");
  g.addColorStop(1, `rgba(210, 228, 222, ${maxAlpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, FOG_TOP, W, H - FOG_TOP);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (!assetsReady()) {
    ctx.fillStyle = "#223"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#aab"; ctx.font = "14px sans-serif"; ctx.fillText("Lade...", 20, 30);
    return;
  }

  if (player.inSecretRoom) {
    ctx.fillStyle = "#15171a"; ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W / secretImg.naturalWidth, H / secretImg.naturalHeight) * 0.95;
    const dw = secretImg.naturalWidth * scale, dh = secretImg.naturalHeight * scale;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    ctx.drawImage(secretImg, ox, oy, dw, dh);
    drawPlayer(ox + player.x * scale, oy + player.y * scale, scale);
    return;
  }

  ctx.fillStyle = "#101810"; ctx.fillRect(0, 0, W, H);

  const bgParallax = 0.5;
  const bgW = bgImg.naturalWidth, bgH = bgImg.naturalHeight;
  const bgY = H - bgH;
  const bgOffset = -((cameraX * bgParallax) % bgW);
  for (let x = bgOffset - bgW; x < W; x += bgW) ctx.drawImage(bgImg, x, bgY);
  fogWash(0.38);

  ctx.save();
  ctx.translate(-Math.round(cameraX), 0);
  const levelY = H - levelImg.naturalHeight;
  ctx.drawImage(levelImg, 0, levelY);
  for (const e of enemies) drawEnemy(e);
  drawAxes();
  drawParticles();
  drawPlayer(player.x, player.y, 1);
  drawBullets();
  ctx.restore();
}

// Ein Sprite-Frame zeichnen, optional gespiegelt und/oder weiss aufblitzend (Treffer)
const tintCanvas = document.createElement("canvas");
const tintCtx = tintCanvas.getContext("2d");
function drawFrame(img, sx, sy, sw, sh, dx, dy, dw, dh, flip, flash) {
  let src = img;
  if (flash) {
    tintCanvas.width = sw; tintCanvas.height = sh;
    tintCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    tintCtx.globalCompositeOperation = "source-atop";
    tintCtx.fillStyle = "rgba(255, 255, 255, 0.75)";
    tintCtx.fillRect(0, 0, sw, sh);
    tintCtx.globalCompositeOperation = "source-over";
    src = tintCanvas; sx = 0; sy = 0;
  }
  if (flip) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

function drawEnemy(e) {
  ctx.globalAlpha = Math.max(0, e.alpha);
  const flash = e.flash > 0 && e.flash % 2 === 0;
  if (e.t.hunter) {
    // in der Luft: Lauf-Frame "eingefroren" als Sprung-Pose
    const inAir = !e.grounded && !["attack", "throw", "dead"].includes(e.state);
    const airState = e.hasAxe ? "walk" : "unarmedWalk";
    const a = inAir ? getAnim(e, airState) : getAnim(e);
    const f = inAir ? (a.start || 0) + 1 : enemyFrame(e);
    const fw = a.img.naturalWidth / (a.sheetFrames || a.frames), fh = a.img.naturalHeight;
    if (fw) {
      const dx = Math.round(e.x + e.w / 2 - a.anchor * e.S);
      const dy = Math.round(e.y + e.h - fh * e.S);
      drawFrame(a.img, f * fw, 0, fw, fh, dx, dy, fw * e.S, fh * e.S, false, flash);
    }
  } else {
    const a = getAnim(e);
    if (a.img.naturalWidth) {
      const size = ENEMY_FRAME * e.S;
      const dx = Math.round(e.x + e.w / 2 - size / 2);
      const dy = Math.round(e.y + e.h - ENEMY_FEET_Y * e.S);
      // Sprites schauen nach links -> fuer rechts horizontal spiegeln
      drawFrame(a.img, enemyFrame(e) * ENEMY_FRAME, 0, ENEMY_FRAME, ENEMY_FRAME, dx, dy, size, size, e.dir > 0, flash);
    }
  }
  ctx.globalAlpha = 1;

  // Lebensbalken, sobald der Gegner verletzt ist
  if (e.state !== "dead" && e.hp < e.maxHp) {
    const bw = 26, bx = Math.round(e.x + e.w / 2 - bw / 2), by = Math.round(e.y - 10);
    ctx.fillStyle = "rgba(10, 10, 12, 0.75)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = "#e8453c"; ctx.fillRect(bx, by, Math.round(bw * e.hp / e.maxHp), 3);
  }
}

function drawAxes() {
  const S = AXE_SCALE;
  for (const a of axes) {
    const set = THROWN_AXE[a.dir > 0 ? "r" : "l"];
    ctx.globalAlpha = Math.max(0, a.alpha);
    if (a.state === "fly") {
      const sh = set.thrown, fw = sh.img.naturalWidth / sh.frames, fh = sh.img.naturalHeight;
      const f = Math.floor(a.tick / AXE_SPIN_TICKS) % sh.frames;
      if (fw) ctx.drawImage(sh.img, f * fw, 0, fw, fh,
        Math.round(a.x - fw * S / 2), Math.round(a.y - fh * S / 2), fw * S, fh * S);
    } else {
      // steckt im Boden: Klinge 1px in die Plattform, mittig um a.x
      const lw = set.landed.naturalWidth, lh = set.landed.naturalHeight;
      const lx = Math.round(a.x - lw * S / 2), ly = Math.round(a.groundY + S - lh * S);
      if (a.state === "landing") {
        const sh = set.landing, fw = sh.img.naturalWidth / sh.frames, fh = sh.img.naturalHeight;
        const f = Math.min(sh.frames - 1, Math.floor(a.tick / AXE_LANDING_TICKS));
        if (fw) ctx.drawImage(sh.img, f * fw, 0, fw, fh,
          lx - set.landedOff[0] * S, ly - set.landedOff[1] * S, fw * S, fh * S);
      } else if (lw) {
        ctx.drawImage(set.landed, lx, ly, lw * S, lh * S);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawBullets() {
  for (const b of bullets) {
    // gegen Ende der Reichweite ausblenden, damit man die Grenze "sieht"
    const fade = Math.min(1, Math.max(0, (BULLET_RANGE - b.dist) / (BULLET_RANGE * 0.25)));
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.drawImage(bulletImg, -8, -1, 8, 2);         // Leuchtspur hinter der Kugel
    ctx.fillStyle = "#fff6c8"; ctx.fillRect(-2, -1, 2, 2); // heller Kopf
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 30);
    if (p.type === "casing") ctx.drawImage(casingImg, Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
    else { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
  }
  ctx.globalAlpha = 1;
}

let animTimer = 0;
function drawPlayer(x, y, scale) {
  const moving = Math.abs(player.vx) > 0.3;
  let sheet;
  if (player.facing === 1) sheet = moving ? runRightImg : idleRightImg;
  else sheet = moving ? runLeftImg : idleLeftImg;

  const frameW = sheet.naturalWidth / CHAR_FRAMES;
  const frameH = sheet.naturalHeight;
  const fps = moving ? 10 : 5;
  const frame = Math.floor(animTimer / (1000 / fps)) % CHAR_FRAMES;

  const drawScale = SPRITE_SCALE * scale;
  const drawW = frameW * drawScale;
  const drawH = frameH * drawScale;
  // horizontal mittig ueber der Hitbox, unten an der Hitbox-Grundlinie ausgerichtet
  const drawX = Math.round(x + (player.w * scale - drawW) / 2);
  const drawY = Math.round(y + player.h * scale - drawH);

  ctx.globalAlpha = player.invulnFrames > 0 && Math.floor(player.invulnFrames / 5) % 2 === 0 ? 0.4 : 1;
  if (sheet.naturalWidth) {
    ctx.drawImage(sheet, frame * frameW, 0, frameW, frameH, drawX, drawY, drawW, drawH);
  } else {
    // Fallback-Platzhalter, falls ein Sheet (noch) nicht geladen ist
    ctx.fillStyle = "#e07a2c";
    ctx.fillRect(x, y, player.w * scale, player.h * scale);
  }
  drawGun(x, y, scale, frame);
  ctx.globalAlpha = 1;
}

function drawGun(x, y, scale, charFrame) {
  const o = gunOrigin(x, y, scale);
  let sheet, f, off;
  if (gun.state === "shoot") {
    sheet = o.cfg.shoot; f = Math.min(2, Math.floor(gun.tick / SHOOT_ANIM_TICKS)); off = o.cfg.shootOff;
  } else if (gun.state === "reload") {
    sheet = o.cfg.reload; f = Math.min(10, Math.floor(gun.tick / RELOAD_ANIM_TICKS)); off = o.cfg.reloadOff;
  } else {
    sheet = o.cfg.idle; f = charFrame % sheet.frames; off = [0, 0]; // laeuft synchron zum Koerper
  }
  const img = sheet.img;
  if (!img.naturalWidth) return;
  const fw = img.naturalWidth / sheet.frames, fh = img.naturalHeight;
  ctx.drawImage(img, f * fw, 0, fw, fh,
    Math.round(o.x + off[0] * o.S), Math.round(o.y + off[1] * o.S), fw * o.S, fh * o.S);

  if (gun.flash > 0) {
    const mx = o.x + o.cfg.muzzle[0] * o.S, my = o.y + o.cfg.muzzle[1] * o.S;
    const fx = mx + Math.cos(gun.angle) * 3, fy = my + Math.sin(gun.angle) * 3;
    ctx.fillStyle = "rgba(255, 236, 160, 0.9)"; ctx.fillRect(fx - 3, fy - 3, 6, 6);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(fx - 1, fy - 1, 2, 2);
  }
}

let lastT = performance.now();
function loop(t) {
  animTimer += t - lastT;
  lastT = t;
  update();
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
