/* =============================================================================
 * app.js — Praesentationsschicht
 * -----------------------------------------------------------------------------
 * Verbindet die Oberflaeche mit Store (Daten) und Streak (Logik).
 * Enthaelt selbst keine Geschaeftsregeln.
 * ========================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  view: 'dashboard',
  categoryFilter: 'all',
  search: '',
  editor: { days: new Set([0, 1, 2, 3, 4, 5, 6]), icon: '🎯', category: 'nutrition', reminder: 15 },
  undo: null,
  notifiedKeys: new Set(),
};

const QUOTES = [
  'Kleine Erfolge summieren sich leise zu großen Veränderungen.',
  'Du steigst nicht auf das Niveau deiner Ziele, sondern fällst auf das Niveau deiner Systeme.',
  'Jeden Tag ein Prozent besser ist nach einem Jahr das 37-Fache.',
  'Verpasse nie zweimal hintereinander.',
  'Die Gewohnheit ist der Autopilot deiner Zukunft.',
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'Keine' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 Std' },
  { value: 120, label: '2 Std' },
];

/* ------------------------------------------------------------------- Audio */

let audioContext = null;

/** Kurzes "Pling" als Bestaetigung (FR-2.3). */
function playPling() {
  if (!Store.getSettings().sound) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012 + index * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38 + index * 0.05);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now + index * 0.05);
      osc.stop(now + 0.5 + index * 0.05);
    });
  } catch (error) {
    /* Ton ist optional — Fehler bewusst ignorieren. */
  }
}

/** Haptisches Feedback, sofern das Geraet es unterstuetzt. */
function vibrate(pattern = 12) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/* ---------------------------------------------------------------- Snackbar */

let snackbarTimer = null;

function showSnackbar(text, onUndo) {
  const bar = $('#snackbar');
  $('#snackbar-text').textContent = text;
  $('#snackbar-action').hidden = !onUndo;
  state.undo = onUndo || null;
  bar.hidden = false;
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => { bar.hidden = true; state.undo = null; }, 5000);
}

/**
 * Bestaetigungsdialog als Promise. Ersetzt window.confirm(), das in
 * eingebetteten Seiten blockiert ist und dort immer false liefern wuerde.
 */
function askConfirm(message, confirmLabel = 'Bestätigen') {
  return new Promise((resolve) => {
    const backdrop = $('#confirm-backdrop');
    const yes = $('#confirm-yes');
    const no = $('#confirm-no');
    $('#confirm-text').textContent = message;
    yes.textContent = confirmLabel;
    backdrop.hidden = false;
    yes.focus();

    const close = (value) => {
      backdrop.hidden = true;
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      backdrop.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    const onBackdrop = (event) => { if (event.target === backdrop) close(false); };
    const onKey = (event) => { if (event.key === 'Escape') close(false); };

    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

$('#snackbar-action').addEventListener('click', () => {
  if (state.undo) state.undo();
  $('#snackbar').hidden = true;
  state.undo = null;
});

/* -------------------------------------------------------------- Formatter */

function formatDate(date) {
  return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function repetitionLabel(repetition) {
  if (repetition === 'Daily') return 'Täglich';
  if (repetition === 'Mon-Fri') return 'Mo–Fr';
  const days = [...Streak.scheduledDays(repetition)].sort((a, b) => a - b);
  if (days.length === 2 && days[0] === 5 && days[1] === 6) return 'Wochenende';
  return days.map((d) => Streak.DAY_LABELS_DE[d]).join(', ');
}

function reminderLabel(minutes) {
  const option = REMINDER_OPTIONS.find((o) => o.value === Number(minutes));
  return option && option.value ? `${option.label} vorher` : null;
}

/* ------------------------------------------------------------------- Theme */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  const checkbox = $('#setting-theme');
  if (checkbox) checkbox.checked = theme === 'dark';
}

function toggleTheme() {
  const next = Store.getSettings().theme === 'dark' ? 'light' : 'dark';
  Store.updateSettings({ theme: next });
  applyTheme(next);
}

/* ------------------------------------------------------- Habit-Karte bauen */

function habitCard(habit, { showCheck = true, today = new Date() } = {}) {
  const category = Store.categoryById(habit.category);
  const done = Streak.isDoneToday(habit, today);
  const due = Streak.isDueToday(habit, today);

  const element = document.createElement('article');
  element.className = `habit${done ? ' is-done' : ''}`;
  element.dataset.id = habit.id;

  const meta = [];
  if (habit.time) meta.push(`🕗 ${habit.time}`);
  const reminder = reminderLabel(habit.reminder);
  if (reminder) meta.push(`🔔 ${reminder}`);
  if (habit.duration) meta.push(`⏱ ${habit.duration} min`);
  if (habit.target) meta.push(`🎯 ${habit.target} ${habit.unit || ''}`.trim());

  element.innerHTML = `
    ${showCheck ? `<button class="check${done ? ' is-checked' : ''}" data-action="toggle"
        aria-label="${done ? 'Abhaken rückgängig machen' : 'Als erledigt markieren'}"
        aria-pressed="${done}" ${due ? '' : 'disabled title="Heute nicht geplant"'}>✓</button>` : ''}
    <div class="habit-body">
      <p class="habit-name">${habit.icon || category.icon} ${escapeHtml(habit.name)}</p>
      <div class="habit-meta">
        <span class="tag cat">${category.label}</span>
        ${habit.streak > 0 ? `<span class="tag streak">🔥 ${habit.streak} ${habit.streak === 1 ? 'Tag' : 'Tage'}</span>` : ''}
        <span class="tag">${repetitionLabel(habit.repetition)}</span>
        ${meta.map((m) => `<span>${m}</span>`).join('')}
      </div>
      ${habit.notes ? `<p class="habit-meta"><span>📝 ${escapeHtml(habit.notes)}</span></p>` : ''}
    </div>
    <div class="habit-actions">
      <button class="mini-btn" data-action="skip" title="Heute pausieren, ohne den Streak zu verlieren">⏸</button>
      <button class="mini-btn" data-action="edit" title="Bearbeiten">✏️</button>
    </div>`;

  return element;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

/* ---------------------------------------------------------------- Dashboard */

function renderDashboard() {
  const today = new Date();
  const habits = Store.getHabits();

  $('#today-title').textContent = `Heute, ${formatDate(today)}`;
  $('#quote-text').textContent = QUOTES[today.getDate() % QUOTES.length];

  // Wochenleiste: Montag bis Sonntag der aktuellen Woche
  const strip = $('#week-strip');
  strip.innerHTML = '';
  const monday = Streak.addDays(today, -Streak.weekday(today));
  for (let i = 0; i < 7; i++) {
    const day = Streak.addDays(monday, i);
    const key = Streak.toKey(day);
    const planned = habits.filter((h) => Streak.scheduledDays(h.repetition).has(Streak.weekday(day)));
    const completed = planned.filter((h) => (h.completions || []).includes(key));
    const isToday = key === Streak.toKey(today);

    const cell = document.createElement('div');
    cell.className = `week-day${isToday ? ' is-today' : ''}`;
    cell.innerHTML = `<small>${Streak.DAY_LABELS_DE[i]}</small><b>${day.getDate()}</b>
      <span class="dot${planned.length && completed.length === planned.length ? ' filled' : ''}"></span>`;
    strip.appendChild(cell);
  }

  // Heute faellige Habits
  const due = habits.filter((h) => Streak.isDueToday(h, today) && !(h.skips || []).includes(Streak.toKey(today)));
  const done = due.filter((h) => Streak.isDoneToday(h, today));
  const open = due.filter((h) => !Streak.isDoneToday(h, today));

  const plural = (n) => `${n} ${n === 1 ? 'Habit' : 'Habits'}`;
  $('#count-done').textContent = plural(done.length);
  $('#count-todo').textContent = plural(open.length);
  $('#today-total').textContent = due.length;
  $('#done-count-pill').textContent = done.length;
  $('#done-section').hidden = done.length === 0;

  // Fortschrittsring
  const ratio = due.length ? done.length / due.length : 0;
  const circumference = 2 * Math.PI * 52;
  $('#ring-fill').style.strokeDashoffset = String(circumference * (1 - ratio));
  // Bei 0 % wuerde die runde Linienkappe sonst als einzelner Punkt stehen bleiben.
  $('#ring-fill').style.opacity = ratio > 0 ? '1' : '0';
  $('#ring-label').textContent = `${done.length}/${due.length}`;

  // Momentum
  $('#consistency-value').textContent = Streak.consistency(habits, today, 30);
  $('#best-streak').textContent = habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);

  // Listen
  const openList = $('#today-open');
  openList.innerHTML = '';
  if (open.length === 0) {
    openList.innerHTML = due.length
      ? '<div class="card" style="text-align:center">🎉 Alles erledigt für heute. Stark!</div>'
      : '<div class="card" style="text-align:center">Für heute ist nichts geplant.</div>';
  } else {
    open.forEach((habit) => openList.appendChild(habitCard(habit, { today })));
  }

  const doneList = $('#today-done');
  doneList.innerHTML = '';
  done.forEach((habit) => doneList.appendChild(habitCard(habit, { today })));

  renderHeatmap(habits, today);
}

function renderHeatmap(habits, today) {
  const container = $('#heatmap');
  container.innerHTML = '';
  // Raster auf Montag ausrichten, dann 12 Wochen zurueck
  const end = Streak.addDays(today, 6 - Streak.weekday(today));
  const start = Streak.addDays(end, -(12 * 7 - 1));

  for (let i = 0; i < 12 * 7; i++) {
    const day = Streak.addDays(start, i);
    const key = Streak.toKey(day);
    const planned = habits.filter((h) => Streak.scheduledDays(h.repetition).has(Streak.weekday(day)));
    const completed = planned.filter((h) => (h.completions || []).includes(key));
    const ratio = planned.length ? completed.length / planned.length : 0;

    let level = 0;
    if (ratio > 0) level = 1;
    if (ratio >= 0.35) level = 2;
    if (ratio >= 0.65) level = 3;
    if (ratio >= 0.95) level = 4;
    if (day > today) level = 0;

    const cell = document.createElement('i');
    cell.className = `hm-cell level-${level}`;
    cell.title = `${day.toLocaleDateString('de-DE')}: ${completed.length}/${planned.length} erledigt`;
    container.appendChild(cell);
  }
}

/* ------------------------------------------------------------- Habits-Seite */

function renderCategoryChips() {
  const container = $('#category-chips');
  container.innerHTML = '';
  const all = [{ id: 'all', label: 'Alle', icon: '∞' }, ...Store.CATEGORIES];

  all.forEach((category) => {
    const chip = document.createElement('button');
    chip.className = `chip${state.categoryFilter === category.id ? ' is-active' : ''}`;
    chip.textContent = `${category.icon} ${category.label}`;
    chip.addEventListener('click', () => {
      state.categoryFilter = category.id;
      renderCategoryChips();
      renderHabits();
    });
    container.appendChild(chip);
  });
}

function renderHabits() {
  const today = new Date();
  const container = $('#habit-groups');
  container.innerHTML = '';

  const search = state.search.trim().toLowerCase();
  const filtered = Store.getHabits().filter((habit) => {
    const matchesCategory = state.categoryFilter === 'all' || habit.category === state.categoryFilter;
    const matchesSearch = !search
      || habit.name.toLowerCase().includes(search)
      || (habit.notes || '').toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });

  $('#habits-empty').hidden = filtered.length > 0;

  Store.CATEGORIES.forEach((category) => {
    const group = filtered.filter((h) => h.category === category.id);
    if (group.length === 0) return;

    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML = `<i class="group-dot" style="background:${category.color}"></i>
      ${category.label} <span class="pill">${group.length}</span>`;
    container.appendChild(head);

    group
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .forEach((habit) => container.appendChild(habitCard(habit, { today })));
  });
}

/* ---------------------------------------------------------------- Konto */

function renderAccount() {
  const user = Store.currentUser();
  if (!user) return;
  const habits = Store.getHabits();

  const initials = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  $('#profile-initials').textContent = initials || '··';
  $('#profile-name').textContent = user.name;
  $('#profile-email').textContent = user.email;
  $('#profile-birthday').textContent = user.birthday
    ? `Geburtstag: ${new Date(user.birthday).toLocaleDateString('de-DE')}`
    : '';

  $('#stat-habits').textContent = habits.length;
  $('#stat-completions').textContent = habits.reduce((sum, h) => sum + (h.completions || []).length, 0);
  $('#stat-longest').textContent = habits.reduce((max, h) => Math.max(max, h.longestStreak || 0), 0);
  $('#stat-consistency').textContent = `${Streak.consistency(habits, new Date(), 30)}%`;

  $('#setting-sound').checked = Store.getSettings().sound;
  $('#setting-theme').checked = Store.getSettings().theme === 'dark';
  $('#setting-notifications').checked =
    'Notification' in window && Notification.permission === 'granted' && Store.getSettings().notifications !== false;
}

/* -------------------------------------------------------------- Navigation */

function navigate(view) {
  state.view = view;
  $$('.view').forEach((section) => { section.hidden = section.id !== `view-${view}`; });
  $$('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.nav === view));
  $('#view-label').textContent = { dashboard: 'Dashboard', habits: 'Habits', account: 'Konto' }[view];
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

function render() {
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'habits') { renderCategoryChips(); renderHabits(); }
  if (state.view === 'account') renderAccount();
}

/* ---------------------------------------------------- Interaktion: Abhaken */

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('.habit');
  if (!card) return;

  const habit = Store.getHabits().find((h) => h.id === card.dataset.id);
  if (!habit) return;

  if (button.dataset.action === 'edit') return openEditor(habit);
  if (button.dataset.action === 'skip') return skipToday(habit);
  if (button.dataset.action === 'toggle') return toggleHabit(habit, card);
});

function toggleHabit(habit, card) {
  const today = new Date();

  if (Streak.isDoneToday(habit, today)) {
    Streak.uncompleteHabit(habit, today);
    Store.saveHabits();
    render();
    return;
  }

  const result = Streak.completeHabit(habit, today);
  if (result.status !== 'completed') {
    showSnackbar(result.message);
    return;
  }

  Store.saveHabits();
  playPling();
  vibrate();

  // Karte sanft ausblenden, dann neu rendern (FR-2.3)
  card.querySelector('.check').classList.add('is-checked');
  card.classList.add('is-leaving');
  setTimeout(() => {
    render();
    showSnackbar(`✓ ${habit.name} · ${result.message}`, () => {
      Streak.uncompleteHabit(habit, new Date());
      Store.saveHabits();
      render();
    });
  }, 320);
}

function skipToday(habit) {
  const key = Streak.toKey(new Date());
  const skips = new Set(habit.skips || []);
  const wasSkipped = skips.has(key);

  if (wasSkipped) skips.delete(key); else skips.add(key);
  habit.skips = [...skips];
  Streak.recalculateStreak(habit, new Date());
  Store.saveHabits();
  render();

  showSnackbar(wasSkipped ? 'Pause aufgehoben' : `${habit.name} heute pausiert — Streak bleibt erhalten`);
}

/* ------------------------------------------------------------------ Editor */

function buildEditorControls() {
  const categories = $('#editor-categories');
  categories.innerHTML = '';
  Store.CATEGORIES.forEach((category) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${state.editor.category === category.id ? ' is-active' : ''}`;
    chip.textContent = `${category.icon} ${category.label}`;
    chip.addEventListener('click', () => { state.editor.category = category.id; buildEditorControls(); });
    categories.appendChild(chip);
  });

  const icons = $('#editor-icons');
  icons.innerHTML = '';
  Store.ICONS.forEach((icon) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `icon-option${state.editor.icon === icon ? ' is-active' : ''}`;
    option.textContent = icon;
    option.addEventListener('click', () => { state.editor.icon = icon; buildEditorControls(); });
    icons.appendChild(option);
  });

  const reminders = $('#editor-reminders');
  reminders.innerHTML = '';
  REMINDER_OPTIONS.forEach((option) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${state.editor.reminder === option.value ? ' is-active' : ''}`;
    chip.textContent = option.label;
    chip.addEventListener('click', () => { state.editor.reminder = option.value; buildEditorControls(); });
    reminders.appendChild(chip);
  });

  const presets = $('#editor-presets');
  presets.innerHTML = '';
  const presetList = [
    { label: 'Täglich', days: [0, 1, 2, 3, 4, 5, 6] },
    { label: 'Mo–Fr', days: [0, 1, 2, 3, 4] },
    { label: 'Wochenende', days: [5, 6] },
  ];
  presetList.forEach((preset) => {
    const active = preset.days.length === state.editor.days.size
      && preset.days.every((d) => state.editor.days.has(d));
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${active ? ' is-active' : ''}`;
    chip.textContent = preset.label;
    chip.addEventListener('click', () => { state.editor.days = new Set(preset.days); buildEditorControls(); });
    presets.appendChild(chip);
  });

  const dayRow = $('#editor-days');
  dayRow.innerHTML = '';
  Streak.DAY_LABELS_DE.forEach((label, index) => {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `day-toggle${state.editor.days.has(index) ? ' is-active' : ''}`;
    toggle.textContent = label;
    toggle.addEventListener('click', () => {
      if (state.editor.days.has(index)) state.editor.days.delete(index);
      else state.editor.days.add(index);
      buildEditorControls();
    });
    dayRow.appendChild(toggle);
  });
}

function openEditor(habit = null) {
  const form = $('#habit-form');
  form.reset();
  $('#editor-error').hidden = true;

  if (habit) {
    $('#editor-title').textContent = 'Gewohnheit bearbeiten';
    form.id.value = habit.id;
    form.name.value = habit.name;
    form.time.value = habit.time || '08:00';
    form.duration.value = habit.duration || 15;
    form.target.value = habit.target || '';
    form.unit.value = habit.unit || '';
    form.notes.value = habit.notes || '';
    state.editor.category = habit.category;
    state.editor.icon = habit.icon || Store.categoryById(habit.category).icon;
    state.editor.reminder = Number(habit.reminder) || 0;
    state.editor.days = Streak.scheduledDays(habit.repetition);
    $('#editor-delete').hidden = false;
  } else {
    $('#editor-title').textContent = 'Neue Gewohnheit';
    form.id.value = '';
    state.editor = { days: new Set([0, 1, 2, 3, 4, 5, 6]), icon: '🎯', category: 'nutrition', reminder: 15 };
    $('#editor-delete').hidden = true;
  }

  buildEditorControls();
  $('#editor-backdrop').hidden = false;
  setTimeout(() => form.name.focus(), 120);
}

function closeEditor() {
  $('#editor-backdrop').hidden = true;
}

function saveEditor() {
  const form = $('#habit-form');
  const name = form.name.value.trim();
  const error = $('#editor-error');

  if (!name) {
    error.textContent = 'Bitte einen Namen für die Gewohnheit angeben.';
    error.hidden = false;
    return;
  }
  if (state.editor.days.size === 0) {
    error.textContent = 'Bitte mindestens einen Wochentag auswählen.';
    error.hidden = false;
    return;
  }

  const data = {
    name,
    category: state.editor.category,
    icon: state.editor.icon,
    repetition: Streak.daysToRepetition(state.editor.days),
    reminder: state.editor.reminder,
    time: form.time.value || null,
    duration: Number(form.duration.value) || null,
    target: Number(form.target.value) || null,
    unit: form.unit.value.trim(),
    notes: form.notes.value.trim(),
  };

  if (form.id.value) {
    Store.updateHabit(form.id.value, data);
    showSnackbar('Gewohnheit aktualisiert');
  } else {
    Store.addHabit(data);
    showSnackbar('Gewohnheit angelegt');
  }

  closeEditor();
  render();
}

$('#editor-save').addEventListener('click', saveEditor);
$('#habit-form').addEventListener('submit', (event) => { event.preventDefault(); saveEditor(); });
$('#editor-cancel').addEventListener('click', closeEditor);
$('#editor-backdrop').addEventListener('click', (event) => {
  if (event.target === $('#editor-backdrop')) closeEditor();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#editor-backdrop').hidden) closeEditor();
});

$('#editor-delete').addEventListener('click', async () => {
  const id = $('#habit-form').id.value;
  if (!id) return;
  const ok = await askConfirm('Diese Gewohnheit löschen? Der gesamte Verlauf geht dabei verloren.', 'Löschen');
  if (!ok) return;
  Store.deleteHabit(id);
  closeEditor();
  render();
  showSnackbar('Gewohnheit gelöscht');
});

$$('[data-open-editor]').forEach((button) => button.addEventListener('click', () => openEditor()));

/* ----------------------------------------------------------- Erinnerungen */

/**
 * Prueft einmal pro Minute, ob eine Erinnerung faellig ist.
 * Habits mit derselben Benachrichtigungszeit werden zusammengefasst (FR-3.2).
 */
function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (Store.getSettings().notifications === false) return;

  const now = new Date();
  const todayKey = Streak.toKey(now);
  const groups = new Map();

  Store.getHabits().forEach((habit) => {
    if (!habit.time || !habit.reminder) return;
    if (!Streak.isDueToday(habit, now) || Streak.isDoneToday(habit, now)) return;
    if ((habit.skips || []).includes(todayKey)) return;

    const [hours, minutes] = habit.time.split(':').map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    const fireAt = new Date(target.getTime() - habit.reminder * 60000);
    const delta = (now - fireAt) / 60000;
    if (delta < 0 || delta > 1) return; // nur im Minutenfenster ausloesen

    const slot = `${todayKey}-${fireAt.getHours()}:${fireAt.getMinutes()}`;
    if (state.notifiedKeys.has(slot)) return;
    if (!groups.has(slot)) groups.set(slot, []);
    groups.get(slot).push(habit);
  });

  groups.forEach((habits, slot) => {
    state.notifiedKeys.add(slot);
    const title = habits.length === 1 ? habits[0].name : `${habits.length} Gewohnheiten stehen an`;
    const body = habits.map((h) => `${h.icon} ${h.name} um ${h.time}`).join('\n');
    new Notification(`Habit Trackz · ${title}`, { body, tag: slot });
  });
}

setInterval(checkReminders, 30000);

/* ---------------------------------------------------- Einstellungen & Konto */

$('#theme-toggle').addEventListener('click', toggleTheme);
$('#account-btn').addEventListener('click', () => navigate('account'));
$$('.nav-item').forEach((item) => item.addEventListener('click', () => navigate(item.dataset.nav)));
$$('[data-nav]').forEach((element) => {
  if (element.classList.contains('nav-item')) return;
  element.addEventListener('click', () => navigate(element.dataset.nav));
});

$('#setting-theme').addEventListener('change', (event) => {
  const theme = event.target.checked ? 'dark' : 'light';
  Store.updateSettings({ theme });
  applyTheme(theme);
});

$('#setting-sound').addEventListener('change', (event) => {
  Store.updateSettings({ sound: event.target.checked });
  if (event.target.checked) playPling();
});

$('#setting-notifications').addEventListener('change', async (event) => {
  if (!('Notification' in window)) {
    event.target.checked = false;
    showSnackbar('Dieser Browser unterstützt keine Benachrichtigungen.');
    return;
  }
  if (event.target.checked) {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    event.target.checked = granted;
    Store.updateSettings({ notifications: granted });
    showSnackbar(granted ? 'Erinnerungen aktiviert' : 'Berechtigung wurde abgelehnt');
  } else {
    Store.updateSettings({ notifications: false });
  }
});

$('#habit-search').addEventListener('input', (event) => {
  state.search = event.target.value;
  renderHabits();
});

$('#export-data').addEventListener('click', async () => {
  const user = Store.currentUser();
  const payload = JSON.stringify({ user: user.name, habits: Store.getHabits() }, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    showSnackbar('Daten als JSON in die Zwischenablage kopiert');
  } catch (error) {
    // Fallback: Text markieren, damit manuell kopiert werden kann.
    const area = document.createElement('textarea');
    area.value = payload;
    area.style.cssText = 'position:fixed;inset:auto;opacity:0';
    document.body.appendChild(area);
    area.select();
    showSnackbar('Kopieren wurde blockiert — Text ist markiert, bitte Strg/Cmd + C drücken');
    setTimeout(() => area.remove(), 8000);
  }
});

$('#seed-data').addEventListener('click', async () => {
  const ok = await askConfirm('Alle bestehenden Gewohnheiten durch Demo-Daten ersetzen?', 'Ersetzen');
  if (!ok) return;
  Store.seedDemoData();
  render();
  showSnackbar('Demo-Daten geladen');
});

$('#logout-btn').addEventListener('click', () => {
  Store.logout();
  location.reload();
});

/* ---------------------------------------------------------------- Auth-UI */

$$('[data-auth-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.authTab;
    $$('[data-auth-tab]').forEach((t) => t.classList.toggle('is-active', t === tab));
    $('#login-form').hidden = target !== 'login';
    $('#register-form').hidden = target !== 'register';
    $('#login-error').hidden = true;
    $('#register-error').hidden = true;
  });
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const error = $('#login-error');
  const result = await Store.login(form.email.value, form.password.value);

  if (result.error) {
    error.textContent = result.error;
    error.hidden = false;
    return;
  }
  startApp();
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const error = $('#register-error');
  const result = await Store.register({
    name: form.name.value,
    email: form.email.value,
    birthday: form.birthday.value,
    password: form.password.value,
  });

  if (result.error) {
    error.textContent = result.error;
    error.hidden = false;
    return;
  }
  if (form.demo.checked) Store.seedDemoData();
  startApp();
});

$('#demo-login').addEventListener('click', async () => {
  const email = 'demo@habit-trackz.app';
  const password = 'demo1234';
  let result = await Store.login(email, password);
  if (result.error) {
    result = await Store.register({ name: 'Demo Nutzerin', email, birthday: '2003-05-14', password });
    if (result.error) {
      $('#login-error').textContent = result.error;
      $('#login-error').hidden = false;
      return;
    }
    Store.seedDemoData();
  }
  startApp();
});

/* ----------------------------------------------------------------- Startup */

function startApp() {
  // Streaks beim Start neu berechnen: verpasste Tage sollen auch dann zaehlen,
  // wenn die App zwischendurch nicht geoeffnet war.
  const today = new Date();
  Store.getHabits().forEach((habit) => Streak.recalculateStreak(habit, today));
  Store.saveHabits();

  $('#auth-screen').hidden = true;
  $('#app').hidden = false;
  navigate('dashboard');
}

function init() {
  applyTheme(Store.getSettings().theme);
  if (Store.currentUser()) startApp();
}

init();
