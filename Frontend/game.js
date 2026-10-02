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

// Gegner-Platzierung: x = Startposition, y = Oberkante der Plattform
// (beides in level.png-Koordinaten). Die passende Plattform wird automatisch
// gesucht, der Zombie patrouilliert dann genau auf deren Breite.
// Fuer mehr Gegner spaeter einfach weitere Eintraege hinzufuegen.
const ENEMY_SPAWNS = [
  { type: "zombie", x: 620, y: 418 }, // breite Plattform in der Mitte (x 450–702)
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

// --- Zombie ------------------------------------------------------------
// Jedes Sheet: 6 Frames a 64x64, Zombie schaut im Original nach LINKS,
// Fuesse stehen im Frame auf y=48.
const ZOMBIE_PATH = "assets/enemies/zombie/";
const ZOMBIE_FRAME = 64, ZOMBIE_FEET_Y = 48;
// Zeichen-Groesse des Zombies (1 = Original). 1.5 -> ca. 46px hoch, Spieler ist 32px.
// Tipp: 2 ergibt die schaerfsten Pixel (ganzzahlig), ist aber deutlich groesser.
const ZOMBIE_SCALE = 1.5;
function zombieAnim(name, ticks, loop) {
  return { img: loadImg(`${ZOMBIE_PATH}Zombie_Default_${name}.png`), frames: 6, ticks, loop };
}
const ZOMBIE_ANIMS = {
  idle: zombieAnim("Idle", 10, true),
  walk: zombieAnim("Walk", 8, true),
  attack: zombieAnim("Attack1", 6, false),
  hurt: zombieAnim("Hurt", 4, false),
  dead: zombieAnim("Dead", 8, false),
};
const ZOMBIE_W = Math.round(16 * ZOMBIE_SCALE), ZOMBIE_H = Math.round(30 * ZOMBIE_SCALE);
const ZOMBIE_HP = 3;
const ZOMBIE_PATROL_SPEED = 0.5;
const ZOMBIE_CHASE_SPEED = 0.9;
const ZOMBIE_AGGRO_RANGE = 130;   // ab dieser Distanz laeuft er auf den Spieler zu
const ZOMBIE_ATTACK_GAP = 6;      // Abstand Koerper-zu-Koerper, ab dem er zuschlaegt
const ZOMBIE_ATTACK_COOLDOWN = 45;
const ZOMBIE_EDGE_PAUSE = 50;     // kurz stehen bleiben an der Plattformkante

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

let enemies = [], bullets = [], particles = [];

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
// GEGNER (Zombie)
// =====================================================================
function findPlatform(x, topY) {
  const r = GROUND.find(g => x >= g.x && x <= g.x + g.w && Math.abs(g.y - (topY + LEVEL_Y_OFFSET)) <= 6);
  if (!r) console.warn("Keine Plattform fuer Gegner gefunden bei", x, topY);
  return r;
}

function createZombie(spawn) {
  const plat = findPlatform(spawn.x, spawn.y);
  if (!plat) return null;
  return {
    x: spawn.x - ZOMBIE_W / 2, y: plat.y - ZOMBIE_H, w: ZOMBIE_W, h: ZOMBIE_H,
    plat,
    minX: plat.x + 4, maxX: plat.x + plat.w - ZOMBIE_W - 4,
    dir: -1,                // -1 = links (so ist das Sprite gezeichnet), 1 = rechts
    hp: ZOMBIE_HP,
    state: "walk", animTick: 0,
    pauseTicks: 0, attackCooldown: 0, knockVx: 0, hitDone: false,
    deadTicks: 0, alpha: 1, removed: false,
  };
}

function spawnEnemies() {
  enemies = ENEMY_SPAWNS.map(createZombie).filter(Boolean);
}

function setZombieState(z, state) {
  if (z.state !== state) { z.state = state; z.animTick = 0; z.hitDone = false; }
}
function zombieFrame(z) {
  const a = ZOMBIE_ANIMS[z.state];
  const f = Math.floor(z.animTick / a.ticks);
  return a.loop ? f % a.frames : Math.min(f, a.frames - 1);
}
function zombieAnimDone(z) {
  const a = ZOMBIE_ANIMS[z.state];
  return !a.loop && z.animTick >= a.frames * a.ticks;
}
function clampToPlatform(z) {
  z.x = Math.max(z.minX, Math.min(z.x, z.maxX));
}

function updateZombie(z) {
  z.animTick++;

  if (z.state === "dead") {
    if (zombieAnimDone(z)) {
      z.deadTicks++;
      if (z.deadTicks > 120) z.alpha -= 1 / 60;   // Leiche liegt kurz, dann ausblenden
      if (z.alpha <= 0) z.removed = true;
    }
    return;
  }
  if (z.attackCooldown > 0) z.attackCooldown--;

  // Spieler "in der Naehe": horizontal ueber der Plattform und hoechstens
  // etwas darueber (z. B. im Sprung) -- nicht auf anderen Plattformen.
  const playerBottom = player.y + player.h;
  const playerNear =
    !player.inSecretRoom &&
    player.x + player.w > z.plat.x && player.x < z.plat.x + z.plat.w &&
    playerBottom <= z.plat.y + 2 && playerBottom >= z.plat.y - 90;
  const dx = (player.x + player.w / 2) - (z.x + z.w / 2);
  const gap = Math.abs(dx) - (z.w + player.w) / 2;

  if (z.state === "hurt") {
    z.x += z.knockVx; z.knockVx *= 0.8;
    clampToPlatform(z);
    if (zombieAnimDone(z)) setZombieState(z, "walk");
    return;
  }

  if (z.state === "attack") {
    // Frame 2 = der Schlag (Krallen-Wisch im Sprite) -> dann Treffer pruefen
    if (zombieFrame(z) >= 2 && !z.hitDone) {
      z.hitDone = true;
      const r = 14 * ZOMBIE_SCALE;
      const reach = { x: z.dir < 0 ? z.x - r : z.x + z.w - 4, y: z.y + 4, w: r + 4, h: z.h - 8 };
      if (rectsOverlap(player, reach)) takeDamage(z.dir);
    }
    if (zombieAnimDone(z)) { z.attackCooldown = ZOMBIE_ATTACK_COOLDOWN; setZombieState(z, "idle"); }
    return;
  }

  // Verfolgen, wenn der Spieler auf seiner Plattform ist
  if (playerNear && Math.abs(dx) < ZOMBIE_AGGRO_RANGE) {
    z.dir = dx >= 0 ? 1 : -1;
    if (gap < ZOMBIE_ATTACK_GAP) {
      if (z.attackCooldown === 0) setZombieState(z, "attack");
      else setZombieState(z, "idle");
      return;
    }
    const before = z.x;
    z.x += z.dir * ZOMBIE_CHASE_SPEED;
    clampToPlatform(z);
    setZombieState(z, z.x === before ? "idle" : "walk"); // an der Kante: stehen bleiben
    z.pauseTicks = 0;
    return;
  }

  // Patrouille: hin und her, an jeder Kante kurz warten und umdrehen
  if (z.pauseTicks > 0) {
    setZombieState(z, "idle");
    z.pauseTicks--;
    if (z.pauseTicks === 0) z.dir *= -1;
    return;
  }
  setZombieState(z, "walk");
  z.x += z.dir * ZOMBIE_PATROL_SPEED;
  if (z.x <= z.minX && z.dir < 0) { z.x = z.minX; z.pauseTicks = ZOMBIE_EDGE_PAUSE; }
  else if (z.x >= z.maxX && z.dir > 0) { z.x = z.maxX; z.pauseTicks = ZOMBIE_EDGE_PAUSE; }
}

function hitZombie(z, b) {
  if (z.state === "dead") return false;
  z.hp--;
  const fromDir = b.vx >= 0 ? 1 : -1;  // Richtung, in die die Kugel fliegt
  if (z.hp <= 0) {
    setZombieState(z, "dead");
  } else {
    setZombieState(z, "hurt");
    z.knockVx = fromDir * 2.2;
    z.dir = -fromDir;                  // dreht sich zum Schuetzen um
  }
  spawnSparks(b.x, b.y, "#7fbf6a", 4);
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
      for (const z of enemies) {
        if (z.state !== "dead" && pointInRect(b.x, b.y, z) && hitZombie(z, b)) { b.dead = true; break; }
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

function updateParticles() {
  for (const p of particles) {
    p.life--;
    if (p.type === "spark") { p.x += p.vx; p.y += p.vy; p.vy += 0.15; continue; }
    // Huelse: Schwerkraft, auf Plattformen aufkommen, kurz abprallen, liegen bleiben
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
  for (const z of enemies) updateZombie(z);
  enemies = enemies.filter(z => !z.removed);
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
  for (const z of enemies) drawZombie(z);
  drawParticles();
  drawPlayer(player.x, player.y, 1);
  drawBullets();
  ctx.restore();
}

function drawZombie(z) {
  const a = ZOMBIE_ANIMS[z.state];
  if (!a.img.naturalWidth) { ctx.fillStyle = "#3a8"; ctx.fillRect(z.x, z.y, z.w, z.h); return; }
  const f = zombieFrame(z);
  const size = ZOMBIE_FRAME * ZOMBIE_SCALE;
  const dx = Math.round(z.x + z.w / 2 - size / 2);
  const dy = Math.round(z.y + z.h - ZOMBIE_FEET_Y * ZOMBIE_SCALE);
  ctx.globalAlpha = Math.max(0, z.alpha);
  if (z.dir > 0) {
    // Sprite schaut nach links -> fuer rechts horizontal spiegeln
    ctx.save();
    ctx.translate(dx + size, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(a.img, f * ZOMBIE_FRAME, 0, ZOMBIE_FRAME, ZOMBIE_FRAME, 0, 0, size, size);
    ctx.restore();
  } else {
    ctx.drawImage(a.img, f * ZOMBIE_FRAME, 0, ZOMBIE_FRAME, ZOMBIE_FRAME, dx, dy, size, size);
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
