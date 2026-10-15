/* =============================================================================
 * store.js — Persistenzschicht (Offline-First, localStorage)
 * -----------------------------------------------------------------------------
 * Trennt Datenhaltung von der Oberflaeche. Die UI kennt nur diese Funktionen,
 * nicht den Speicherort. Ein Wechsel auf eine echte Datenbank waere damit auf
 * diese Datei begrenzt.
 * ========================================================================== */

const STORAGE_KEY = 'habit-trackz/v1';

const CATEGORIES = [
  { id: 'nutrition', label: 'Ernährung', icon: '🥗', color: '#10b981' },
  { id: 'mental', label: 'Mentale Gesundheit', icon: '🧘', color: '#06b6d4' },
  { id: 'workout', label: 'Sport', icon: '🏃', color: '#f59e0b' },
  { id: 'studies', label: 'Studium', icon: '📚', color: '#6366f1' },
  { id: 'work', label: 'Arbeit', icon: '💼', color: '#0ea5e9' },
  { id: 'chores', label: 'Haushalt', icon: '🧹', color: '#a855f7' },
  { id: 'hobbies', label: 'Hobbys', icon: '🎸', color: '#ec4899' },
];

const ICONS = ['🥗', '💧', '🧘', '🏃', '📚', '💼', '🧹', '🎸', '😴', '☀️', '🧠', '🎯', '✍️', '🎹', '🚲', '💊'];

function preferredTheme() {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

const emptyDb = () => ({ users: [], session: null, settings: { theme: preferredTheme(), sound: true } });

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDb();
    const db = JSON.parse(raw);
    return { ...emptyDb(), ...db };
  } catch (error) {
    console.warn('Gespeicherte Daten konnten nicht gelesen werden:', error);
    return emptyDb();
  }
}

function save(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (error) {
    console.warn('Speichern fehlgeschlagen:', error);
  }
}

let db = load();

/* --- Passwoerter -----------------------------------------------------------
 * Demo-Hashing mit SHA-256 + zufaelligem Salt pro Nutzer. Im Produktivbetrieb
 * gehoert das auf einen Server mit Argon2id oder bcrypt (siehe NFR Security).
 * -------------------------------------------------------------------------- */

function randomSalt() {
  const bytes = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues
    ? crypto.getRandomValues(bytes)
    : bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  const input = `${salt}:${password}`;
  if (globalThis.crypto && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback, falls die Web Crypto API nicht verfuegbar ist (nur Demo-Zwecke).
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return `fallback-${hash}`;
}

/** Passwortregeln aus FR-1.1: min. 8 Zeichen, min. 1 Ziffer oder Sonderzeichen. */
function validatePassword(password) {
  if (password.length < 8) return 'Das Passwort braucht mindestens 8 Zeichen.';
  if (!/[\d\W_]/.test(password)) return 'Bitte mindestens eine Ziffer oder ein Sonderzeichen verwenden.';
  return null;
}

/* --- Nutzerkonten --------------------------------------------------------- */

function findUser(email) {
  return db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) || null;
}

async function register({ name, email, birthday, password }) {
  if (!name.trim()) return { error: 'Bitte einen Namen angeben.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return { error: 'Bitte eine gültige E-Mail-Adresse angeben.' };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (findUser(email)) return { error: 'Für diese E-Mail existiert bereits ein Konto.' };

  const salt = randomSalt();
  const user = {
    id: `u_${Date.now()}`,
    name: name.trim(),
    email: email.trim(),
    birthday: birthday || null,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: Streak.toKey(new Date()),
    habits: [],
  };

  db.users.push(user);
  db.session = user.id;
  save(db);
  return { user };
}

async function login(email, password) {
  const user = findUser(email);
  // FR-1.2: generische Meldung, damit niemand testen kann, welche E-Mails existieren.
  const generic = { error: 'E-Mail oder Passwort ungültig' };
  if (!user) {
    await hashPassword(password, 'dummy-salt'); // gleiche Laufzeit, kein Timing-Leak
    return generic;
  }
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return generic;

  db.session = user.id;
  save(db);
  return { user };
}

function logout() {
  db.session = null;
  save(db);
}

function currentUser() {
  if (!db.session) return null;
  return db.users.find((u) => u.id === db.session) || null;
}

function updateUser(changes) {
  const user = currentUser();
  if (!user) return null;
  Object.assign(user, changes);
  save(db);
  return user;
}

/* --- Habits --------------------------------------------------------------- */

function getHabits() {
  const user = currentUser();
  return user ? user.habits : [];
}

function saveHabits() {
  save(db);
}

function addHabit(habit) {
  const user = currentUser();
  if (!user) return null;
  const record = {
    id: `h_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: Streak.toKey(new Date()),
    streak: 0,
    longestStreak: 0,
    lastCompleted: null,
    completions: [],
    skips: [],
    ...habit,
  };
  user.habits.push(record);
  save(db);
  return record;
}

function updateHabit(id, changes) {
  const habit = getHabits().find((h) => h.id === id);
  if (!habit) return null;
  Object.assign(habit, changes);
  Streak.recalculateStreak(habit, new Date());
  save(db);
  return habit;
}

function deleteHabit(id) {
  const user = currentUser();
  if (!user) return;
  user.habits = user.habits.filter((h) => h.id !== id);
  save(db);
}

/* --- Einstellungen -------------------------------------------------------- */

function getSettings() {
  return db.settings;
}

function updateSettings(changes) {
  Object.assign(db.settings, changes);
  save(db);
  return db.settings;
}

/* --- Demodaten ------------------------------------------------------------
 * Erzeugt eine glaubwuerdige Historie, damit Dashboard und Heatmap direkt nach
 * der Registrierung etwas zeigen (wichtig fuer die Praesentation).
 * -------------------------------------------------------------------------- */

function seedDemoData() {
  const user = currentUser();
  if (!user) return;

  const today = new Date();
  const blueprint = [
    { name: '2,5 L Wasser trinken', category: 'nutrition', icon: '💧', repetition: 'Daily', time: '08:00', reminder: 15, duration: 5, notes: 'Flasche auf den Schreibtisch stellen', target: 2500, unit: 'ml', reliability: 0.92 },
    { name: '15 min Meditation', category: 'mental', icon: '🧘', repetition: 'Daily', time: '07:30', reminder: 5, duration: 15, notes: 'Direkt nach dem Aufstehen', reliability: 0.85 },
    { name: '5 km laufen', category: 'workout', icon: '🏃', repetition: 'Mon, Wed, Fri', time: '18:00', reminder: 30, duration: 35, notes: '', reliability: 0.8 },
    { name: '20 Seiten lesen', category: 'studies', icon: '📚', repetition: 'Daily', time: '21:00', reminder: 60, duration: 45, notes: 'Vor dem Schlafen, Handy aus', reliability: 0.75 },
    { name: 'Vorlesung nachbereiten', category: 'studies', icon: '✍️', repetition: 'Mon-Fri', time: '16:00', reminder: 15, duration: 45, notes: '', reliability: 0.7 },
    { name: 'Küche aufräumen', category: 'chores', icon: '🧹', repetition: 'Tue, Thu, Sun', time: '19:30', reminder: 15, duration: 15, notes: '', reliability: 0.65 },
    { name: 'Gitarre üben', category: 'hobbies', icon: '🎸', repetition: 'Sat, Sun', time: '11:00', reminder: 30, duration: 30, notes: '', reliability: 0.6 },
    { name: 'Vitamin D nehmen', category: 'nutrition', icon: '💊', repetition: 'Daily', time: '09:30', reminder: 5, duration: 1, notes: 'Zum Frühstück', reliability: 0.88 },
  ];

  user.habits = blueprint.map((item, index) => {
    const { reliability, ...habit } = item;
    const days = Streak.scheduledDays(habit.repetition);
    const completions = [];

    // 70 Tage Historie rueckwaerts erzeugen, heute bleibt offen.
    for (let i = 70; i >= 1; i--) {
      const day = Streak.addDays(today, -i);
      if (!days.has(Streak.weekday(day))) continue;
      if (Math.random() < reliability) completions.push(Streak.toKey(day));
    }

    const record = {
      id: `h_seed_${index}`,
      createdAt: Streak.toKey(Streak.addDays(today, -70)),
      streak: 0,
      longestStreak: 0,
      lastCompleted: null,
      completions: completions.sort(),
      skips: [],
      target: null,
      unit: '',
      ...habit,
    };
    Streak.recalculateStreak(record, today);
    return record;
  });

  save(db);
}

function resetAll() {
  db = emptyDb();
  save(db);
}

const Store = {
  CATEGORIES,
  ICONS,
  register,
  login,
  logout,
  currentUser,
  updateUser,
  validatePassword,
  getHabits,
  saveHabits,
  addHabit,
  updateHabit,
  deleteHabit,
  getSettings,
  updateSettings,
  seedDemoData,
  resetAll,
  categoryById: (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0],
};

if (typeof window !== 'undefined') window.Store = Store;
