/* =============================================================================
 * tests.js — Unit-Tests fuer den Streak-Algorithmus
 * -----------------------------------------------------------------------------
 * Winziges eigenes Test-Framework, damit die Tests ohne Installation im
 * Browser laufen (tests.html oeffnen) oder im Terminal mit `node js/tests.js`.
 * ========================================================================== */

const S = typeof require !== 'undefined' && typeof window === 'undefined'
  ? require('./streak.js')
  : window.Streak;

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, message: error.message });
  }
}

function assertEqual(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} erwartet ${e}, war ${a}`);
}

function assertTrue(value, label = '') {
  if (!value) throw new Error(`${label} erwartet true, war ${value}`);
}

/** Hilfsfunktion: Habit-Objekt fuer Tests bauen. */
function makeHabit(repetition, completions = [], extra = {}) {
  return {
    name: 'Test',
    repetition,
    completions: [...completions].sort(),
    skips: [],
    streak: 0,
    longestStreak: 0,
    lastCompleted: completions.length ? completions[completions.length - 1] : null,
    ...extra,
  };
}

const d = (year, month, day) => new Date(year, month - 1, day);

/* --------------------------------------------------- scheduledDays parsen */

test('scheduledDays: "Daily" ergibt alle sieben Tage', () => {
  assertEqual([...S.scheduledDays('Daily')].sort(), [0, 1, 2, 3, 4, 5, 6]);
});

test('scheduledDays: Liste "Mon, Wed, Fri"', () => {
  assertEqual([...S.scheduledDays('Mon, Wed, Fri')].sort(), [0, 2, 4]);
});

test('scheduledDays: Bereich "Mon-Fri"', () => {
  assertEqual([...S.scheduledDays('Mon-Fri')].sort(), [0, 1, 2, 3, 4]);
});

test('scheduledDays: Gedankenstrich "Mon–Fri" wird akzeptiert', () => {
  assertEqual([...S.scheduledDays('Mon–Fri')].sort(), [0, 1, 2, 3, 4]);
});

test('daysToRepetition: Umkehrfunktion zu scheduledDays', () => {
  assertEqual(S.daysToRepetition(new Set([0, 1, 2, 3, 4, 5, 6])), 'Daily');
  assertEqual(S.daysToRepetition(new Set([0, 1, 2, 3, 4])), 'Mon-Fri');
  assertEqual(S.daysToRepetition(new Set([0, 2, 4])), 'Mon, Wed, Fri');
});

/* ----------------------------------------------- previousScheduledDay */

test('previousScheduledDay: Mo/Mi/Fr — vor Mittwoch liegt Montag', () => {
  const previous = S.previousScheduledDay(d(2026, 9, 30), S.scheduledDays('Mon, Wed, Fri'));
  assertEqual(S.toKey(previous), '2026-09-28');
});

test('previousScheduledDay: taeglich — vor dem 1. liegt der Vortag', () => {
  const previous = S.previousScheduledDay(d(2026, 10, 1), S.scheduledDays('Daily'));
  assertEqual(S.toKey(previous), '2026-09-30');
});

test('previousScheduledDay: pausierte Tage werden uebersprungen', () => {
  const previous = S.previousScheduledDay(d(2026, 10, 7), S.scheduledDays('Daily'), ['2026-10-06']);
  assertEqual(S.toKey(previous), '2026-10-05');
});

/* ------------------------------------------------------- completeHabit */

test('completeHabit: erster Abschluss startet den Streak bei 1', () => {
  const habit = makeHabit('Daily');
  const result = S.completeHabit(habit, d(2026, 10, 7));
  assertEqual(result.status, 'completed');
  assertEqual(habit.streak, 1);
  assertEqual(habit.lastCompleted, '2026-10-07');
});

test('completeHabit: lueckenloser Vortag erhoeht den Streak', () => {
  const habit = makeHabit('Daily', ['2026-10-06'], { streak: 4 });
  S.completeHabit(habit, d(2026, 10, 7));
  assertEqual(habit.streak, 5);
});

test('completeHabit: verpasster Tag setzt den Streak auf 1 zurueck', () => {
  const habit = makeHabit('Daily', ['2026-10-05'], { streak: 12 });
  S.completeHabit(habit, d(2026, 10, 7)); // der 6. fehlt
  assertEqual(habit.streak, 1);
});

test('completeHabit: zweimal am selben Tag zaehlt nur einmal', () => {
  const habit = makeHabit('Daily', ['2026-10-06'], { streak: 4 });
  S.completeHabit(habit, d(2026, 10, 7));
  const second = S.completeHabit(habit, d(2026, 10, 7));
  assertEqual(second.status, 'already-done');
  assertEqual(habit.streak, 5, 'Streak darf sich nicht verdoppeln');
});

test('completeHabit: an einem nicht geplanten Tag passiert nichts', () => {
  const habit = makeHabit('Mon, Wed, Fri', [], { streak: 3 });
  const result = S.completeHabit(habit, d(2026, 10, 6)); // Dienstag
  assertEqual(result.status, 'not-scheduled');
  assertEqual(habit.streak, 3);
  assertEqual(habit.completions, []);
});

test('completeHabit: Mo/Mi/Fr — Dienstag ist keine Luecke (Kernfall der Abgabe)', () => {
  // Ben war am Montag (28.09.) im Gym, haekelt am Mittwoch (30.09.) ab.
  const habit = makeHabit('Mon, Wed, Fri', ['2026-09-28'], { streak: 6 });
  const result = S.completeHabit(habit, d(2026, 9, 30));
  assertEqual(habit.streak, 7, 'Streak');
  assertEqual(result.message, 'Streak ist jetzt 7');
});

test('completeHabit: longestStreak merkt sich den Rekord', () => {
  const habit = makeHabit('Daily', ['2026-10-06'], { streak: 9, longestStreak: 9 });
  S.completeHabit(habit, d(2026, 10, 7));
  assertEqual(habit.longestStreak, 10);
});

/* ------------------------------------------- uncompleteHabit / Undo */

test('uncompleteHabit: Undo entfernt den heutigen Eintrag', () => {
  // Ausgangslage: zwei Tage in Folge erledigt, der Streak steht also auf 2.
  const habit = makeHabit('Daily', ['2026-10-05', '2026-10-06'], { streak: 2 });
  S.completeHabit(habit, d(2026, 10, 7));
  assertEqual(habit.streak, 3);
  S.uncompleteHabit(habit, d(2026, 10, 7));
  assertEqual(habit.completions.includes('2026-10-07'), false);
  assertEqual(habit.streak, 2, 'Streak nach Undo');
});

/* ------------------------------------------------- recalculateStreak */

test('recalculateStreak: zaehlt eine lueckenlose Kette rueckwaerts', () => {
  const habit = makeHabit('Daily', ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
  assertEqual(S.recalculateStreak(habit, d(2026, 10, 7)), 5);
});

test('recalculateStreak: heute noch offen bricht den Streak nicht', () => {
  const habit = makeHabit('Daily', ['2026-10-05', '2026-10-06']);
  assertEqual(S.recalculateStreak(habit, d(2026, 10, 7)), 2);
});

test('recalculateStreak: ein verpasster Tag beendet die Kette', () => {
  const habit = makeHabit('Daily', ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06']);
  assertEqual(S.recalculateStreak(habit, d(2026, 10, 7)), 2);
});

test('recalculateStreak: pausierter Tag erhaelt den Streak (Skip Day)', () => {
  const habit = makeHabit('Daily', ['2026-10-04', '2026-10-05', '2026-10-07'], { skips: ['2026-10-06'] });
  assertEqual(S.recalculateStreak(habit, d(2026, 10, 7)), 3);
});

test('recalculateStreak: ohne Abschluesse ist der Streak 0', () => {
  const habit = makeHabit('Daily');
  assertEqual(S.recalculateStreak(habit, d(2026, 10, 7)), 0);
});

/* ------------------------------------------------------- consistency */

test('consistency: alle geplanten Tage erledigt ergibt 100 %', () => {
  const completions = [];
  for (let i = 0; i < 7; i++) completions.push(S.toKey(S.addDays(d(2026, 10, 7), -i)));
  const habit = makeHabit('Daily', completions, { createdAt: '2026-09-01' });
  assertEqual(S.consistency([habit], d(2026, 10, 7), 7), 100);
});

test('consistency: die Haelfte erledigt ergibt rund 50 %', () => {
  const completions = ['2026-10-07', '2026-10-05', '2026-10-03', '2026-10-01'];
  const habit = makeHabit('Daily', completions, { createdAt: '2026-09-01' });
  const value = S.consistency([habit], d(2026, 10, 7), 8);
  assertTrue(value >= 45 && value <= 55, `Konsistenz ${value} sollte nahe 50 liegen`);
});

test('consistency: ohne Habits ist das Ergebnis 0 und kein Fehler', () => {
  assertEqual(S.consistency([], d(2026, 10, 7), 30), 0);
});

/* ---------------------------------------------------- Datumsfunktionen */

test('toKey/fromKey: Hin- und Rueckwandlung bleibt stabil', () => {
  assertEqual(S.toKey(S.fromKey('2026-02-29')), '2026-03-01'); // 2026 ist kein Schaltjahr
  assertEqual(S.toKey(S.fromKey('2026-10-07')), '2026-10-07');
});

test('weekday: Montag ist 0, Sonntag ist 6', () => {
  assertEqual(S.weekday(d(2026, 10, 5)), 0);
  assertEqual(S.weekday(d(2026, 10, 11)), 6);
});

test('addDays: rechnet ueber Monatsgrenzen korrekt', () => {
  assertEqual(S.toKey(S.addDays(d(2026, 10, 1), -1)), '2026-09-30');
  assertEqual(S.toKey(S.addDays(d(2026, 12, 31), 1)), '2027-01-01');
});

/* ------------------------------------------------------------- Ausgabe */

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;

if (typeof document !== 'undefined') {
  const list = document.querySelector('#results');
  results.forEach((result) => {
    const row = document.createElement('li');
    row.className = result.passed ? 'pass' : 'fail';
    row.innerHTML = `<span class="mark">${result.passed ? '✓' : '✗'}</span>
      <span>${result.name}${result.message ? `<small>${result.message}</small>` : ''}</span>`;
    list.appendChild(row);
  });
  document.querySelector('#summary').textContent =
    `${passed} von ${results.length} Tests bestanden${failed ? ` · ${failed} fehlgeschlagen` : ''}`;
  document.querySelector('#summary').className = failed ? 'summary fail' : 'summary pass';
} else {
  results.forEach((r) => console.log(`${r.passed ? '✓' : '✗'} ${r.name}${r.message ? ` — ${r.message}` : ''}`));
  console.log(`\n${passed}/${results.length} Tests bestanden.`);
  if (failed) process.exitCode = 1;
}
