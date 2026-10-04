// =====================================================================
// js/overworld-menu.js – Menue fuer die Overworld (Esc):
// Weiterspielen, Speichern, Abmelden.
// Aendert nichts an overworld.js. Einbinden in overworld.html NACH
// overworld.js:
//   <script src="js/ui-core.js"></script>
//   <script src="js/overworld-menu.js"></script>
//
// WAS GESPEICHERT WIRD: Das Backend speichert coins + bullets. Sobald es
// im Spiel Muenzen/Patronen gibt, definiert ihr irgendwo
//   window.getSaveData = () => ({ coins: ..., bullets: ... });
// Ohne diese Funktion wird der zuletzt geladene Stand erneut gespeichert
// (es wird also nichts mit 0 ueberschrieben).
// Der geladene Stand liegt in window.GameUI.save; sobald er da ist,
// gibt es das Event "gamesave:loaded" auf window.
// =====================================================================
(() => {
const UI = window.GameUI;

// Nicht angemeldet -> zur Login-Seite
if (!UI.readToken()) { UI.goTo("login"); return; }
UI.save = { coins: 0, bullets: 0 };

// --- Menue in die Seite einfuegen ---------------------------------------
const dim = document.createElement("div");
dim.className = "ui-dim";
dim.hidden = true;
const layer = document.createElement("div");
layer.className = "ui-layer";
layer.hidden = true;
layer.innerHTML = `
  <section class="ui-screen" role="dialog" aria-modal="true" aria-labelledby="ow-menu-title">
    <div class="ui-panel ui-menu-panel">
      <div class="ui-stack" data-view="main">
        <h2 id="ow-menu-title">Menü</h2>
        <p class="ui-text" data-user></p>
        <button type="button" class="ui-btn ui-btn-play" data-act="resume" aria-label="Weiterspielen"></button>
        <button type="button" class="ui-btn ui-btn-save" data-act="save" aria-label="Speichern"></button>
        <button type="button" class="ui-btn ui-btn-quit" data-act="ask-quit" aria-label="Abmelden"></button>
        <p class="ui-status" role="status" data-status></p>
      </div>
      <div class="ui-stack" data-view="confirm" hidden>
        <h2>Abmelden?</h2>
        <p class="ui-text">Nicht gespeicherter Fortschritt geht verloren.</p>
        <div class="ui-yes-no">
          <button type="button" class="ui-icon-btn" data-act="quit" aria-label="Ja, abmelden"></button>
          <button type="button" class="ui-icon-btn ui-btn-no" data-act="cancel" aria-label="Nein"></button>
        </div>
      </div>
    </div>
  </section>`;
document.body.append(dim, layer);
UI.fitToWindow(layer);

const $ = (sel) => layer.querySelector(sel);
const statusEl = $("[data-status]");
const userEl = $("[data-user]");
function showUser(name) { userEl.textContent = name ? `Angemeldet als ${name}` : ""; }
showUser(UI.readUser());
function setStatus(text, kind = "info") { statusEl.textContent = text; statusEl.dataset.kind = kind; }
function showView(name) {
  layer.querySelectorAll("[data-view]").forEach(v => { v.hidden = v.dataset.view !== name; });
  (name === "main" ? $("[data-act=resume]") : $("[data-act=cancel]")).focus({ preventScroll: true });
}

// --- Oeffnen / Schliessen ------------------------------------------------
let open = false;
const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
function openMenu() {
  if (open) return;
  open = true;
  // gedrueckte Lauftasten "loslassen", damit die Figur stehen bleibt
  for (const code of MOVE_KEYS) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
  dim.hidden = false;
  layer.hidden = false;
  setStatus("");
  showView("main");
}
function closeMenu() {
  open = false;
  dim.hidden = true;
  layer.hidden = true;
  if (document.activeElement) document.activeElement.blur();
}

// Esc oeffnet/schliesst das Menue. Solange es offen ist, bekommt die
// Overworld keine Tasten (Capture-Phase laeuft vor ihren Listenern),
// man laeuft also nicht weiter und E betritt kein Level.
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!open) openMenu();
    else if (!$("[data-view=confirm]").hidden) showView("main");
    else closeMenu();
    return;
  }
  if (open) e.stopImmediatePropagation();
}, true);
// Fenster verliert den Fokus -> Menue auf (wirkt wie Pause)
window.addEventListener("blur", openMenu);

// --- Speichern / Abmelden ------------------------------------------------
async function save(btn) {
  const data = typeof window.getSaveData === "function" ? window.getSaveData() : UI.save;
  btn.disabled = true;
  setStatus("Speichern …");
  try {
    const res = await UI.api("/game/save", {
      method: "POST", auth: true,
      body: { coins: Math.round(data.coins || 0), bullets: Math.round(data.bullets || 0) },
    });
    UI.save = { coins: res.coins, bullets: res.bullets };
    setStatus("Spielstand gespeichert.", "ok");
  } catch (err) {
    if (err.status === 401) { UI.clearLogin(); UI.goTo("login"); return; }
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.focus({ preventScroll: true });
  }
}

async function quit() {
  try { await UI.api("/auth/logout", { method: "POST", auth: true }); } catch { /* trotzdem abmelden */ }
  UI.clearLogin();
  UI.goTo("login");
}

const ACTIONS = {
  resume: closeMenu,
  save,
  "ask-quit": () => showView("confirm"),
  quit,
  cancel: () => showView("main"),
};
layer.querySelectorAll("[data-act]").forEach(btn => {
  btn.addEventListener("click", () => ACTIONS[btn.dataset.act](btn));
});

// --- Beim Start: Benutzer pruefen + gespeicherten Stand laden -------------
// Der Name kommt vom Backend, damit er auch nach einem alten Login stimmt.
UI.api("/users/me", { auth: true })
  .then((me) => { UI.setUser(me.username); showUser(me.username); })
  .catch((err) => {
    if (err.status === 401) { UI.clearLogin(); UI.goTo("login"); }
  });

UI.api("/game/save", { auth: true })
  .then((data) => {
    UI.save = { coins: data.coins, bullets: data.bullets };
    window.dispatchEvent(new CustomEvent("gamesave:loaded", { detail: UI.save }));
  })
  .catch((err) => {
    if (err.status === 401) { UI.clearLogin(); UI.goTo("login"); } // Token ungueltig
    else console.warn("Spielstand nicht geladen:", err.message);
  });
})();
