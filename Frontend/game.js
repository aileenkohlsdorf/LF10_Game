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

// --- Assets ---------------------------------------------------------
const levelImg = new Image();
const secretImg = new Image();
const bgImg = new Image();
levelImg.src = "assets/level.png";
secretImg.src = "assets/secret-room.png";
bgImg.src = "assets/background.png";

// Charakter: 4 Sprite-Sheets, je 6 Frames nebeneinander (Idle/Run x Rechts/Links).
// Waffe kommt spaeter separat obendrauf (deshalb noch keine Haende im Sprite).
const CHAR_FRAMES = 6;
const idleRightImg = new Image(); idleRightImg.src = "assets/characters/idle_right.png";
const idleLeftImg = new Image(); idleLeftImg.src = "assets/characters/idle_left.png";
const runRightImg = new Image(); runRightImg.src = "assets/characters/run_right.png";
const runLeftImg = new Image(); runLeftImg.src = "assets/characters/run_left.png";
const charImages = [idleRightImg, idleLeftImg, runRightImg, runLeftImg];

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

let ready = 0;
const needed = 3 + charImages.length;
function onReady() {
  ready++;
  if (ready >= needed) {
    LEVEL_Y_OFFSET = H - levelImg.naturalHeight;
    LEVEL_WIDTH = levelImg.naturalWidth;
    GROUND = GROUND_RECTS_RAW.map(toRect);
    SPIKES = SPIKE_RECTS_RAW.map(toRect);
    SECRET_TRIGGER = toRect(SECRET_TRIGGER_RAW);
    player.x = 24;
    player.y = GROUND[0].y - player.h;
  }
}
levelImg.onload = onReady; levelImg.onerror = onReady;
secretImg.onload = onReady; secretImg.onerror = onReady;
bgImg.onload = onReady; bgImg.onerror = onReady;
for (const img of charImages) { img.onload = onReady; img.onerror = onReady; }

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

const keys = {};
const controlKeys = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
stage.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (controlKeys.has(k)) e.preventDefault();
});
stage.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

setTimeout(() => { document.getElementById("hint").style.opacity = "0"; }, 6000);

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
  gameOver = false;
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

function update() {
  if (gameOver || ready < needed) return;
  if (player.invulnFrames > 0) player.invulnFrames--;

  if (player.inSecretRoom) {
    const left = keys["a"] || keys["arrowleft"];
    const right = keys["d"] || keys["arrowright"];
    if (left) { player.x -= MOVE_SPEED; player.facing = -1; }
    if (right) { player.x += MOVE_SPEED; player.facing = 1; }
    // Nur innerhalb der tatsaechlichen Raumwaende bewegen, fest auf dem Boden stehen
    player.x = Math.max(SECRET_LEFT, Math.min(player.x, SECRET_RIGHT - player.w));
    player.y = SECRET_FLOOR_Y - player.h;

    const playerCenterX = player.x + player.w / 2;
    const atOpening = playerCenterX > SECRET_OPENING.xMin && playerCenterX < SECRET_OPENING.xMax;
    if (atOpening && (keys["s"] || keys["arrowdown"])) exitSecretRoom();
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
  updateHUD();
}

function updateHUD() {
  const hud = document.getElementById("hud");
  hud.innerHTML = "";
  for (let i = 0; i < player.maxLives; i++) {
    const span = document.createElement("span");
    span.textContent = i < player.lives ? "♥" : "♡";
    span.style.color = i < player.lives ? "#e8453c" : "rgba(255,255,255,0.4)";
    hud.appendChild(span);
  }
}

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
  if (ready < needed) {
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
  ctx.translate(-cameraX, 0);
  const levelY = H - levelImg.naturalHeight;
  ctx.drawImage(levelImg, 0, levelY);
  drawPlayer(player.x, player.y, 1);
  ctx.restore();
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
  const drawX = x + (player.w * scale - drawW) / 2;
  const drawY = y + player.h * scale - drawH;

  ctx.globalAlpha = player.invulnFrames > 0 && Math.floor(player.invulnFrames / 5) % 2 === 0 ? 0.4 : 1;
  if (sheet.naturalWidth) {
    ctx.drawImage(sheet, frame * frameW, 0, frameW, frameH, drawX, drawY, drawW, drawH);
  } else {
    // Fallback-Platzhalter, falls ein Sheet (noch) nicht geladen ist
    ctx.fillStyle = "#e07a2c";
    ctx.fillRect(x, y, player.w * scale, player.h * scale);
  }
  ctx.globalAlpha = 1;
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
