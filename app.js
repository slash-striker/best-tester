const DATA_KEY = "novex-learner-data-v1";
const SETTINGS_KEY = "novex-learner-settings-v1";
const OLD_PAIR_KEY = "best-tester-study-pairs-v1";
const ACCOUNTS_KEY = "novex-learner-local-accounts-v1";
const PASSWORD_ITERATIONS = 240000;
const QUESTION_TYPES = [
  ["leftToRight", "Left → right"],
  ["rightToLeft", "Right → left"],
  ["write", "Write answer"],
  ["draw", "Draw answer"],
  ["recognition", "Recognition"],
];
const viewRoot = document.querySelector("#view-root");
const testScreen = document.querySelector("#test-screen");
const modalRoot = document.querySelector("#modal-root");
const csvInput = document.querySelector("#csv-input");
const authScreen = document.querySelector("#auth-screen");
const authForm = document.querySelector("#auth-form");
let data = loadData();
let settings = loadSettings();
let currentAccount = null;
let accountLoadError = "";
let accounts = loadAccounts();
let authMode = accounts.length ? "login" : "signup";
let authBusy = false;
let activeView = "dashboard";
let activeDeckId = data.decks[0]?.id || "";
let testOptions = { mode: "self", count: 10, minutes: 5, types: { leftToRight: true, rightToLeft: true, write: true, draw: false, recognition: false } };
let session = null;
let timerId = null;
let importDeckId = "";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyData() {
  return { decks: [{ id: uid(), name: "My first deck", pairs: [] }], history: [] };
}

function loadData(storageKey = DATA_KEY, allowLegacyMigration = storageKey === DATA_KEY) {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch (error) {
    console.error("Could not access Novex Learner storage.", error);
    if (!allowLegacyMigration) throw new Error("Could not access this profile's saved data.");
    raw = null;
  }
  if (raw !== null) {
    try {
      const stored = JSON.parse(raw);
      if (stored && Array.isArray(stored.decks) && Array.isArray(stored.history)) {
        return {
          decks: stored.decks.filter((deck) => deck && typeof deck.id === "string" && Array.isArray(deck.pairs)),
          history: stored.history.filter((record) => record && typeof record.id === "string"),
        };
      }
      if (!allowLegacyMigration) throw new Error("This profile's saved study data has an invalid format.");
    } catch (error) {
      console.error("Could not load Novex Learner data.", error);
      if (!allowLegacyMigration) throw new Error("Could not read this profile's saved data. Your saved data has not been overwritten.");
    }
  }
  if (!allowLegacyMigration) return createEmptyData();
  let migratedPairs = [];
  try {
    const oldPairs = JSON.parse(localStorage.getItem(OLD_PAIR_KEY) || "[]");
    if (Array.isArray(oldPairs)) {
      migratedPairs = oldPairs
        .filter((pair) => pair && typeof pair.left === "string" && typeof pair.right === "string")
        .map((pair) => ({ id: uid(), left: pair.left, right: pair.right, guide: "" }));
    }
  } catch (error) {
    console.error("Could not migrate your previous study set.", error);
  }
  return {
    decks: [{ id: uid(), name: migratedPairs.length ? "Chinese vocabulary" : "My first deck", pairs: migratedPairs }],
    history: [],
  };
}

function loadSettings(storageKey = SETTINGS_KEY) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      theme: stored.theme === "light" ? "light" : "dark",
      grid: stored.grid !== false,
      ink: typeof stored.ink === "string" ? stored.ink : "#54f4e3",
      background: typeof stored.background === "string" ? stored.background : "#101624",
      brush: Math.min(24, Math.max(1, Number(stored.brush) || 5)),
      canvasHeight: Math.min(440, Math.max(160, Number(stored.canvasHeight) || 250)),
    };
  } catch (error) {
    console.error("Could not load appearance preferences.", error);
    return { theme: "dark", grid: true, ink: "#54f4e3", background: "#101624", brush: 5, canvasHeight: 250 };
  }
}

function persist() {
  if (!currentAccount) return;
  try {
    const suffix = encodeURIComponent(currentAccount.username.toLowerCase());
    localStorage.setItem(`novex-learner-data-${suffix}`, JSON.stringify(data));
    localStorage.setItem(`novex-learner-settings-${suffix}`, JSON.stringify(settings));
    localStorage.setItem(`novex-learner-test-options-${suffix}`, JSON.stringify(testOptions));
  } catch (error) {
    console.error("Could not save your Novex Learner data.", error);
    showToast("Browser storage is full. Export your decks to keep a backup.", true);
  }
}

function loadAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(stored)) throw new Error("Local account registry has an invalid format.");
    return stored.filter((account) =>
      account &&
      typeof account.username === "string" &&
      typeof account.salt === "string" &&
      typeof account.passwordHash === "string"
    );
  } catch (error) {
    console.error("Could not read local account profiles.", error);
    accountLoadError = "Could not read the local account registry. Your saved profiles have not been overwritten.";
    return [];
  }
}

function accountStorageKey(kind, username) {
  return `novex-learner-${kind}-${encodeURIComponent(username.toLowerCase())}`;
}

function normalizeData() {
  data.decks = data.decks.filter((deck) => deck && typeof deck.id === "string" && Array.isArray(deck.pairs)).map((deck) => ({
    ...deck,
    pairs: deck.pairs
      .filter((pair) => pair && typeof pair.id === "string" && typeof pair.left === "string" && typeof pair.right === "string")
      .map((pair) => ({ guide: "", ...pair })),
  }));
  if (!data.decks.length) data = createEmptyData();
}

function loadTestOptions(username) {
  try {
    const stored = JSON.parse(localStorage.getItem(accountStorageKey("test-options", username)) || "null");
    if (!stored) return;
    testOptions = {
      mode: stored.mode === "timed" ? "timed" : "self",
      count: Math.max(1, Number(stored.count) || 10),
      minutes: Math.min(180, Math.max(1, Number(stored.minutes) || 5)),
      types: Object.fromEntries(QUESTION_TYPES.map(([key]) => [key, Boolean(stored.types?.[key])])),
    };
  } catch (error) {
    console.error("Could not load this profile's test preferences.", error);
    throw new Error("Could not read this profile's test preferences.");
  }
}

async function passwordHash(password, encodedSalt) {
  if (!crypto.subtle) throw new Error("Password profiles require a secure connection. Open the site on localhost or HTTPS.");
  const salt = Uint8Array.from(atob(encodedSalt), (character) => character.charCodeAt(0));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    material,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(result)));
}

function renderAuth(message = "") {
  authScreen.hidden = false;
  document.querySelector(".app-shell").hidden = true;
  testScreen.hidden = true;
  document.querySelectorAll("[data-auth-mode]").forEach((tab) => {
    const active = tab.dataset.authMode === authMode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.disabled = authBusy;
    tab.hidden = tab.dataset.authMode === "login" && accounts.length === 0;
  });
  document.querySelector("#auth-title").innerHTML = authMode === "signup"
    ? "Create your profile.<br><span>Build your vault.</span>"
    : "Welcome back.<br><span>Pick up where you left off.</span>";
  document.querySelector("#auth-submit").textContent = authMode === "signup" ? "Create local account →" : "Sign in →";
  document.querySelector("#auth-password").autocomplete = authMode === "signup" ? "new-password" : "current-password";
  document.querySelector("#auth-message").textContent = message;
  document.querySelector("#auth-message").classList.toggle("error", Boolean(message));
  document.querySelector("#account-name").hidden = true;
  document.querySelector("#logout-button").hidden = true;
}

async function handleAuthSubmit(form) {
  const submitButton = document.querySelector("#auth-submit");
  const message = document.querySelector("#auth-message");
  const formData = new FormData(form);
  const signingUp = authMode === "signup";
  const username = String(formData.get("username") || "").trim();
  const normalizedName = username.toLowerCase();
  const password = String(formData.get("password") || "");
  submitButton.disabled = true;
  authBusy = true;
  renderAuth(signingUp ? "Creating your local profile…" : "Checking your profile…");
  message.textContent = signingUp ? "Creating your local profile…" : "Checking your profile…";
  message.classList.remove("error");
  try {
    if (accountLoadError) throw new Error(accountLoadError);
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
      throw new Error("Use 3–24 letters, numbers, underscores, or hyphens for your username.");
    }
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    let profile;
    if (signingUp) {
      if (accounts.some((item) => item.username.toLowerCase() === normalizedName)) {
        throw new Error("That username already exists on this device. Sign in instead.");
      }
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const salt = btoa(String.fromCharCode(...saltBytes));
      const passwordDigest = await passwordHash(password, salt);
      profile = { username, salt, passwordHash: passwordDigest, createdAt: Date.now() };
      const updatedAccounts = [...accounts, profile];
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
      accounts = updatedAccounts;
      if (accounts.length > 1) {
        data = createEmptyData();
        settings = loadSettings(accountStorageKey("settings", profile.username));
      }
    } else {
      profile = accounts.find((item) => item.username.toLowerCase() === normalizedName);
      if (!profile || await passwordHash(password, profile.salt) !== profile.passwordHash) {
        throw new Error("Username or password is incorrect.");
      }
      data = loadData(accountStorageKey("data", profile.username), false);
      settings = loadSettings(accountStorageKey("settings", profile.username));
    }
    testOptions = { mode: "self", count: 10, minutes: 5, types: { leftToRight: true, rightToLeft: true, write: true, draw: false, recognition: false } };
    if (!signingUp) loadTestOptions(profile.username);
    currentAccount = { username: profile.username };
    normalizeData();
    activeDeckId = data.decks[0].id;
    authScreen.hidden = true;
    document.querySelector(".app-shell").hidden = false;
    persist();
    updateHeader();
    setView("dashboard");
  } catch (error) {
    message.textContent = error.message || "Could not open this profile.";
    message.classList.add("error");
  } finally {
    submitButton.disabled = false;
    authBusy = false;
    document.querySelectorAll("[data-auth-mode]").forEach((tab) => { tab.disabled = false; });
    if (form.isConnected) document.querySelector("#auth-password").value = "";
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function activeDeck() {
  return data.decks.find((deck) => deck.id === activeDeckId) || data.decks[0] || null;
}

function allQuestions(deck, types = testOptions.types) {
  if (!deck) return [];
  const variants = [];
  for (const pair of deck.pairs) {
    const add = (type, fromLeft, direction) => variants.push({
      pairId: pair.id,
      type,
      direction,
      prompt: fromLeft ? pair.left : pair.right,
      answer: fromLeft ? pair.right : pair.left,
      left: pair.left,
      right: pair.right,
      guide: pair.guide || "",
      response: "",
      drawing: "",
      status: null,
      elapsedMs: 0,
    });
    if (types.leftToRight) add("leftToRight", true, "LEFT → RIGHT");
    if (types.rightToLeft) add("rightToLeft", false, "RIGHT → LEFT");
    if (types.write) add("write", Math.random() < 0.5, "WRITE · RANDOM DIRECTION");
    if (types.draw) add("draw", Math.random() < 0.5, "HANDWRITE · RANDOM DIRECTION");
    if (types.recognition) add("recognition", Math.random() < 0.5, "RECOGNITION");
  }
  return variants;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function buildQuestionSet(deck, types, requested) {
  const byPair = new Map(deck.pairs.map((pair) => [pair.id, []]));
  allQuestions(deck, types).forEach((question) => byPair.get(question.pairId)?.push(question));
  for (const group of byPair.values()) shuffle(group);
  const result = [];
  while (result.length < requested) {
    const groups = shuffle([...byPair.values()].filter((group) => group.length));
    if (!groups.length) break;
    for (const group of groups) {
      if (result.length >= requested) break;
      result.push(group.pop());
    }
  }
  return result;
}

function statsFor(records) {
  const questions = records.flatMap((record) => record.questions || []);
  const correct = questions.filter((question) => question.status === "correct").length;
  const incorrect = questions.filter((question) => question.status === "incorrect").length;
  const skipped = questions.filter((question) => question.status === "skipped" || question.status === "pending").length;
  const submitted = questions.filter((question) => question.submitted).length;
  const graded = correct + incorrect;
  const points = questions.reduce((sum, question) => {
    if (question.status === "correct") return sum + (question.type === "draw" && Number.isFinite(question.rating) ? question.rating : 100);
    if (question.status === "incorrect") return sum + (question.type === "draw" && Number.isFinite(question.rating) ? question.rating : 0);
    return sum;
  }, 0);
  const accuracy = graded ? Math.round(points / graded) : 0;
  const elapsed = questions.reduce((sum, question) => sum + (Number(question.elapsedMs) || 0), 0);
  const best = Math.max(0, ...records.map((record) => Number(record.score) || 0));
  return { questions, correct, incorrect, skipped, submitted, graded, accuracy, elapsed, best };
}

function updateHeader() {
  const labels = { dashboard: "DASHBOARD", decks: "STUDY DECKS", deck: "DECK / STUDY", progress: "PROGRESS", settings: "SETTINGS" };
  document.querySelector("#current-section").textContent = labels[activeView] || "DASHBOARD";
  document.querySelector("#nav-deck-count").textContent = data.decks.length;
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date()).toUpperCase();
  document.querySelector("#account-name").textContent = currentAccount?.username || "";
  document.querySelector("#account-name").hidden = !currentAccount;
  document.querySelector("#logout-button").hidden = !currentAccount;
  document.body.dataset.theme = settings.theme;
  document.querySelector("#theme-toggle").textContent = settings.theme === "dark" ? "☼" : "☾";
  document.querySelector("#theme-toggle").setAttribute("aria-label", `Switch to ${settings.theme === "dark" ? "light" : "dark"} theme`);
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === activeView || (activeView === "deck" && button.dataset.nav === "decks"));
  });
}

function setView(view) {
  activeView = view;
  updateHeader();
  if (view === "dashboard") renderDashboard();
  else if (view === "decks") renderDecks();
  else if (view === "deck") renderDeck();
  else if (view === "progress") renderProgress();
  else renderSettings();
}

document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.nav)));
document.querySelector(".sidebar .brand").addEventListener("click", (event) => {
  event.preventDefault();
  setView("dashboard");
});
document.querySelector("#theme-toggle").addEventListener("click", () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  persist();
  updateHeader();
  renderCurrentView();
});

document.querySelectorAll("[data-auth-mode]").forEach((tab) => tab.addEventListener("click", () => {
  if (authBusy) return;
  authMode = tab.dataset.authMode;
  renderAuth();
}));

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAuthSubmit(authForm);
});

document.querySelector("#logout-button").addEventListener("click", () => {
  if (session && !window.confirm("Sign out of this session? Unfinished test answers will be discarded.")) return;
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
  session = null;
  currentAccount = null;
  authMode = accounts.length ? "login" : "signup";
  renderAuth();
});

function renderCurrentView() {
  if (activeView === "dashboard") renderDashboard();
  else if (activeView === "decks") renderDecks();
  else if (activeView === "deck") renderDeck();
  else if (activeView === "progress") renderProgress();
  else renderSettings();
}

function renderDashboard() {
  const stats = statsFor(data.history);
  const deck = activeDeck();
  const records = deck ? data.history.filter((record) => record.deckId === deck.id) : [];
  const deckStats = statsFor(records);
  const recent = [...data.history].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 4);
  viewRoot.innerHTML = `
    <section class="welcome-row">
      <div>
        <div class="eyebrow"><span class="pulse"></span> PERSONAL LEARNING SYSTEM <span class="eyebrow-line"></span> ONLINE</div>
        <h1>Welcome back,<br><span>knowledge seeker.</span></h1>
        <p class="lead">Build your vault. Sharpen your recall. Keep moving forward.</p>
      </div>
      <div class="hero-orbit" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit-core">NV</div><span class="orbit-dot dot-a"></span><span class="orbit-dot dot-b"></span></div>
    </section>
    <section class="metric-grid">
      ${metricCard("TOTAL ANSWERED", stats.submitted, "⌘", "all decks")}
      ${metricCard("OVERALL ACCURACY", `${stats.accuracy}%`, "◈", `${stats.correct} right · ${stats.incorrect} missed`)}
      ${metricCard("BEST TEST SCORE", `${stats.best}%`, "✳", `${data.history.length} completed tests`)}
      ${metricCard("ACTIVE DECK", deck ? deck.pairs.length : 0, "▤", deck ? escapeHtml(deck.name) : "Create a deck")}
    </section>
    <div class="dashboard-grid">
      <section class="panel panel-main">
        <div class="section-heading"><div><span class="section-code">01 / READY ROOM</span><h2>Start a session</h2></div><span class="section-marker">● LIVE</span></div>
        ${deck ? `
          <div class="active-deck-strip">
            <div class="deck-glyph">${glyphFor(deck.name)}</div>
            <div class="active-deck-meta"><small>ACTIVE STUDY DECK</small><strong>${escapeHtml(deck.name)}</strong><span>${deck.pairs.length} pairs · ${deckStats.accuracy}% accuracy</span></div>
            <button type="button" class="button button-quiet" data-open-deck="${deck.id}">Manage deck ↗</button>
          </div>
          ${testSetup(deck)}
        ` : emptyState("No study decks yet", "Create a deck, add a few pairs, and your learning system is ready.", "Create your first deck", "new-deck")}
      </section>
      <section class="panel side-panel">
        <div class="section-heading"><div><span class="section-code">02 / YOUR VAULT</span><h2>Study decks</h2></div><button class="text-button" data-nav="decks">View all ↗</button></div>
        <div class="mini-decks">${data.decks.slice(0, 4).map((item) => deckMini(item)).join("") || '<div class="empty-note">Your decks will appear here.</div>'}</div>
        <button class="button button-outline full-button" data-action="new-deck">＋ Create a deck</button>
      </section>
      <section class="panel side-panel weak-panel">
        <div class="section-heading"><div><span class="section-code">03 / SIGNAL DETECTED</span><h2>Weakest pairs</h2></div><span class="neon-tag">REVIEW</span></div>
        ${renderWeakPairs(4)}
        <button class="text-button" data-nav="progress">Open progress report ↗</button>
      </section>
      <section class="panel side-panel recent-panel">
        <div class="section-heading"><div><span class="section-code">04 / FLIGHT LOG</span><h2>Recent tests</h2></div><button class="text-button" data-nav="progress">History ↗</button></div>
        <div class="recent-list">${recent.map((record) => recentRow(record)).join("") || '<div class="empty-note">No tests yet. Your results will be saved here.</div>'}</div>
      </section>
    </div>
  `;
}

function metricCard(label, value, icon, caption) {
  return `<article class="metric-card"><div class="metric-head"><span>${label}</span><b>${icon}</b></div><strong>${value}</strong><small>${caption}</small></article>`;
}

function glyphFor(name) {
  const words = name.trim().split(/\s+/);
  return escapeHtml(words.map((word) => word[0] || "").join("").slice(0, 2).toUpperCase() || "NV");
}

function deckMini(deck) {
  return `<button type="button" class="deck-mini" data-open-deck="${deck.id}"><span class="deck-glyph small">${glyphFor(deck.name)}</span><span><strong>${escapeHtml(deck.name)}</strong><small>${deck.pairs.length} ${deck.pairs.length === 1 ? "pair" : "pairs"}</small></span><i>↗</i></button>`;
}

function emptyState(title, text, label, action) {
  return `<div class="empty-state"><span class="empty-art">＋</span><h3>${title}</h3><p>${text}</p><button class="button button-primary" data-action="${action}">${label} ↗</button></div>`;
}

function testSetup(deck) {
  const available = allQuestions(deck).length;
  const selectedTypes = QUESTION_TYPES.filter(([key]) => testOptions.types[key]).length;
  const capacity = deck.pairs.length * selectedTypes;
  const safeCount = Math.max(1, Math.min(Number(testOptions.count) || 1, capacity || 1));
  const typeOptions = QUESTION_TYPES.map(([key, label]) => `
    <label class="type-check"><input type="checkbox" data-question-type="${key}" ${testOptions.types[key] ? "checked" : ""}><span class="check-box"></span><span>${label}</span></label>`).join("");
  return `
    <div class="setup-block">
      <div class="setup-title"><span>SESSION CONFIGURATION</span><span>01 — 03</span></div>
      <div class="type-list">${typeOptions}</div>
      <div class="setup-row">
        <label class="setting-field"><span>QUESTIONS</span><div class="setting-input"><input id="setup-count" type="number" min="1" max="${Math.max(1, capacity)}" value="${safeCount}"><small>max ${capacity}</small></div></label>
        <label class="setting-field"><span>SESSION MODE</span><select id="setup-mode"><option value="self" ${testOptions.mode === "self" ? "selected" : ""}>Self-test</option><option value="timed" ${testOptions.mode === "timed" ? "selected" : ""}>Timed test</option></select></label>
        ${testOptions.mode === "timed" ? `<label class="setting-field"><span>TIME LIMIT</span><div class="setting-input"><input id="setup-minutes" type="number" min="1" max="180" value="${Math.min(180, Math.max(1, testOptions.minutes))}"><small>min</small></div></label>` : ""}
      </div>
      <p class="setup-hint" id="setup-hint">${capacity ? `Up to ${capacity} unique question variants · random order · pairs are spread out.` : "Enable at least one question type and add a pair to begin."}${available < capacity ? "" : ""}</p>
      <button class="button button-primary start-button" data-action="start-test" ${capacity ? "" : "disabled"}>INITIALIZE TEST <span>→</span></button>
    </div>`;
}

function renderDecks() {
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> ORGANIZE YOUR KNOWLEDGE</div><h1>Study <span>decks.</span></h1><p class="lead">Separate subjects, share a copy, and choose what to review.</p></div><button class="button button-primary" data-action="new-deck">＋ New deck</button></section>
    <section class="deck-grid">${data.decks.map((deck) => {
      const stats = statsFor(data.history.filter((record) => record.deckId === deck.id));
      return `<article class="deck-card"><div class="deck-card-top"><span class="deck-glyph">${glyphFor(deck.name)}</span><span class="deck-card-count">${deck.pairs.length} PAIRS</span></div><h2>${escapeHtml(deck.name)}</h2><p>${stats.graded ? `${stats.accuracy}% accuracy · ${stats.graded} graded` : "Ready for your first practice session"}</p><div class="deck-card-footer"><button class="button button-quiet" data-open-deck="${deck.id}">Open deck ↗</button><button class="icon-button" data-action="copy-deck" data-id="${deck.id}" aria-label="Copy ${escapeHtml(deck.name)}">⧉</button></div></article>`;
    }).join("")}
      <button class="deck-card deck-card-add" data-action="new-deck"><span>＋</span><strong>Create another deck</strong><small>One subject, one focused space.</small></button>
    </section>`;
}

function renderDeck() {
  const deck = activeDeck();
  if (!deck) return setView("decks");
  const pairs = deck.pairs;
  viewRoot.innerHTML = `
    <section class="page-heading deck-heading"><div><button class="back-link" data-nav="decks">← All decks</button><div class="eyebrow"><span class="pulse"></span> DECK MANAGEMENT</div><h1>${escapeHtml(deck.name)}<span class="heading-period">.</span></h1><p class="lead">${pairs.length} ${pairs.length === 1 ? "key-value pair" : "key-value pairs"} · edit, import, export, and practice.</p></div><div class="deck-heading-actions"><button class="button button-quiet" data-action="export-csv" data-id="${deck.id}">↓ Export CSV</button><button class="button button-primary" data-action="start-test">Test this deck →</button></div></section>
    <div class="deck-manage-grid">
      <section class="panel panel-main">
        <div class="section-heading"><div><span class="section-code">PAIR DATABASE</span><h2>Key-value pairs</h2></div><span class="section-marker">${pairs.length} RECORDS</span></div>
        <form id="pair-form" class="pair-form">
          <label class="field-label" for="pair-left">ADD A NEW PAIR</label>
          <div class="pair-input-row"><input id="pair-left" name="left" required maxlength="500" placeholder="你好"><span>=</span><input name="right" required maxlength="500" placeholder="Hello"><button class="button button-primary" type="submit">Add pair <b>＋</b></button></div>
          <details class="guide-details"><summary>＋ Add optional stroke-order guide</summary><textarea name="guide" rows="2" placeholder="Manually add stroke steps, one per line (optional)"></textarea></details>
        </form>
        <div class="pair-tools"><div class="section-code">YOUR RECORDS <span id="pair-record-count">${pairs.length} TOTAL</span></div><div><button class="small-action" data-action="import-csv" data-id="${deck.id}">↑ Import CSV</button><button class="small-action" data-action="copy-deck" data-id="${deck.id}">⧉ Copy deck</button></div></div>
        <div class="pair-table">${pairs.length ? pairs.map((pair, index) => `
          <article class="pair-record"><span class="pair-index">${String(index + 1).padStart(2, "0")}</span><strong class="pair-value">${escapeHtml(pair.left)}</strong><span class="pair-equals">↔</span><strong class="pair-value pair-value-right">${escapeHtml(pair.right)}</strong><span class="pair-record-actions"><button class="icon-button compact" data-action="edit-pair" data-id="${pair.id}" aria-label="Edit pair">✎</button><button class="icon-button compact danger" data-action="delete-pair" data-id="${pair.id}" aria-label="Delete pair">×</button></span>
          ${pair.guide ? `<div class="pair-guide"><span>STROKE GUIDE</span>${escapeHtml(pair.guide).replace(/\n/g, "<br>")}</div>` : ""}
          </article>`).join("") : '<div class="empty-note">No pairs yet. Add one above or import a CSV.</div>'}</div>
        <div class="bulk-entry"><details><summary>＋ Bulk entry / multiline paste</summary><p>One pair per line: left side = right side. Tab and comma separators work too.</p><textarea id="bulk-pairs" rows="4" placeholder="你好 = Hello&#10;谢谢 = Thank you"></textarea><button class="button button-quiet" data-action="bulk-add">Add lines to deck ↗</button></details></div>
      </section>
      <aside class="deck-setup-column"><section class="panel side-panel deck-info"><div class="section-code">DECK CONTROLS</div><label class="field-label" for="rename-deck">DECK NAME</label><div class="rename-row"><input id="rename-deck" value="${escapeHtml(deck.name)}" maxlength="80"><button class="button button-quiet" data-action="rename-deck">Save</button></div><div class="deck-utility"><button class="utility-row" data-action="export-csv" data-id="${deck.id}"><span>↓</span><span><strong>Export pairs</strong><small>Download as a CSV file</small></span><i>↗</i></button><button class="utility-row" data-action="import-csv" data-id="${deck.id}"><span>↑</span><span><strong>Import pairs</strong><small>Bring a CSV into this deck</small></span><i>↗</i></button><button class="utility-row" data-action="copy-deck" data-id="${deck.id}"><span>⧉</span><span><strong>Copy this deck</strong><small>Duplicate all pairs</small></span><i>↗</i></button></div><button class="text-button danger-text" data-action="delete-deck" data-id="${deck.id}">Delete this deck</button></section>
      <section class="panel side-panel deck-test-panel"><div class="section-heading"><div><span class="section-code">QUICK CONFIG</span><h2>Test settings</h2></div></div>${testSetup(deck)}</section></aside>
    </div>`;
}

function renderProgress() {
  const stats = statsFor(data.history);
  const records = [...data.history].sort((a, b) => b.finishedAt - a.finishedAt);
  const deckTiles = data.decks.map((deck) => {
    const deckStats = statsFor(data.history.filter((record) => record.deckId === deck.id));
    return `<article class="progress-deck"><div class="deck-glyph small">${glyphFor(deck.name)}</div><div><strong>${escapeHtml(deck.name)}</strong><small>${deckStats.correct} correct · ${deckStats.incorrect} incorrect · ${deckStats.skipped} skipped</small></div><b>${deckStats.accuracy}%</b></article>`;
  }).join("");
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> YOUR LEARNING TELEMETRY</div><h1>Progress <span>report.</span></h1><p class="lead">Every session gives you a clearer picture of what is sticking.</p></div><span class="report-code">NV / ANALYTICS</span></section>
    <section class="metric-grid progress-metrics">${metricCard("OVERALL ACCURACY", `${stats.accuracy}%`, "◈", `${stats.correct} correct · ${stats.incorrect} incorrect`)}${metricCard("QUESTIONS ANSWERED", stats.submitted, "⌘", `${stats.skipped} skipped / unanswered`)}${metricCard("BEST TEST SCORE", `${stats.best}%`, "✳", `${data.history.length} saved tests`)}${metricCard("AVERAGE TIME / QUESTION", formatDuration(stats.questions.length ? stats.elapsed / stats.questions.length : 0), "◷", "across saved sessions")}</section>
    <div class="progress-grid"><section class="panel panel-main"><div class="section-heading"><div><span class="section-code">PER-DECK ACCURACY</span><h2>Deck performance</h2></div></div><div class="progress-decks">${deckTiles || '<div class="empty-note">Create a deck to begin.</div>'}</div><div class="chart-heading"><div><span class="section-code">HISTORICAL RESULTS</span><h2>Test history</h2></div></div><div class="history-list">${records.map((record) => historyRow(record)).join("") || '<div class="empty-note">Completed tests will appear here automatically.</div>'}</div></section><aside class="panel side-panel weak-panel"><div class="section-heading"><div><span class="section-code">SIGNAL ANALYSIS</span><h2>Weakest pairs</h2></div><span class="neon-tag">FOCUS</span></div>${renderWeakPairs(20)}</aside></div>`;
}

function renderSettings() {
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> SYSTEM PREFERENCES</div><h1>Settings <span>& controls.</span></h1><p class="lead">Tune your practice environment. Your preferences stay on this device.</p></div></section>
    <div class="settings-page-grid"><section class="panel panel-main"><div class="section-heading"><div><span class="section-code">INTERFACE</span><h2>Appearance</h2></div></div><div class="preference-row"><div><strong>Color theme</strong><small>Switch between the neon dark and clear light interface.</small></div><button class="button button-quiet" data-action="toggle-theme">Switch to ${settings.theme === "dark" ? "light" : "dark"} mode</button></div>
      <div class="section-heading settings-subhead"><div><span class="section-code">DRAWING TOOL</span><h2>Canvas defaults</h2></div></div>
      <label class="preference-row"><span><strong>Grid overlay</strong><small>Show a proportion grid while handwriting.</small></span><input id="pref-grid" type="checkbox" class="switch" ${settings.grid ? "checked" : ""}></label>
      <label class="preference-row"><span><strong>Ink color</strong><small>Choose the default pen color.</small></span><input id="pref-ink" type="color" value="${escapeHtml(settings.ink)}"></label>
      <label class="preference-row"><span><strong>Canvas background</strong><small>Set the canvas paper color.</small></span><input id="pref-background" type="color" value="${escapeHtml(settings.background)}"></label>
      <label class="preference-row"><span><strong>Brush width</strong><small>Default stroke width.</small></span><input id="pref-brush" type="range" min="1" max="24" value="${settings.brush}"></label>
      <label class="preference-row"><span><strong>Canvas height</strong><small>Default drawing area size.</small></span><input id="pref-canvas-height" type="range" min="160" max="440" step="10" value="${settings.canvasHeight}"></label>
    </section><aside class="panel side-panel"><div class="section-heading"><div><span class="section-code">DATA / LOCAL ONLY</span><h2>Your vault</h2></div></div><p class="panel-copy">Decks, drawings, and test history are saved in this browser. No sign-up or server is required. Export your decks as CSV for a portable backup.</p><div class="data-actions"><button class="button button-quiet" data-action="export-all">↓ Export all decks</button><button class="button button-outline" data-action="clear-history">Clear test history</button></div><div class="local-status"><span class="live-dot"></span> SAVED ON THIS DEVICE</div></aside></div>`;
}

function renderWeakPairs(limit) {
  const missed = new Map();
  for (const record of data.history) {
    for (const question of record.questions || []) {
      if (!question.pairId || !["correct", "incorrect"].includes(question.status)) continue;
      const item = missed.get(question.pairId) || { pairId: question.pairId, left: question.left, right: question.right, incorrect: 0, graded: 0 };
      item.graded += 1;
      if (question.status === "incorrect") item.incorrect += 1;
      missed.set(question.pairId, item);
    }
  }
  const list = [...missed.values()].filter((item) => item.incorrect > 0).sort((a, b) => (b.incorrect / b.graded) - (a.incorrect / a.graded) || b.incorrect - a.incorrect).slice(0, limit);
  if (!list.length) return '<div class="empty-note">No weak signals yet. Graded missed pairs will surface here.</div>';
  return `<div class="weak-list">${list.map((item) => `<div class="weak-row"><span class="weak-index">!</span><span class="weak-pair"><strong>${escapeHtml(item.left)}</strong><i>↔</i>${escapeHtml(item.right)}</span><small>${item.incorrect} missed / ${item.graded}</small></div>`).join("")}</div>`;
}

function recentRow(record) {
  return `<div class="recent-row"><span class="recent-glyph">↗</span><span><strong>${escapeHtml(record.deckName)} · ${record.mode === "timed" ? "Timed" : "Self-test"}</strong><small>${formatDate(record.finishedAt)} · ${record.questions.length} questions</small></span><b>${record.score ?? "—"}%</b></div>`;
}

function historyRow(record) {
  const result = statsFor([record]);
  return `<div class="history-row"><div><strong>${escapeHtml(record.deckName)}</strong><small>${formatDate(record.finishedAt)} · ${record.mode === "timed" ? "Timed test" : "Self-test"} · ${record.questions.length} questions</small></div><span class="history-counts"><i>${result.correct} ✓</i><i>${result.incorrect} ×</i><i>${result.skipped} —</i></span><b>${record.score == null ? "—" : `${record.score}%`}</b></div>`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal panel" role="dialog" aria-modal="true">${html}</section></div>`;
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function openCreateDeck() {
  openModal(`<form id="deck-form" class="modal-form"><div class="section-code">NEW KNOWLEDGE SPACE</div><h2>Create a deck</h2><p class="panel-copy">Give this subject its own focused place.</p><label class="field-label" for="deck-name">DECK NAME</label><input id="deck-name" name="name" maxlength="80" required placeholder="e.g. Chinese vocabulary"><div class="modal-actions"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Create deck →</button></div></form>`);
  modalRoot.querySelector("#deck-name").focus();
}

function editPairModal(pair) {
  openModal(`<form id="edit-pair-form" class="modal-form" data-id="${pair.id}"><div class="section-code">PAIR EDITOR</div><h2>Edit pair</h2><label class="field-label" for="edit-left">FIRST SIDE</label><input id="edit-left" name="left" required maxlength="500" value="${escapeHtml(pair.left)}"><label class="field-label" for="edit-right">SECOND SIDE</label><input id="edit-right" name="right" required maxlength="500" value="${escapeHtml(pair.right)}"><label class="field-label" for="edit-guide">STROKE-ORDER GUIDE (OPTIONAL)</label><textarea id="edit-guide" name="guide" rows="4" placeholder="One manual step per line">${escapeHtml(pair.guide || "")}</textarea><div class="modal-actions"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Save changes →</button></div></form>`);
}

function duplicatePair(deck, left, right, skipId = "") {
  return deck.pairs.some((pair) => pair.id !== skipId && pair.left.trim().toLocaleLowerCase() === left.trim().toLocaleLowerCase() && pair.right.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase());
}

function addPairs(deck, candidates) {
  if (!candidates.length) return { added: 0, duplicates: 0 };
  const duplicateCount = candidates.filter((pair) => duplicatePair(deck, pair.left, pair.right)).length;
  if (duplicateCount && !window.confirm(`${duplicateCount} pair${duplicateCount === 1 ? "" : "s"} already exist in this deck. Add duplicates anyway?`)) {
    return { added: 0, duplicates: duplicateCount };
  }
  candidates.forEach((pair) => deck.pairs.push({ id: uid(), left: pair.left.trim(), right: pair.right.trim(), guide: pair.guide || "" }));
  persist();
  return { added: candidates.length, duplicates: duplicateCount };
}

function parseBulk(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const delimiter = line.includes("\t") ? "\t" : line.includes("=") ? "=" : ",";
    const index = line.indexOf(delimiter);
    if (index < 0) return null;
    const left = line.slice(0, index).trim();
    const right = line.slice(index + delimiter.length).trim();
    return left && right ? { left, right, guide: "" } : null;
  }).filter(Boolean);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length && /^(left|front|key|term|character)$/i.test(rows[0][0].trim()) &&
      /^(right|back|value|definition|translation|meaning)$/i.test((rows[0][1] || "").trim())) rows.shift();
  return rows.map((cells) => ({ left: (cells[0] || "").trim(), right: (cells[1] || "").trim(), guide: (cells[2] || "").trim() }))
    .filter((pair) => pair.left && pair.right);
}

function downloadCsv(deck) {
  const escapeCell = (value) => `"${String(value || "").replace(/"/g, '""')}"`;
  const rows = [["left", "right", "stroke_guide"], ...deck.pairs.map((pair) => [pair.left, pair.right, pair.guide || ""])];
  const blob = new Blob([rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "novex-deck"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify({ format: "novex-learner-backup", version: 1, exportedAt: new Date().toISOString(), decks: data.decks }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "novex-learner-backup.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function startTest() {
  const deck = activeDeck();
  if (!deck) return showToast("Create a deck before starting a test.", true);
  const candidates = buildQuestionSet(deck, testOptions.types, Number(testOptions.count) || 1);
  if (!candidates.length) return showToast("Enable at least one question type.", true);
  session = {
    id: uid(), deckId: deck.id, deckName: deck.name, mode: testOptions.mode,
    questions: candidates, index: 0, finished: false, startedAt: Date.now(),
    durationMs: Math.max(1, Number(testOptions.minutes) || 1) * 60_000,
    secondsRemaining: Math.max(1, Number(testOptions.minutes) || 1) * 60,
    currentShownAt: Date.now(), historySaved: false,
  };
  document.querySelector(".app-shell").hidden = true;
  testScreen.hidden = false;
  if (session.mode === "timed") {
    timerId = window.setInterval(() => {
      if (!session || session.finished) return;
      session.secondsRemaining = Math.max(0, Math.ceil((session.startedAt + session.durationMs - Date.now()) / 1000));
      if (session.secondsRemaining <= 0) finishTest(true);
      else updateTimer();
    }, 250);
  }
  renderQuestion();
}

function questionNow() {
  return session.questions[session.index];
}

function saveQuestionResponse() {
  if (!session) return;
  const question = questionNow();
  const textarea = testScreen.querySelector("#answer-text");
  if (textarea) question.response = textarea.value;
  const canvas = testScreen.querySelector("#answer-canvas");
  if (canvas) {
    question.drawing = hasInk(canvas) ? canvas.toDataURL("image/png") : "";
    question.background = settings.background;
    question.grid = testScreen.querySelector("#draw-grid")?.checked ?? settings.grid;
  }
}

function addQuestionTime() {
  if (session) {
    questionNow().elapsedMs += Math.max(0, Date.now() - session.currentShownAt);
    session.currentShownAt = Date.now();
  }
}

function updateTimer() {
  const timer = testScreen.querySelector("#timer");
  if (!timer) return;
  const minutes = Math.floor(session.secondsRemaining / 60);
  const seconds = session.secondsRemaining % 60;
  timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  timer.classList.toggle("urgent", session.secondsRemaining < 31);
}

function renderQuestion() {
  if (!session || session.finished) return;
  const question = questionNow();
  const self = session.mode === "self";
  const revealed = self && question.revealed;
  const submitted = question.submitted;
  const drawMode = question.type === "draw";
  const score = getSessionScore();
  testScreen.innerHTML = `
    <div class="test-shell">
      <header class="test-top"><button class="back-link" data-action="exit-test">← Exit session</button><span class="test-brand">NOVEX <b>LEARNER</b></span>${self ? `<span class="live-score"><small>LIVE SCORE</small><strong>${score.percent}%</strong></span>` : '<span id="timer" class="timer-pill"></span>'}</header>
      <div class="test-progress-row"><span>QUESTION <b>${session.index + 1}</b> / ${session.questions.length}</span><span>${self ? "SELF-GRADED" : `${session.questions.filter((item) => item.submitted).length} SUBMITTED`}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${((session.index + (revealed ? 1 : 0)) / session.questions.length) * 100}%"></div></div>
      <article class="question-card">
        <div class="question-kicker">${escapeHtml(question.direction)}</div>
        <h1>${escapeHtml(question.prompt)}</h1>
        <p class="question-hint">${question.type === "recognition" ? "Recall the matching side of this pair." : drawMode ? "Write the answer by hand. Multiple characters are welcome." : "Take a moment. What belongs on the other side?"}</p>
        ${drawMode ? renderDrawingArea(question, revealed) : `<div class="answer-area"><label class="field-label" for="answer-text">YOUR ANSWER</label><textarea id="answer-text" class="answer-text" rows="3" ${revealed || submitted ? "disabled" : ""} placeholder="Type your answer…">${escapeHtml(question.response)}</textarea></div>`}
        ${revealed ? `<div class="answer-reveal"><div class="section-code">REFERENCE PAIR</div><div class="reveal-values"><strong>${escapeHtml(question.left)}</strong><span>↔</span><strong>${escapeHtml(question.right)}</strong></div>${drawMode && question.guide ? `<div class="stroke-guide"><small>MANUAL STROKE GUIDE</small><p>${escapeHtml(question.guide).replace(/\n/g, "<br>")}</p></div>` : ""}        ${drawMode
          ? `<div class="character-rating"><label for="character-rating">SELF-GRADE YOUR HANDWRITING</label><div><input id="character-rating" data-rating type="range" min="0" max="100" step="1" value="${question.rating ?? 50}" aria-label="Character score from zero to one hundred"><output id="rating-output">${question.rating ?? 50}%</output></div><small>100 = nailed it · 0 = needs more practice</small></div>`
          : `<div class="grade-controls"><span>How did you do?</span><button class="grade-button correct ${question.status === "correct" ? "chosen" : ""}" data-grade="correct">✓ Correct</button><button class="grade-button incorrect ${question.status === "incorrect" ? "chosen" : ""}" data-grade="incorrect">× Incorrect</button></div>`}
        <div class="score-feedback">Score updated · ${score.correct} correct / ${score.graded} graded (${score.percent}%)</div></div>` : ""}
        ${!self && submitted ? '<p class="submitted-note">Answer saved. The key stays hidden until the test ends.</p>' : ""}
        <div class="question-actions">
          <span class="saved-note">${question.status === "skipped" ? "Marked as skipped" : self && revealed && question.status ? question.status.toUpperCase() : ""}</span>
          ${self
            ? revealed
              ? `<button class="button button-primary" data-action="next-question" ${!question.status ? "disabled" : ""}>${session.index === session.questions.length - 1 ? "Finish test" : "Next question"} →</button>`
              : `<button class="button button-quiet" data-action="skip-question">Skip</button><button class="button button-primary" data-action="submit-self">Submit answer & reveal →</button>`
            : submitted
              ? `<button class="button button-primary" data-action="next-question">${session.index === session.questions.length - 1 ? "Finish test" : "Next question"} →</button>`
              : `<button class="button button-quiet" data-action="skip-question">Skip</button><button class="button button-primary" data-action="submit-timed">Submit answer →</button>`}
        </div>
      </article>
    </div>`;
  if (session.mode === "timed") updateTimer();
  if (drawMode) setupDrawingCanvas(question, revealed);
  testScreen.querySelector("#answer-text")?.addEventListener("input", () => { question.response = testScreen.querySelector("#answer-text").value; });
  testScreen.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleTestAction));
  testScreen.querySelectorAll("[data-grade]").forEach((button) => button.addEventListener("click", () => gradeCurrent(button.dataset.grade)));
  testScreen.querySelector("[data-rating]")?.addEventListener("input", (event) => {
    question.rating = Number(event.target.value);
    question.status = question.rating === 100 ? "correct" : "incorrect";
    testScreen.querySelector("#rating-output").textContent = `${question.rating}%`;
    const updatedScore = getSessionScore();
    testScreen.querySelector(".live-score strong").textContent = `${updatedScore.percent}%`;
    testScreen.querySelector(".score-feedback").textContent = `Score updated · ${updatedScore.correct} correct / ${updatedScore.graded} graded (${updatedScore.percent}%)`;
    testScreen.querySelector('[data-action="next-question"]').disabled = false;
  });
}

function renderDrawingArea(question, revealed) {
  const paper = escapeHtml(question.background || settings.background);
  if (!revealed) {
    return `<div class="drawing-container"><div class="draw-toolbar">
      <label>INK <input type="color" id="draw-ink" value="${escapeHtml(settings.ink)}" aria-label="Ink color"></label>
      <label>PAPER <input type="color" id="draw-background" value="${paper}" aria-label="Canvas background"></label>
      <label>BRUSH <input type="range" id="draw-brush" min="1" max="24" value="${settings.brush}" aria-label="Brush size"></label>
      <label>SIZE <input type="range" id="draw-height" min="160" max="440" step="10" value="${settings.canvasHeight}" aria-label="Canvas size"></label>
      <button class="draw-tool" data-draw-tool="eraser">⌫ Eraser</button><button class="draw-tool" data-draw-tool="undo">↶ Undo</button><button class="draw-tool" data-draw-tool="redo">↷ Redo</button><button class="draw-tool" data-draw-tool="clear">Clear</button>
      <label class="grid-toggle"><input type="checkbox" id="draw-grid" ${settings.grid ? "checked" : ""}> Grid</label>
    </div><canvas id="answer-canvas" class="draw-canvas ${settings.grid ? "grid-on" : ""}" style="height:${settings.canvasHeight}px;background-color:${paper}" aria-label="Handwriting canvas" tabindex="0"></canvas>
    <div class="draw-hint">Draw one character or a whole phrase · touch and stylus supported</div></div>`;
  }
  return `<div class="draw-review">
    <div class="draw-review-panel"><small>YOUR DRAWING</small><canvas id="answer-canvas" class="draw-canvas ${question.grid ? "grid-on" : ""}" style="height:${settings.canvasHeight}px;background-color:${paper}" aria-label="Your submitted drawing"></canvas></div>
    <div class="draw-review-panel draw-reference"><small>CORRECT CHARACTER / ANSWER</small><strong>${escapeHtml(question.answer)}</strong>${question.guide ? `<div class="stroke-guide"><small>MANUAL STROKE GUIDE</small><p>${escapeHtml(question.guide).replace(/\n/g, "<br>")}</p></div>` : '<p class="draw-hint">Add a manual stroke-order guide in deck management to see it here.</p>'}</div>
  </div>`;
}

function setupDrawingCanvas(question, readOnly) {
  const canvas = testScreen.querySelector("#answer-canvas");
  const context = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.scale(ratio, ratio);
  context.lineCap = "round";
  context.lineJoin = "round";
  canvas.dataset.hasInk = String(Boolean(question.drawing));
  const undoStack = [];
  const redoStack = [];
  let drawing = false;
  let erase = false;
  const snapshot = () => {
    try { undoStack.push({ image: canvas.toDataURL("image/png"), hasInk: canvas.dataset.hasInk === "true" }); } catch (error) { console.error("Could not snapshot the drawing.", error); }
    if (undoStack.length > 18) undoStack.shift();
    redoStack.length = 0;
  };
  const restore = (state) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.hasInk = String(Boolean(state?.hasInk));
    if (!state?.image) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, bounds.width, bounds.height);
    image.src = state.image;
  };
  if (question.drawing) restore({ image: question.drawing, hasInk: true });
  if (readOnly) return;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.addEventListener("pointerdown", (event) => {
    snapshot();
    canvas.dataset.hasInk = "true";
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineTo(position.x + 0.1, position.y + 0.1);
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.strokeStyle = document.querySelector("#draw-ink").value;
    context.lineWidth = Number(document.querySelector("#draw-brush").value);
    context.stroke();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const position = point(event);
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.strokeStyle = document.querySelector("#draw-ink").value;
    context.lineWidth = Number(document.querySelector("#draw-brush").value);
    context.lineTo(position.x, position.y);
    context.stroke();
  });
  canvas.addEventListener("pointerup", () => { drawing = false; });
  canvas.addEventListener("pointercancel", () => { drawing = false; });
  testScreen.querySelectorAll("[data-draw-tool]").forEach((button) => button.addEventListener("click", () => {
    const tool = button.dataset.drawTool;
    if (tool === "eraser") {
      erase = !erase;
      button.classList.toggle("selected", erase);
    } else if (tool === "undo" && undoStack.length) {
      redoStack.push({ image: canvas.toDataURL("image/png"), hasInk: canvas.dataset.hasInk === "true" });
      restore(undoStack.pop());
    } else if (tool === "redo" && redoStack.length) {
      undoStack.push({ image: canvas.toDataURL("image/png"), hasInk: canvas.dataset.hasInk === "true" });
      restore(redoStack.pop());
    } else if (tool === "clear") {
      snapshot();
      restore(null);
    }
  }));
  document.querySelector("#draw-grid").addEventListener("change", (event) => {
    settings.grid = event.target.checked;
    canvas.classList.toggle("grid-on", settings.grid);
    persist();
  });
  document.querySelector("#draw-background").addEventListener("input", (event) => {
    settings.background = event.target.value;
    canvas.style.backgroundColor = settings.background;
  });
  document.querySelector("#draw-ink").addEventListener("input", (event) => { settings.ink = event.target.value; });
  document.querySelector("#draw-brush").addEventListener("input", (event) => { settings.brush = Number(event.target.value); });
  document.querySelector("#draw-height").addEventListener("input", (event) => {
    settings.canvasHeight = Number(event.target.value);
    canvas.style.height = `${settings.canvasHeight}px`;
  });
}

function hasInk(canvas) {
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) return true;
  }
  return false;
}

function getSessionScore() {
  const questions = session?.questions || [];
  const correct = questions.filter((question) => question.status === "correct").length;
  const incorrect = questions.filter((question) => question.status === "incorrect").length;
  const graded = correct + incorrect;
  const points = questions.reduce((sum, question) => {
    if (question.status === "correct") return sum + (question.type === "draw" && Number.isFinite(question.rating) ? question.rating : 100);
    if (question.status === "incorrect") return sum + (question.type === "draw" && Number.isFinite(question.rating) ? question.rating : 0);
    return sum;
  }, 0);
  return { correct, incorrect, graded, percent: graded ? Math.round(points / graded) : 0 };
}

function handleTestAction(event) {
  const action = event.currentTarget.dataset.action;
  if (action === "exit-test") {
    if (window.confirm("Exit this session? Its unfinished answers will not be added to test history.")) exitTest();
  } else if (action === "submit-self") {
    saveQuestionResponse();
    addQuestionTime();
    const question = questionNow();
    question.submitted = true;
    question.revealed = true;
    renderQuestion();
  } else if (action === "submit-timed") {
    saveQuestionResponse();
    addQuestionTime();
    questionNow().submitted = true;
    renderQuestion();
  } else if (action === "skip-question") {
    saveQuestionResponse();
    addQuestionTime();
    const question = questionNow();
    question.status = "skipped";
    question.submitted = false;
    nextOrFinish();
  } else if (action === "next-question") {
    nextOrFinish();
  }
}

function gradeCurrent(status) {
  const question = questionNow();
  question.status = status;
  if (question.type === "draw") question.rating = status === "correct" ? 100 : status === "incorrect" ? 0 : null;
  renderQuestion();
}

function nextOrFinish() {
  addQuestionTime();
  if (session.index >= session.questions.length - 1) finishTest(false);
  else {
    session.index += 1;
    session.currentShownAt = Date.now();
    renderQuestion();
  }
}

function finishTest(timedOut) {
  if (!session || session.finished) return;
  if (session.mode === "timed") {
    const question = questionNow();
    if (!question.submitted && (testScreen.querySelector("#answer-text") || testScreen.querySelector("#answer-canvas"))) {
      saveQuestionResponse();
      if (question.response.trim() || question.drawing) question.submitted = true;
    }
  } else {
    saveQuestionResponse();
  }
  addQuestionTime();
  session.finished = true;
  session.timedOut = timedOut;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  session.questions.forEach((question) => {
    if (!question.status) question.status = "skipped";
  });
  saveHistory();
  renderResults();
}

function saveHistory() {
  const score = getSessionScore();
  if (!session.historySaved) {
    data.history.push({
      id: session.id,
      deckId: session.deckId,
      deckName: session.deckName,
      mode: session.mode,
      startedAt: session.startedAt,
      finishedAt: Date.now(),
      score: score.graded ? score.percent : null,
      questions: session.questions.map((question) => ({ ...question })),
    });
    session.historySaved = true;
  } else {
    const record = data.history.find((item) => item.id === session.id);
    if (record) {
      record.questions = session.questions.map((question) => ({ ...question }));
      record.score = score.graded ? score.percent : null;
    }
  }
  persist();
}

function renderResults() {
  const score = getSessionScore();
  const skipped = session.questions.filter((question) => question.status === "skipped").length;
  testScreen.innerHTML = `
    <div class="test-shell results-shell"><header class="test-top"><button class="back-link" data-action="back-home">← Return to vault</button><span class="test-brand">NOVEX <b>LEARNER</b></span><span class="test-mode-label">${session.mode === "timed" ? "TIMED REVIEW" : "SESSION RESULTS"}</span></header>
    <section class="result-hero"><div class="eyebrow"><span class="pulse"></span>${session.timedOut ? "TIME LIMIT REACHED" : "SESSION COMPLETE"}</div><h1>${session.mode === "timed" ? "Review your answers." : "Good work showing up."}</h1><p>${escapeHtml(session.deckName)} · ${session.questions.length} questions · ${formatDuration(Date.now() - session.startedAt)}</p><div class="result-score"><strong id="result-percent">${score.graded ? score.percent : "—"}</strong><span>%</span></div><div class="result-summary"><span><b id="result-correct">${score.correct}</b> correct</span><span><b id="result-incorrect">${score.incorrect}</b> incorrect</span><span><b>${skipped}</b> skipped</span><span><b>${score.graded}</b> graded</span></div></section>
    <div class="result-toolbar"><div><span class="section-code">ANSWER REVIEW</span><h2>Manual grading</h2></div><span class="result-instruction">Correct + incorrect answers count toward your percentage. Skips do not.</span></div>
    <div class="result-list">${session.questions.map((question, index) => renderResultQuestion(question, index)).join("")}</div>
    <div class="results-actions"><button class="button button-quiet" data-action="back-home">← Back to dashboard</button><button class="button button-primary" data-action="restart-test">Start another session →</button></div></div>`;
  testScreen.querySelectorAll("[data-grade-result]").forEach((button) => button.addEventListener("click", () => {
    const question = session.questions[Number(button.dataset.index)];
    question.status = button.dataset.gradeResult;
    if (question.type === "draw") question.rating = question.status === "correct" ? 100 : question.status === "incorrect" ? 0 : null;
    saveHistory();
    renderResults();
  }));
  testScreen.querySelectorAll("[data-result-rating]").forEach((input) => input.addEventListener("input", () => {
    const question = session.questions[Number(input.dataset.index)];
    question.rating = Number(input.value);
    question.status = question.rating === 100 ? "correct" : "incorrect";
    input.nextElementSibling.textContent = `${question.rating}%`;
    saveHistory();
    updateResultsScore();
    const card = input.closest(".result-card");
    card.querySelector(".result-status").textContent = question.status.toUpperCase();
    card.querySelector(".result-status").className = `result-status status-${question.status}`;
    card.querySelector(".result-grade-actions > span").textContent = question.status === "correct" ? "Marked correct" : "Marked incorrect";
  }));
  testScreen.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.action === "back-home") exitTest();
    if (button.dataset.action === "restart-test") {
      testScreen.hidden = true;
      session = null;
      startTest();
    }
  }));
}

function renderResultQuestion(question, index) {
  const answer = question.response.trim() ? escapeHtml(question.response) : "No written answer";
  const slider = question.type === "draw"
    ? `<div class="character-rating result-rating"><label>HANDWRITING SCORE · 0–100</label><div><input type="range" min="0" max="100" step="1" value="${question.rating ?? 50}" data-result-rating data-index="${index}" aria-label="Grade handwriting from zero to one hundred"><output>${question.rating == null ? "—" : `${question.rating}%`}</output></div></div>`
    : "";
  return `<article class="result-card"><div class="result-card-head"><span>QUESTION ${String(index + 1).padStart(2, "0")} · ${escapeHtml(question.direction)}</span><span class="result-status status-${question.status}">${question.status.toUpperCase()}</span></div><h3>${escapeHtml(question.prompt)}</h3><div class="result-answer"><strong>Your answer</strong><p>${answer}</p>${question.drawing ? `<img class="result-drawing ${question.grid ? "grid-on" : ""}" style="background-color:${escapeHtml(question.background || settings.background)}" src="${question.drawing}" alt="Your submitted drawing">` : ""}</div><div class="result-key"><strong>Key-value pair</strong><p>${escapeHtml(question.left)} <span>↔</span> ${escapeHtml(question.right)}</p></div>${question.type === "draw" && question.guide ? `<div class="stroke-guide result-guide"><small>MANUAL STROKE GUIDE</small><p>${escapeHtml(question.guide).replace(/\n/g, "<br>")}</p></div>` : ""}${slider}<div class="result-grade-actions"><span>${question.status === "correct" ? "Marked correct" : question.status === "incorrect" ? "Marked incorrect" : "Unanswered / skipped"}</span><div><button class="grade-button correct ${question.status === "correct" ? "chosen" : ""}" data-grade-result="correct" data-index="${index}">✓ Correct</button><button class="grade-button incorrect ${question.status === "incorrect" ? "chosen" : ""}" data-grade-result="incorrect" data-index="${index}">× Incorrect</button><button class="grade-button skip-grade ${question.status === "skipped" ? "chosen" : ""}" data-grade-result="skipped" data-index="${index}">— Skip</button></div></div></article>`;
}

function updateResultsScore() {
  const score = getSessionScore();
  const skipped = session.questions.filter((question) => question.status === "skipped").length;
  testScreen.querySelector("#result-percent").textContent = score.graded ? String(score.percent) : "—";
  testScreen.querySelector("#result-correct").textContent = String(score.correct);
  testScreen.querySelector("#result-incorrect").textContent = String(score.incorrect);
  testScreen.querySelector(".result-summary span:nth-child(3) b").textContent = String(skipped);
  testScreen.querySelector(".result-summary span:nth-child(4) b").textContent = String(score.graded);
}

function exitTest() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  session = null;
  persist();
  testScreen.hidden = true;
  document.querySelector(".app-shell").hidden = false;
  setView("dashboard");
}

function showToast(message, error = false) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `toast ${error ? "toast-error" : ""}`;
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

viewRoot.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) return setView(nav.dataset.nav);
  const open = event.target.closest("[data-open-deck]");
  if (open) {
    activeDeckId = open.dataset.openDeck;
    activeView = "deck";
    updateHeader();
    return renderDeck();
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "new-deck") openCreateDeck();
  else if (action === "start-test") {
    updateTestOptionsFromUI();
    startTest();
  } else if (action === "rename-deck") {
    const deck = activeDeck();
    const name = document.querySelector("#rename-deck").value.trim();
    if (!name) return showToast("Deck name cannot be empty.", true);
    deck.name = name;
    persist();
    renderDeck();
  } else if (action === "delete-pair") {
    const deck = activeDeck();
    if (window.confirm("Delete this pair?")) {
      deck.pairs = deck.pairs.filter((pair) => pair.id !== id);
      persist();
      renderDeck();
    }
  } else if (action === "edit-pair") {
    const pair = activeDeck().pairs.find((item) => item.id === id);
    if (pair) editPairModal(pair);
  } else if (action === "bulk-add") {
    const deck = activeDeck();
    const candidates = parseBulk(document.querySelector("#bulk-pairs").value);
    if (!candidates.length) return showToast("No valid pairs found. Use left = right on each line.", true);
    const result = addPairs(deck, candidates);
    if (result.added) {
      showToast(`${result.added} pairs added${result.duplicates ? ` · ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} included` : ""}.`);
      renderDeck();
    }
  } else if (action === "export-csv") {
    const deck = data.decks.find((item) => item.id === id) || activeDeck();
    if (deck) downloadCsv(deck);
  } else if (action === "import-csv") {
    importDeckId = id || activeDeckId;
    csvInput.click();
  } else if (action === "copy-deck") {
    const source = data.decks.find((item) => item.id === id) || activeDeck();
    if (!source) return;
    openModal(`<form id="copy-deck-form" class="modal-form" data-id="${source.id}"><div class="section-code">DUPLICATE DECK</div><h2>Copy ${escapeHtml(source.name)}</h2><label class="field-label" for="copy-deck-name">COPY NAME</label><input id="copy-deck-name" name="name" required value="${escapeHtml(`${source.name} copy`)}"><div class="modal-actions"><button type="button" class="button button-quiet" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Create copy →</button></div></form>`);
  } else if (action === "delete-deck") {
    if (data.decks.length < 2) return showToast("Keep at least one deck in your vault.", true);
    if (window.confirm("Delete this deck and its pairs? Saved test history will remain.")) {
      data.decks = data.decks.filter((deck) => deck.id !== id);
      activeDeckId = data.decks[0].id;
      persist();
      setView("decks");
    }
  } else if (action === "toggle-theme") {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    persist();
    updateHeader();
    renderCurrentView();
  } else if (action === "clear-history") {
    if (window.confirm("Clear all saved test history? Your decks and pairs will remain.")) {
      data.history = [];
      persist();
      renderSettings();
    }
  } else if (action === "export-all") {
    downloadBackup();
  }
});

viewRoot.addEventListener("change", (event) => {
  if (event.target.matches("[data-question-type]")) {
    testOptions.types[event.target.dataset.questionType] = event.target.checked;
    const deck = activeDeck();
    if (deck) {
      const capacity = allQuestions(deck).length;
      testOptions.count = Math.min(Number(testOptions.count) || 1, Math.max(1, capacity));
    }
    persist();
    renderCurrentView();
  } else if (event.target.id === "setup-mode") {
    testOptions.mode = event.target.value;
    persist();
    renderCurrentView();
  } else if (event.target.id === "setup-count") {
    testOptions.count = Math.max(1, Number(event.target.value) || 1);
    persist();
  } else if (event.target.id === "setup-minutes") {
    testOptions.minutes = Math.min(180, Math.max(1, Number(event.target.value) || 1));
    persist();
  } else if (event.target.id === "pref-grid") {
    settings.grid = event.target.checked;
    persist();
  } else if (event.target.id === "pref-ink") {
    settings.ink = event.target.value;
    persist();
  } else if (event.target.id === "pref-background") {
    settings.background = event.target.value;
    persist();
  } else if (event.target.id === "pref-brush") {
    settings.brush = Number(event.target.value);
    persist();
  } else if (event.target.id === "pref-canvas-height") {
    settings.canvasHeight = Number(event.target.value);
    persist();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "pair-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const left = String(form.get("left") || "").trim();
    const right = String(form.get("right") || "").trim();
    const deck = activeDeck();
    if (duplicatePair(deck, left, right) && !window.confirm("This pair already exists. Add the duplicate anyway?")) return;
    deck.pairs.push({ id: uid(), left, right, guide: String(form.get("guide") || "").trim() });
    persist();
    renderDeck();
  } else if (event.target.id === "deck-form") {
    event.preventDefault();
    const name = new FormData(event.target).get("name").trim();
    if (!name) return;
    const deck = { id: uid(), name, pairs: [] };
    data.decks.push(deck);
    activeDeckId = deck.id;
    persist();
    closeModal();
    setView("deck");
  } else if (event.target.id === "edit-pair-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const pair = activeDeck().pairs.find((item) => item.id === event.target.dataset.id);
    if (pair) {
      pair.left = String(form.get("left")).trim();
      pair.right = String(form.get("right")).trim();
      pair.guide = String(form.get("guide")).trim();
      persist();
      closeModal();
      renderDeck();
    }
  } else if (event.target.id === "copy-deck-form") {
    event.preventDefault();
    const source = data.decks.find((deck) => deck.id === event.target.dataset.id);
    const name = new FormData(event.target).get("name").trim();
    if (!source || !name) return;
    const copy = { id: uid(), name, pairs: source.pairs.map((pair) => ({ ...pair, id: uid() })) };
    data.decks.push(copy);
    activeDeckId = copy.id;
    persist();
    closeModal();
    setView("deck");
  }
});

modalRoot.addEventListener("click", (event) => {
  if (event.target === modalRoot.querySelector(".modal-backdrop") || event.target.closest('[data-action="close-modal"]')) closeModal();
});

csvInput.addEventListener("change", async () => {
  const file = csvInput.files?.[0];
  if (!file) return;
  try {
    const pairs = parseCsv(await file.text());
    const deck = data.decks.find((item) => item.id === importDeckId);
    if (!deck) throw new Error("The target deck no longer exists.");
    if (!pairs.length) throw new Error("No valid rows found. CSV requires left and right columns.");
    const report = addPairs(deck, pairs);
    if (report.added) {
      showToast(`${report.added} rows imported${report.duplicates ? ` · ${report.duplicates} duplicates included` : ""}.`);
      renderCurrentView();
    }
  } catch (error) {
    console.error("CSV import failed.", error);
    showToast(error.message || "CSV import failed.", true);
  } finally {
    csvInput.value = "";
  }
});

document.body.addEventListener("click", (event) => {
  const modalClose = event.target.closest('[data-action="close-modal"]');
  if (modalClose) closeModal();
});

function updateTestOptionsFromUI() {
  const count = viewRoot.querySelector("#setup-count");
  const mode = viewRoot.querySelector("#setup-mode");
  const minutes = viewRoot.querySelector("#setup-minutes");
  if (count) testOptions.count = Math.max(1, Number(count.value) || 1);
  if (mode) testOptions.mode = mode.value;
  if (minutes) testOptions.minutes = Math.min(180, Math.max(1, Number(minutes.value) || 1));
  viewRoot.querySelectorAll("[data-question-type]").forEach((input) => { testOptions.types[input.dataset.questionType] = input.checked; });
  persist();
}

normalizeData();
activeDeckId = data.decks.some((deck) => deck.id === activeDeckId) ? activeDeckId : data.decks[0].id;
updateHeader();
renderAuth();
