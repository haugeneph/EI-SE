/* =============================================================================
 * streak.js — Kernalgorithmus "Streak Update"
 * -----------------------------------------------------------------------------
 * Reine Logik, keine DOM-Zugriffe. Dadurch testbar (siehe tests.html).
 * Entspricht 1:1 dem Algorithmus aus der Abgabe (Python -> JavaScript).
 *
 *   1. Welche Wochentage sind fuer den Habit geplant?
 *   2. Ist heute kein geplanter Tag -> nichts tun.
 *   3. Wurde heute schon abgehakt -> nichts tun (keine Doppelbuchung).
 *   4. Letzter geplanter Tag VOR heute erledigt? -> Streak + 1, sonst zurueck auf 1.
 *   5. Heute als "zuletzt erledigt" speichern.
 * ========================================================================== */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Datum -> 'YYYY-MM-DD' (lokale Zeit, kein UTC-Versatz). */
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> Datum (lokale Mitternacht). */
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Wochentag mit Montag = 0 (JavaScript zaehlt sonst ab Sonntag). */
function weekday(date) {
  return (date.getDay() + 6) % 7;
}

/** Datum um n Tage verschieben (ohne das Original zu veraendern). */
function addDays(date, n) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * 'Daily', 'Mon, Wed, Fri' oder 'Mon-Fri' -> Set aus Wochentagsnummern (Mo = 0).
 */
function scheduledDays(repetition) {
  const text = String(repetition || '').trim();
  if (text.toLowerCase() === 'daily') return new Set([0, 1, 2, 3, 4, 5, 6]);

  const days = new Set();
  for (let part of text.split(',')) {
    part = part.trim().replace('–', '-'); // Gedankenstrich -> Bindestrich
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((p) => DAY_NAMES.indexOf(p.trim()));
      if (a < 0 || b < 0) continue;
      for (let i = a; i <= b; i++) days.add(i);
    } else {
      const i = DAY_NAMES.indexOf(part);
      if (i >= 0) days.add(i);
    }
  }
  return days;
}

/** Set aus Wochentagsnummern -> kompakter Repetition-String. */
function daysToRepetition(daySet) {
  const days = [...daySet].sort((a, b) => a - b);
  if (days.length === 7) return 'Daily';
  if (days.length === 5 && days.every((d, i) => d === i)) return 'Mon-Fri';
  return days.map((d) => DAY_NAMES[d]).join(', ');
}

/**
 * Der letzte geplante Tag vor `today`.
 * Pausierte Tage ("Skip Day", FR-4.3) werden uebersprungen, damit Urlaub oder
 * Krankheit den Streak nicht zerstoert.
 */
function previousScheduledDay(today, days, skips = []) {
  const skipSet = new Set(skips);
  if (days.size === 0) return null;

  let d = addDays(today, -1);
  for (let guard = 0; guard < 400; guard++) {
    if (days.has(weekday(d)) && !skipSet.has(toKey(d))) return d;
    d = addDays(d, -1);
  }
  return null;
}

/**
 * Habit fuer `today` abhaken und den Streak aktualisieren.
 * Gibt ein Ergebnisobjekt zurueck: { status, message, streak }
 */
function completeHabit(habit, today = new Date()) {
  const days = scheduledDays(habit.repetition);
  const todayKey = toKey(today);

  // 2. Heute gar nicht geplant
  if (!days.has(weekday(today))) {
    return { status: 'not-scheduled', message: 'Heute nicht geplant', streak: habit.streak };
  }

  // 3. Heute bereits erledigt -> keine Doppelbuchung
  if (habit.lastCompleted === todayKey) {
    return { status: 'already-done', message: 'Heute schon erledigt', streak: habit.streak };
  }

  // 4. Lueckenlos? -> weiterzaehlen, sonst Neustart bei 1
  const previous = previousScheduledDay(today, days, habit.skips);
  const previousKey = previous ? toKey(previous) : null;
  const completions = new Set(habit.completions || []);

  habit.streak = previousKey && completions.has(previousKey) ? habit.streak + 1 : 1;

  // 5. Abschluss speichern
  habit.lastCompleted = todayKey;
  completions.add(todayKey);
  habit.completions = [...completions].sort();
  habit.longestStreak = Math.max(habit.longestStreak || 0, habit.streak);

  return { status: 'completed', message: `Streak ist jetzt ${habit.streak}`, streak: habit.streak };
}

/**
 * Abhaken rueckgaengig machen (Undo-Snackbar, FR-2.3) und den Streak
 * aus der Historie neu berechnen.
 */
function uncompleteHabit(habit, today = new Date()) {
  const todayKey = toKey(today);
  habit.completions = (habit.completions || []).filter((key) => key !== todayKey);
  recalculateStreak(habit, today);
  return { status: 'undone', message: 'Rueckgaengig gemacht', streak: habit.streak };
}

/**
 * Streak komplett aus der Completion-Historie ableiten.
 * Wird nach einem Undo und beim Laden der App gebraucht, damit verpasste Tage
 * den Streak auch dann brechen, wenn die App zwischendurch nicht offen war.
 */
function recalculateStreak(habit, today = new Date()) {
  const days = scheduledDays(habit.repetition);
  const completions = new Set(habit.completions || []);
  const skips = new Set(habit.skips || []);

  habit.lastCompleted = habit.completions && habit.completions.length
    ? habit.completions[habit.completions.length - 1]
    : null;

  if (days.size === 0) {
    habit.streak = 0;
    return 0;
  }

  // Startpunkt: der letzte geplante Tag, der nicht in der Zukunft liegt.
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (!days.has(weekday(cursor))) cursor = addDays(cursor, -1);

  // Heute darf noch offen sein, ohne den Streak zu brechen.
  if (!completions.has(toKey(cursor))) {
    const previous = previousScheduledDay(cursor, days, habit.skips);
    if (!previous) {
      habit.streak = 0;
      return 0;
    }
    cursor = previous;
  }

  let streak = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const key = toKey(cursor);
    if (completions.has(key)) {
      streak++;
    } else if (!skips.has(key)) {
      break;
    }
    const previous = previousScheduledDay(cursor, days, habit.skips);
    if (!previous) break;
    cursor = previous;
  }

  habit.streak = streak;
  habit.longestStreak = Math.max(habit.longestStreak || 0, streak);
  return streak;
}

/**
 * Konsistenz in Prozent: erledigte geplante Tage der letzten `windowDays` Tage.
 */
function consistency(habits, today = new Date(), windowDays = 30) {
  let planned = 0;
  let done = 0;

  for (const habit of habits) {
    const days = scheduledDays(habit.repetition);
    const completions = new Set(habit.completions || []);
    const skips = new Set(habit.skips || []);
    const created = habit.createdAt ? fromKey(habit.createdAt) : null;

    for (let i = 0; i < windowDays; i++) {
      const d = addDays(today, -i);
      if (!days.has(weekday(d))) continue;
      if (created && d < created) continue;
      const key = toKey(d);
      if (skips.has(key)) continue;
      planned++;
      if (completions.has(key)) done++;
    }
  }

  if (planned === 0) return 0;
  return Math.round((done / planned) * 100);
}

/** Ist der Habit heute faellig? */
function isDueToday(habit, today = new Date()) {
  return scheduledDays(habit.repetition).has(weekday(today));
}

/** Heute abgehakt? */
function isDoneToday(habit, today = new Date()) {
  return (habit.completions || []).includes(toKey(today));
}

// Export fuer die Tests (Node) und fuer den Browser (globaler Namespace).
const Streak = {
  DAY_NAMES,
  DAY_LABELS_DE,
  toKey,
  fromKey,
  weekday,
  addDays,
  scheduledDays,
  daysToRepetition,
  previousScheduledDay,
  completeHabit,
  uncompleteHabit,
  recalculateStreak,
  consistency,
  isDueToday,
  isDoneToday,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Streak;
if (typeof window !== 'undefined') window.Streak = Streak;
