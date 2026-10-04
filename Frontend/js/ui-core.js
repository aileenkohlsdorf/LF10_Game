// =====================================================================
// js/ui-core.js – gemeinsame Grundlage fuer login.html und das
// Overworld-Menue: Backend-Anfragen, Login merken, UI-Sprites.
// Alles steht in einer Funktion, damit keine Namen mit overworld.js
// kollidieren. Nach aussen gibt es nur window.GameUI.
// =====================================================================
(() => {

// --- Einstellungen ------------------------------------------------------
const API_BASE = "http://127.0.0.1:8000";   // FastAPI-Server (uvicorn)
const PAGES = {
  login: "login.html",         // Anmelden / Registrieren
  overworld: "overworld.html", // hierhin geht es nach dem Login
};
const UI_PATH = "assets/ui/";  // die UI-Sprites (Buttons, Panel, ...)

function assetUrl(path) { return path; }

// --- Backend ------------------------------------------------------------
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) headers["token"] = readToken() || ""; // Backend erwartet den Header "token"
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Server nicht erreichbar. Läuft das Backend?");
  }
  let data = {};
  try { data = await res.json(); } catch { /* leere Antwort */ }
  if (!res.ok) {
    // FastAPI: detail ist Text (HTTPException) oder eine Liste (Validierung)
    const msg = typeof data.detail === "string" ? data.detail : "Eingabe wurde vom Server abgelehnt.";
    throw new ApiError(res.status, msg);
  }
  return data;
}

// --- Login merken ("Angemeldet bleiben" = localStorage, sonst nur Tab) ---
const TOKEN_KEY = "zombie_token";
const USER_KEY = "zombie_user";
function storages() { try { return [localStorage, sessionStorage]; } catch { return []; } }
function saveLogin(token, username, remember) {
  clearLogin();
  try {
    const s = remember ? localStorage : sessionStorage;
    s.setItem(TOKEN_KEY, token);
    s.setItem(USER_KEY, username);
  } catch { /* Speicher gesperrt */ }
}
function readToken() { for (const s of storages()) { const v = s.getItem(TOKEN_KEY); if (v) return v; } return null; }
function readUser() { for (const s of storages()) { const v = s.getItem(USER_KEY); if (v) return v; } return null; }
// Benutzernamen dort ablegen, wo auch der Token liegt
function setUser(username) {
  for (const s of storages()) { if (s.getItem(TOKEN_KEY)) s.setItem(USER_KEY, username); }
}
function clearLogin() { for (const s of storages()) { s.removeItem(TOKEN_KEY); s.removeItem(USER_KEY); } }

function goTo(page) { window.location.href = PAGES[page]; }

// --- UI-Sprites als CSS-Variablen (werden in ui.css benutzt) ------------
const UI_SPRITES = {
  "panel": "Inventory_1.png",
  "blank-up": "Blank_Not-Pressed.png", "blank-down": "Blank_Pressed.png",
  "play-up": "Play_Not-Pressed.png", "play-down": "Play_Pressed.png",
  "save-up": "Save_Not-Pressed.png", "save-down": "Save_Pressed.png",
  "quit-up": "Quit_Not-Pressed.png", "quit-down": "Quit_Pressed.png",
  "yes-up": "Button_Yes_Not-Pressed.png", "yes-down": "Button_Yes_Pressed.png",
  "no-up": "Button_No_Not-Pressed.png", "no-down": "Button_No_Pressed.png",
  "check-body": "Checkmark-Body.png", "check-anim": "Checkmark-Sheet5.png",
};
const rootStyle = document.documentElement.style;
for (const [name, file] of Object.entries(UI_SPRITES)) {
  rootStyle.setProperty(`--img-${name}`, `url("${assetUrl(UI_PATH + file)}")`);
}
// Pixel-Mauszeiger (Cursor.png, 3x vergroessert)
const cursorImg = new Image();
cursorImg.onload = () => {
  const c = document.createElement("canvas");
  c.width = cursorImg.width * 3; c.height = cursorImg.height * 3;
  const cx = c.getContext("2d");
  cx.imageSmoothingEnabled = false;
  cx.drawImage(cursorImg, 0, 0, c.width, c.height);
  try { rootStyle.setProperty("--menu-cursor", `url("${c.toDataURL()}") 0 0, default`); } catch { /* Standard */ }
};
cursorImg.src = assetUrl(UI_PATH + "Cursor.png");

// UI-Ebene (480x270 UI-Pixel) passend zum Fenster skalieren
function fitToWindow(el) {
  const fit = () => {
    const s = Math.min(window.innerWidth / 480, window.innerHeight / 270);
    el.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  window.addEventListener("resize", fit);
  fit();
}

window.GameUI = { api, ApiError, assetUrl, goTo, saveLogin, readToken, readUser, setUser, clearLogin, fitToWindow };

})();
