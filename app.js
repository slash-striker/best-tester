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
  ["multipleChoice", "Multiple choice"],
  ["recognition", "Recognition"],
];
const viewRoot = document.querySelector("#view-root");
const testScreen = document.querySelector("#test-screen");
const modalRoot = document.querySelector("#modal-root");
const csvInput = document.querySelector("#csv-input");
const backupInput = document.querySelector("#backup-input");
const authScreen = document.querySelector("#auth-screen");
const authForm = document.querySelector("#auth-form");
const AVATAR_OPTIONS = ["⌬", "◈", "⚡", "☾", "✦", "♜", "猫", "龍", "🦊", "🐙", "🌙", "👑", "🐉", "🦄"];
const FAVORITE_GAMES = [
  ["solitaire", "Klondike Solitaire"],
  ["freecell", "FreeCell"],
  ["blackjack", "Blackjack"],
  ["gofish", "Go Fish"],
];
let data = loadData();
let settings = loadSettings();
let currentAccount = null;
let accountLoadError = "";
let accounts = loadAccounts();
let authMode = accounts.length ? "login" : "signup";
let authBusy = false;
let activeView = "dashboard";
let activeDeckId = data.decks[0]?.id || "";
let testOptions = { mode: "self", count: 10, minutes: 5, types: { leftToRight: true, rightToLeft: true, write: true, draw: false, multipleChoice: false, recognition: false } };
let session = null;
let timerId = null;
let importDeckId = "";
let toastTimer = null;
let sessionTimerEndsAt = 0;
let gamesTab = "solitaire";
let supabaseClient = null;
let multiplayerState = { room: null, user: null, channel: null, subscribedRoomId: "", loading: false, error: "" };
let gamePointerDrag = null;
let wheelSpinning = false;
let cardClubRequest = 0;
let cardClubState = { loading: false, loaded: false, error: "", leaderboard: [], tournaments: [], standings: [], joined: false, joinedTournamentIds: [], activeTournamentId: "" };
const ACHIEVEMENTS = [
  { id: "first-session", name: "First Contact", description: "Complete your first learning session.", icon: "⌁" },
  { id: "night-owl", name: "Night Owl", description: "Study after midnight.", icon: "☾", secret: true },
  { id: "unstoppable", name: "Unstoppable", description: "Maintain a 30-day study streak.", icon: "🔥" },
  { id: "brain-machine", name: "Brain Machine", description: "Answer 100 questions correctly.", icon: "⌘" },
  { id: "comeback", name: "Comeback", description: "Return after a 7-day absence.", icon: "↻", secret: true },
  { id: "perfectionist", name: "Perfectionist", description: "Complete 10 perfect sessions.", icon: "✧" },
  { id: "speed-demon", name: "Speed Demon", description: "Complete a Speed Run.", icon: "⚡" },
  { id: "survivor", name: "Last One Standing", description: "Survive 10 questions.", icon: "◈" },
  { id: "collector", name: "Neon Collector", description: "Own 3 shop cosmetics.", icon: "◇" },
  { id: "variety", name: "Mode Jumper", description: "Complete 3 different game modes.", icon: "⟳" },
  { id: "secret-code", name: "Ghost in the Machine", description: "Study 你好 and 再见 in one day.", icon: "▣", secret: true },
];
const SHOP_ITEMS = [
  { id: "theme-default", name: "Neon Nexus", description: "The original cyan command environment.", type: "theme", value: "default", price: 0, rarity: "COMMON" },
  { id: "theme-violet", name: "Afterglow", description: "Violet glass and ultraviolet signals.", type: "theme", value: "violet", price: 120, rarity: "RARE" },
  { id: "theme-toxic", name: "Toxic Grid", description: "An electric acid-green interface.", type: "theme", value: "toxic", price: 160, rarity: "RARE" },
  { id: "theme-red", name: "Red Sector", description: "High-alert crimson command deck.", type: "theme", value: "red", price: 180, rarity: "EPIC" },
  { id: "frame-orbit", name: "Orbital Frame", description: "A rotating holo-ring for your profile.", type: "frame", value: "orbit", price: 90, rarity: "COMMON" },
  { id: "frame-glitch", name: "Glitch Frame", description: "Chromatic edges. Maximum signal.", type: "frame", value: "glitch", price: 140, rarity: "RARE" },
  { id: "card-back-royal", name: "Royal Nebula Back", description: "Deep purple foil with a constellation crest.", type: "cardBack", value: "royal", price: 160, rarity: "RARE" },
  { id: "card-back-sakura", name: "Sakura Night Back", description: "Petal-pink ink drifting across midnight.", type: "cardBack", value: "sakura", price: 220, rarity: "EPIC" },
  { id: "card-back-aurora", name: "Aurora Vault Back", description: "An animated ribbon of northern lights.", type: "cardBack", value: "aurora", price: 420, rarity: "LEGENDARY" },
  { id: "card-effect-glimmer", name: "Glimmer Reveal", description: "Cards shimmer into view with a soft sparkle.", type: "cardEffect", value: "glimmer", price: 180, rarity: "RARE" },
  { id: "card-effect-prism", name: "Prism Reveal", description: "A prismatic flash follows every reveal.", type: "cardEffect", value: "prism", price: 360, rarity: "EPIC" },
  { id: "table-velvet", name: "Velvet Lounge", description: "A rich plum table made for a late-night game.", type: "tableTheme", value: "velvet", price: 200, rarity: "EPIC" },
  { id: "table-gold", name: "Gilded Parlor", description: "Warm gold felt with a polished edge.", type: "tableTheme", value: "gold", price: 480, rarity: "LEGENDARY" },
  { id: "banner-constellation", name: "Star Cartographer", description: "A custom constellation banner for your profile.", type: "banner", value: "constellation", price: 220, rarity: "EPIC" },
  { id: "avatar-fox", name: "Foxfire Avatar", description: "A clever fox with a bright little spark.", type: "avatar", value: "🦊", price: 120, rarity: "RARE" },
  { id: "deck-royal", name: "Royal Card Set", description: "A refined face-card treatment for your favorite deck.", type: "cardDeck", value: "royal", price: 260, rarity: "EPIC" },
  { id: "title-ghost", name: "Ghost Protocol", description: "An encrypted profile title.", type: "title", value: "Ghost Protocol", price: 75, rarity: "COMMON" },
  { id: "title-neural", name: "Neural Architect", description: "A title for builders of memory.", type: "title", value: "Neural Architect", price: 130, rarity: "RARE" },
  { id: "streak-freeze", name: "Streak Shield", description: "Automatically protects one missed day.", type: "freeze", value: 1, price: 100, rarity: "UTILITY" },
];
const DAILY_CHALLENGES = [
  { id: "questions", name: "Signal Scan", description: "Answer 10 questions today.", target: 10, metric: "answered", reward: 40 },
  { id: "correct", name: "Clean Data", description: "Get 5 answers right today.", target: 5, metric: "correct", reward: 45 },
  { id: "sessions", name: "Stay Connected", description: "Complete 2 sessions today.", target: 2, metric: "sessions", reward: 35 },
  { id: "modes", name: "Protocol Switch", description: "Try 3 different game modes.", target: 3, metric: "modes", reward: 50 },
];
const DAILY_WHEEL_PRIZES = [
  { label: "25 credits", weight: 35, credits: 25 },
  { label: "40 credits", weight: 25, credits: 40 },
  { label: "60 credits", weight: 20, credits: 60 },
  { label: "100 credits", weight: 12, credits: 100 },
  { label: "Rare cosmetic", weight: 8, cosmetic: true },
];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyData() {
  return {
    decks: [{ id: uid(), name: "My first deck", pairs: [] }],
    history: [],
    progression: defaultProgression(),
    budget: NovexBudget.createBudget(),
    games: NovexCardGames.normalizeGameStats(),
  };
}

function defaultProgression() {
  return {
    xp: 0,
    credits: 0,
    streak: 0,
    bestStreak: 0,
    lastStudyDate: "",
    lastActiveDate: "",
    freezeCount: 0,
    perfectSessions: 0,
    correctTotal: 0,
    answeredTotal: 0,
    profile: { displayName: "", title: "", frame: "", avatar: "⌬", banner: "default", favoriteGame: "solitaire", favoriteDeck: "classic", showcase: [] },
    owned: ["theme-default"],
    equippedTheme: "default",
    cardBack: "classic",
    cardEffect: "none",
    tableTheme: "neon",
    achievements: [],
    daily: { date: "", answered: 0, correct: 0, sessions: 0, completed: [] },
    skillPoints: 0,
    skills: { memory: 0, focus: 0, speed: 0, intelligence: 0 },
    defeatedBosses: [],
  };
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
          progression: normalizeProgression(stored.progression),
          budget: NovexBudget.normalizeBudget(stored.budget),
          games: NovexCardGames.normalizeGameStats(stored.games),
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
    progression: defaultProgression(),
    budget: NovexBudget.createBudget(),
    games: NovexCardGames.normalizeGameStats(),
  };
}

function normalizeProgression(progress = {}) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) progress = {};
  const defaults = defaultProgression();
  const nonnegative = (value) => Math.min(1_000_000_000, Math.max(0, Math.floor(Number(value) || 0)));
  const dateValue = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const profile = progress.profile && typeof progress.profile === "object" ? progress.profile : {};
  const daily = progress.daily && typeof progress.daily === "object" ? progress.daily : {};
  const skills = progress.skills && typeof progress.skills === "object" ? progress.skills : {};
  return {
    ...defaults,
    ...progress,
    xp: nonnegative(progress.xp),
    credits: nonnegative(progress.credits),
    streak: nonnegative(progress.streak),
    bestStreak: nonnegative(progress.bestStreak),
    lastStudyDate: dateValue(progress.lastStudyDate),
    lastActiveDate: dateValue(progress.lastActiveDate),
    equippedTheme: typeof progress.equippedTheme === "string" ? progress.equippedTheme : "default",
    cardBack: typeof progress.cardBack === "string" ? progress.cardBack : "classic",
    cardEffect: typeof progress.cardEffect === "string" ? progress.cardEffect : "none",
    tableTheme: typeof progress.tableTheme === "string" ? progress.tableTheme : "neon",
    freezeCount: nonnegative(progress.freezeCount),
    perfectSessions: nonnegative(progress.perfectSessions),
    correctTotal: nonnegative(progress.correctTotal),
    answeredTotal: nonnegative(progress.answeredTotal),
    skillPoints: nonnegative(progress.skillPoints),
    profile: {
      displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 28) : "",
      title: typeof profile.title === "string" ? profile.title.slice(0, 40) : "",
      frame: typeof profile.frame === "string" ? profile.frame : "",
      avatar: AVATAR_OPTIONS.includes(profile.avatar) ? profile.avatar : "⌬",
      banner: typeof profile.banner === "string" ? profile.banner : "default",
      favoriteGame: FAVORITE_GAMES.some(([id]) => id === profile.favoriteGame) ? profile.favoriteGame : "solitaire",
      favoriteDeck: typeof profile.favoriteDeck === "string" ? profile.favoriteDeck : "classic",
      showcase: Array.isArray(profile.showcase) ? [...new Set(profile.showcase.filter((id) => typeof id === "string"))].slice(0, 4) : [],
    },
    daily: {
      ...defaults.daily,
      ...daily,
      date: dateValue(daily.date),
      answered: nonnegative(daily.answered),
      correct: nonnegative(daily.correct),
      sessions: nonnegative(daily.sessions),
      modes: Array.isArray(daily.modes) ? [...new Set(daily.modes.filter((mode) => typeof mode === "string"))] : [],
      completed: Array.isArray(daily.completed) ? [...new Set(daily.completed.filter((id) => typeof id === "string"))] : [],
      bonusClaimed: Boolean(daily.bonusClaimed),
    },
    skills: Object.fromEntries(Object.keys(defaults.skills).map((skill) => [skill, Math.min(5, nonnegative(skills[skill]))])),
    achievements: Array.isArray(progress.achievements) ? [...new Set(progress.achievements.filter((id) => typeof id === "string"))] : [],
    owned: Array.isArray(progress.owned) ? [...new Set(["theme-default", ...progress.owned])] : defaults.owned,
    defeatedBosses: Array.isArray(progress.defeatedBosses) ? [...new Set(progress.defeatedBosses.map(Number).filter((number) => Number.isInteger(number) && number > 0))] : [],
  };
}

function validateProgressionCosmetics(progression) {
  const owned = new Set(progression.owned.filter((id) =>
    id === "theme-default" || SHOP_ITEMS.some((item) => item.id === id)
  ));
  progression.owned = [...owned];
  const isOwnedValue = (type, value) => SHOP_ITEMS.some((item) =>
    item.type === type && item.value === value && owned.has(item.id)
  );
  if (!isOwnedValue("theme", progression.equippedTheme)) progression.equippedTheme = "default";
  if (!isOwnedValue("cardBack", progression.cardBack)) progression.cardBack = "classic";
  if (!isOwnedValue("cardEffect", progression.cardEffect)) progression.cardEffect = "none";
  if (!isOwnedValue("tableTheme", progression.tableTheme)) progression.tableTheme = "neon";
  if (progression.profile.frame && !isOwnedValue("frame", progression.profile.frame)) progression.profile.frame = "";
  if (progression.profile.title && !isOwnedValue("title", progression.profile.title)) progression.profile.title = "";
  if (progression.profile.banner !== "default" && !isOwnedValue("banner", progression.profile.banner)) progression.profile.banner = "default";
  if (!AVATAR_OPTIONS.slice(0, 8).includes(progression.profile.avatar) &&
      !isOwnedValue("avatar", progression.profile.avatar)) progression.profile.avatar = "⌬";
  if (progression.profile.favoriteDeck !== "classic" &&
      !isOwnedValue("cardDeck", progression.profile.favoriteDeck)) progression.profile.favoriteDeck = "classic";
  progression.profile.showcase = progression.profile.showcase.filter((id) => owned.has(id)).slice(0, 4);
  return progression;
}

function loadSettings(storageKey = SETTINGS_KEY) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return normalizeSettings(stored);
  } catch (error) {
    console.error("Could not load appearance preferences.", error);
    return normalizeSettings({});
  }
}

function normalizeSettings(stored = {}) {
  const color = (value, fallback) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  return {
    theme: stored.theme === "light" ? "light" : "dark",
    grid: stored.grid !== false,
    ink: color(stored.ink, "#54f4e3"),
    background: color(stored.background, "#101624"),
    brush: Math.min(24, Math.max(1, Number(stored.brush) || 5)),
    canvasHeight: Math.min(440, Math.max(160, Number(stored.canvasHeight) || 250)),
  };
}

function persist() {
  if (!currentAccount) return false;
  const suffix = encodeURIComponent(currentAccount.username.toLowerCase());
  const entries = [
    [`novex-learner-data-${suffix}`, JSON.stringify(data)],
    [`novex-learner-settings-${suffix}`, JSON.stringify(settings)],
    [`novex-learner-test-options-${suffix}`, JSON.stringify(testOptions)],
  ];
  let previous;
  try {
    previous = entries.map(([key]) => localStorage.getItem(key));
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
    return true;
  } catch (error) {
    console.error("Could not save your Novex Learner data.", error);
    if (previous) {
      entries.forEach(([key], index) => {
        try {
          if (previous[index] === null) localStorage.removeItem(key);
          else localStorage.setItem(key, previous[index]);
        } catch (rollbackError) {
          console.error(`Could not restore the previous value for ${key}.`, rollbackError);
        }
      });
    }
    showToast("Could not save your profile. Check browser storage and keep a backup.", true);
    return false;
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
  data.progression = normalizeProgression(data.progression);
  data.progression = validateProgressionCosmetics(data.progression);
  data.budget = NovexBudget.normalizeBudget(data.budget);
  data.games = NovexCardGames.normalizeGameStats(data.games);
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
    testOptions = normalizeTestOptions(stored);
  } catch (error) {
    console.error("Could not load this profile's test preferences.", error);
    throw new Error("Could not read this profile's test preferences.");
  }
}

function normalizeTestOptions(stored = {}) {
  return {
    mode: ["timed", "speed", "survival", "memory", "perfect"].includes(stored.mode) ? stored.mode : "self",
    count: Math.max(1, Math.min(1000, Number(stored.count) || 10)),
    minutes: Math.min(180, Math.max(1, Number(stored.minutes) || 5)),
    types: Object.fromEntries(QUESTION_TYPES.map(([key]) => [key, Boolean(stored.types?.[key])])),
  };
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
    testOptions = { mode: "self", count: 10, minutes: 5, types: { leftToRight: true, rightToLeft: true, write: true, draw: false, multipleChoice: false, recognition: false } };
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
    if (types.multipleChoice && deck.pairs.length > 1) add("multipleChoice", Math.random() < 0.5, "MULTIPLE CHOICE · RANDOM DIRECTION");
    if (types.recognition) add("recognition", Math.random() < 0.5, "RECOGNITION");
  }
  for (const question of variants) {
    if (question.type !== "multipleChoice") continue;
    const distractors = deck.pairs
      .filter((pair) => pair.id !== question.pairId)
      .map((pair) => question.prompt === pair.left ? pair.right : pair.left);
    question.choices = shuffle([question.answer, ...shuffle([...new Set(distractors.filter((choice) => choice !== question.answer))]).slice(0, 3)]);
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

function buildQuestionSet(deck, types, requested, repeatAfterPool = false) {
  const fillPool = () => {
    const groups = new Map(deck.pairs.map((pair) => [pair.id, []]));
    allQuestions(deck, types).forEach((question) => groups.get(question.pairId)?.push(question));
    for (const group of groups.values()) shuffle(group);
    return groups;
  };
  let byPair = fillPool();
  const result = [];
  while (result.length < requested) {
    let groups = shuffle([...byPair.values()].filter((group) => group.length));
    if (!groups.length) {
      if (!repeatAfterPool) break;
      byPair = fillPool();
      groups = shuffle([...byPair.values()].filter((group) => group.length));
      if (!groups.length) break;
    }
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
  const labels = {
    dashboard: "NEURO // OS",
    decks: "STUDY DECKS",
    deck: "DECK / STUDY",
    progress: "PROGRESS",
    settings: "SETTINGS",
    arcade: "ARCADE",
    budget: "BUDGET LAB",
    games: "CARD TABLE",
    shop: "NEON MARKET",
    profile: "OPERATOR PROFILE",
  };
  document.querySelector("#current-section").textContent = labels[activeView] || "DASHBOARD";
  document.querySelector("#nav-deck-count").textContent = data.decks.length;
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date()).toUpperCase();
  document.querySelector("#account-name").textContent = currentAccount?.username || "";
  document.querySelector("#account-name").hidden = !currentAccount;
  document.querySelector("#logout-button").hidden = !currentAccount;
  document.body.dataset.theme = settings.theme;
  document.body.dataset.skin = data.progression?.equippedTheme || "default";
  document.body.dataset.frame = data.progression?.profile?.frame || "";
  document.body.dataset.cardBack = data.progression?.cardBack || "classic";
  document.body.dataset.cardEffect = data.progression?.cardEffect || "none";
  document.body.dataset.tableTheme = data.progression?.tableTheme || "neon";
  document.body.dataset.profileBanner = data.progression?.profile?.banner || "default";
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
  else if (view === "arcade") renderArcade();
  else if (view === "budget") renderBudget();
  else if (view === "games") renderGames();
  else if (view === "shop") renderShop();
  else if (view === "profile") renderProfile();
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
  else if (activeView === "arcade") renderArcade();
  else if (activeView === "budget") renderBudget();
  else if (activeView === "games") renderGames();
  else if (activeView === "shop") renderShop();
  else if (activeView === "profile") renderProfile();
  else renderSettings();
}

function renderDashboard() {
  resetDailyIfNeeded();
  const stats = statsFor(data.history);
  const deck = activeDeck();
  const records = deck ? data.history.filter((record) => record.deckId === deck.id) : [];
  const deckStats = statsFor(records);
  const recent = [...data.history].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 4);
  viewRoot.innerHTML = `
    <section class="welcome-row">
      <div>
        <div class="eyebrow"><span class="pulse"></span> PERSONAL LEARNING SYSTEM <span class="eyebrow-line"></span> ONLINE</div>
        <h1>Welcome back,<br><span>${escapeHtml(data.progression.profile.displayName || currentAccount?.username || "knowledge seeker")}.</span></h1>
        <p class="lead">NEURO // OS online. Build your vault, keep your streak alive, and earn your next upgrade.</p>
      </div>
      <div class="hero-orbit" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit-core">NV</div><span class="orbit-dot dot-a"></span><span class="orbit-dot dot-b"></span></div>
    </section>
    ${renderLevelBar()}
    <section class="gamification-strip">
      <article class="streak-card ${streakClass()}"><div class="streak-flame" aria-hidden="true">♨</div><div><small>ACTIVE STREAK</small><strong>${data.progression.streak} <span>${data.progression.streak === 1 ? "day" : "days"}</span></strong><p>Best: ${data.progression.bestStreak} ${data.progression.bestStreak === 1 ? "day" : "days"}</p></div><i class="streak-orbit"></i></article>
      <article class="daily-card"><div class="section-heading"><div><span class="section-code">DAILY UPLINK · ${escapeHtml(todayKey())}</span><h2>Missions</h2></div><span class="coin-chip">◈ ${data.progression.credits}</span></div>${dailyChallengesMarkup()}<button class="text-button" data-nav="arcade">All challenges & achievements ↗</button></article>
      <article class="profile-card-mini"><div class="section-code">OPERATOR PROFILE</div><div class="profile-mini-row"><span class="profile-avatar">${escapeHtml(data.progression.profile.avatar || "⌬")}</span><div><strong>${escapeHtml(data.progression.profile.displayName || currentAccount?.username || "Operator")}</strong><small>${escapeHtml(data.progression.profile.title || "New Recruit")}</small></div></div><div class="profile-mini-meta"><span>◈ ${data.progression.credits} credits</span><span>✦ ${unlockedAchievementCount()} achievements</span></div><button class="text-button" data-nav="profile">Customize profile ↗</button></article>
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
          ${renderBossPanel()}
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
  const capacity = available;
  const enabledTypeCount = QUESTION_TYPES.filter(([key]) => testOptions.types[key]).length;
  const multipleChoiceHint = testOptions.types.multipleChoice && deck.pairs.length < 2 ? " Add a second pair to enable multiple choice." : "";
  const safeCount = Math.max(1, Math.min(Number(testOptions.count) || 1, capacity || 1));
  const setupHint = capacity
    ? `Up to ${capacity} unique question variants · random order · pairs are spread out.${testOptions.mode === "timed" && data.progression.skills.focus ? ` Focus tree adds ${data.progression.skills.focus} minute${data.progression.skills.focus === 1 ? "" : "s"}.` : ""}${multipleChoiceHint}`
    : !deck.pairs.length
      ? "Add at least one pair to begin."
      : !enabledTypeCount
        ? "Enable at least one question type."
        : "Multiple choice requires at least two pairs.";
  const typeOptions = QUESTION_TYPES.map(([key, label]) => `
    <label class="type-check"><input type="checkbox" data-question-type="${key}" ${testOptions.types[key] ? "checked" : ""}><span class="check-box"></span><span>${label}</span></label>`).join("");
  return `
    <div class="setup-block">
      <div class="setup-title"><span>SESSION CONFIGURATION</span><span>01 — 03</span></div>
      <div class="type-list">${typeOptions}</div>
      <div class="setup-row">
        <label class="setting-field"><span>QUESTIONS</span><div class="setting-input"><input id="setup-count" type="number" min="1" max="${Math.max(1, capacity)}" value="${safeCount}"><small>max ${capacity}</small></div></label>
        <label class="setting-field"><span>SESSION MODE</span><select id="setup-mode">${modeOptionsMarkup()}</select></label>
        ${testOptions.mode === "timed" ? `<label class="setting-field"><span>TIME LIMIT</span><div class="setting-input"><input id="setup-minutes" type="number" min="1" max="180" value="${Math.min(180, Math.max(1, testOptions.minutes))}"><small>min</small></div></label>` : ""}
      </div>
      <p class="setup-hint" id="setup-hint">${setupHint}</p>
      <button class="button button-primary start-button" data-action="start-test" ${capacity ? "" : "disabled"}>INITIALIZE TEST <span>→</span></button>
    </div>`;
}

function modeOptionsMarkup() {
  const modes = [
    ["self", "Self-test"],
    ["timed", "Timed test"],
    ["speed", "Speed Run · 60 sec"],
    ["survival", "Survival"],
    ["memory", "Memory Rush"],
    ["perfect", "Perfect Run"],
  ];
  return modes.map(([value, label]) => `<option value="${value}" ${testOptions.mode === value ? "selected" : ""}>${label}</option>`).join("");
}

function todayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function resetDailyIfNeeded() {
  if (data.progression.daily.date === todayKey()) return;
  data.progression.daily = { date: todayKey(), answered: 0, correct: 0, sessions: 0, modes: [], completed: [], bonusClaimed: false };
  persist();
}

function challengeProgress(challenge) {
  const daily = data.progression.daily;
  if (challenge.metric === "modes") return new Set(daily.modes || []).size;
  return daily[challenge.metric] || 0;
}

function dailyChallengesMarkup() {
  resetDailyIfNeeded();
  return `<div class="challenge-list">${DAILY_CHALLENGES.map((challenge) => {
    const progress = challengeProgress(challenge);
    const completed = data.progression.daily.completed.includes(challenge.id);
    const pct = Math.min(100, Math.round(progress / challenge.target * 100));
    return `<article class="challenge-row ${completed ? "challenge-complete" : ""}"><span class="challenge-check">${completed ? "✓" : "·"}</span><div class="challenge-body"><div><strong>${challenge.name}</strong><small>${challenge.description}</small></div><b>${Math.min(progress, challenge.target)}/${challenge.target}</b><div class="challenge-track"><i style="width:${pct}%"></i></div></div><span class="challenge-reward">+${challenge.reward}</span></article>`;
  }).join("")}${data.progression.daily.bonusClaimed ? '<div class="daily-bonus-earned">ALL DAILY MISSIONS COMPLETE · +50 BONUS CLAIMED</div>' : ""}</div>`;
}

function currentLevel() {
  return Math.floor(data.progression.xp / 150) + 1;
}

function levelProgress() {
  return data.progression.xp % 150;
}

function renderLevelBar() {
  const level = currentLevel();
  const pct = Math.round(levelProgress() / 150 * 100);
  return `<section class="level-strip"><div class="level-badge"><small>LVL</small><strong>${level}</strong></div><div class="level-progress"><div class="level-label"><strong>${escapeHtml(data.progression.profile.title || titleForLevel(level))}</strong><span>${data.progression.xp} XP · ${150 - levelProgress()} XP TO LEVEL ${level + 1}</span></div><div class="xp-track"><i style="width:${pct}%"></i></div></div><div class="currency-badge">◈ <strong>${data.progression.credits}</strong><small>CREDITS</small></div></section>`;
}

function titleForLevel(level) {
  if (level >= 25) return "Neural Legend";
  if (level >= 15) return "Memory Architect";
  if (level >= 10) return "Signal Runner";
  if (level >= 5) return "Data Seeker";
  return "New Recruit";
}

function streakClass() {
  const streak = data.progression.streak;
  return streak >= 365 ? "streak-legendary" : streak >= 100 ? "streak-holo" : streak >= 30 ? "streak-aura" : streak >= 14 ? "streak-electric" : streak >= 7 ? "streak-neon" : streak >= 3 ? "streak-lit" : "";
}

function unlockedAchievementCount() {
  return data.progression.achievements.length;
}

function bossNumber() {
  return Math.floor(currentLevel() / 5);
}

function bossIsAvailable() {
  const boss = bossNumber();
  return boss >= 1 && !data.progression.defeatedBosses.includes(boss);
}

function renderBossPanel() {
  if (!bossIsAvailable()) return "";
  const deck = activeDeck();
  return `<div class="boss-panel"><span class="boss-sigil">⬡</span><div><span class="section-code">BOSS SIGNAL · DISTRICT ${bossNumber()}</span><strong>${escapeHtml(deck?.name || "Your toughest topic")}</strong><small>Face five hits drawn from your weakest pairs when available. Victory earns 100 credits and 80 XP.</small></div><button class="button button-danger" data-action="boss-fight">CHALLENGE →</button></div>`;
}

function themeName(theme) {
  return { default: "Neon Nexus", violet: "Afterglow", toxic: "Toxic Grid", red: "Red Sector" }[theme] || "Neon Nexus";
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

function renderArcade() {
  const records = data.history;
  const perfects = records.filter((record) => record.perfect).length;
  const modes = [
    { id: "speed", name: "Speed Run", length: `${60 + data.progression.skills.speed * 5} SECONDS`, icon: "⚡", copy: "Answer as many as you can before the clock burns out.", reward: "Fast answers · XP burst" },
    { id: "survival", name: "Survival", length: "UNTIL A MISS", icon: "◈", copy: "One mistake ends the run. How long can you stay sharp?", reward: "Streak bonus · score chase" },
    { id: "memory", name: "Memory Rush", length: "MEMORIZE → RECALL", icon: "◉", copy: "Study your pairs during a short preview, then recall them from memory.", reward: "Memory XP · no peeking" },
    { id: "perfect", name: "Perfect Run", length: "NO MISTAKES", icon: "✧", copy: "Finish your full set without a single incorrect answer.", reward: "Perfect-run bonus" },
  ];
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> NEURAL ARCADE / TRAINING PROTOCOLS</div><h1>Choose your <span>challenge.</span></h1><p class="lead">Different pressure, same goal: make the knowledge stick.</p></div><div class="coin-chip large">◈ ${data.progression.credits} CREDITS</div></section>
    <section class="arcade-grid">${modes.map((mode) => `<article class="arcade-mode mode-${mode.id}"><div class="arcade-mode-top"><span class="arcade-icon">${mode.icon}</span><span class="mode-length">${mode.length}</span></div><h2>${mode.name}</h2><p>${mode.copy}</p><div class="arcade-reward">${mode.reward}</div><button class="button button-primary" data-start-mode="${mode.id}" ${activeDeck()?.pairs.length ? "" : "disabled"}>LAUNCH PROTOCOL →</button></article>`).join("")}</section>
    <div class="arcade-lower"><section class="panel panel-main"><div class="section-heading"><div><span class="section-code">MILESTONES / ${unlockedAchievementCount()} UNLOCKED</span><h2>Achievement matrix</h2></div><span class="neon-tag">SECRET SIGNALS INCLUDED</span></div>${achievementGrid()}</section><aside class="panel side-panel"><div class="section-heading"><div><span class="section-code">DAILY UPLINK</span><h2>Today's missions</h2></div></div>${dailyChallengesMarkup()}<div class="mode-record"><span class="section-code">PERFECT RUNS</span><strong>${perfects} <small>clean sessions</small></strong></div></aside></div>
  `;
}

function formatMoney(cents, currency = data.budget.currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((Number(cents) || 0) / 100);
}

function localDateKey(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function renderBudget() {
  const budget = data.budget;
  const currencySymbol = escapeHtml(new Intl.NumberFormat(undefined, { style: "currency", currency: budget.currency })
    .formatToParts(0).find((part) => part.type === "currency")?.value || budget.currency);
  const summary = NovexBudget.summarizeBudget(budget);
  const categories = budget.categories;
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date());
  const recentExpenses = [...budget.expenses]
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    .slice(0, 8);
  const tips = [
    "Give every dollar a job before the month begins. A plan is a guide, not a guilt trip.",
    "Try the 50/30/20 split as a starting point: needs, wants, and future-you. Adjust it to fit real life.",
    "A tiny automatic-feeling habit can help: record a purchase right after you make it.",
    "Savings is a category, not just whatever is left over. Even a small planned amount counts.",
    "If one category is over, learn from it and rebalance next month. The goal is awareness, not perfection.",
  ];
  const tip = tips[(new Date().getDate() - 1) % tips.length];
  const totalGoals = summary.goalTargetCents;
  const savedGoals = summary.goalSavedCents;
  const challenges = [
    { done: budget.monthlyIncomeCents > 0, label: "Set your monthly take-home plan" },
    { done: categories.every((category) => category.limitCents > 0), label: "Give all three buckets a job" },
    { done: budget.expenses.some((expense) => expense.date.slice(0, 7) === summary.month), label: "Log your first purchase this month" },
    { done: budget.goals.length > 0, label: "Create a goal for future-you" },
  ];
  viewRoot.innerHTML = `
    <section class="page-heading budget-heading"><div><div class="eyebrow"><span class="pulse"></span> MONEY LAB / YOUR PLAN, YOUR PACE</div><h1>Make money <span>make sense.</span></h1><p class="lead">A friendly, private budget planner. Start with a simple split, track what you spend, and celebrate the little wins.</p></div><div class="budget-month">${escapeHtml(monthLabel)}<small>LOCAL TO THIS BROWSER</small></div></section>
    <section class="metric-grid budget-metrics">
      <article class="metric-card"><div class="metric-head">TAKE-HOME PLAN <b>↗</b></div><strong>${formatMoney(budget.monthlyIncomeCents)}</strong><small>Monthly income you entered</small></article>
      <article class="metric-card"><div class="metric-head">SPENT THIS MONTH <b>⌁</b></div><strong>${formatMoney(summary.spentCents)}</strong><small>${budget.expenses.filter((expense) => expense.date.slice(0, 7) === summary.month).length} purchases logged</small></article>
      <article class="metric-card ${summary.remainingCents < 0 ? "budget-over" : ""}"><div class="metric-head">LEFT TO PLAN <b>◈</b></div><strong>${formatMoney(summary.remainingCents)}</strong><small>Income minus recorded spending</small></article>
      <article class="metric-card"><div class="metric-head">GOAL SAVINGS <b>✦</b></div><strong>${formatMoney(savedGoals)}</strong><small>Across ${budget.goals.length} ${budget.goals.length === 1 ? "goal" : "goals"}</small></article>
    </section>
    <div class="budget-layout">
      <div class="budget-main-column">
        <section class="panel budget-panel">
          <div class="section-heading"><div><span class="section-code">01 / START WITH YOUR TAKE-HOME</span><h2>Build your monthly plan</h2></div><span class="budget-sticker">NO JUDGMENT ZONE</span></div>
          <form id="budget-income-form" class="budget-income-form">
            <label class="setting-field"><span>MONTHLY TAKE-HOME</span><div class="money-input"><b aria-hidden="true">${currencySymbol}</b><input name="income" type="number" min="0" max="10000000" step="0.01" value="${(budget.monthlyIncomeCents / 100).toFixed(2)}" required aria-label="Monthly take-home income"></div></label>
            <label class="setting-field"><span>CURRENCY</span><select name="currency">${NovexBudget.currencies.map((currency) => `<option value="${currency}" ${budget.currency === currency ? "selected" : ""}>${currency}</option>`).join("")}</select></label>
            <button class="button button-primary" type="submit">Save plan →</button>
          </form>
          <div class="budget-section-heading"><div><span class="section-code">THE 50 / 30 / 20 STARTER SPLIT</span><p class="panel-copy">A flexible starting point: 50% needs, 30% wants, 20% savings.</p></div><button class="button button-outline" type="button" data-action="budget-suggest">Use suggested split</button></div>
          <form id="budget-plan-form" class="budget-category-list">
            ${categories.map((category) => {
              const spent = summary.byCategory[category.id] || 0;
              const limit = category.limitCents;
              const percentage = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
              const remainder = limit - spent;
              return `<label class="budget-category budget-${category.color}"><span class="budget-category-icon">${category.id === "needs" ? "⌂" : category.id === "wants" ? "✦" : "↗"}</span><span class="budget-category-info"><strong>${category.name}</strong><small>${category.percent}% guide · ${formatMoney(spent)} spent · ${formatMoney(remainder)} left</small><span class="budget-track"><i style="width:${percentage}%"></i></span></span><span class="budget-category-input"><small>MONTHLY LIMIT</small><span class="money-input"><b aria-hidden="true">${currencySymbol}</b><input name="${category.id}" data-budget-limit="${category.id}" type="number" min="0" max="10000000" step="0.01" value="${(limit / 100).toFixed(2)}" aria-label="${category.name} monthly limit"></span></span></label>`;
            }).join("")}
            <div class="budget-plan-footer"><span>${summary.budgetedCents > budget.monthlyIncomeCents ? "Your planned buckets are above your income. That's okay—adjust them to fit." : "Your buckets are a plan, not a rulebook. Make them yours."}</span><button class="button button-quiet" type="submit">Save category limits</button></div>
          </form>
        </section>
        <section class="panel budget-panel">
          <div class="section-heading"><div><span class="section-code">02 / KEEP THE RECEIPTS, SKIP THE GUILT</span><h2>Log a purchase</h2></div><span class="budget-sticker">30 SECONDS</span></div>
          <form id="budget-expense-form" class="budget-expense-form">
            <label class="setting-field"><span>WHAT WAS IT?</span><input name="description" maxlength="80" placeholder="Coffee, groceries, bus pass…" required></label>
            <label class="setting-field"><span>AMOUNT</span><div class="money-input"><b aria-hidden="true">${currencySymbol}</b><input name="amount" type="number" min="0.01" max="10000000" step="0.01" placeholder="0.00" required></div></label>
            <label class="setting-field"><span>BUCKET</span><select name="categoryId">${categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join("")}</select></label>
            <label class="setting-field"><span>DATE</span><input name="date" type="date" value="${localDateKey()}" required></label>
            <button class="button button-primary" type="submit">Add purchase +</button>
          </form>
          <div class="budget-expenses-heading"><div><span class="section-code">RECENT ACTIVITY</span><p class="panel-copy">Only your entries are shown. Nothing is connected to a bank.</p></div></div>
          ${recentExpenses.length ? `<div class="budget-expense-list">${recentExpenses.map((expense) => {
            const category = categories.find((item) => item.id === expense.categoryId);
            return `<div class="budget-expense-row"><span class="budget-expense-dot budget-${category?.color || "cyan"}"></span><span><strong>${escapeHtml(expense.description)}</strong><small>${escapeHtml(category?.name || "Other")} · ${escapeHtml(expense.date)}</small></span><b>−${formatMoney(expense.amountCents)}</b><button type="button" class="icon-button" data-action="delete-expense" data-id="${escapeHtml(expense.id)}" aria-label="Delete ${escapeHtml(expense.description)}">×</button></div>`;
          }).join("")}</div>` : `<div class="budget-empty"><span>✧</span><strong>Your first entry is a tiny win.</strong><p>Add a purchase above and your plan will start coming to life.</p></div>`}
        </section>
      </div>
      <aside class="budget-side-column">
        <section class="panel budget-tip-panel"><div class="budget-tip-orb">✦</div><span class="section-code">A LITTLE MONEY WISDOM</span><h2>Budgeting is a skill, not a personality trait.</h2><p>${escapeHtml(tip)}</p><small>TIP ${String((new Date().getDate() - 1) % tips.length + 1).padStart(2, "0")} / ${String(tips.length).padStart(2, "0")}</small></section>
        <section class="panel budget-panel">
          <div class="section-heading"><div><span class="section-code">03 / A REASON TO SAVE</span><h2>Dream fund</h2></div><span class="budget-sticker">FUTURE YOU SAYS HI</span></div>
          <form id="budget-goal-form" class="budget-goal-form">
            <label class="setting-field"><span>GOAL NAME</span><input name="name" maxlength="60" placeholder="Concert tickets, new bike…" required></label>
            <label class="setting-field"><span>TARGET</span><div class="money-input"><b aria-hidden="true">${currencySymbol}</b><input name="target" type="number" min="0.01" max="10000000" step="0.01" placeholder="0.00" required></div></label>
            <label class="setting-field"><span>WISH DATE (OPTIONAL)</span><input name="deadline" type="date"></label>
            <button class="button button-primary" type="submit" ${budget.goals.length >= 20 ? "disabled" : ""}>Plant a goal →</button>
          </form>
          ${budget.goals.length ? `<div class="budget-goals">${budget.goals.map((goal) => {
            const progress = Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100));
            return `<article class="budget-goal"><div class="budget-goal-top"><strong>${escapeHtml(goal.name)}</strong><button class="text-button" type="button" data-action="delete-goal" data-id="${escapeHtml(goal.id)}" aria-label="Delete ${escapeHtml(goal.name)}">Remove</button></div><div class="budget-track"><i style="width:${progress}%"></i></div><small>${formatMoney(goal.savedCents)} of ${formatMoney(goal.targetCents)} · ${progress}%${goal.deadline ? ` · by ${escapeHtml(goal.deadline)}` : ""}</small><form class="budget-contribute-form" data-goal-id="${escapeHtml(goal.id)}"><label class="sr-only" for="goal-add-${escapeHtml(goal.id)}">Add savings to ${escapeHtml(goal.name)}</label><div class="money-input"><b aria-hidden="true">${currencySymbol}</b><input id="goal-add-${escapeHtml(goal.id)}" name="amount" type="number" min="0.01" step="0.01" max="10000000" placeholder="Add amount" required></div><button class="button button-quiet" type="submit">Add savings</button></form></article>`;
          }).join("")}</div>` : `<div class="budget-empty compact"><span>✦</span><strong>Give a dream a name.</strong><p>Save toward something that makes you smile.</p></div>`}
          <div class="budget-goal-summary"><span>ALL GOALS</span><strong>${formatMoney(savedGoals)} <small>of ${formatMoney(totalGoals)}</small></strong></div>
        </section>
        <section class="panel budget-challenge-panel"><div class="section-heading"><div><span class="section-code">TINY WINS / THIS MONTH</span><h2>Your money quest</h2></div><span class="coin-chip">${challenges.filter((challenge) => challenge.done).length}/${challenges.length}</span></div><div class="budget-challenges">${challenges.map((challenge) => `<div class="budget-challenge ${challenge.done ? "complete" : ""}"><span>${challenge.done ? "✓" : "·"}</span>${challenge.label}</div>`).join("")}</div><p>Small steps add up. No streaks, no shame, just a clearer picture.</p></section>
      </aside>
    </div>
  `;
}

function cardRankLabel(rank) {
  return ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] || String(rank);
}

function cardSuitSymbol(suit) {
  return ({ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" })[suit] || "♠";
}

function solitaireCardMarkup(card, source, selected = false) {
  const color = NovexCardGames.redSuits.includes(card.suit) ? "red" : "black";
  const face = card.faceUp;
  const revealClass = data.progression.cardEffect !== "none" ? ` card-reveal effect-${escapeHtml(data.progression.cardEffect)}` : "";
  const deckClass = data.progression.profile.favoriteDeck === "royal" ? " deck-royal" : "";
  const backClass = `card-back-${escapeHtml(data.progression.cardBack)}`;
  const sourceAttributes = source ? `data-card-source="${source.zone}" draggable="${face ? "true" : "false"}" ${["tableau", "foundation", "cell"].includes(source.zone) ? `data-card-destination="${source.zone}"` : ""} ${source.column != null ? `data-column="${source.column}"` : ""} ${source.index != null ? `data-index="${source.index}"` : ""} ${source.pile != null ? `data-pile="${source.pile}"` : ""}` : "";
  if (!face) return `<div class="playing-card card-back ${backClass}" aria-label="Face-down card"><span>NL</span></div>`;
  const label = `${cardRankLabel(card.rank)} of ${card.suit}`;
  const tag = source ? "button" : "div";
  const role = source ? "" : 'role="img"';
  return `<${tag} ${source ? 'type="button"' : ""} class="playing-card ${color}${deckClass}${revealClass} ${selected ? "selected" : ""}" ${sourceAttributes} ${role} aria-label="${label}"><span class="card-corner">${cardRankLabel(card.rank)}<i>${cardSuitSymbol(card.suit)}</i></span><span class="card-center">${cardSuitSymbol(card.suit)}</span><span class="card-corner card-corner-bottom">${cardRankLabel(card.rank)}<i>${cardSuitSymbol(card.suit)}</i></span></${tag}>`;
}

function renderSolitaire() {
  const stats = data.games;
  const game = stats.solitaire;
  const cardSlot = (card, source, selected) => solitaireCardMarkup(card, source, selected);
  const selectedIs = (zone, index, subindex) => game.selected?.zone === zone &&
    (index == null || game.selected.column === index || game.selected.pile === index) &&
    (subindex == null || game.selected.index === subindex);
  const foundations = game.foundations.map((pile, index) => {
    const top = pile.cards[pile.cards.length - 1];
    return `<div class="solitaire-slot">${top
      ? cardSlot(top, { zone: "foundation", pile: index }, selectedIs("foundation", index))
      : `<button type="button" class="solitaire-empty foundation-empty" data-card-destination="foundation" data-pile="${index}" aria-label="Empty ${pile.suit} foundation">${cardSuitSymbol(pile.suit)}</button>`}</div>`;
  }).join("");
  const waste = game.waste.length
    ? cardSlot(game.waste[game.waste.length - 1], { zone: "waste" }, selectedIs("waste"))
    : `<div class="solitaire-empty" aria-label="Empty waste pile"></div>`;
  const columns = game.tableau.map((stack, column) => `<div class="tableau-column" data-column="${column}">${stack.length
    ? stack.map((card, index) => `<div class="tableau-card-wrap" style="--card-offset:${index ? card.faceUp ? "48px" : "21px" : "0px"}">${card.faceUp
      ? cardSlot(card, { zone: "tableau", column, index }, selectedIs("tableau", column, index))
      : cardSlot(card, null, false)}</div>`).join("")
    : `<button type="button" class="solitaire-empty tableau-empty" data-card-destination="tableau" data-column="${column}" aria-label="Empty tableau column, move a king here">K</button>`}</div>`).join("");
  return `
    <div class="solitaire-toolbar"><div><span class="section-code">KLONDIKE / DRAW ONE</span><strong>${game.won ? "Deal complete!" : `${game.moves} moves · ${game.stock.length} cards in stock`}</strong></div><div class="solitaire-actions"><button class="button button-outline" type="button" data-action="solitaire-hint">Need a hint?</button><button class="button button-primary" type="button" data-action="new-solitaire">New deal ↻</button></div></div>
    ${game.won ? `<div class="solitaire-win victory-celebration" role="status">✦ All 52 cards home. You did it!</div>` : ""}
    <div class="solitaire-scroll"><div class="solitaire-board" data-table-theme="${escapeHtml(data.progression.tableTheme)}">
      <div class="solitaire-top-row"><div class="solitaire-stock-waste"><button type="button" class="solitaire-empty stock-slot ${game.stock.length ? "stock-ready" : ""}" data-action="solitaire-stock" aria-label="${game.stock.length ? "Draw next card" : "Recycle waste pile"}">${game.stock.length ? `<span>↻</span><small>${game.stock.length}</small>` : game.waste.length ? "↻" : "·"}</button><div class="solitaire-slot">${waste}</div></div><div class="solitaire-foundations">${foundations}</div></div>
      <div class="solitaire-tableau">${columns}</div>
    </div></div>
    <div class="solitaire-footer"><span>♣ ${stats.solitaireWins} wins</span><span>Move a face-up card onto the opposite color, one rank higher. Empty columns are for kings.</span><span>♥ ${stats.solitaireMoves} lifetime moves</span></div>
  `;
}

function renderFreecell() {
  const game = data.games.freecell || (data.games.freecell = NovexCardGames.createFreecellGame());
  const renderCard = (card, source, selected = false) => solitaireCardMarkup(card, source, selected);
  const cells = game.cells.map((card, index) => `<div class="solitaire-slot">${card
    ? renderCard(card, { zone: "cell", index }, game.selected?.zone === "cell" && game.selected.index === index)
    : `<button type="button" class="solitaire-empty freecell-empty" data-card-destination="cell" data-index="${index}" aria-label="Empty free cell ${index + 1}">+</button>`}</div>`).join("");
  const foundations = game.foundations.map((pile, index) => {
    const top = pile.cards[pile.cards.length - 1];
    return `<div class="solitaire-slot">${top
      ? renderCard(top, { zone: "foundation", index }, game.selected?.zone === "foundation" && game.selected.index === index)
      : `<button type="button" class="solitaire-empty foundation-empty" data-card-destination="foundation" data-index="${index}" aria-label="Empty ${pile.suit} foundation">${cardSuitSymbol(pile.suit)}</button>`}</div>`;
  }).join("");
  const tableau = game.tableau.map((stack, column) => `<div class="freecell-column" data-card-destination="tableau" data-column="${column}">${stack.length
    ? stack.map((card, index) => `<div class="tableau-card-wrap" style="--card-offset:${index ? "30px" : "0px"}">${renderCard(card, index === stack.length - 1 ? { zone: "tableau", column } : null, game.selected?.zone === "tableau" && game.selected.column === column && index === stack.length - 1)}</div>`).join("")
    : `<button type="button" class="solitaire-empty tableau-empty" data-card-destination="tableau" data-column="${column}" aria-label="Empty free-cell column ${column + 1}">+</button>`}</div>`).join("");
  return `<section class="freecell-panel playing-table" data-table-theme="${escapeHtml(data.progression.tableTheme)}">
    <div class="solitaire-toolbar"><div><span class="section-code">FREECELL / PLAN YOUR ROUTE</span><strong>${game.won ? "All cards home!" : `${game.moves} moves · four open cells`}</strong></div><div class="solitaire-actions"><button class="button button-primary" type="button" data-action="new-freecell">New deal ↻</button></div></div>
    ${game.won ? `<div class="solitaire-win victory-celebration" role="status">✦ Perfectly routed. FreeCell won!</div>` : ""}
    <div class="freecell-board"><div class="freecell-top-row"><div class="freecell-cells">${cells}</div><div class="solitaire-foundations">${foundations}</div></div><div class="freecell-tableau">${tableau}</div></div>
    <p class="solitaire-footer"><span>♣ ${data.games.freecellWins} wins</span><span>Move one card at a time; build alternating colors down. Any card may enter an empty column.</span><span>Drag or tap a card, then its destination.</span></p>
  </section>`;
}

function blackjackCardMarkup(card, hidden = false) {
  if (hidden) return `<div class="playing-card card-back card-back-${escapeHtml(data.progression.cardBack)}" aria-label="Dealer's hidden card"><span>NL</span></div>`;
  const color = NovexCardGames.redSuits.includes(card.suit) ? "red" : "black";
  const effect = data.progression.cardEffect !== "none" ? ` card-reveal effect-${escapeHtml(data.progression.cardEffect)}` : "";
  const deckClass = data.progression.profile.favoriteDeck === "royal" ? " deck-royal" : "";
  return `<div class="playing-card ${color}${deckClass}${effect}" aria-label="${cardRankLabel(card.rank)} of ${card.suit}"><span class="card-corner">${cardRankLabel(card.rank)}<i>${cardSuitSymbol(card.suit)}</i></span><span class="card-center">${cardSuitSymbol(card.suit)}</span><span class="card-corner card-corner-bottom">${cardRankLabel(card.rank)}<i>${cardSuitSymbol(card.suit)}</i></span></div>`;
}

function renderBlackjack() {
  if (!data.games.blackjack) data.games.blackjack = NovexCardGames.createBlackjackGame(1);
  const game = data.games.blackjack;
  const score = (hand) => NovexCardGames.blackjackScore(hand);
  const handMarkup = (hand, hideSecond = false) => `<div class="blackjack-hand">${hand.map((card, index) => blackjackCardMarkup(card, hideSecond && index === 1)).join("")}</div>`;
  return `<section class="blackjack-panel playing-table" data-table-theme="${escapeHtml(data.progression.tableTheme)}">
    <div class="solitaire-toolbar"><div><span class="section-code">BLACKJACK / NO BETS, JUST CARDS</span><strong>${game.status === "settled" ? escapeHtml(game.result) : "Get closest to 21 without going over."}</strong></div><div class="solitaire-actions"><label class="bot-picker"><span>BOTS</span><select id="blackjack-bot-count" aria-label="Number of bots">${Array.from({ length: 6 }, (_, index) => `<option value="${index + 1}" ${game.botCount === index + 1 ? "selected" : ""}>${index + 1}</option>`).join("")}</select></label><button class="button button-primary" type="button" data-action="new-blackjack">New hand ↻</button></div></div>
    <div class="blackjack-table">
      <article class="blackjack-seat dealer-seat"><span class="section-code">DEALER · ${game.status === "settled" ? score(game.dealer.hand) : "?"}</span>${handMarkup(game.dealer.hand, game.status === "playing")}</article>
      <div class="blackjack-seats">${game.players.map((player) => `<article class="blackjack-seat ${player.human ? "human-seat" : "bot-seat"} ${player.result === "win" ? "seat-winner" : ""}"><span class="section-code">${escapeHtml(player.name.toUpperCase())}${player.result ? ` · ${escapeHtml(player.result.toUpperCase())}` : ""}</span>${handMarkup(player.hand)}<strong>${score(player.hand)}</strong></article>`).join("")}</div>
    </div>
    ${game.status === "playing" ? `<div class="blackjack-actions"><button class="button button-primary" type="button" data-action="blackjack-hit">Hit</button><button class="button button-outline" type="button" data-action="blackjack-stand">Stand</button></div>` : `<div class="solitaire-win ${game.players[0].result === "win" ? "victory-celebration" : ""}" role="status">${game.players[0].result === "win" ? "✦" : "♠"} ${escapeHtml(game.result)}</div>`}
    <p class="solitaire-footer"><span>♣ ${data.games.blackjackWins} wins</span><span>${data.games.blackjackGames} hands completed · ${data.games.botGames} bot games</span><span>Dealer stands on 17. Aces count as 1 or 11.</span></p>
  </section>`;
}

function supabaseSetupMessage() {
  const config = window.NOVEX_SUPABASE_CONFIG;
  if (!window.supabase?.createClient) return "The Supabase client could not load. Check your internet connection and reload.";
  if (!config?.url || !config?.anonKey) return "Online features need your Supabase project URL and public anon key in supabase-config.js. Solo card games and budgeting work without them.";
  return "";
}

function getSupabaseClient() {
  const issue = supabaseSetupMessage();
  if (issue) throw new Error(issue);
  if (!supabaseClient) {
    const config = window.NOVEX_SUPABASE_CONFIG;
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  }
  return supabaseClient;
}

async function ensureGameUser() {
  const client = getSupabaseClient();
  if (multiplayerState.user) return multiplayerState.user;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) {
    multiplayerState.user = sessionData.session.user;
    return multiplayerState.user;
  }
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Supabase did not return a player identity.");
  multiplayerState.user = data.user;
  return data.user;
}

async function fetchGoFishRoom(roomId) {
  const client = getSupabaseClient();
  const user = await ensureGameUser();
  const [roomResult, playersResult, handResult] = await Promise.all([
    client.from("gofish_rooms").select("id, code, host_id, status, current_turn, deck_count, last_action, winner_id, created_at").eq("id", roomId).single(),
    client.from("gofish_players").select("user_id, display_name, seat, books, left_at").eq("room_id", roomId).is("left_at", null).order("seat"),
    client.from("gofish_hands").select("cards").eq("room_id", roomId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (roomResult.error) throw roomResult.error;
  if (playersResult.error) throw playersResult.error;
  if (handResult.error) throw handResult.error;
  multiplayerState.room = {
    ...roomResult.data,
    players: playersResult.data || [],
    hand: handResult.data?.cards || [],
  };
  if (roomResult.data.status === "finished" && !data.games.completedRoomIds.includes(roomId)) {
    data.games.completedRoomIds.push(roomId);
    data.games.goFishGames += 1;
    recordCardGameResult("gofish", roomResult.data.winner_id === user.id);
    data.games = NovexCardGames.normalizeGameStats(data.games);
    persist();
  }
  multiplayerState.error = "";
  localStorage.setItem("novex-gofish-room-id", roomId);
  subscribeToGoFishRoom(roomId, user.id);
  if (activeView === "games" && gamesTab === "friends") renderGames();
}

function subscribeToGoFishRoom(roomId, userId) {
  const client = getSupabaseClient();
  if (multiplayerState.channel && multiplayerState.subscribedRoomId === roomId) return;
  if (multiplayerState.channel) client.removeChannel(multiplayerState.channel);
  multiplayerState.channel = client.channel(`gofish-room-${roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "gofish_rooms", filter: `id=eq.${roomId}` }, () => {
      fetchGoFishRoom(roomId).catch((error) => setMultiplayerError(error));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "gofish_players", filter: `room_id=eq.${roomId}` }, () => {
      fetchGoFishRoom(roomId).catch((error) => setMultiplayerError(error));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "gofish_hands", filter: `user_id=eq.${userId}` }, () => {
      fetchGoFishRoom(roomId).catch((error) => setMultiplayerError(error));
    })
    .subscribe();
  multiplayerState.subscribedRoomId = roomId;
}

function setMultiplayerError(error) {
  console.error("Friend game connection failed.", error);
  multiplayerState.loading = false;
  multiplayerState.error = error.message || "Could not connect to that game room.";
  if (activeView === "games" && gamesTab === "friends") renderGames();
}

function goFishDisplayName() {
  return (data.progression.profile.displayName || currentAccount?.username || "Player").trim().slice(0, 24) || "Player";
}

async function hostGoFish(displayName) {
  multiplayerState.loading = true;
  multiplayerState.error = "";
  renderGames();
  try {
    const client = getSupabaseClient();
    await ensureGameUser();
    const { data: room, error } = await client.rpc("create_gofish_room", { p_display_name: displayName.slice(0, 24) });
    if (error) throw error;
    await fetchGoFishRoom(room.room_id);
    multiplayerState.room.code = room.room_code;
  } catch (error) {
    setMultiplayerError(error);
  } finally {
    multiplayerState.loading = false;
    renderGames();
  }
}

async function joinGoFish(code, displayName) {
  multiplayerState.loading = true;
  multiplayerState.error = "";
  renderGames();
  try {
    const client = getSupabaseClient();
    await ensureGameUser();
    const { data: roomId, error } = await client.rpc("join_gofish_room", {
      p_room_code: code.trim().toUpperCase(),
      p_display_name: displayName.slice(0, 24),
    });
    if (error) throw error;
    await fetchGoFishRoom(roomId);
  } catch (error) {
    setMultiplayerError(error);
  } finally {
    multiplayerState.loading = false;
    renderGames();
  }
}

async function startGoFish() {
  try {
    const { error } = await getSupabaseClient().rpc("start_gofish_room", { p_room_id: multiplayerState.room.id });
    if (error) throw error;
    await fetchGoFishRoom(multiplayerState.room.id);
  } catch (error) {
    setMultiplayerError(error);
  }
}

async function askGoFish(targetId, rank) {
  try {
    const { error } = await getSupabaseClient().rpc("ask_gofish_rank", {
      p_room_id: multiplayerState.room.id,
      p_target_user_id: targetId,
      p_rank: Number(rank),
    });
    if (error) throw error;
    await fetchGoFishRoom(multiplayerState.room.id);
  } catch (error) {
    setMultiplayerError(error);
  }
}

async function leaveGoFish() {
  const roomId = multiplayerState.room?.id;
  try {
    if (roomId) {
      const { error } = await getSupabaseClient().rpc("leave_gofish_room", { p_room_id: roomId });
      if (error) throw error;
    }
    if (multiplayerState.channel) getSupabaseClient().removeChannel(multiplayerState.channel);
    multiplayerState = { room: null, user: multiplayerState.user, channel: null, subscribedRoomId: "", loading: false, error: "" };
    localStorage.removeItem("novex-gofish-room-id");
    renderGames();
  } catch (error) {
    setMultiplayerError(error);
  }
}

function renderGoFish() {
  const issue = supabaseSetupMessage();
  const room = multiplayerState.room;
  const loading = multiplayerState.loading;
  const status = multiplayerState.error
    ? `<div class="multiplayer-notice error" role="alert">${escapeHtml(multiplayerState.error)}</div>`
    : issue ? `<div class="multiplayer-notice" role="status">${escapeHtml(issue)}<small>After setting up Supabase, run the SQL in <code>supabase/setup.sql</code>.</small></div>` : "";
  if (!room) {
    const inviteCode = new URLSearchParams(window.location.search).get("room") || "";
    return `<section class="friend-lobby panel"><div class="friend-lobby-art"><span>♠</span><span>♥</span><span>♦</span><span>♣</span></div><div class="friend-lobby-copy"><span class="section-code">ONLINE TABLE / GO FISH</span><h2>Bring your people.</h2><p>Create a room, share the code, and play a friendly round together from anywhere. You can play with 2–4 people.</p></div>${status}<div class="friend-lobby-forms"><form id="game-host-form"><label class="setting-field"><span>YOUR TABLE NAME</span><input name="displayName" maxlength="24" value="${escapeHtml(goFishDisplayName())}" required></label><button class="button button-primary" type="submit" ${issue || loading ? "disabled" : ""}>${loading ? "Connecting…" : "Create a room →"}</button></form><div class="lobby-divider"><span>OR JOIN WITH A CODE</span></div><form id="game-join-form"><label class="setting-field"><span>YOUR TABLE NAME</span><input name="displayName" maxlength="24" value="${escapeHtml(goFishDisplayName())}" required></label><label class="setting-field"><span>ROOM CODE</span><input name="code" maxlength="6" pattern="[A-Za-z0-9]{6}" value="${escapeHtml(inviteCode)}" placeholder="ABC123" required></label><button class="button button-quiet" type="submit" ${issue || loading ? "disabled" : ""}>Join a friend's room ↗</button></form></div><p class="friend-privacy-note">Players join with a private anonymous game identity. No password, email, or learning profile is shared.</p></section>`;
  }
  const playerName = (id) => room.players.find((player) => player.user_id === id)?.display_name || "Player";
  const opponents = room.players.filter((player) => player.user_id !== multiplayerState.user?.id);
  const currentTurn = room.current_turn === multiplayerState.user?.id;
  const rankOptions = [...new Set(room.hand.map((card) => Number(card.rank)))].sort((a, b) => a - b);
  const playerCards = room.hand.map((card) => `<span class="hand-card ${NovexCardGames.redSuits.includes(card.suit) ? "red" : "black"}"><b>${cardRankLabel(card.rank)}</b><i>${cardSuitSymbol(card.suit)}</i></span>`).join("");
  return `<section class="friend-room panel">
    <div class="friend-room-head"><div><span class="section-code">${room.status === "lobby" ? "WAITING ROOM" : room.status === "finished" ? "ROUND COMPLETE" : "LIVE TABLE"} / GO FISH</span><h2>Room <span>${escapeHtml(room.code)}</span></h2><p>${room.status === "lobby" ? "Share the code to invite friends." : room.status === "finished" ? `${escapeHtml(playerName(room.winner_id))} takes this round!` : currentTurn ? "Your turn — ask for a rank in your hand." : `${escapeHtml(playerName(room.current_turn))} is taking a turn.`}</p></div><div class="friend-room-actions"><button type="button" class="button button-outline" data-action="copy-room-link">Copy invite link</button><button type="button" class="button button-quiet" data-action="leave-room">Leave room</button></div></div>
    ${status}
    <div class="friend-players">${room.players.map((player) => `<div class="friend-player ${player.user_id === room.current_turn && room.status === "playing" ? "is-turn" : ""}"><span class="friend-player-avatar">${escapeHtml(player.display_name.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(player.display_name)}${player.user_id === multiplayerState.user?.id ? " (you)" : ""}</strong><small>${player.books} ${player.books === 1 ? "book" : "books"}${player.user_id === room.host_id ? " · host" : ""}</small></span></div>`).join("")}</div>
    ${room.status === "lobby" ? `<div class="friend-lobby-wait"><div class="playing-card lobby-card red"><span class="card-center">♥</span></div><div><strong>${room.players.length}/4 players at the table</strong><small>${room.players.length < 2 ? "Waiting for a friend to join…" : "Ready when the host is."}</small></div>${room.host_id === multiplayerState.user?.id ? `<button class="button button-primary" type="button" data-action="start-gofish" ${room.players.length < 2 ? "disabled" : ""}>Deal the cards →</button>` : ""}</div>` : room.status === "playing" ? `<div class="gofish-play-area"><div class="gofish-table-center"><span class="gofish-pile">▧</span><strong>${room.deck_count} cards in the pond</strong><small>${escapeHtml(room.last_action || "The cards are ready.")}</small></div><div class="gofish-hand"><div class="section-heading"><div><span class="section-code">YOUR HAND / ${room.hand.length} CARDS</span><h3>What you can ask for</h3></div></div><div class="hand-cards">${playerCards || "<small>Your hand is empty; draw cards to continue.</small>"}</div></div>${currentTurn ? `<form id="gofish-ask-form"><label class="setting-field"><span>ASK A FRIEND</span><select name="target" required>${opponents.map((player) => `<option value="${escapeHtml(player.user_id)}">${escapeHtml(player.display_name)}</option>`).join("")}</select></label><label class="setting-field"><span>ASK FOR A RANK IN YOUR HAND</span><select name="rank" required>${rankOptions.map((rank) => `<option value="${rank}">${cardRankLabel(rank)}s</option>`).join("")}</select></label><button class="button button-primary" type="submit" ${!opponents.length || !rankOptions.length ? "disabled" : ""}>Ask for cards →</button></form>` : `<div class="friend-turn-note">Your hand is private. You’ll get a turn when it’s your seat’s turn.</div>`}</div>` : `<div class="friend-round-finished"><span>✦</span><strong>Nice game!</strong><p>Ready to shuffle and play another?</p><button class="button button-primary" type="button" data-action="leave-room">Back to rooms →</button></div>`}
    <p class="friend-privacy-note">Card hands are private to each player. Game actions are checked by the database before the table updates.</p>
  </section>`;
}

function renderGames() {
  if (!data.games.solitaire) data.games.solitaire = NovexCardGames.createSolitaireGame();
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> NEON CARD TABLE / PLAY SOLO OR TOGETHER</div><h1>Shuffle up <span>some fun.</span></h1><p class="lead">Take a quiet round of solitaire or invite friends to a live table. No bets, no buy-ins, just cards.</p></div><div class="games-sparkle">♠ <span>♥</span> ♦ <span>♣</span></div></section>
    <div class="games-tabs" role="tablist" aria-label="Card game type">
      <button type="button" role="tab" aria-selected="${gamesTab === "solitaire"}" class="${gamesTab === "solitaire" ? "active" : ""}" data-games-tab="solitaire">♠ Solitaire <small>SOLO</small></button>
      <button type="button" role="tab" aria-selected="${gamesTab === "freecell"}" class="${gamesTab === "freecell" ? "active" : ""}" data-games-tab="freecell">♣ FreeCell <small>SOLO</small></button>
      <button type="button" role="tab" aria-selected="${gamesTab === "blackjack"}" class="${gamesTab === "blackjack" ? "active" : ""}" data-games-tab="blackjack">♦ Blackjack <small>BOTS</small></button>
      <button type="button" role="tab" aria-selected="${gamesTab === "community"}" class="${gamesTab === "community" ? "active" : ""}" data-games-tab="community">✦ Leaderboard <small>EVENTS</small></button>
      <button type="button" role="tab" aria-selected="${gamesTab === "friends"}" class="${gamesTab === "friends" ? "active" : ""}" data-games-tab="friends">♥ Go Fish <small>FRIENDS</small></button>
    </div>
    ${gamesTab === "solitaire" ? `<section class="solitaire-panel panel">${renderSolitaire()}</section>`
      : gamesTab === "freecell" ? renderFreecell()
        : gamesTab === "blackjack" ? renderBlackjack()
          : gamesTab === "community" ? renderCardClub()
            : renderGoFish()}
    <div class="games-footnote"><span>✧</span> ${data.games.totalGamesPlayed} games played · ${data.games.highestWinStreak} best win streak · ${data.games.goFishGames} online Go Fish rounds</div>
  `;
  if (gamesTab === "community" && !supabaseSetupMessage() && !cardClubState.loading && !cardClubState.loaded) {
    void loadCardClub();
  }
  if (gamesTab === "friends" && !multiplayerState.room && !multiplayerState.loading && !supabaseSetupMessage()) {
    const savedRoomId = localStorage.getItem("novex-gofish-room-id");
    if (savedRoomId) {
      multiplayerState.loading = true;
      fetchGoFishRoom(savedRoomId).catch((error) => {
        localStorage.removeItem("novex-gofish-room-id");
        setMultiplayerError(error);
      }).finally(() => {
        multiplayerState.loading = false;
        if (activeView === "games" && gamesTab === "friends") renderGames();
      });
    }
  }

  function renderCardClub() {
    const setupMessage = supabaseSetupMessage();
    if (setupMessage) return `<section class="card-club panel"><div class="section-code">CARD CLUB / ONLINE RANKINGS</div><h2>Play, place, repeat.</h2><p>${escapeHtml(setupMessage)}</p><p class="friend-privacy-note">Online leaderboards and tournaments are optional. Local games work without Supabase.</p></section>`;
    const active = cardClubState.activeTournamentId;
    return `<section class="card-club">
      <div class="panel club-intro"><div><span class="section-code">COMMUNITY / PLAYER-REPORTED SCORES</span><h2>Friendly competition.</h2><p>Join the public card leaderboard, enter a casual tournament, and invite friends to beat your best. Game results are self-reported because the games run in your browser.</p></div>${cardClubState.joined ? `<span class="status-pill">LEADERBOARD JOINED</span>` : `<button class="button button-primary" type="button" data-action="join-card-leaderboard">Join leaderboard</button>`}</div>
      ${cardClubState.error ? `<div class="multiplayer-notice error" role="alert">${escapeHtml(cardClubState.error)}</div>` : ""}
      <div class="club-grid"><section class="panel"><div class="section-heading"><div><span class="section-code">ALL-TIME / OPT-IN</span><h2>Leaderboard</h2></div><button type="button" class="text-button" data-action="refresh-card-club">Refresh ↻</button></div>${cardClubState.loading ? `<p class="panel-copy">Loading the card club…</p>` : cardClubState.leaderboard.length ? `<ol class="leaderboard-list">${cardClubState.leaderboard.map((entry, index) => `<li><span class="leaderboard-rank">${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(entry.display_name)}</strong><small>${entry.total_wins} wins · ${entry.total_games} games</small><b>${entry.best_streak}🔥</b></li>`).join("")}</ol>` : `<p class="empty-note">Be the first to join the public leaderboard.</p>`}</section>
      <section class="panel"><div class="section-heading"><div><span class="section-code">LIVE + UPCOMING</span><h2>Casual tournaments</h2></div></div><form id="create-tournament-form" class="tournament-create"><input name="name" maxlength="48" placeholder="Name your tournament" required><select name="gameType" aria-label="Tournament game"><option value="solitaire">Solitaire</option><option value="freecell">FreeCell</option><option value="blackjack">Blackjack</option></select><button class="button button-quiet" type="submit" ${!cardClubState.joined ? "disabled" : ""}>Create 24h event</button></form>${cardClubState.tournaments.length ? `<div class="tournament-list">${cardClubState.tournaments.map((event) => {
      const joined = cardClubState.joinedTournamentIds.includes(event.id);
      const isActive = active === event.id;
      return `<article class="tournament-card ${isActive ? "tournament-active" : ""}"><div><span class="section-code">${escapeHtml(event.game_type.toUpperCase())} · ${joined ? "JOINED" : "OPEN"}</span><h3>${escapeHtml(event.name)}</h3><p>${new Date(event.starts_at).toLocaleString()} – ${new Date(event.ends_at).toLocaleString()}</p><small>${event.participant_count} players · ${event.total_games} rounds reported</small>${isActive ? `<ol class="tournament-standings">${cardClubState.standings.map((standing, index) => `<li><span>${index + 1}.</span><strong>${escapeHtml(standing.display_name)}</strong><small>${standing.wins} wins · ${standing.games} games</small></li>`).join("") || "<li>Play a game to appear on the standings.</li>"}</ol>` : ""}</div><button class="button ${joined ? "button-quiet" : "button-outline"}" type="button" data-action="${joined ? "select-tournament" : "join-tournament"}" data-tournament-id="${escapeHtml(event.id)}" ${!cardClubState.joined ? "disabled" : ""}>${isActive ? "ACTIVE" : joined ? "Set active" : "Join"}</button></article>`;
    }).join("")}</div>` : `<p class="empty-note">${cardClubState.loading ? "Loading events…" : "No live events yet. Create one and invite friends to join."}</p>`}</section></div>
      <p class="friend-privacy-note">Joining shares only the display name you choose and your card-game totals. Your learning profile, budget, email, and password are never shared.</p>
    </section>`;
  }

  async function loadCardClub() {
    const requestId = ++cardClubRequest;
    cardClubState.loading = true;
    cardClubState.error = "";
    if (activeView === "games" && gamesTab === "community") renderGames();
    try {
      const client = getSupabaseClient();
      const user = await ensureGameUser();
      const [leaderboardResult, tournamentsResult, statusResult] = await Promise.all([
        client.from("card_leaderboard").select("display_name,total_wins,total_games,best_streak,updated_at").order("total_wins", { ascending: false }).order("best_streak", { ascending: false }).limit(50),
        client.from("card_tournaments").select("id,name,game_type,starts_at,ends_at,participant_count,total_games").gt("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(25),
        client.rpc("get_my_card_club_status"),
      ]);
      if (leaderboardResult.error) throw leaderboardResult.error;
      if (tournamentsResult.error) throw tournamentsResult.error;
      if (statusResult.error) throw statusResult.error;
      if (requestId !== cardClubRequest) return;
      const status = statusResult.data || {};
      cardClubState.leaderboard = leaderboardResult.data || [];
      cardClubState.tournaments = tournamentsResult.data || [];
      cardClubState.joined = Boolean(status.joined);
      cardClubState.joinedTournamentIds = Array.isArray(status.tournament_ids) ? status.tournament_ids : [];
      if (!cardClubState.joinedTournamentIds.includes(cardClubState.activeTournamentId)) {
        cardClubState.activeTournamentId = cardClubState.joinedTournamentIds[0] || "";
      }
      if (cardClubState.activeTournamentId) {
        const standingsResult = await client.rpc("get_card_tournament_standings", {
          p_tournament_id: cardClubState.activeTournamentId,
        });
        if (standingsResult.error) throw standingsResult.error;
        if (requestId !== cardClubRequest) return;
        cardClubState.standings = standingsResult.data || [];
      } else cardClubState.standings = [];
      cardClubState.loaded = true;
    } catch (error) {
      console.error("Could not load the card club.", error);
      if (requestId === cardClubRequest) cardClubState.error = error.message || "Could not load the online card club.";
    } finally {
      if (requestId === cardClubRequest) {
        cardClubState.loaded = true;
        cardClubState.loading = false;
        if (activeView === "games" && gamesTab === "community") renderGames();
      }
    }
  }

  async function cardClubAction(action, tournamentId = "", formValues = {}) {
    try {
      const client = getSupabaseClient();
      await ensureGameUser();
      let result;
      if (action === "join") {
        result = await client.rpc("join_card_leaderboard", {
          p_display_name: data.progression.profile.displayName || currentAccount?.username || "Card Player",
        });
      } else if (action === "join-tournament") {
        result = await client.rpc("join_card_tournament", { p_tournament_id: tournamentId });
        cardClubState.activeTournamentId = tournamentId;
      } else if (action === "create-tournament") {
        result = await client.rpc("create_card_tournament", {
          p_name: formValues.name,
          p_game_type: formValues.gameType,
        });
        cardClubState.activeTournamentId = result.data;
      }
      if (result?.error) throw result.error;
      cardClubState.loaded = false;
      await loadCardClub();
      showToast(action === "join" ? "YOU'RE ON THE CARD LEADERBOARD" : action === "create-tournament" ? "TOURNAMENT CREATED" : "YOU JOINED THE TOURNAMENT");
    } catch (error) {
      console.error("Card club action failed.", error);
      cardClubState.error = error.message || "That card club action did not work.";
      if (activeView === "games" && gamesTab === "community") renderGames();
      else showToast(cardClubState.error, true);
    }
  }
}

function achievementGrid() {
  return `<div class="achievement-grid">${ACHIEVEMENTS.map((achievement) => {
    const unlocked = data.progression.achievements.includes(achievement.id);
    const secretHidden = achievement.secret && !unlocked;
    return `<article class="achievement-card ${unlocked ? "unlocked" : "locked"}"><span class="achievement-icon">${secretHidden ? "?" : achievement.icon}</span><div><strong>${secretHidden ? "Unknown signal" : achievement.name}</strong><small>${secretHidden ? "A hidden protocol waits to be discovered." : achievement.description}</small></div><span class="achievement-state">${unlocked ? "UNLOCKED" : "LOCKED"}</span></article>`;
  }).join("")}</div>`;
}

function renderShop() {
  const items = SHOP_ITEMS;
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> COSMETIC EXCHANGE / NO REAL-MONEY ITEMS</div><h1>Neon <span>market.</span></h1><p class="lead">Earn credits from learning. Spend them on themes, profile flair, or a streak shield.</p></div><div class="coin-chip large">◈ ${data.progression.credits} CREDITS</div></section>
    <div class="shop-note"><span>◇</span><p>Every item uses in-app credits only. No paid currency, random crates, or surprise odds.</p></div>
    <section class="shop-grid">${items.map((item) => {
      const owned = data.progression.owned.includes(item.id);
      const equipped = shopItemEquipped(item);
      const canAfford = data.progression.credits >= item.price;
      const action = item.type === "freeze"
        ? `BUY SHIELD · ◈ ${item.price} (${data.progression.freezeCount} owned)`
        : equipped ? "EQUIPPED" : owned ? "EQUIP ITEM" : `◈ ${item.price}`;
      const isDisabled = item.type === "freeze" ? !canAfford : equipped || (!owned && !canAfford);
      const icon = item.type === "avatar" ? item.value : item.type === "cardBack" || item.type === "cardDeck" ? "🂠" : item.type === "cardEffect" ? "✧" : item.type === "tableTheme" ? "♣" : item.type === "banner" ? "▰" : item.type === "theme" ? "NV" : item.type === "frame" ? "⌬" : item.type === "freeze" ? "♨" : "✦";
      return `<article class="shop-item ${owned ? "item-owned" : ""} ${item.rarity === "LEGENDARY" ? "item-legendary" : ""}"><span class="rarity rarity-${item.rarity.toLowerCase()}">${item.rarity}</span><div class="shop-preview preview-${escapeHtml(item.value)}">${escapeHtml(icon)}</div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p><button class="button ${owned ? "button-quiet" : "button-primary"} shop-buy" data-shop-item="${item.id}" ${isDisabled ? "disabled" : ""}>${action}</button></article>`;
    }).join("")}</section>`;
}

function shopItemEquipped(item) {
  const progression = data.progression;
  return (item.type === "theme" && progression.equippedTheme === item.value) ||
    (item.type === "frame" && progression.profile.frame === item.value) ||
    (item.type === "title" && progression.profile.title === item.value) ||
    (item.type === "cardBack" && progression.cardBack === item.value) ||
    (item.type === "cardEffect" && progression.cardEffect === item.value) ||
    (item.type === "tableTheme" && progression.tableTheme === item.value) ||
    (item.type === "banner" && progression.profile.banner === item.value) ||
    (item.type === "avatar" && progression.profile.avatar === item.value) ||
    (item.type === "cardDeck" && progression.profile.favoriteDeck === item.value);
}

function equipShopItem(item) {
  const progression = data.progression;
  if (item.type === "theme") progression.equippedTheme = item.value;
  else if (item.type === "frame") progression.profile.frame = item.value;
  else if (item.type === "title") progression.profile.title = item.value;
  else if (item.type === "cardBack") progression.cardBack = item.value;
  else if (item.type === "cardEffect") progression.cardEffect = item.value;
  else if (item.type === "tableTheme") progression.tableTheme = item.value;
  else if (item.type === "banner") progression.profile.banner = item.value;
  else if (item.type === "avatar") progression.profile.avatar = item.value;
  else if (item.type === "cardDeck") progression.profile.favoriteDeck = item.value;
}

function handleShopPurchase(itemId) {
  const item = SHOP_ITEMS.find((shopItem) => shopItem.id === itemId);
  if (!item) return;
  const progression = data.progression;
  const owned = progression.owned.includes(item.id);
  if (item.type === "freeze") {
    if (progression.credits < item.price) return showToast("Not enough credits for a streak shield.", true);
    progression.credits -= item.price;
    progression.freezeCount += 1;
    showToast("STREAK SHIELD ACQUIRED · ready when you need it");
  } else if (owned) {
    equipShopItem(item);
    showToast(`${item.name.toUpperCase()} EQUIPPED`);
  } else {
    if (progression.credits < item.price) return showToast("Not enough credits for this item.", true);
    progression.credits -= item.price;
    progression.owned.push(item.id);
    equipShopItem(item);
    showToast(`${item.name.toUpperCase()} UNLOCKED · ITEM ADDED TO PROFILE`);
  }
  checkAchievements();
  persist();
  updateHeader();
  renderShop();
}

function spinDailyWheel() {
  if (wheelSpinning) return;
  const games = data.games;
  const today = todayKey();
  if (games.dailySpinDate === today) return showToast("TODAY'S WHEEL REWARD IS ALREADY CLAIMED.");
  let ticket = Math.random() * DAILY_WHEEL_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
  const prize = DAILY_WHEEL_PRIZES.find((entry) => (ticket -= entry.weight) < 0) || DAILY_WHEEL_PRIZES[0];
  let reward = prize.label;
  if (prize.cosmetic) {
    const rareItems = SHOP_ITEMS.filter((item) =>
      ["RARE", "EPIC", "LEGENDARY"].includes(item.rarity) &&
      item.type !== "freeze" && item.type !== "theme" &&
      !gamesOwnedCosmetic(item)
    );
    if (rareItems.length) {
      const item = rareItems[Math.floor(Math.random() * rareItems.length)];
      data.progression.owned.push(item.id);
      reward = `Rare ${item.rarity.toLowerCase()} cosmetic: ${item.name}`;
    } else {
      data.progression.credits += 120;
      reward = "120 credits (all rare cosmetics collected)";
    }
  } else data.progression.credits += prize.credits;
  games.dailySpinDate = today;
  games.dailySpinReward = reward;
  wheelSpinning = true;
  persist();
  updateHeader();
  renderProfile();
  window.setTimeout(() => {
    wheelSpinning = false;
    if (activeView === "profile") renderProfile();
    showToast(`DAILY DROP · ${reward.toUpperCase()}`);
  }, 2400);
}

function gamesOwnedCosmetic(item) {
  return data.progression.owned.includes(item.id);
}

function recordCardGameResult(gameType, won) {
  const games = data.games;
  games.totalGamesPlayed += 1;
  if (won) {
    games.currentWinStreak += 1;
    games.highestWinStreak = Math.max(games.highestWinStreak, games.currentWinStreak);
    if (gameType === "solitaire") games.solitaireWins += 1;
    if (gameType === "freecell") games.freecellWins += 1;
    if (gameType === "blackjack") games.blackjackWins += 1;
    if (gameType === "gofish") games.goFishWins += 1;
  } else games.currentWinStreak = 0;
  persist();
  if (cardClubState.joined && !supabaseSetupMessage()) void submitCardClubResult(gameType, won);
}

async function submitCardClubResult(gameType, won) {
  try {
    const client = getSupabaseClient();
    await ensureGameUser();
    const calls = [client.rpc("record_card_game_result", { p_game_type: gameType, p_won: won })];
    const activeTournament = cardClubState.tournaments.find((event) =>
      event.id === cardClubState.activeTournamentId && event.game_type === gameType
    );
    if (activeTournament) {
      calls.push(client.rpc("record_card_tournament_result", {
        p_tournament_id: activeTournament.id,
        p_won: won,
      }));
    }
    const results = await Promise.all(calls);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
  } catch (error) {
    console.error("Could not submit the card game result.", error);
    showToast("Your local result was saved, but the online score could not sync.", true);
  }
}

function settleBlackjackGame() {
  const game = data.games.blackjack;
  data.games.blackjackGames += 1;
  if (game.botCount > 0) data.games.botGames += 1;
  recordCardGameResult("blackjack", game.players[0].result === "win");
  if (game.players[0].result === "win") showToast("BLACKJACK · YOU BEAT THE DEALER!");
}

function investSkill(skill) {
  if (!Object.hasOwn(data.progression.skills, skill) || data.progression.skills[skill] >= 5 || data.progression.skillPoints <= 0) return;
  data.progression.skills[skill] += 1;
  data.progression.skillPoints -= 1;
  persist();
  renderProfile();
  showToast(`${skill.toUpperCase()} NODE UNLOCKED`);
}

function startBossFight() {
  const deck = activeDeck();
  if (!deck || !bossIsAvailable()) return;
  const weakIds = weakestPairIds(deck.id, 5);
  const bossDeck = weakIds.length
    ? { ...deck, pairs: deck.pairs.filter((pair) => weakIds.includes(pair.id)) }
    : deck;
  const originalDeck = deck;
  const previousDeck = deck;
  activeDeckId = bossDeck.id;
  const start = () => {
    const bossTypes = { leftToRight: true, rightToLeft: true, write: true, draw: false, multipleChoice: false, recognition: false };
    const questions = buildQuestionSet(bossDeck, bossTypes, 100, true);
    if (!questions.length) {
      activeDeckId = previousDeck.id;
      return showToast("Add at least one pair before challenging the boss.", true);
    }
    session = {
      id: uid(), deckId: originalDeck.id, deckName: originalDeck.name, mode: "boss",
      questions, index: 0, finished: false, startedAt: Date.now(), durationMs: 0,
      secondsRemaining: 0, currentShownAt: Date.now(), historySaved: false,
      phase: "recall", bossNumber: bossNumber(), bossHealth: 5, bossMaxHealth: 5, playerHealth: 3,
    };
    document.querySelector(".app-shell").hidden = true;
    testScreen.hidden = false;
    renderQuestion();
  };
  start();
  activeDeckId = previousDeck.id;
}

function weakestPairIds(deckId, limit) {
  const misses = new Map();
  for (const record of data.history.filter((item) => item.deckId === deckId)) {
    for (const question of record.questions || []) {
      if (question.status !== "incorrect") continue;
      misses.set(question.pairId, (misses.get(question.pairId) || 0) + 1);
    }
  }
  return [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

function renderProfile() {
  const progression = data.progression;
  const level = currentLevel();
  const streak = progression.streak;
  const owned = new Set(progression.owned);
  const availableAvatars = AVATAR_OPTIONS.filter((avatar, index) => index < 8 ||
    SHOP_ITEMS.some((item) => item.type === "avatar" && item.value === avatar && owned.has(item.id)));
  const collection = SHOP_ITEMS.filter((item) => owned.has(item.id) && item.type !== "freeze");
  const showcase = progression.profile.showcase;
  const spinAvailable = data.games.dailySpinDate !== todayKey();
  viewRoot.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> OPERATOR ID / ${escapeHtml(currentAccount?.username || "")}</div><h1>Your personal <span>signal.</span></h1><p class="lead">Shape your profile, track your evolution, and spend skill points on your learning style.</p></div><button class="button button-quiet" data-nav="shop">Visit neon market →</button></section>
    <section class="profile-hero ${streakClass()} banner-${escapeHtml(progression.profile.banner)}"><div class="profile-avatar profile-avatar-large">${escapeHtml(progression.profile.avatar || "⌬")}</div><div class="profile-identity"><span class="section-code">LEVEL ${level} OPERATOR</span><h2>${escapeHtml(progression.profile.displayName || currentAccount?.username || "Operator")}</h2><p>${escapeHtml(progression.profile.title || titleForLevel(level))}</p><div class="profile-xp-track"><i style="width:${Math.round(levelProgress() / 150 * 100)}%"></i></div><small>${progression.xp} XP TOTAL · FAVORITE: ${escapeHtml(FAVORITE_GAMES.find(([id]) => id === progression.profile.favoriteGame)?.[1] || "Klondike Solitaire")}</small></div><div class="profile-streak"><span>♨</span><strong>${streak}</strong><small>DAY STREAK</small><em>RECORD ${progression.bestStreak}</em></div></section>
    <section class="profile-stats"><article><strong>${data.games.totalGamesPlayed}</strong><span>GAMES PLAYED</span></article><article><strong>${data.games.highestWinStreak}</strong><span>BEST WIN STREAK</span></article><article><strong>${data.games.solitaireWins + data.games.freecellWins + data.games.blackjackWins + data.games.goFishWins}</strong><span>GAMES WON</span></article><article><strong>${collection.length}</strong><span>COSMETICS OWNED</span></article></section>
    <div class="profile-grid"><section class="panel panel-main"><div class="section-heading"><div><span class="section-code">OPERATOR CUSTOMIZATION</span><h2>Edit profile</h2></div></div><form id="profile-form" class="profile-form"><label class="setting-field"><span>DISPLAY NAME</span><input name="displayName" maxlength="28" value="${escapeHtml(progression.profile.displayName || "")}" placeholder="${escapeHtml(currentAccount?.username || "Operator")}"></label><label class="setting-field"><span>AVATAR</span><select name="avatar">${availableAvatars.map((avatar) => `<option value="${escapeHtml(avatar)}" ${progression.profile.avatar === avatar ? "selected" : ""}>${escapeHtml(avatar)}</option>`).join("")}</select></label><label class="setting-field"><span>PROFILE TITLE</span><select name="title"><option value="">${escapeHtml(titleForLevel(level))} (default)</option>${SHOP_ITEMS.filter((item) => item.type === "title" && owned.has(item.id)).map((item) => `<option value="${escapeHtml(item.value)}" ${progression.profile.title === item.value ? "selected" : ""}>${escapeHtml(item.value)}</option>`).join("")}</select></label><label class="setting-field"><span>PROFILE FRAME</span><select name="frame"><option value="">Default frame</option>${SHOP_ITEMS.filter((item) => item.type === "frame" && owned.has(item.id)).map((item) => `<option value="${escapeHtml(item.value)}" ${progression.profile.frame === item.value ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><label class="setting-field"><span>PROFILE BANNER</span><select name="banner"><option value="default">Default banner</option>${SHOP_ITEMS.filter((item) => item.type === "banner" && owned.has(item.id)).map((item) => `<option value="${escapeHtml(item.value)}" ${progression.profile.banner === item.value ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><label class="setting-field"><span>FAVORITE GAME</span><select name="favoriteGame">${FAVORITE_GAMES.map(([id, name]) => `<option value="${id}" ${progression.profile.favoriteGame === id ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label><label class="setting-field"><span>FAVORITE CARD DECK</span><select name="favoriteDeck"><option value="classic">Classic</option>${SHOP_ITEMS.filter((item) => item.type === "cardDeck" && owned.has(item.id)).map((item) => `<option value="${escapeHtml(item.value)}" ${progression.profile.favoriteDeck === item.value ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><button class="button button-primary" type="submit">SAVE PROFILE →</button></form></section>
    <section class="panel skill-panel"><div class="section-heading"><div><span class="section-code">NEURAL SKILL TREE</span><h2>Invest points</h2></div><span class="skill-points">${progression.skillPoints} SP</span></div><p class="skill-copy">Earn one point per level. Each path has five permanent learning bonuses.</p><div class="skill-list">${Object.entries({ memory: ["MEMORY", "+2 seconds to Memory Rush per node"], focus: ["FOCUS", "+1 minute to timed tests per node"], speed: ["SPEED", "+5 seconds and +3 XP in Speed Run per node"], intelligence: ["INTELLIGENCE", "+2 XP per correct answer per node"] }).map(([key, [label, benefit]]) => `<div class="skill-row"><div><strong>${label}</strong><small>${progression.skills[key]} / 5 nodes · ${benefit}</small></div><button class="skill-node" data-skill="${key}" ${progression.skillPoints <= 0 || progression.skills[key] >= 5 ? "disabled" : ""}>＋</button></div>`).join("")}</div></section>
    <section class="panel daily-wheel-panel"><div class="section-heading"><div><span class="section-code">DAILY DROP / FREE ONCE A DAY</span><h2>Spin the wheel</h2></div><span class="rarity rarity-legendary">RARE PRIZES</span></div><div class="wheel-layout"><div class="daily-wheel ${wheelSpinning ? "spinning" : ""}"><span>25</span><span>40</span><span>60</span><span>100</span><span>✦</span><i>◈</i></div><div class="wheel-copy">${data.games.dailySpinDate === todayKey() ? `<strong>Today's drop: ${escapeHtml(data.games.dailySpinReward || "Reward claimed")}</strong><p>Come back tomorrow for another free spin.</p>` : `<strong>A little luck, once a day.</strong><p>35% · 25 credits · 25% · 40 credits · 20% · 60 credits · 12% · 100 credits · 8% · rare cosmetic.</p>`}<button class="button button-primary" type="button" data-action="spin-daily-wheel" ${!spinAvailable || wheelSpinning ? "disabled" : ""}>${wheelSpinning ? "Spinning…" : spinAvailable ? "Spin for today's reward →" : "Already claimed today"}</button></div></div></section>
    <section class="panel collection-panel"><div class="section-heading"><div><span class="section-code">YOUR COLLECTION / ${collection.length} ITEMS</span><h2>Showcase</h2></div><small>Choose up to 4 favorites</small></div><div class="collection-showcase">${showcase.length ? showcase.map((id) => collection.find((item) => item.id === id)).filter(Boolean).map((item) => `<span class="collection-chip rarity-${item.rarity.toLowerCase()}">${escapeHtml(item.name)}</span>`).join("") : `<span class="empty-note">Pick a few owned pieces to show off on your profile.</span>`}</div><div class="collection-items">${collection.map((item) => `<button type="button" class="collection-item ${showcase.includes(item.id) ? "in-showcase" : ""}" data-showcase-item="${item.id}" aria-pressed="${showcase.includes(item.id)}" title="${escapeHtml(item.description)}"><span class="rarity rarity-${item.rarity.toLowerCase()}">${item.rarity}</span><strong>${escapeHtml(item.name)}</strong><small>${showcase.includes(item.id) ? "SHOWCASED · click to remove" : "Click to showcase"}</small></button>`).join("") || `<span class="empty-note">Visit the market to collect your first cosmetic.</span>`}</div></section>
    <section class="panel trophy-panel"><div class="section-heading"><div><span class="section-code">TROPHY ROOM</span><h2>Unlocked achievements</h2></div><button class="text-button" data-nav="arcade">All achievements ↗</button></div>${achievementGrid()}</section></div>`;
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
    </section><aside class="panel side-panel"><div class="section-heading"><div><span class="section-code">DATA / LOCAL ONLY</span><h2>Your vault</h2></div></div><p class="panel-copy">Your profile backup includes decks, pairs, history, progression, budget, game progress, settings, and test preferences. Account credentials are never included. Keep the downloaded file somewhere safe.</p><div class="data-actions"><button class="button button-quiet" data-action="export-all">↓ Download full backup (.txt)</button><button class="button button-outline" data-action="import-profile">↑ Restore full backup</button><button class="button button-outline" data-action="clear-history">Clear test history</button></div><div class="local-status"><span class="live-dot"></span> SAVED ON THIS DEVICE</div><p class="backup-warning">Restoring replaces this profile's current data, including its budget and game progress.</p></aside></div>`;
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
  return `<div class="recent-row"><span class="recent-glyph">↗</span><span><strong>${escapeHtml(record.deckName)} · ${modeLabel(record.mode)}</strong><small>${formatDate(record.finishedAt)} · ${record.questions.length} questions</small></span><b>${record.score ?? "—"}%</b></div>`;
}

function historyRow(record) {
  const result = statsFor([record]);
  return `<div class="history-row"><div><strong>${escapeHtml(record.deckName)}</strong><small>${formatDate(record.finishedAt)} · ${modeLabel(record.mode)} · ${record.questions.length} questions</small></div><span class="history-counts"><i>${result.correct} ✓</i><i>${result.incorrect} ×</i><i>${result.skipped} —</i></span><b>${record.score == null ? "—" : `${record.score}%`}</b></div>`;
}

function modeLabel(mode) {
  return {
    self: "Self-test",
    timed: "Timed test",
    speed: "Speed Run",
    survival: "Survival",
    memory: "Memory Rush",
    perfect: "Perfect Run",
    boss: "Boss Battle",
  }[mode] || "Self-test";
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
  const blob = new Blob([JSON.stringify({
    format: "novex-learner-profile",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: data.progression.profile,
    decks: data.decks,
    history: data.history,
    progression: data.progression,
    budget: data.budget,
    games: data.games,
    settings,
    testOptions,
  }, null, 2)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "novex-learner-backup.txt";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateBackup(value) {
  if (!value || value.format !== "novex-learner-profile" || value.version !== 1) {
    throw new Error("This is not a supported Novex Learner profile backup.");
  }
  const isObject = (item) => item !== null && typeof item === "object" && !Array.isArray(item);
  if (!Array.isArray(value.decks) || !value.decks.length || !Array.isArray(value.history) ||
      !isObject(value.progression) || !isObject(value.settings) || !isObject(value.testOptions)) {
    throw new Error("The backup is missing required profile data.");
  }
  const deckIds = new Set();
  const decks = value.decks.map((deck) => {
    if (!deck || typeof deck.name !== "string" || !Array.isArray(deck.pairs)) {
      throw new Error("A deck in this backup has an invalid format.");
    }
    let deckId = typeof deck.id === "string" && deck.id ? deck.id : uid();
    if (deckIds.has(deckId)) deckId = uid();
    deckIds.add(deckId);
    const pairIds = new Set();
    return {
      id: deckId,
      name: deck.name.slice(0, 80),
      pairs: deck.pairs.map((pair) => {
        if (!pair || typeof pair.left !== "string" || typeof pair.right !== "string") {
          throw new Error(`A pair in "${deck.name}" is invalid.`);
        }
        let pairId = typeof pair.id === "string" && pair.id ? pair.id : uid();
        if (pairIds.has(pairId)) pairId = uid();
        pairIds.add(pairId);
        return {
          id: pairId,
          left: pair.left.slice(0, 500),
          right: pair.right.slice(0, 500),
          guide: typeof pair.guide === "string" ? pair.guide.slice(0, 5000) : "",
        };
      }),
    };
  });
  const history = value.history.map((record) => {
    if (!record || typeof record.id !== "string" || !Array.isArray(record.questions)) {
      throw new Error("A test result in this backup is invalid.");
    }
    return {
      id: record.id,
      deckId: typeof record.deckId === "string" ? record.deckId : "",
      deckName: typeof record.deckName === "string" ? record.deckName.slice(0, 80) : "Imported deck",
      mode: ["self", "timed", "speed", "survival", "memory", "perfect", "boss"].includes(record.mode) ? record.mode : "self",
      startedAt: Number(record.startedAt) || Date.now(),
      finishedAt: Number(record.finishedAt) || Date.now(),
      score: record.score == null ? null : Math.min(100, Math.max(0, Number(record.score) || 0)),
      perfect: Boolean(record.perfect),
      xpEarned: Number(record.xpEarned) || 0,
      creditsEarned: Number(record.creditsEarned) || 0,
      bossVictory: Boolean(record.bossVictory),
      questions: record.questions.map((question) => {
        if (!question || typeof question.prompt !== "string" || typeof question.answer !== "string") {
          throw new Error("A saved answer in this backup is invalid.");
        }
        const drawing = typeof question.drawing === "string" ? question.drawing : "";
        if (drawing && !/^data:image\/png;base64,[\da-z+/]+=*$/i.test(drawing)) {
          throw new Error("A drawing in this backup has an unsupported format.");
        }
        const allowedStatuses = ["correct", "incorrect", "skipped", "pending"];
        return {
          pairId: typeof question.pairId === "string" ? question.pairId : "",
          type: ["leftToRight", "rightToLeft", "write", "draw", "multipleChoice", "recognition"].includes(question.type) ? question.type : "write",
          direction: typeof question.direction === "string" ? question.direction.slice(0, 50) : "",
          prompt: question.prompt.slice(0, 500),
          answer: question.answer.slice(0, 500),
          left: typeof question.left === "string" ? question.left.slice(0, 500) : question.prompt.slice(0, 500),
          right: typeof question.right === "string" ? question.right.slice(0, 500) : question.answer.slice(0, 500),
          guide: typeof question.guide === "string" ? question.guide.slice(0, 5000) : "",
          response: typeof question.response === "string" ? question.response.slice(0, 500) : "",
          drawing,
          background: typeof question.background === "string" && /^#[\da-f]{6}$/i.test(question.background) ? question.background : "#101624",
          grid: Boolean(question.grid),
          submitted: Boolean(question.submitted),
          revealed: Boolean(question.revealed),
          status: allowedStatuses.includes(question.status) ? question.status : "skipped",
          rating: question.rating != null && Number.isFinite(Number(question.rating)) ? Math.min(100, Math.max(0, Number(question.rating))) : null,
          elapsedMs: Math.max(0, Number(question.elapsedMs) || 0),
        };
      }),
    };
  });
  const progression = validateProgressionCosmetics(normalizeProgression(value.progression));
  const budget = NovexBudget.normalizeBudget(value.budget);
  const games = NovexCardGames.normalizeGameStats(value.games);
  return {
    decks,
    history,
    progression,
    budget,
    games,
    settings: normalizeSettings(value.settings),
    testOptions: normalizeTestOptions(value.testOptions),
  };
}

async function restoreBackup(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) throw new Error("Backup files must be smaller than 50 MB.");
  const parsed = JSON.parse(await file.text());
  const restored = validateBackup(parsed);
  const deckCount = restored.decks.length;
  const pairCount = restored.decks.reduce((sum, deck) => sum + deck.pairs.length, 0);
  if (!window.confirm(`Restore ${deckCount} deck${deckCount === 1 ? "" : "s"} and ${pairCount} pair${pairCount === 1 ? "" : "s"}? This replaces the current profile's study data, budget, game progress, settings, and test preferences.`)) return;
  const previous = { data, settings, testOptions };
  data = {
    decks: restored.decks,
    history: restored.history,
    progression: restored.progression,
    budget: restored.budget,
    games: restored.games,
  };
  settings = restored.settings;
  testOptions = restored.testOptions;
  activeDeckId = data.decks[0].id;
  if (!persist()) {
    data = previous.data;
    settings = previous.settings;
    testOptions = previous.testOptions;
    activeDeckId = data.decks[0]?.id || "";
    updateHeader();
    return;
  }
  updateHeader();
  setView("dashboard");
  showToast("PROFILE RESTORED · your vault and progress are back");
}

function startTest() {
  const deck = activeDeck();
  if (!deck) return showToast("Create a deck before starting a test.", true);
  const mode = testOptions.mode;
  const types = mode === "boss"
    ? { leftToRight: true, rightToLeft: true, write: true, draw: false, multipleChoice: false, recognition: false }
    : testOptions.types;
  const pool = allQuestions(deck, types);
  const requested = mode === "speed" || mode === "survival"
    ? 1000
    : mode === "perfect"
      ? pool.length
    : mode === "boss" ? Math.min(5, pool.length) : Number(testOptions.count) || 1;
  const candidates = buildQuestionSet(deck, types, requested, ["speed", "survival"].includes(mode));
  if (!candidates.length) return showToast("Enable at least one question type.", true);
  session = {
    id: uid(), deckId: deck.id, deckName: deck.name, mode,
    questions: candidates, index: 0, finished: false, startedAt: Date.now(),
    durationMs: mode === "speed"
      ? (60 + data.progression.skills.speed * 5) * 1000
      : Math.min(180, Math.max(1, Number(testOptions.minutes) || 1) + data.progression.skills.focus) * 60_000,
    secondsRemaining: mode === "speed"
      ? 60 + data.progression.skills.speed * 5
      : Math.min(180, Math.max(1, Number(testOptions.minutes) || 1) + data.progression.skills.focus) * 60,
    currentShownAt: Date.now(), historySaved: false,
    phase: mode === "memory" ? "memorize" : "recall",
    bossNumber: mode === "boss" ? bossNumber() : null,
    bossHealth: candidates.length,
    playerHealth: 3,
  };
  document.querySelector(".app-shell").hidden = true;
  testScreen.hidden = false;
  if (session.mode === "speed" || session.mode === "timed") {
    sessionTimerEndsAt = session.startedAt + session.durationMs;
    timerId = window.setInterval(() => {
      if (!session || session.finished) return;
      session.secondsRemaining = Math.max(0, Math.ceil((sessionTimerEndsAt - Date.now()) / 1000));
      if (session.secondsRemaining <= 0) finishTest(true);
      else updateTimer();
    }, 250);
  } else if (session.mode === "memory") {
    session.secondsRemaining = 10 + data.progression.skills.memory * 2;
    sessionTimerEndsAt = Date.now() + session.secondsRemaining * 1000;
    renderMemoryPreview();
    timerId = window.setInterval(() => {
      if (!session || session.finished || session.phase !== "memorize") return;
      session.secondsRemaining = Math.max(0, Math.ceil((sessionTimerEndsAt - Date.now()) / 1000));
      if (session.secondsRemaining <= 0) beginMemoryRecall();
      else renderMemoryTimer();
    }, 250);
    return;
  }
  renderQuestion();
}

function renderMemoryPreview() {
  testScreen.innerHTML = `<div class="test-shell memory-shell"><header class="test-top"><button class="back-link" data-action="exit-test">← Exit session</button><span class="test-brand">MEMORY <b>RUSH</b></span><span class="timer-pill" id="memory-timer">00:10</span></header><section class="memory-intro"><span class="section-code">MEMORIZE THE PAIRS</span><h1>Lock it <span>in.</span></h1><p>Study these pairs. They disappear when the countdown ends.</p></section><div class="memory-grid">${session.questions.map((question) => `<article class="memory-pair"><small>PAIR ${String(session.questions.indexOf(question) + 1).padStart(2, "0")}</small><strong>${escapeHtml(question.left)}</strong><i>↔</i><strong>${escapeHtml(question.right)}</strong></article>`).join("")}</div><button class="button button-primary memory-ready" data-action="memory-ready">I'M READY · START RECALL →</button></div>`;
  testScreen.querySelector('[data-action="exit-test"]').addEventListener("click", handleTestAction);
  testScreen.querySelector('[data-action="memory-ready"]').addEventListener("click", beginMemoryRecall);
  renderMemoryTimer();
}

function renderMemoryTimer() {
  const timer = testScreen.querySelector("#memory-timer");
  if (timer) timer.textContent = `${String(Math.floor(session.secondsRemaining / 60)).padStart(2, "0")}:${String(session.secondsRemaining % 60).padStart(2, "0")}`;
}

function beginMemoryRecall() {
  if (!session || session.phase !== "memorize") return;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  session.phase = "recall";
  session.index = 0;
  session.currentShownAt = Date.now();
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
  question.presented = true;
  const self = !["timed", "speed"].includes(session.mode);
  const revealed = self && question.revealed;
  const submitted = question.submitted;
  const drawMode = question.type === "draw";
  const score = getSessionScore();
  const bossStatus = session.mode === "boss" ? `<div class="boss-health"><span>OPERATOR <b>${"♥".repeat(session.playerHealth)}${"♡".repeat(Math.max(0, 3 - session.playerHealth))}</b></span><span>CORE <b>${"◆".repeat(session.bossHealth)}${"◇".repeat(Math.max(0, session.bossMaxHealth - session.bossHealth))}</b></span></div>` : "";
  const openEndedMode = ["speed", "survival"].includes(session.mode);
  const progressPercent = openEndedMode ? ((session.index % 10) + 1) * 10 : ((session.index + (revealed ? 1 : 0)) / session.questions.length) * 100;
  const progressLabel = openEndedMode ? `QUESTION ${session.index + 1}` : `QUESTION <b>${session.index + 1}</b> / ${session.questions.length}`;
  const statusLabel = session.mode === "speed"
    ? `${session.questions.filter((item) => item.submitted).length} ANSWERED · 60-SECOND RUN`
    : session.mode === "survival"
      ? `${session.questions.filter((item) => item.status === "correct").length} SURVIVED`
      : self ? "SELF-GRADED" : `${session.questions.filter((item) => item.submitted).length} SUBMITTED`;
  const answerInput = question.type === "draw"
    ? renderDrawingArea(question, revealed)
    : question.type === "multipleChoice"
      ? `<div class="answer-area"><div class="field-label">SELECT THE MATCHING SIDE</div><div class="choice-grid">${question.choices.map((choice, index) => `<button type="button" class="choice-option ${question.response === choice ? "selected" : ""}" data-choice="${escapeHtml(choice)}" ${revealed || submitted ? "disabled" : ""}><small>${index + 1}</small>${escapeHtml(choice)}</button>`).join("")}</div></div>`
      : `<div class="answer-area"><label class="field-label" for="answer-text">YOUR ANSWER</label><textarea id="answer-text" class="answer-text" rows="3" ${revealed || submitted ? "disabled" : ""} placeholder="Type your answer…">${escapeHtml(question.response)}</textarea></div>`;
  testScreen.innerHTML = `
    <div class="test-shell">
      <header class="test-top"><button class="back-link" data-action="exit-test">← Exit session</button><span class="test-brand">${session.mode === "speed" ? "SPEED " : session.mode === "survival" ? "SURVIVAL " : session.mode === "perfect" ? "PERFECT " : session.mode === "boss" ? "BOSS " : session.mode === "memory" ? "MEMORY " : "NOVEX "}<b>${session.mode === "boss" ? "BATTLE" : "LEARNER"}</b></span>${["timed", "speed"].includes(session.mode) ? '<span id="timer" class="timer-pill"></span>' : `<span class="live-score"><small>${session.mode === "boss" ? "BOSS CORE" : "LIVE SCORE"}</small><strong>${session.mode === "boss" ? `${session.bossHealth}/${session.questions.length}` : `${score.percent}%`}</strong></span>`}</header>
      ${bossStatus}
      <div class="test-progress-row"><span>${progressLabel}</span><span>${statusLabel}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${progressPercent}%"></div></div>
      <article class="question-card">
        <div class="question-kicker">${escapeHtml(question.direction)}</div>
        <h1>${escapeHtml(question.prompt)}</h1>
        <p class="question-hint">${question.type === "recognition" ? "Recall the matching side of this pair." : drawMode ? "Write the answer by hand. Multiple characters are welcome." : "Take a moment. What belongs on the other side?"}</p>
        ${answerInput}
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
  if (["timed", "speed"].includes(session.mode)) updateTimer();
  if (drawMode) setupDrawingCanvas(question, revealed);
  testScreen.querySelector("#answer-text")?.addEventListener("input", () => { question.response = testScreen.querySelector("#answer-text").value; });
  testScreen.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleTestAction));
  testScreen.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
    question.response = button.dataset.choice;
    testScreen.querySelectorAll("[data-choice]").forEach((option) => option.classList.toggle("selected", option === button));
  }));
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
    if (["survival", "perfect", "boss"].includes(session.mode)) {
      saveQuestionResponse();
      return gradeCurrent("incorrect");
    }
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
  addQuestionTime();
  question.status = status;
  question.revealed = true;
  if (question.type === "draw") question.rating = status === "correct" ? 100 : status === "incorrect" ? 0 : null;
  if (session.mode === "boss") {
    if (status === "correct") session.bossHealth = Math.max(0, session.bossHealth - 1);
    else session.playerHealth = Math.max(0, session.playerHealth - 1);
    if (session.bossHealth === 0) {
      session.bossVictory = true;
      return finishTest(false);
    }
    if (session.playerHealth === 0) {
      session.bossVictory = false;
      return finishTest(false);
    }
    return nextOrFinish();
  }
  if (session.mode === "survival" && status !== "correct") {
    session.failedRun = true;
    return finishTest(false);
  }
  if (session.mode === "perfect" && status !== "correct") {
    session.failedRun = true;
    return finishTest(false);
  }
  if (session.mode === "survival" && session.index === session.questions.length - 1) return finishTest(false);
  renderQuestion();
}

function addExperience(amount) {
  if (session) session.xpEarned = (session.xpEarned || 0) + amount;
  const before = currentLevel();
  data.progression.xp = Math.max(0, data.progression.xp + amount);
  const gainedLevels = currentLevel() - before;
  if (gainedLevels > 0) {
    data.progression.skillPoints += gainedLevels;
    showToast(`LEVEL UP · LEVEL ${currentLevel()} · +${gainedLevels} SKILL POINT${gainedLevels > 1 ? "S" : ""}`);
  }
}

function addCredits(amount) {
  data.progression.credits += amount;
  if (session) session.creditsEarned = (session.creditsEarned || 0) + amount;
}

function updateStreak() {
  const progression = data.progression;
  const today = todayKey();
  if (progression.lastStudyDate === today) return;
  const gap = progression.lastStudyDate ? dayDifference(progression.lastStudyDate, today) : 0;
  if (!progression.lastStudyDate) progression.streak = 1;
  else if (gap === 1) progression.streak += 1;
  else if (gap === 2 && progression.freezeCount > 0) {
    progression.freezeCount -= 1;
    progression.streak += 1;
    showToast("STREAK SHIELD ACTIVATED · your streak is safe");
  } else if (gap >= 7) {
    session.comeback = true;
    progression.streak = 1;
  } else if (gap > 1) progression.streak = 1;
  progression.lastStudyDate = today;
  progression.lastActiveDate = today;
  progression.bestStreak = Math.max(progression.bestStreak, progression.streak);
}

function dayDifference(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function awardQuestionReward(question) {
  if (question.rewarded || !["correct", "incorrect"].includes(question.status)) return;
  question.rewarded = true;
  if (question.status === "correct") {
    addExperience(12 + data.progression.skills.intelligence * 2);
    addCredits(4);
    data.progression.correctTotal += 1;
    data.progression.daily.correct += 1;
  } else if (question.status === "incorrect") {
    addExperience(2);
  }
}

function refreshDailyChallenges() {
  const daily = data.progression.daily;
  for (const challenge of DAILY_CHALLENGES) {
    if (!daily.completed.includes(challenge.id) && challengeProgress(challenge) >= challenge.target) {
      daily.completed.push(challenge.id);
      addCredits(challenge.reward);
      showToast(`DAILY MISSION COMPLETE · +${challenge.reward} CREDITS`);
    }
  }
  if (daily.completed.length === DAILY_CHALLENGES.length && !daily.bonusClaimed) {
    daily.bonusClaimed = true;
    addCredits(50);
    showToast("ALL MISSIONS COMPLETE · +50 BONUS CREDITS");
  }
}

function applySessionRewards() {
  if (session.rewardsApplied) return;
  resetDailyIfNeeded();
  const progression = data.progression;
  const submitted = session.questions.filter((question) => question.submitted).length;
  const score = getSessionScore();
  session.perfect = session.questions.length > 0 &&
    session.questions.every((question) => question.status === "correct") &&
    score.percent === 100;
  session.engaged = submitted > 0 || score.graded > 0;
  session.xpEarned = 0;
  session.creditsEarned = 0;
  if (session.engaged) {
    addExperience(submitted * 3 + 10);
    addCredits(10);
    progression.answeredTotal += submitted;
    progression.daily.answered += submitted;
    progression.daily.sessions += 1;
    progression.daily.modes = [...new Set([...(progression.daily.modes || []), session.mode])];
    if (session.mode === "speed") {
      const speedBonus = 15 + progression.skills.speed * 3;
      addExperience(speedBonus);
      addCredits(10);
    }
    if (session.perfect) {
      addExperience(25);
      addCredits(20);
      progression.perfectSessions += 1;
      session.perfectBonusApplied = true;
    }
    if (session.mode === "boss" && session.bossVictory) {
      progression.defeatedBosses = [...new Set([...progression.defeatedBosses, session.bossNumber])];
      addCredits(100);
      addExperience(80);
    }
    if (session.mode === "survival" && session.questions.filter((question) => question.status === "correct").length >= 10) {
      addCredits(30);
    }
    updateStreak();
    for (const question of session.questions) awardQuestionReward(question);
    refreshDailyChallenges();
    progression.lastActiveDate = todayKey();
  }
  session.rewardsApplied = true;
  checkAchievements();
  persist();
}

function checkAchievements() {
  const progression = data.progression;
  const records = data.history;
  const current = session;
  const activeRecords = records.filter((record) => (record.questions || []).some((question) =>
    question.submitted || ["correct", "incorrect"].includes(question.status)
  ));
  const perfectCount = activeRecords.filter((record) => record.perfect).length + (current?.perfect && !activeRecords.some((record) => record.id === current.id) ? 1 : 0);
  const modes = new Set(activeRecords.map((record) => record.mode));
  if (current?.engaged) modes.add(current.mode);
  const currentDay = todayKey();
  const studiedTerms = [
    ...activeRecords.filter((record) => todayKey(record.finishedAt) === currentDay).flatMap((record) => (record.questions || [])
      .filter((question) => question.submitted)
      .flatMap((question) => [question.left || "", question.right || ""])),
    ...(current?.questions || []).filter((question) => question.submitted).flatMap((question) => [question.left || "", question.right || ""]),
  ];
  const secretPairSeen = ["你好", "再见"].every((term) => studiedTerms.some((side) => side.includes(term)));
  const unlocked = new Set(progression.achievements);
  const qualifies = {
    "first-session": activeRecords.length > 0 || Boolean(current?.engaged),
    "night-owl": Boolean(current?.engaged && new Date(current.startedAt).getHours() < 5),
    unstoppable: progression.streak >= 30,
    "brain-machine": progression.correctTotal >= 100,
    comeback: Boolean(current?.comeback),
    perfectionist: progression.perfectSessions >= 10 || perfectCount >= 10,
    "speed-demon": activeRecords.some((record) => record.mode === "speed") || Boolean(current?.engaged && current.mode === "speed"),
    survivor: activeRecords.some((record) => record.mode === "survival" && (record.questions || []).filter((question) => question.status === "correct").length >= 10) ||
      Boolean(current?.engaged && current.mode === "survival" && current.questions.filter((question) => question.status === "correct").length >= 10),
    collector: progression.owned.filter((item) => item !== "theme-default").length >= 3,
    variety: modes.size >= 3,
    "secret-code": secretPairSeen,
  };
  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked.has(achievement.id) && qualifies[achievement.id]) {
      progression.achievements.push(achievement.id);
      addCredits(25);
      addExperience(15);
      showToast(`ACHIEVEMENT UNLOCKED · ${achievement.name} · +25 CREDITS`);
    }
  }
}

function awardLateGrading(question) {
  if (question.rewarded) return;
  awardQuestionReward(question);
  if (question.status === "correct") refreshDailyChallenges();
  if (session && !session.perfectBonusApplied && session.questions.length > 0 &&
      session.questions.every((item) => item.status === "correct")) {
    session.perfect = true;
    session.perfectBonusApplied = true;
    data.progression.perfectSessions += 1;
    addCredits(20);
    addExperience(25);
    showToast("PERFECT RUN · +25 XP · +20 CREDITS");
  }
  checkAchievements();
  persist();
}

function nextOrFinish() {
  addQuestionTime();
  if (session.mode === "boss" && session.index === session.questions.length - 1) {
    session.bossVictory = session.bossHealth === 0;
    return finishTest(false);
  }
  if (session.index >= session.questions.length - 1) finishTest(false);
  else {
    session.index += 1;
    session.currentShownAt = Date.now();
    renderQuestion();
  }
}

function finishTest(timedOut) {
  if (!session || session.finished) return;
  if (["timed", "speed"].includes(session.mode)) {
    const question = questionNow();
    if (!question.submitted) {
      saveQuestionResponse();
      if (question.response.trim() || question.drawing) question.submitted = true;
    }
  } else {
    saveQuestionResponse();
  }
  addQuestionTime();
  session.questions = session.questions.filter((question) => question.presented);
  session.finished = true;
  session.timedOut = timedOut;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  session.questions.forEach((question) => {
    if (!question.status) question.status = "skipped";
  });
  applySessionRewards();
  saveHistory();
  checkAchievements();
  persist();
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
      perfect: session.perfect,
      xpEarned: session.xpEarned || 0,
      creditsEarned: session.creditsEarned || 0,
      bossVictory: session.bossVictory || false,
      questions: session.questions.map((question) => ({ ...question })),
    });
    session.historySaved = true;
  } else {
    const record = data.history.find((item) => item.id === session.id);
    if (record) {
      record.questions = session.questions.map((question) => ({ ...question }));
      record.score = score.graded ? score.percent : null;
      record.perfect = session.perfect;
      record.xpEarned = session.xpEarned || 0;
      record.creditsEarned = session.creditsEarned || 0;
      record.bossVictory = session.bossVictory || false;
    }
  }
  persist();
}

function renderResults() {
  const score = getSessionScore();
  const skipped = session.questions.filter((question) => question.status === "skipped").length;
  testScreen.innerHTML = `
    <div class="test-shell results-shell"><header class="test-top"><button class="back-link" data-action="back-home">← Return to vault</button><span class="test-brand">NOVEX <b>LEARNER</b></span><span class="test-mode-label">${session.mode === "timed" || session.mode === "speed" ? "TIMED REVIEW" : "SESSION RESULTS"}</span></header>
    <section class="result-hero"><div class="eyebrow"><span class="pulse"></span>${session.bossVictory ? "BOSS DEFEATED · +100 CREDITS" : session.bossVictory === false && session.mode === "boss" ? "OPERATOR WITHDREW · REGROUP AND RETRY" : session.timedOut ? "TIME LIMIT REACHED" : session.failedRun ? "RUN ENDED · RESET AND REBUILD" : "SESSION COMPLETE"}</div><h1>${session.mode === "speed" ? "Clock's out." : session.mode === "survival" ? "Survival report." : session.mode === "memory" ? "Memory deployed." : session.mode === "boss" ? (session.bossVictory ? "Core destabilized." : "The boss held the line.") : session.mode === "timed" ? "Review your answers." : session.perfect ? "Flawless execution." : "Good work showing up."}</h1><p>${escapeHtml(session.deckName)} · ${session.questions.length} questions · ${formatDuration(Date.now() - session.startedAt)}</p><div class="result-score"><strong id="result-percent">${score.graded ? score.percent : "—"}</strong><span>%</span></div><div class="result-summary"><span><b id="result-correct">${score.correct}</b> correct</span><span><b id="result-incorrect">${score.incorrect}</b> incorrect</span><span><b>${skipped}</b> skipped</span><span><b>${score.graded}</b> graded</span></div><div class="reward-toast">+${session.xpEarned || 0} XP &nbsp;·&nbsp; +${session.creditsEarned || 0} CREDITS${session.perfect ? " &nbsp;·&nbsp; PERFECT RUN" : ""}</div></section>
    <div class="result-toolbar"><div><span class="section-code">ANSWER REVIEW</span><h2>Manual grading</h2></div><span class="result-instruction">Correct + incorrect answers count toward your percentage. Skips do not.</span></div>
    <div class="result-list">${session.questions.map((question, index) => renderResultQuestion(question, index)).join("")}</div>
    <div class="results-actions"><button class="button button-quiet" data-action="back-home">← Back to dashboard</button><button class="button button-primary" data-action="restart-test">Start another session →</button></div></div>`;
  testScreen.querySelectorAll("[data-grade-result]").forEach((button) => button.addEventListener("click", () => {
    const question = session.questions[Number(button.dataset.index)];
    question.status = button.dataset.gradeResult;
    if (question.type === "draw") question.rating = question.status === "correct" ? 100 : question.status === "incorrect" ? 0 : null;
    awardLateGrading(question);
    saveHistory();
    renderResults();
  }));
  testScreen.querySelectorAll("[data-result-rating]").forEach((input) => input.addEventListener("input", () => {
    const question = session.questions[Number(input.dataset.index)];
    question.rating = Number(input.value);
    question.status = question.rating === 100 ? "correct" : "incorrect";
    input.nextElementSibling.textContent = `${question.rating}%`;
    updateResultsScore();
    const card = input.closest(".result-card");
    card.querySelector(".result-status").textContent = question.status.toUpperCase();
    card.querySelector(".result-status").className = `result-status status-${question.status}`;
    card.querySelector(".result-grade-actions > span").textContent = question.status === "correct" ? "Marked correct" : "Marked incorrect";
  }));
  testScreen.querySelectorAll("[data-result-rating]").forEach((input) => input.addEventListener("change", () => {
    const question = session.questions[Number(input.dataset.index)];
    awardLateGrading(question);
    saveHistory();
    renderResults();
  }));
  testScreen.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.action === "back-home") exitTest();
    if (button.dataset.action === "restart-test") {
      const previousMode = session.mode;
      const deckId = session.deckId;
      testScreen.hidden = true;
      session = null;
      if (previousMode === "boss") {
        activeDeckId = deckId;
        return startBossFight();
      }
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
  if (toastTimer) clearTimeout(toastTimer);
  const toast = document.createElement("div");
  toast.className = `toast terminal-toast ${error ? "toast-error" : ""}`;
  toast.innerHTML = `<span class="toast-glyph">${error ? "!" : "⌁"}</span><span>${escapeHtml(message)}</span>`;
  document.body.append(toast);
  toastTimer = window.setTimeout(() => toast.remove(), 4400);
}

function saveSolitaireMove(previouslyWon = false) {
  const game = data.games.solitaire;
  data.games.solitaireMoves += 1;
  if (!previouslyWon && game.won) {
    recordCardGameResult("solitaire", true);
    showToast("ALL 52 HOME · SOLITAIRE WON!");
  }
  persist();
  renderGames();
}

function handleSolitaireBoardClick(event) {
  const game = data.games.solitaire;
  const sourceElement = event.target.closest("[data-card-source]");
  const destinationElement = event.target.closest("[data-card-destination]");
  const sameValue = (left, right) => left == null && right == null || Number(left) === Number(right);
  const sameSource = (selected, element) => selected && selected.zone === element.dataset.cardSource &&
    sameValue(selected.column, element.dataset.column) &&
    sameValue(selected.index, element.dataset.index) &&
    sameValue(selected.pile, element.dataset.pile);
  if (game.selected && destinationElement && !sameSource(game.selected, destinationElement)) {
    const destination = destinationElement.dataset.cardDestination === "tableau"
      ? { zone: "tableau", column: Number(destinationElement.dataset.column) }
      : { zone: "foundation", pile: Number(destinationElement.dataset.pile) };
    const wasWon = game.won;
    if (NovexCardGames.moveSelected(game, destination)) return saveSolitaireMove(wasWon);
  }
  if (sourceElement) {
    const source = {
      zone: sourceElement.dataset.cardSource,
      column: sourceElement.dataset.column == null ? undefined : Number(sourceElement.dataset.column),
      index: sourceElement.dataset.index == null ? undefined : Number(sourceElement.dataset.index),
      pile: sourceElement.dataset.pile == null ? undefined : Number(sourceElement.dataset.pile),
    };
    if (sameSource(game.selected, sourceElement)) game.selected = null;
    else game.selected = source;
    persist();
    renderGames();
  }
}

function freecellSourceFromElement(element) {
  const zone = element.dataset.cardSource;
  return {
    zone,
    column: element.dataset.column == null ? undefined : Number(element.dataset.column),
    index: element.dataset.index == null ? undefined : Number(element.dataset.index),
  };
}

function handleFreecellBoardClick(event) {
  const game = data.games.freecell;
  const sourceElement = event.target.closest("[data-card-source]");
  const destinationElement = event.target.closest("[data-card-destination]");
  if (!sourceElement && !destinationElement) return;
  const selected = game.selected;
  if (selected && destinationElement) {
    const destination = {
      zone: destinationElement.dataset.cardDestination,
      column: destinationElement.dataset.column == null ? undefined : Number(destinationElement.dataset.column),
      index: destinationElement.dataset.index == null ? undefined : Number(destinationElement.dataset.index),
    };
    const isSameCell = selected.zone === "cell" && destination.zone === "cell" && selected.index === destination.index;
    const isSameColumn = selected.zone === "tableau" && destination.zone === "tableau" && selected.column === destination.column;
    if (!isSameCell && !isSameColumn) {
      const wasWon = game.won;
      if (NovexCardGames.moveFreecellCard(game, destination)) {
        if (!wasWon && game.won) recordCardGameResult("freecell", true);
        persist();
        return renderGames();
      }
    }
  }
  if (sourceElement) {
    const source = freecellSourceFromElement(sourceElement);
    game.selected = selected && selected.zone === source.zone &&
      selected.column === source.column && selected.index === source.index ? null : source;
    persist();
    renderGames();
  }
}

function solitaireDestinationFromElement(element) {
  return element.dataset.cardDestination === "tableau"
    ? { zone: "tableau", column: Number(element.dataset.column) }
    : { zone: "foundation", pile: Number(element.dataset.pile) };
}

function freecellDestinationFromElement(element) {
  return {
    zone: element.dataset.cardDestination,
    column: element.dataset.column == null ? undefined : Number(element.dataset.column),
    index: element.dataset.index == null ? undefined : Number(element.dataset.index),
  };
}

viewRoot.addEventListener("dragstart", (event) => {
  const sourceElement = event.target.closest("[data-card-source][draggable='true']");
  if (!sourceElement || !["solitaire", "freecell"].includes(gamesTab)) return;
  gamePointerDrag = { game: gamesTab, source: sourceElement };
  sourceElement.classList.add("is-dragging");
  event.dataTransfer?.setData("text/plain", "playing-card");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
});

viewRoot.addEventListener("dragover", (event) => {
  if (gamePointerDrag && event.target.closest("[data-card-destination]")) event.preventDefault();
});

viewRoot.addEventListener("drop", (event) => {
  if (!gamePointerDrag || gamePointerDrag.game !== gamesTab) return;
  const destinationElement = event.target.closest("[data-card-destination]");
  if (!destinationElement) return;
  event.preventDefault();
  const wasWon = data.games[gamesTab].won;
  let moved = false;
  if (gamesTab === "solitaire") {
    const source = gamePointerDrag.source;
    data.games.solitaire.selected = {
      zone: source.dataset.cardSource,
      column: source.dataset.column == null ? undefined : Number(source.dataset.column),
      index: source.dataset.index == null ? undefined : Number(source.dataset.index),
      pile: source.dataset.pile == null ? undefined : Number(source.dataset.pile),
    };
    moved = NovexCardGames.moveSelected(data.games.solitaire, solitaireDestinationFromElement(destinationElement));
  } else {
    data.games.freecell.selected = freecellSourceFromElement(gamePointerDrag.source);
    moved = NovexCardGames.moveFreecellCard(data.games.freecell, freecellDestinationFromElement(destinationElement));
  }
  gamePointerDrag.source.classList.remove("is-dragging");
  gamePointerDrag = null;
  if (moved && gamesTab === "solitaire") saveSolitaireMove(wasWon);
  else {
    if (moved && gamesTab === "freecell" && !wasWon && data.games.freecell.won) recordCardGameResult("freecell", true);
    persist();
    renderGames();
  }
});

viewRoot.addEventListener("dragend", () => {
  gamePointerDrag?.source?.classList.remove("is-dragging");
  gamePointerDrag = null;
});

viewRoot.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) return setView(nav.dataset.nav);
  const gameTab = event.target.closest("[data-games-tab]");
  if (gameTab) {
    gamesTab = gameTab.dataset.gamesTab;
    renderGames();
    return;
  }
  const cardAction = event.target.closest("[data-action='solitaire-stock']");
  if (cardAction) {
    const wasWon = data.games.solitaire.won;
    if (NovexCardGames.drawFromStock(data.games.solitaire)) saveSolitaireMove(wasWon);
    return;
  }
  if (event.target.closest("[data-card-source], [data-card-destination]")) {
    if (gamesTab === "solitaire") handleSolitaireBoardClick(event);
    else if (gamesTab === "freecell") handleFreecellBoardClick(event);
    return;
  }
  const open = event.target.closest("[data-open-deck]");
  if (open) {
    activeDeckId = open.dataset.openDeck;
    activeView = "deck";
    updateHeader();
    return renderDeck();
  }
  const button = event.target.closest("[data-action]");
  const startMode = event.target.closest("[data-start-mode]");
  if (startMode) {
    testOptions.mode = startMode.dataset.startMode;
    const deck = activeDeck();
    testOptions.count = Math.max(1, allQuestions(deck).length);
    persist();
    setView("dashboard");
    return startTest();
  }
  const shopButton = event.target.closest("[data-shop-item]");
  if (shopButton) return handleShopPurchase(shopButton.dataset.shopItem);
  const showcaseButton = event.target.closest("[data-showcase-item]");
  if (showcaseButton) {
    const itemId = showcaseButton.dataset.showcaseItem;
    if (!data.progression.owned.includes(itemId)) return;
    const selected = data.progression.profile.showcase;
    if (selected.includes(itemId)) data.progression.profile.showcase = selected.filter((id) => id !== itemId);
    else if (selected.length >= 4) return showToast("Your showcase has room for four items.", true);
    else selected.push(itemId);
    persist();
    return renderProfile();
  }
  if (event.target.closest("[data-action='spin-daily-wheel']")) return spinDailyWheel();
  const skillButton = event.target.closest("[data-skill]");
  if (skillButton) return investSkill(skillButton.dataset.skill);
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "new-solitaire") {
    data.games.solitaire = NovexCardGames.createSolitaireGame();
    persist();
    renderGames();
  } else if (action === "new-freecell") {
    data.games.freecell = NovexCardGames.createFreecellGame();
    persist();
    renderGames();
  } else if (action === "new-blackjack") {
    const botCount = Number(viewRoot.querySelector("#blackjack-bot-count")?.value) || 1;
    data.games.blackjack = NovexCardGames.createBlackjackGame(botCount);
    persist();
    renderGames();
  } else if (action === "blackjack-hit" || action === "blackjack-stand") {
    const game = data.games.blackjack;
    if (game?.status !== "playing") return;
    const wasPlaying = game.status === "playing";
    if (action === "blackjack-hit") NovexCardGames.hitBlackjack(game);
    else NovexCardGames.standBlackjack(game);
    if (wasPlaying && game.status === "settled") settleBlackjackGame();
    persist();
    renderGames();
  } else if (action === "join-card-leaderboard") {
    void cardClubAction("join");
  } else if (action === "refresh-card-club") {
    cardClubState.loaded = false;
    void loadCardClub();
  } else if (action === "join-tournament") {
    void cardClubAction("join-tournament", button.dataset.tournamentId);
  } else if (action === "select-tournament") {
    cardClubState.activeTournamentId = button.dataset.tournamentId;
    cardClubState.loaded = false;
    void loadCardClub();
  } else if (action === "solitaire-hint") {
    showToast(NovexCardGames.hintFor(data.games.solitaire));
  } else if (action === "budget-suggest") {
    data.budget.categories = NovexBudget.categories.map((category) => ({
      ...category,
      limitCents: Math.round(data.budget.monthlyIncomeCents * category.percent / 100),
    }));
    persist();
    renderBudget();
  } else if (action === "delete-expense") {
    if (!window.confirm("Delete this purchase from your budget?")) return;
    data.budget.expenses = data.budget.expenses.filter((expense) => expense.id !== id);
    persist();
    renderBudget();
  } else if (action === "delete-goal") {
    if (!window.confirm("Delete this savings goal and its saved progress?")) return;
    data.budget.goals = data.budget.goals.filter((goal) => goal.id !== id);
    persist();
    renderBudget();
  } else if (action === "start-gofish") {
    void startGoFish();
  } else if (action === "leave-room") {
    void leaveGoFish();
  } else if (action === "copy-room-link") {
    const url = new URL(window.location.href);
    url.searchParams.set("room", multiplayerState.room.code);
    if (!navigator.clipboard?.writeText) return showToast(`Share room code ${multiplayerState.room.code} with your friends.`, true);
    navigator.clipboard.writeText(url.toString())
      .then(() => showToast("INVITE LINK COPIED"))
      .catch((error) => {
        console.error("Could not copy the invite link.", error);
        showToast(`Share room code ${multiplayerState.room.code} with your friends.`, true);
      });
  } else if (action === "new-deck") openCreateDeck();
  else if (action === "boss-fight") startBossFight();
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
  } else if (action === "import-profile") {
    backupInput.click();
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
  if (event.target.id === "budget-income-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    data.budget.monthlyIncomeCents = NovexBudget.centsFromAmount(form.get("income"));
    data.budget.currency = NovexBudget.currencies.includes(form.get("currency")) ? form.get("currency") : "USD";
    data.budget = NovexBudget.normalizeBudget(data.budget);
    persist();
    renderBudget();
  } else if (event.target.id === "budget-plan-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    data.budget.categories = data.budget.categories.map((category) => ({
      ...category,
      limitCents: NovexBudget.centsFromAmount(form.get(category.id)),
    }));
    data.budget = NovexBudget.normalizeBudget(data.budget);
    persist();
    renderBudget();
  } else if (event.target.id === "budget-expense-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const amountCents = NovexBudget.centsFromAmount(form.get("amount"));
    const description = String(form.get("description") || "").trim();
    const date = String(form.get("date") || "");
    const categoryId = String(form.get("categoryId") || "");
    if (!description || !amountCents || !data.budget.categories.some((category) => category.id === categoryId) ||
        !NovexBudget.isValidDate(date)) {
      return showToast("Add a description, valid amount, category, and date.", true);
    }
    data.budget.expenses.push({ id: uid(), description: description.slice(0, 80), amountCents, categoryId, date });
    data.budget.expenses = data.budget.expenses.slice(-1000);
    persist();
    renderBudget();
  } else if (event.target.id === "budget-goal-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get("name") || "").trim();
    const targetCents = NovexBudget.centsFromAmount(form.get("target"));
    const deadline = String(form.get("deadline") || "");
    if (!name || !targetCents || (deadline && !NovexBudget.isValidDate(deadline))) {
      return showToast("Add a goal name and a valid target amount.", true);
    }
    if (data.budget.goals.length >= 20) return showToast("You can keep up to 20 goals at a time.", true);
    data.budget.goals.push({ id: uid(), name: name.slice(0, 60), targetCents, savedCents: 0, deadline });
    data.budget = NovexBudget.normalizeBudget(data.budget);
    persist();
    renderBudget();
  } else if (event.target.matches(".budget-contribute-form")) {
    event.preventDefault();
    const form = new FormData(event.target);
    const goal = data.budget.goals.find((item) => item.id === event.target.dataset.goalId);
    const amountCents = NovexBudget.centsFromAmount(form.get("amount"));
    if (!goal || !amountCents) return showToast("Enter a savings amount greater than zero.", true);
    goal.savedCents = Math.min(goal.targetCents, goal.savedCents + amountCents);
    persist();
    renderBudget();
  } else if (event.target.id === "create-tournament-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get("name") || "").trim();
    const gameType = String(form.get("gameType") || "");
    if (!name || !["solitaire", "freecell", "blackjack"].includes(gameType)) return showToast("Choose a tournament name and game.", true);
    void cardClubAction("create-tournament", "", { name: name.slice(0, 48), gameType });
  } else if (event.target.id === "game-host-form") {
    event.preventDefault();
    const displayName = String(new FormData(event.target).get("displayName") || "").trim();
    if (!displayName) return showToast("Add a name for your game table.", true);
    void hostGoFish(displayName.slice(0, 24));
  } else if (event.target.id === "game-join-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const code = String(form.get("code") || "").trim();
    const displayName = String(form.get("displayName") || "").trim();
    if (!/^[a-zA-Z0-9]{6}$/.test(code) || !displayName) return showToast("Enter your name and a six-character room code.", true);
    void joinGoFish(code, displayName.slice(0, 24));
  } else if (event.target.id === "gofish-ask-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const target = String(form.get("target") || "");
    const rank = Number(form.get("rank"));
    if (!target || !Number.isInteger(rank)) return showToast("Choose a player and a rank from your hand.", true);
    void askGoFish(target, rank);
  } else if (event.target.id === "pair-form") {
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
  } else if (event.target.id === "profile-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    data.progression.profile.displayName = String(form.get("displayName") || "").trim().slice(0, 28);
    const avatar = String(form.get("avatar") || "⌬");
    const allowedAvatars = AVATAR_OPTIONS.filter((option, index) => index < 8 ||
      SHOP_ITEMS.some((item) => item.type === "avatar" && item.value === option && data.progression.owned.includes(item.id)));
    data.progression.profile.avatar = allowedAvatars.includes(avatar) ? avatar : "⌬";
    const title = String(form.get("title") || "");
    const allowedTitles = SHOP_ITEMS.filter((item) => item.type === "title" && data.progression.owned.includes(item.id)).map((item) => item.value);
    data.progression.profile.title = allowedTitles.includes(title) ? title : "";
    const frame = String(form.get("frame") || "");
    const allowedFrames = SHOP_ITEMS.filter((item) => item.type === "frame" && data.progression.owned.includes(item.id)).map((item) => item.value);
    data.progression.profile.frame = allowedFrames.includes(frame) ? frame : "";
    const banner = String(form.get("banner") || "default");
    const allowedBanners = SHOP_ITEMS.filter((item) => item.type === "banner" && data.progression.owned.includes(item.id)).map((item) => item.value);
    data.progression.profile.banner = banner === "default" || allowedBanners.includes(banner) ? banner : "default";
    const favoriteGame = String(form.get("favoriteGame") || "solitaire");
    data.progression.profile.favoriteGame = FAVORITE_GAMES.some(([id]) => id === favoriteGame) ? favoriteGame : "solitaire";
    const favoriteDeck = String(form.get("favoriteDeck") || "classic");
    const allowedDecks = SHOP_ITEMS.filter((item) => item.type === "cardDeck" && data.progression.owned.includes(item.id)).map((item) => item.value);
    data.progression.profile.favoriteDeck = favoriteDeck === "classic" || allowedDecks.includes(favoriteDeck) ? favoriteDeck : "classic";
    persist();
    updateHeader();
    renderProfile();
    showToast("OPERATOR PROFILE UPDATED");
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

backupInput.addEventListener("change", async () => {
  const file = backupInput.files?.[0];
  if (!file) return;
  try {
    await restoreBackup(file);
  } catch (error) {
    console.error("Profile restore failed.", error);
    showToast(error.message || "Could not restore this profile backup.", true);
  } finally {
    backupInput.value = "";
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
