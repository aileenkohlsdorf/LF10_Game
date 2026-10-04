// login.js – Anmelden/Registrieren, danach weiter zur Overworld
(() => {
const { api, goTo, saveLogin, readToken, clearLogin, assetUrl, fitToWindow } = window.GameUI;

document.documentElement.style.setProperty("--img-login-bg", `url("${assetUrl("assets/background.png")}")`);
fitToWindow(document.getElementById("login-ui"));

const form = document.getElementById("auth-form");
const tabs = document.querySelectorAll(".ui-tab");
const statusEl = document.getElementById("auth-status");
const submitBtn = document.getElementById("auth-submit");
const userInput = document.getElementById("auth-user");
const passInput = document.getElementById("auth-pass");
const pass2Input = document.getElementById("auth-pass2");
const pass2Field = document.getElementById("field-pass2");
const rememberInput = document.getElementById("auth-remember");
let mode = "login";

function setMode(m) {
  mode = m;
  tabs.forEach(t => t.setAttribute("aria-selected", String(t.dataset.mode === m)));
  pass2Field.hidden = m !== "register";
  passInput.autocomplete = m === "register" ? "new-password" : "current-password";
  submitBtn.querySelector("span").textContent = m === "register" ? "Registrieren" : "Anmelden";
  setStatus("");
}
function setStatus(text, kind = "error") { statusEl.textContent = text; statusEl.dataset.kind = kind; }
tabs.forEach(t => t.addEventListener("click", () => { setMode(t.dataset.mode); userInput.focus(); }));

function validate(username, password, password2) {
  if (!username) return "Gib einen Benutzernamen ein.";
  if (!password) return "Gib ein Passwort ein.";
  if (mode === "register") {
    if (username.length < 3 || username.length > 16) return "Benutzername: 3 bis 16 Zeichen.";
    if (password.length < 4) return "Passwort: mindestens 4 Zeichen.";
    if (password !== password2) return "Die Passwörter stimmen nicht überein.";
  }
  return null;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitBtn.disabled) return;
  const username = userInput.value.trim();
  const password = passInput.value;
  const problem = validate(username, password, pass2Input.value);
  if (problem) return setStatus(problem);

  submitBtn.disabled = true;
  setStatus(mode === "register" ? "Konto wird erstellt …" : "Anmelden …", "info");
  try {
    if (mode === "register") await api("/auth/register", { method: "POST", body: { username, password } });
    const data = await api("/auth/login", { method: "POST", body: { username, password } });
    saveLogin(data.token, username, rememberInput.checked);
    setStatus("Willkommen!", "ok");
    goTo("overworld");
  } catch (err) {
    setStatus(err.message);
    submitBtn.disabled = false;
  }
});

// Noch angemeldet? Dann direkt weiter zur Overworld
setMode("login");
userInput.focus();
(async () => {
  if (!readToken()) return;
  try {
    const me = await api("/users/me", { auth: true });
    window.GameUI.setUser(me.username);
    goTo("overworld");
  } catch (err) {
    if (err.status === 401) clearLogin(); // Token abgelaufen
  }
})();
})();
