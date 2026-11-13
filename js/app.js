import { NUTRIENTS, NUTRIENT_MAP, formatAmount, scaleNutrients } from './nutrients.js';
import * as store from './store.js';
import { MEALS } from './store.js';
import { searchFoods, lookupBarcode } from './providers/index.js';
import { RESTAURANTS, getRestaurant } from './providers/restaurants/index.js';
import { startScanner } from './scanner.js';
import { analyze } from './swaps.js';
import { dayRows, foodFlags, foodStatus, LIMITS } from './watch.js';
import { menuAlternatives, isRestaurantFood } from './swaps-menu.js';
import * as groceryUI from './grocery-ui.js';
import * as sync from './sync.js';
import * as garmin from './garmin.js';
import * as recipeUI from './recipe-ui.js';
import { parseLabel, scoreReading } from './label.js';
import * as ocr from './ocr.js';
import * as targets from './targets.js';
import * as trends from './trends.js';
import * as theme from './theme.js';
import * as mealTargets from './meal-targets.js';
import * as mealsUI from './meals-ui.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (n) => Math.round(n || 0);

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
];

const ui = {
  date: store.todayKey(),
  view: 'today',
  addMeal: guessMeal(),
  addTab: 'search',
  microGroup: 'vitamin',
  trendDays: 7,
  restaurant: null,
  stopScan: null,
  searchAbort: null,
  foodCache: new Map(), // id → food, for list click handlers
};

function guessMeal() {
  const h = new Date().getHours();
  if (h < 10) return 'Breakfast';
  if (h < 15) return 'Lunch';
  if (h < 21) return 'Dinner';
  return 'Snacks';
}

/* ---------------- Toast ---------------- */
let toastTimer;
// `action` ({ label, run }) adds a button, e.g. Undo.
function toast(msg, action = null) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-act';
    b.textContent = action.label;
    b.onclick = () => {
      t.classList.remove('show');
      action.run();
    };
    t.append(' ', b);
  }
  t.classList.toggle('actionable', !!action);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2400);
}

/* ---------------- Navigation ---------------- */
function showView(view, section = '') {
  if (ui.view === 'recipes' && view === 'recipes') return recipeUI.home();
  if (view === 'settings') showSettingsSection(section);
  if (ui.view === 'recipes' && view !== 'recipes' && !recipeUI.canLeave()) return;
  ui.view = view;
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== view));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  if (view !== 'add') stopScanning();
  if (view === 'add') renderAddTab();
  if (view === 'trends') renderTrends();
  if (view === 'settings') renderSettings();
  if (view === 'recipes') recipeUI.render();
  if (view === 'groceries') groceryUI.render();
  document.querySelector('main').scrollTo({ top: 0 });
}

function setDate(key) {
  ui.date = key;
  renderDate();
  renderToday();
  if (ui.view === 'trends') renderTrends();
  garmin.refreshAround(key);
}

// Move one day back (-1) or forward (1). Today slides in from the right (from = 1) or the left (from = -1);
// arrows default to the side of the arrow, swipes follow the finger.
function stepDay(dir, from = dir) {
  setDate(store.shiftDate(ui.date, dir));
  const v = $('#view-today');
  v.classList.remove('day-next', 'day-prev');
  void v.offsetWidth; // restart the animation on quick repeats
  v.addEventListener('animationend', () => v.classList.remove('day-next', 'day-prev'), { once: true });
  v.classList.add(from > 0 ? 'day-next' : 'day-prev');
}

// On Today, swiping anywhere changes the day: right to left goes to the next day,
// left to right goes to the previous day. Touches that start on something that scrolls
// sideways, or on a form control, are left alone.
function initDaySwipe() {
  let start = null;
  const sideScroller = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.matches('input, textarea, select, [contenteditable]')) return true;
      if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  };
  document.addEventListener('touchstart', (e) => {
    start = null;
    if (e.touches.length !== 1 || ui.view !== 'today' || document.querySelector('dialog[open]')) return;
    if (sideScroller(e.target)) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dy > 30 && dy > Math.abs(dx)) start = null; // a scroll, not a swipe
    else if (Math.abs(dx) > 70 && Math.abs(dx) > dy * 1.5) {
      start = null;
      // Finger moving left = next day, moving right = previous day; the page follows the finger.
      stepDay(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
  document.addEventListener('touchend', () => (start = null), { passive: true });
  document.addEventListener('touchcancel', () => (start = null), { passive: true });
}

function renderDate() {
  const today = store.todayKey();
  let label;
  if (ui.date === today) label = 'Today';
  else if (ui.date === store.shiftDate(today, -1)) label = 'Yesterday';
  else if (ui.date === store.shiftDate(today, 1)) label = 'Tomorrow';
  else {
    const [y, m, d] = ui.date.split('-').map(Number);
    label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  $('#date-label').textContent = label;
}

/* ---------------- Today ---------------- */
function renderToday() {
  const { goals } = store.getState();
  const totals = store.totalsFor(ui.date);
  const eaten = totals.kcal || 0;
  const left = goals.kcal - eaten;

  $('#kcal-goal').textContent = round(goals.kcal).toLocaleString();
  $('#kcal-eaten').textContent = round(eaten).toLocaleString();
  $('#kcal-left').textContent = Math.abs(round(left)).toLocaleString();
  $('#kcal-left-label').textContent = left >= 0 ? 'kcal left' : 'kcal over';

  const circ = 2 * Math.PI * 52;
  const pct = goals.kcal > 0 ? Math.min(eaten / goals.kcal, 1) : 0;
  const ring = $('#ring-fill');
  ring.style.strokeDasharray = `${circ}`;
  ring.style.strokeDashoffset = `${circ * (1 - pct)}`;
  ring.classList.toggle('over', left < 0);
  renderGarminSync();

  $('#macro-bars').innerHTML = MACROS.map((m) => macroBar(m, totals[m.key] || 0, goals[m.key])).join('') + caffeineBar(totals.caffeine);

  const entries = store.entriesFor(ui.date);
  $('#meals').innerHTML = MEALS.map((meal) => {
    const list = entries.filter((e) => e.meal === meal);
    const kcal = list.reduce((s, e) => s + (e.nutrients.kcal || 0), 0);
    const settings = store.getState().settings;
    const target = mealTargets.enabled(settings) ? mealTargets.targetFor(meal, goals.kcal, settings) : 0;
    const ms = mealTargets.status(kcal, target, meal);
    const extra = mealsUI.cardExtras(meal, list);
    return `
      <div class="card meal">
        <div class="card-head"><h2>${meal}</h2><span class="meal-kcal">${round(kcal).toLocaleString()}${target ? ` / ${target.toLocaleString()}` : ''} kcal</span></div>
        ${ms ? `<div class="meal-target ${ms.state}"><div class="bar"><i style="width:${Math.min(ms.pct, 1) * 100}%"></i></div><small>${esc(ms.text)}</small></div>` : ''}
        ${list.length ? mealsUI.entriesHtml(list, (e) => entryRow(e, mealSum(list))) : extra.top || '<div class="empty">Nothing logged yet.</div>'}
        <div class="meal-btns"><button class="btn small add-to-meal" data-add-meal="${meal}">+ Add food</button>${extra.button}</div>
      </div>`;
  }).join('');

  renderWatch(totals, entries.length > 0);
  renderMicros(totals);
  renderBalance();
  renderWeight();
}

/* ---------------- Weight ---------------- */
const fmtWeight = (kg) => `${(Math.round(targets.kgToDisplay(kg) * 10) / 10).toLocaleString()} ${targets.weightUnit()}`;

function dayLabel(key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

function renderWeight() {
  const w = store.weightFor(ui.date);
  const last = w || store.latestWeight(ui.date);
  const card = $('#weight-card');
  if (w) {
    card.innerHTML = `<div class="w-main"><span class="muted small">Weight</span><b>${fmtWeight(w.kg)}</b>
      <span class="muted small">${w.source === 'garmin' ? 'from Garmin' : 'entered by you'}</span></div>
      <button class="btn ghost small" data-weight-edit>Edit</button>`;
  } else {
    card.innerHTML = `<div class="w-main"><span class="muted small">Weight</span>
      <span class="muted small">${last ? `last ${fmtWeight(last.kg)} on ${esc(dayLabel(last.date, { month: 'short', day: 'numeric' }))}` : 'not logged yet'}</span></div>
      <button class="btn small" data-weight-edit>+ Log weight</button>`;
  }
}

const weightDlg = { date: null };
function openWeight(date = ui.date) {
  weightDlg.date = date;
  const w = store.weightFor(date);
  const prev = w || store.latestWeight(date);
  const f = $('#weight-form').elements;
  $('#weight-label').textContent = `Weight (${targets.weightUnit()})`;
  f.weight.value = w ? (Math.round(targets.kgToDisplay(w.kg) * 10) / 10) : '';
  f.weight.placeholder = prev ? String(Math.round(targets.kgToDisplay(prev.kg) * 10) / 10) : '';
  $('#weight-date').textContent = dayLabel(date, { weekday: 'long', month: 'short', day: 'numeric' }) +
    (w?.source === 'garmin' ? ' · from Garmin. Garmin will replace a typed weight if it has one for this day.' : '');
  $('#weight-clear').hidden = !w;
  $('#weight-dialog').showModal();
  f.weight.focus();
}

/* ---------------- Energy balance ---------------- */
const fmt = (n) => round(n).toLocaleString();

function renderBalance() {
  const card = $('#balance-card');
  const bal = store.balanceFor(ui.date);
  const isToday = ui.date === store.todayKey();
  if (!bal) {
    const hint = garmin.hasKey()
      ? garmin.status.state === 'syncing' ? 'Getting calories burned from Garmin…' : 'No calories burned from Garmin for this day yet.'
      : 'Connect Garmin in Settings, or type in calories burned, to see your deficit or surplus.';
    card.innerHTML = `
      <div class="card-head"><h2>Deficit or surplus</h2></div>
      <div class="bal-empty"><p class="muted small">${esc(hint)}</p><button class="btn small" data-burn-edit>Add burned</button></div>`;
    return;
  }
  const surplus = bal.net > 0;
  const label = Math.abs(bal.net) < 1 ? 'balanced' : surplus ? 'surplus' : 'deficit';
  const src = { garmin: 'Garmin', manual: 'entered by you', health: 'Apple Health' }[bal.source] || bal.source;
  const restingNote = bal.restingFromGoal
    ? bal.resting ? `resting ${fmt(bal.resting)} from your goal` : 'no resting burn yet: set it in Settings → Daily goals'
    : `resting ${fmt(bal.resting)}`;
  card.innerHTML = `
    <div class="card-head"><h2>Deficit or surplus${isToday ? ' so far' : ''}</h2><button class="btn ghost small" data-burn-edit>Edit</button></div>
    <div class="bal-eq">
      <div><b>${fmt(bal.eaten)}</b><span>eaten</span></div>
      <div class="op">−</div>
      <div><b>${fmt(bal.burned)}</b><span>burned</span></div>
      <div class="op">=</div>
      <div class="net ${surplus ? 'surplus' : ''}"><b>${fmt(Math.abs(bal.net))}</b><span>kcal ${label}</span></div>
    </div>
    <div class="bal-split">Active ${fmt(bal.active)} + ${esc(restingNote)} · ${esc(src)}</div>`;
}

const burnDlg = { date: null };
function openBurn(date = ui.date) {
  burnDlg.date = date;
  const b = store.burnFor(date);
  const f = $('#burn-form').elements;
  f.active.value = b ? b.active : '';
  f.resting.value = b?.resting ?? '';
  const [y, m, d] = date.split('-').map(Number);
  $('#burn-date').textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) +
    (b?.source === 'garmin' ? ' · from Garmin. Saving here stops Garmin updating this day.' : '');
  $('#burn-clear').hidden = !b;
  $('#burn-dialog').showModal();
}

// Shown when something logged that day reports caffeine.
function caffeineBar(mg) {
  if (mg == null) return '';
  const limit = NUTRIENT_MAP.caffeine.dv;
  const pct = (mg / limit) * 100;
  return `
    <div class="macro-row caffeine-row">
      <div class="lbl"><span>Caffeine</span><b>${round(mg)} / ${limit} mg</b></div>
      <div class="bar"><i style="width:${Math.min(pct, 100)}%;background:var(--caffeine)" class="${pct > 100 ? 'over' : ''}"></i></div>
    </div>`;
}

function macroBar(m, value, goal) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  return `
    <div class="macro-row">
      <div class="lbl"><span>${m.label}</span><b>${round(value)} / ${round(goal)} g</b></div>
      <div class="bar"><i style="width:${Math.min(pct, 100)}%;background:${m.color}" class="${pct > 110 ? 'over' : ''}"></i></div>
    </div>`;
}

function unitText(entry) {
  const unit = entry.food.units[entry.unitIndex] || entry.food.units[0];
  const qty = +entry.qty.toFixed(2);
  if (unit.label === 'g') return `${qty} g`;
  return qty === 1 ? unit.label : `${qty} × ${unit.label}`;
}

// Product photo (Open Food Facts gives one for most packaged foods), or a
// lettered placeholder for foods without one.
const safeImage = (url) => (/^https:\/\/[^\s"'<>]+$/.test(url || '') ? url : '');
function thumb(food, cls = '') {
  const url = safeImage(food.image);
  const letter = esc((food.name || '?').trim().charAt(0).toUpperCase());
  return url
    ? `<span class="thumb ${cls}" data-letter="${letter}"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="thumb ${cls} none" data-letter="${letter}"></span>`;
}

const sumNutrients = (list) => list.reduce((t, e) => ({ kcal: t.kcal + (e.nutrients.kcal || 0), protein: t.protein + (e.nutrients.protein || 0), fiber: t.fiber + (e.nutrients.fiber || 0) }), { kcal: 0, protein: 0, fiber: 0 });
const mealSum = sumNutrients;

// Today so far (plus the food being looked at, if it isn't logged yet) against the goals.
function dayContext(extra = null) {
  const { goals } = store.getState();
  const t = store.totalsFor(ui.date);
  const add = (k) => (t[k] || 0) + (extra ? extra[k] || 0 : 0);
  return { kcal: add('kcal'), kcalGoal: goals.kcal, protein: add('protein'), proteinGoal: goals.protein, fiber: add('fiber'), fiberGoal: 28 };
}

function entryRow(e, meal) {
  return `
    <div class="entry" data-entry="${e.id}">
      ${thumb(e.food, 'sm')}
      <div class="info">
        <div class="name">${esc(e.food.name)}</div>
        <div class="sub">${esc(e.food.brand ? `${e.food.brand} · ` : '')}${esc(unitText(e))}</div>
      </div>
      ${analyze(e.food, e.nutrients, meal, null, e.meal).flagged ? `<button type="button" class="swap-ico" data-swap-entry="${e.id}" aria-label="Healthier ideas for ${esc(e.food.name)}" title="Healthier ideas"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-5 6-8 10-10"/></svg></button>` : ''}
      <div class="kcal">${round(e.nutrients.kcal)}</div>
    </div>`;
}

// Limits to stay under: red when over, amber when close, so the numbers that matter for
// eating healthier are the first thing seen after the calorie ring.
function renderWatch(totals, any) {
  const card = $('#watch-card');
  const rows = any ? dayRows(totals) : [];
  card.hidden = !rows.length;
  if (!rows.length) return;
  const bad = rows.filter((r) => r.status !== 'ok');
  const worst = rows.some((r) => r.status === 'over') ? 'over' : bad.length ? 'warn' : 'ok';
  const say = bad.length
    ? bad.map((r) => `${r.label.toLowerCase()} is at ${round(r.pct)}% of the daily limit`).join(', ')
    : 'All four are well under the daily limit so far.';
  card.className = `card watch ${worst}`;
  card.innerHTML = `
    <div class="card-head"><h2>Keep an eye on</h2><span class="muted small">stay under</span></div>
    <p class="watch-msg ${worst}">${esc(bad.length ? say.charAt(0).toUpperCase() + say.slice(1) + '.' : say)}</p>
    ${rows.map((r) => `
      <div class="watch-row ${r.status}">
        <div class="lbl"><span>${esc(r.label)}</span><b>${formatAmount(r.value, r.unit)} / ${r.limit.toLocaleString()} ${r.unit}</b></div>
        <div class="bar"><i style="width:${Math.min(r.pct, 100)}%"></i></div>
      </div>`).join('')}`;
}

const dayStatus2 = (pct) => (pct > 100 ? 'over' : pct >= 75 ? 'warn' : '');

function renderMicros(totals = store.totalsFor(ui.date)) {
  const list = NUTRIENTS.filter((n) => n.group === ui.microGroup);
  $('#micro-list').innerHTML = list.map((n) => {
    const v = totals[n.key];
    const pct = n.dv && v != null ? (v / n.dv) * 100 : null;
    const limitNutrient = ['sodium', 'satFat', 'addedSugar', 'cholesterol'].includes(n.key);
    const color = limitNutrient && pct > 100 ? 'var(--over)' : 'var(--accent)';
    return `
      <div class="micro-row">
        <span>${n.label}</span>
        <span class="amt">${v != null ? formatAmount(v, n.unit) : '–'}</span>
        <span class="pct ${limitNutrient && pct != null ? dayStatus2(pct) : ''}">${pct != null ? `${round(pct)}%` : ''}</span>
        <div class="bar"><i style="width:${Math.min(pct || 0, 100)}%;background:${limitNutrient && pct >= 75 && pct <= 100 ? 'var(--warn)' : color}"></i></div>
      </div>`;
  }).join('');
  $$('#micro-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.group === ui.microGroup));
}

/* ---------------- Food list rendering ---------------- */
function foodRow(food) {
  ui.foodCache.set(food.id, food);
  const unit = food.units[food.defaultUnit || 0];
  const kcal = (food.nutrients.kcal || 0) * unit.factor;
  const p = (food.nutrients.protein || 0) * unit.factor;
  const c = (food.nutrients.carbs || 0) * unit.factor;
  const f = (food.nutrients.fat || 0) * unit.factor;
  const sub = [food.brand && food.brand !== food.source ? food.brand : '', food.category || ''].filter(Boolean).join(' · ');
  return `
    <li data-food="${esc(food.id)}">
      ${thumb(food)}
      <div class="info">
        <div class="name">${esc(food.name)}</div>
        <div class="sub"><span class="tag">${esc(food.source)}</span>${esc(sub)}</div>
        <div class="sub">P ${round(p)}g · C ${round(c)}g · F ${round(f)}g</div>
      </div>
      <div class="kcal">${round(kcal)}<small>kcal / ${esc(shortUnit(unit.label))}</small></div>
    </li>`;
}

const shortUnit = (label) => (label.length > 18 ? label.replace(/\s*\(.*\)/, '') : label);

/* ---------------- Food dialog ---------------- */
const dlg = { food: null, editing: null, meal: 'Breakfast' };

function openFood(food, { entry = null, meal = ui.addMeal } = {}) {
  dlg.food = food;
  dlg.editing = entry;
  $('#fd-name').textContent = food.name;
  $('#fd-thumb').innerHTML = thumb(food, 'lg');
  $('#fd-note').textContent = food.note || '';
  $('#fd-meta').textContent = [food.brand, food.source, food.barcode ? `#${food.barcode}` : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  $('#fd-unit').innerHTML = food.units.map((u, i) => `<option value="${i}">${esc(u.label)}</option>`).join('');
  dlg.meal = entry?.meal || meal;
  renderDialogMeals();
  $('#fd-unit').value = String(entry ? entry.unitIndex : food.defaultUnit || 0);
  $('#fd-qty').value = entry ? +entry.qty.toFixed(2) : (food.units[food.defaultUnit || 0].label === 'g' ? 100 : 1);
  $('#fd-delete').hidden = !entry;
  $('#fd-save').textContent = entry ? 'Save changes' : 'Add to log';
  $('.fd-more').open = false;
  $('#fd-swaps').hidden = true;
  updateFoodPreview();
  $('#food-dialog').showModal();
}

const ideaButtons = (list, offset) => list.map((f, i) => `
    <button type="button" class="swap-item" data-swap="${offset + i}">
      <span><b>${esc(f.name)}</b><small>${esc(f.units[0].label)} · ${Math.round(f.nutrients.kcal)} kcal</small></span>
      <span class="swap-kcal swap-gain">${esc(f.gain.split(' · ').join('\n'))}</span></button>`).join('');
const joinWords = (w) => (w.length > 1 ? w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1] : w[0] || '');

// Ideas panel, in order: same-menu replacements, lighter swaps, then additions that round out the meal.
// `alts` are the like-for-like items from the same restaurant's menu (loaded separately).
const ideaList = (a, alts = []) => [...alts, ...a.swaps, ...a.adds];
function swapHtml(a, alts = [], food = null) {
  let html = '';
  const outside = food && isRestaurantFood(food);
  if (alts.length) html += `<p class="muted small">Same menu, a lighter pick next time:</p>${ideaButtons(alts, 0)}`;
  if (a.swaps.length || (a.concerns.length && !alts.length)) {
    const lead = a.concerns.length
      ? `This one leans on ${esc(joinWords(a.concerns))}.`
      : 'Big for what it gives you in protein and fiber.';
    const tail = a.swaps.length ? (outside ? ' Or skip the drive-through, something to make or order instead:' : ' Similar, but lighter:') : " I don't have a simple swap that cuts it much.";
    html += `<p class="muted small">${lead}${tail}</p>${ideaButtons(a.swaps, alts.length)}`;
  }
  if (a.adds.length) html += `<p class="muted small">${esc([...a.notes, a.gaps.length ? `Light on ${joinWords(a.gaps)}. Add one of these:` : 'Round it out:'].join(' '))}</p>${ideaButtons(a.adds, alts.length + a.swaps.length)}`;
  return html || '<p class="muted small">This looks fine as it is.</p>';
}

function renderSwaps(a, alts = []) {
  dlg.swaps = ideaList(a, alts);
  $('#fd-swaps').innerHTML = swapHtml(a, alts, dlg.food);
}

// From the Today list: ideas for something already logged, shown only when its icon is tapped.
const swapDlg = { swaps: [], meal: null };
async function openEntrySwaps(entry) {
  const a = analyze(entry.food, entry.nutrients, mealSum(store.entriesFor(ui.date).filter((x) => x.meal === entry.meal)), dayContext(), entry.meal);
  swapDlg.swaps = ideaList(a);
  swapDlg.meal = entry.meal;
  $('#sw-title').textContent = entry.food.name;
  $('#sw-body').innerHTML = swapHtml(a, [], entry.food);
  $('#swap-dialog').showModal();
  const alts = await menuAlternatives(entry.food, entry.food.nutrients);
  if (alts.length && swapDlg.meal === entry.meal && $('#sw-title').textContent === entry.food.name && $('#swap-dialog').open) {
    swapDlg.swaps = ideaList(a, alts);
    $('#sw-body').innerHTML = swapHtml(a, alts, entry.food);
  }
}

function dialogQty() {
  const q = parseFloat($('#fd-qty').value);
  return Number.isFinite(q) && q >= 0 ? q : 0;
}

function updateFoodPreview() {
  const food = dlg.food;
  if (!food) return;
  const unitIndex = +$('#fd-unit').value;
  const n = store.entryNutrients(food, unitIndex, dialogQty());
  $('#fd-kcal').textContent = round(n.kcal).toLocaleString();
  $('#fd-macros').innerHTML = MACROS.map((m) => `
    <div class="fd-macro" style="--c:${m.color}"><b>${formatAmount(n[m.key] || 0, 'g')}</b><span>${m.label}</span></div>`).join('');

  const limitKeys = new Set(LIMITS.map((l) => l.key));
  const flags = foodFlags(n);
  $('#fd-flags').hidden = !flags.length;
  $('#fd-flags').innerHTML = flags.map((f) => `<span class="fd-flag ${f.status}">${esc(f.label)} ${round(f.pct)}% of daily limit</span>`).join('');
  const groups = [['Details', 'detail'], ['Vitamins', 'vitamin'], ['Minerals', 'mineral'], ['Other', 'other']];
  let html = '';
  for (const [title, g] of groups) {
    const rows = NUTRIENTS.filter((x) => x.group === g && n[x.key] != null);
    if (!rows.length) continue;
    html += `<tr class="group"><td colspan="3">${title}</td></tr>`;
    html += rows.map((x) => `<tr class="${limitKeys.has(x.key) && x.dv ? 'fl-' + foodStatus((n[x.key] / x.dv) * 100) : ''}"><td>${x.label}</td><td>${formatAmount(n[x.key], x.unit)}</td><td>${x.dv ? `${round((n[x.key] / x.dv) * 100)}%` : ''}</td></tr>`).join('');
  }
  // The swap button only appears for heavier foods, and the ideas only show when asked for.
  const ideas = dlg.editing ? { flagged: false } : analyze(food, n, sumNutrients([...store.entriesFor(ui.date).filter((x) => x.meal === dlg.meal), { nutrients: n }]), dayContext(n), dlg.meal);
  $('#fd-swap-btn').hidden = !ideas.flagged;
  if (!ideas.flagged) $('#fd-swaps').hidden = true;
  if (!$('#fd-swaps').hidden) {
    renderSwaps(ideas, dlg.alts?.food === food ? dlg.alts.list : []);
    if (dlg.alts?.food !== food) {
      menuAlternatives(food, food.nutrients).then((list) => {
        dlg.alts = { food, list };
        if (dlg.food === food && !$('#fd-swaps').hidden && list.length) updateFoodPreview();
      });
    }
  }
  $('#fd-table').innerHTML = html || '<tr><td>No vitamin or mineral data for this food.</td></tr>';
}

function saveFromDialog() {
  const unitIndex = +$('#fd-unit').value;
  const qty = dialogQty();
  const meal = dlg.meal;
  if (qty <= 0) return toast('Enter an amount above zero.');
  if (dlg.editing) {
    store.updateEntry(dlg.editing.date, dlg.editing.id, { unitIndex, qty, meal });
    toast('Updated');
  } else {
    store.addEntry({ date: ui.date, meal, food: dlg.food, unitIndex, qty });
    ui.addMeal = meal;
    renderMealTabs();
    toast(`Added to ${meal}`);
  }
  $('#food-dialog').close();
}

/* ---------------- Add food: tabs ---------------- */
function renderAddTab() {
  renderMealTabs();
  $$('#add-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.addTab));
  $$('#view-add .tab').forEach((t) => (t.hidden = t.dataset.tab !== ui.addTab));
  if (ui.addTab !== 'scan') stopScanning();
  if (ui.addTab !== 'label') releaseOcrSoon();
  if (ui.addTab === 'restaurants') renderRestaurants();
  if (ui.addTab === 'mine') renderMine();
  if (ui.addTab === 'search' && !$('#search-input').value) setTimeout(() => $('#search-input').focus(), 50);
}

function renderDialogMeals() {
  $('#fd-meal').innerHTML = MEALS.map((m) =>
    `<button type="button" role="tab" data-meal="${m}" aria-selected="${m === dlg.meal}" class="${m === dlg.meal ? 'active' : ''}">${m}</button>`).join('');
}

function renderMealTabs() {
  $('#add-meal').innerHTML = MEALS.map((m) =>
    `<button type="button" role="tab" data-meal="${m}" aria-selected="${m === ui.addMeal}" class="${m === ui.addMeal ? 'active' : ''}">${m}</button>`).join('');
  mealsUI.renderStrip();
}

/* Search */
async function runSearch(query) {
  query = query.trim();
  if (!query) return;
  ui.searchAbort?.abort();
  const ctrl = new AbortController();
  ui.searchAbort = ctrl;
  const status = $('#search-status');
  status.className = 'status';
  status.textContent = 'Searching USDA and Open Food Facts…';
  $('#search-results').innerHTML = '';

  const { usdaFoods, offFoods, errors } = await searchFoods(query, { apiKey: store.getState().settings.usdaApiKey, signal: ctrl.signal });
  if (ctrl.signal.aborted) return;

  // Local matches first (my foods + recent), then both databases.
  const q = query.toLowerCase();
  const { myFoods, recent } = store.getState();
  const local = [...recipeUI.recipeFoods(), ...myFoods, ...recent].filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i && f.name.toLowerCase().includes(q)).slice(0, 5);

  let html = '';
  if (local.length) html += `<li class="list-label">Your foods</li>${local.map(foodRow).join('')}`;
  if (usdaFoods.length) html += `<li class="list-label">USDA FoodData Central</li>${usdaFoods.map(foodRow).join('')}`;
  if (offFoods.length) html += `<li class="list-label">Open Food Facts</li>${offFoods.map(foodRow).join('')}`;
  $('#search-results').innerHTML = html;

  const count = local.length + usdaFoods.length + offFoods.length;
  if (errors.length) {
    status.className = 'status error';
    status.textContent = `${count ? '' : 'No results. '}${errors.join(' · ')}`;
  } else {
    status.textContent = count ? '' : `No foods found for “${query}”.`;
  }
}

/* Scan */
async function startScanning() {
  const status = $('#scan-status');
  status.className = 'status';
  status.textContent = '';
  $('#scan-idle').hidden = true;
  try {
    ui.stopScan = await startScanner($('#scan-video'), handleBarcode);
    status.textContent = 'Scanning… fit the barcode in the box, any direction.';
  } catch (e) {
    $('#scan-idle').hidden = false;
    status.className = 'status error';
    status.textContent = e.message;
  }
}

function stopScanning() {
  if (ui.stopScan) {
    ui.stopScan();
    ui.stopScan = null;
  }
  const idle = $('#scan-idle');
  if (idle) idle.hidden = false;
}

async function handleBarcode(code) {
  ui.stopScan = null;
  $('#scan-idle').hidden = false;
  code = String(code).replace(/\D/g, '');
  const status = $('#scan-status');
  status.className = 'status';
  status.textContent = `Found barcode ${code}. Looking it up…`;
  const mine = store.getState().myFoods.find((f) => f.barcode === code);
  const food = mine || (await lookupBarcode(code, { apiKey: store.getState().settings.usdaApiKey }));
  if (food) {
    status.textContent = `Barcode ${code}: ${food.name}`;
    openFood(food);
  } else {
    status.className = 'status error';
    status.innerHTML = `No nutrition data found for barcode ${esc(code)}. That happens with newer or supplement products. <button type="button" class="btn small" id="scan-to-label">Photograph the label instead</button>`;
    $('#scan-to-label').onclick = () => {
      pendingBarcode = code;
      ui.addTab = 'label';
      renderAddTab();
    };
  }
}

/* Restaurants */
function renderRestaurants() {
  if (ui.restaurant) return;
  $('#restaurant-grid').hidden = false;
  $('#restaurant-menu').hidden = true;
  $('#restaurant-grid').innerHTML = RESTAURANTS.map((r) => `
    <button class="rest-tile" data-restaurant="${esc(r.id)}" style="--c:${esc(r.color || 'var(--accent)')}">
      <b>${esc(r.name)}</b>${r.note ? `<span>${esc(r.note)}</span>` : ''}
    </button>`).join('');
}

async function openRestaurant(id) {
  const r = getRestaurant(id);
  if (!r) return;
  ui.restaurant = r;
  $('#restaurant-grid').hidden = true;
  $('#restaurant-menu').hidden = false;
  $('#restaurant-name').textContent = r.name;
  $('#restaurant-search').value = '';
  await filterRestaurant('');
}

async function filterRestaurant(query) {
  const r = ui.restaurant;
  if (!r) return;
  const status = $('#restaurant-status');
  status.className = 'status';
  status.textContent = 'Loading menu…';
  try {
    const foods = await r.search(query);
    if (ui.restaurant !== r) return;
    let html = '';
    let lastCat = null;
    for (const f of foods) {
      if (f.category && f.category !== lastCat) {
        html += `<li class="list-label">${esc(f.category)}</li>`;
        lastCat = f.category;
      }
      html += foodRow(f);
    }
    $('#restaurant-results').innerHTML = html;
    status.textContent = foods.length ? '' : 'No menu items match.';
  } catch (e) {
    status.className = 'status error';
    status.textContent = e.message;
  }
}

/* Recent / My foods */
function renderMine() {
  mealsUI.renderMyMeals();
  const { myFoods, recent } = store.getState();
  const recipes = recipeUI.recipeFoods();
  $('#my-recipes-head').hidden = !recipes.length;
  $('#my-recipes').innerHTML = recipes.map(foodRow).join('');
  $('#my-foods').innerHTML = myFoods.map(foodRow).join('');
  $('#recent-foods').innerHTML = recent.map(foodRow).join('');
  if (!myFoods.length && !recent.length) {
    $('#recent-foods').innerHTML = '<li class="list-label" style="text-transform:none">Foods you add will show up here for one-tap logging.</li>';
  }
}

/* Create a food (also the review screen after photographing a label) */
const CUSTOM_MAIN = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium', 'satFat', 'caffeine'];
const custom = { grams: null, perContainer: null, barcode: '' };

function buildCustomExtras() {
  $('#custom-more-fields').innerHTML = NUTRIENTS.filter((n) => !CUSTOM_MAIN.includes(n.key)).map((n) =>
    `<label data-field="${n.key}">${esc(n.label)} (${esc(n.unit)}) <input name="${n.key}" type="number" step="any" min="0" inputmode="decimal"></label>`).join('');
}

/**
 * Opens the food form. With `values` (from a label photo) the fields are
 * filled in; `fixed` ones are marked "check me" and `estimated` ones are
 * marked as rough.
 */
function openCustom({ title = 'Create a food', values = {}, fixed = [], estimated = [], warnings = [], serving = '', grams = null, perContainer = null, note = '', barcode = '' } = {}) {
  const form = $('#custom-form');
  form.reset();
  custom.grams = grams;
  custom.perContainer = perContainer;
  custom.barcode = barcode;
  form.elements.note.value = note;
  $('#custom-title').textContent = title;
  form.elements.serving.value = serving || '1 serving';
  $$('#custom-form label[data-field], #custom-form label.field-check, #custom-form label.field-est').forEach((l) => l.classList.remove('field-check', 'field-est'));
  let extra = false;
  for (const [k, v] of Object.entries(values)) {
    const input = form.elements[k];
    if (!input) continue;
    input.value = +(+v).toFixed(2);
    const label = input.closest('label');
    if (fixed.includes(k)) label.classList.add('field-check');
    if (estimated.includes(k)) label.classList.add('field-est');
    if (!CUSTOM_MAIN.includes(k)) extra = true;
  }
  const notes = [...warnings];
  if (fixed.length) notes.push('Fields outlined in orange were hard to read. Check them against the label.');
  if (estimated.length) notes.push('Dashed fields are rough: they were worked out from the label\'s % Daily Value.');
  const warn = $('#custom-warn');
  warn.innerHTML = notes.map((n) => `<p>${esc(n)}</p>`).join('');
  warn.hidden = !notes.length;
  $('#custom-more').open = extra;
  $('#custom-dialog').showModal();
  if (!form.elements.name.value) setTimeout(() => form.elements.name.focus(), 50);
}

function saveCustomFood(form) {
  const data = Object.fromEntries(new FormData(form));
  const nutrients = {};
  for (const n of NUTRIENTS) {
    const v = data[n.key];
    if (v !== '' && v != null && Number.isFinite(parseFloat(v))) nutrients[n.key] = parseFloat(v);
  }
  const units = [{ label: data.serving.trim() || '1 serving', factor: 1 }];
  // Label photos know the serving's weight and how many servings are in the package.
  if (custom.grams > 0) units.push({ label: 'g', factor: 1 / custom.grams }, { label: '100 g', factor: 100 / custom.grams });
  if (custom.perContainer > 1) units.push({ label: `whole package (${custom.perContainer} servings)`, factor: custom.perContainer });
  const food = {
    id: `custom:${Date.now()}`,
    source: 'My food',
    name: data.name.trim(),
    brand: '',
    ...(custom.barcode ? { barcode: custom.barcode } : {}),
    ...(data.note.trim() ? { note: data.note.trim() } : {}),
    nutrients,
    units,
    defaultUnit: 0,
  };
  store.saveMyFood(food);
  form.reset();
  $('#custom-dialog').close();
  renderMine();
  openFood(food);
}

/* Label photo */
let ocrTimer = null;
function releaseOcrSoon() {
  clearTimeout(ocrTimer);
  ocrTimer = setTimeout(() => ocr.release(), 60000);
}

function labelStatus(msg, kind = '') {
  const el = $('#label-status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}

let labelBusy = false;
let pendingBarcode = '';
async function handleLabelPhoto(file) {
  if (!file || labelBusy) return;
  labelBusy = true;
  clearTimeout(ocrTimer);
  const preview = $('#label-preview');
  const img = $('#label-img');
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.dataset.url = URL.createObjectURL(file);
  img.src = img.dataset.url;
  preview.hidden = false;
  $('#label-bar').style.width = '3%';
  $('#label-take').disabled = $('#label-pick').disabled = true;
  labelStatus('Getting the reader ready… (the first time takes a few seconds)');
  try {
    const best = await ocr.readLabel(file, {
      score: scoreReading,
      good: 7,
      progress: (p, attempt) => {
        $('#label-bar').style.width = `${Math.max(3, Math.round(p * 100))}%`;
        labelStatus(attempt > 1 ? 'Trying the photo another way…' : 'Reading the label…');
      },
    });
    const parsed = parseLabel(best.text);
    if (parsed.count < 2) {
      labelStatus("Couldn't read a nutrition label in that photo. Try again closer to the label, flat on, with even light and no glare. Or type the numbers in.", 'error');
      return;
    }
    labelStatus(`Read ${parsed.count} values. Check them, name the food, and save.`, 'ok');
    openCustom({
      title: 'Check the label',
      values: parsed.nutrients,
      fixed: [...parsed.fixed],
      estimated: [...parsed.estimated],
      warnings: parsed.warnings,
      serving: parsed.serving.text,
      grams: parsed.serving.grams,
      perContainer: parsed.perContainer,
      note: parsed.others?.length ? `Also per serving: ${parsed.others.join(', ')}` : '',
      barcode: pendingBarcode,
    });
    pendingBarcode = '';
  } catch (e) {
    labelStatus(e.message || 'Could not read that photo.', 'error');
  } finally {
    labelBusy = false;
    $('#label-take').disabled = $('#label-pick').disabled = false;
    releaseOcrSoon();
  }
}

/* ---------------- Trends ---------------- */
function renderTrends() {
  $$('#trend-range button').forEach((b) => b.classList.toggle('active', +b.dataset.days === ui.trendDays));
  trends.render($('#view-trends'), { end: ui.date, days: ui.trendDays });
}

/* ---------------- Settings ---------------- */
/* Settings is split into categories: a list first, then one category at a
   time. Tapping the Settings tab again goes back to the list. */
const SETTINGS_SECTIONS = ['profile', 'goals', 'display', 'apis'];
function showSettingsSection(section) {
  const open = SETTINGS_SECTIONS.includes(section) ? section : '';
  ui.settingsSection = open;
  $('#settings-home').hidden = Boolean(open);
  $('#build-line').hidden = Boolean(open);
  $('#settings-back').hidden = !open;
  $$('#view-settings .settings-section').forEach((el) => (el.hidden = el.dataset.section !== open));
  if (!open) renderSettingsSummary();
  document.querySelector('main').scrollTo({ top: 0 });
}

// Swiping right from the left edge of the screen inside a Settings category
// goes back to the category list, like the back gesture in phone apps.
function initSettingsSwipeBack() {
  const view = document;
  const EDGE = 32;
  let start = null;
  view.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 && ui.view === 'settings' && ui.settingsSection && t.clientX <= EDGE ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dy > 40 && dy > dx) start = null; // a scroll, not a swipe
    else if (dx > 70 && dx > dy * 1.5) {
      start = null;
      showSettingsSection('');
    }
  }, { passive: true });
  view.addEventListener('touchend', () => (start = null), { passive: true });
  view.addEventListener('touchcancel', () => (start = null), { passive: true });
}

function renderSettingsSummary() {
  const b = window.FUEL_BUILD;
  $('#build-line').textContent = b ? `Fuel Log build ${b.n} (${b.sha})` : '';
  const { goals, settings } = store.getState();
  const a = sync.getAccount();
  const set = (k, t) => { const el = $(`[data-summary="${k}"]`); if (el) el.textContent = t; };
  set('profile', a.user ? `Signed in as ${a.user.email || 'you'}` : 'Account, body details, backup');
  set('goals', `${Math.round(goals.kcal || 0).toLocaleString()} kcal · ${Math.round(goals.protein || 0)}P ${Math.round(goals.carbs || 0)}C ${Math.round(goals.fat || 0)}F${mealTargets.enabled(settings) ? ' · meal targets on' : ''}`);
  const t = theme.THEMES.find((x) => x.id === theme.current()) || theme.THEMES[0];
  set('display', `Look: ${t.name}`);
  set('apis', `Garmin ${garmin.hasKey() ? 'connected' : 'not set up'} · USDA ${settings.usdaApiKey ? 'your key' : 'demo key'}`);
}

function renderSettings() {
  renderSettingsSummary();
  const { goals, settings } = store.getState();
  const gf = $('#goals-form');
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) gf.elements[k].value = goals[k];
  gf.elements.restingKcal.value = goals.restingKcal || '';
  $('#api-form').elements.usdaApiKey.value = settings.usdaApiKey || '';
  updateGoalCheck();
  renderMealForm();
  renderAccount();
  renderGarmin();
  renderProfile();
}

/* ---------------- Meal targets ---------------- */
function renderMealForm() {
  const { goals, settings } = store.getState();
  const f = $('#meal-form');
  f.elements.mealTargets.checked = mealTargets.enabled(settings);
  const split = mealTargets.getSplit(settings);
  for (const m of MEALS) if (document.activeElement !== f.elements[m]) f.elements[m].value = Math.round(split[m]);
  updateMealCheck();
}
function updateMealCheck() {
  const f = $('#meal-form');
  const { goals } = store.getState();
  const sum = MEALS.reduce((s, m) => s + (+f.elements[m].value || 0), 0);
  const draft = { mealSplit: Object.fromEntries(MEALS.map((m) => [m, +f.elements[m].value || 0])) };
  const kc = MEALS.map((m) => `${m} ${mealTargets.targetFor(m, goals.kcal, draft).toLocaleString()}`).join(' · ');
  $('#meal-check').textContent = `${sum === 100 ? 'Adds up to 100%.' : `Adds up to ${sum}%; it will be scaled to 100%.`} About ${kc} kcal.`;
}

/* ---------------- Profile + recommended goals ---------------- */
function renderProfile() {
  const p = store.getProfile();
  const f = $('#profile-form').elements;
  f.birthday.value = p.birthday || '';
  f.sex.value = p.sex || '';
  f.units.value = p.units || 'imperial';
  f.plan.value = p.plan || 'maintain';
  f.autoGoals.checked = Boolean(p.autoGoals);
  fillHeight(+p.heightCm || 0);
  syncProfileFields(p.rate);
  renderRecommend();
}

function fillHeight(cm) {
  const f = $('#profile-form').elements;
  const totalIn = cm / 2.54;
  f.heightFt.value = cm ? Math.floor(totalIn / 12) : '';
  f.heightIn.value = cm ? Math.round((totalIn % 12) * 2) / 2 : '';
  f.heightCm.value = cm ? Math.round(cm) : '';
}

// Shows the right height inputs and rate choices for the chosen units/goal.
function syncProfileFields(rate) {
  const f = $('#profile-form').elements;
  const imperial = f.units.value === 'imperial';
  $('#profile-form .height-imperial').hidden = !imperial;
  $('#profile-form .height-metric').hidden = imperial;
  $('#profile-form .rate-field').hidden = f.plan.value === 'maintain';
  const opts = imperial
    ? [[0.5, '½ lb a week'], [1, '1 lb a week'], [1.5, '1½ lb a week'], [2, '2 lb a week']].map(([lb, t]) => [lb * 0.45359237, t])
    : [[0.25, '0.25 kg a week'], [0.5, '0.5 kg a week'], [0.75, '0.75 kg a week'], [1, '1 kg a week']];
  const current = rate || 0.45;
  let best = 0;
  opts.forEach(([kg], i) => {
    if (Math.abs(kg - current) < Math.abs(opts[best][0] - current)) best = i;
  });
  f.rate.innerHTML = opts.map(([kg, t], i) => `<option value="${kg}" ${i === best ? 'selected' : ''}>${t}</option>`).join('');
}

// Height from whichever inputs are showing, in cm.
function formHeightCm(imperial) {
  const f = $('#profile-form').elements;
  const cm = imperial ? ((+f.heightFt.value || 0) * 12 + (+f.heightIn.value || 0)) * 2.54 : +f.heightCm.value || 0;
  return cm ? Math.round(cm * 10) / 10 : 0;
}

function readProfileForm() {
  const f = $('#profile-form').elements;
  return {
    birthday: f.birthday.value,
    sex: f.sex.value,
    units: f.units.value,
    heightCm: formHeightCm(f.units.value === 'imperial'),
    plan: f.plan.value,
    rate: +f.rate.value || 0,
    autoGoals: f.autoGoals.checked,
  };
}

function renderRecommend() {
  const box = $('#recommend');
  const r = targets.recommend();
  if (!r.ready) {
    const names = { birthday: 'birthday', sex: 'sex', height: 'height', weight: 'a weight (log one on the Today screen)' };
    box.innerHTML = `<p class="muted small">Add your ${r.missing.map((m) => names[m]).join(', ')} and save to get recommended goals.</p>`;
    return;
  }
  const g = r.goals;
  const change = r.dailyChange
    ? `a ${fmt(Math.abs(r.dailyChange))} kcal ${r.dailyChange < 0 ? 'deficit' : 'surplus'} a day`
    : 'no deficit';
  const auto = store.getProfile().autoGoals;
  box.innerHTML = `
    <h3 class="small">Recommended daily goals</h3>
    <div class="rec-goals">
      <div><b>${fmt(g.kcal)}</b><span>kcal</span></div>
      <div><b>${g.protein} g</b><span>protein</span></div>
      <div><b>${g.carbs} g</b><span>carbs</span></div>
      <div><b>${g.fat} g</b><span>fat</span></div>
    </div>
    <p class="muted small">You burn about <b>${fmt(r.tdee)}</b> kcal a day (${esc(r.level?.label || '')}), based on ${esc(r.basis)}. Resting burn is about ${fmt(g.restingKcal)}.
      ${esc(targets.PLANS[r.plan])} means ${change}. Protein is ${r.proteinPerKg} g per kg of body weight (${fmtWeight(r.kg)}), fat is about 28% of calories, and carbs make up the rest.</p>
    ${r.notes.map((n) => `<p class="muted small">${esc(n)}</p>`).join('')}
    <p class="muted small">General guidelines, not medical advice.</p>
    ${auto ? '<p class="small">Your daily goals follow this automatically.</p>' : '<button class="btn" type="button" id="use-recommend">Use these goals</button>'}`;
}

function renderGarmin() {
  const form = $('#garmin-form');
  const has = garmin.hasKey();
  const signedIn = Boolean(sync.getAccount().user);
  form.elements.garminKey.placeholder = has ? 'Key saved to your account' : 'Paste key';
  $('#garmin-pull').disabled = !has || !signedIn || garmin.status.state === 'syncing';
  $('#garmin-forget').hidden = !has;
  const st = garmin.status;
  let msg = '';
  let kind = '';
  if (!signedIn) msg = 'Sign in under Settings › Profile to use Garmin.';
  else if (st.state === 'syncing') msg = 'Getting calories from Garmin…';
  else if (st.state === 'error') [msg, kind] = [st.message, 'error'];
  else if (garmin.localOnly()) [msg, kind] = [`Your key is saved only on this device, so your other devices can't use it. Paste it again and tap Save key. (${garmin.localOnly()})`, 'error'];
  else if (has && garmin.lastPulled()) [msg, kind] = [`Last pulled from Garmin ${timeAgo(new Date(garmin.lastPulled()))}.`, 'ok'];
  else if (has) msg = 'Key saved. Tap "Pull last 14 days" to fetch.';
  authStatus('#garmin-status', msg, kind);
}

// Sync button under the ring on Today: only there when Garmin is connected
// (key saved and signed in). Pulls the day being viewed, whichever it is.
function renderGarminSync() {
  const btn = $('#garmin-sync');
  const show = garmin.hasKey() && Boolean(sync.getAccount().user);
  btn.hidden = !show;
  if (!show) return;
  const syncing = garmin.status.state === 'syncing';
  const future = ui.date > store.todayKey();
  btn.disabled = syncing || future;
  btn.classList.toggle('syncing', syncing);
  btn.querySelector('span').textContent = syncing ? 'Syncing…' : 'Garmin';
  const day = ui.date === store.todayKey() ? 'today' : dayLabel(ui.date);
  const label = future ? "Garmin can't sync a day that hasn't happened yet" : `Sync Garmin for ${day}`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

async function syncGarminDay() {
  const date = ui.date;
  if (date > store.todayKey()) return;
  const day = date === store.todayKey() ? 'today' : dayLabel(date);
  try {
    const r = await garmin.pull(date, date);
    if (!r.days) return toast(`Garmin had no calories for ${day} yet`);
    const kept = store.burnFor(date)?.source === 'manual' ? ' (kept the calories burned you typed in)' : '';
    toast(`Synced Garmin for ${day}${kept}`);
  } catch (e) {
    toast(e.message);
  }
}

async function pullGarmin(days = 14) {
  const end = store.todayKey();
  try {
    const r = await garmin.pull(store.shiftDate(end, -(days - 1)), end);
    const w = r.weights ? `, ${r.weights} weigh-in${r.weights > 1 ? 's' : ''}` : '';
    toast(r.days ? `Garmin: ${r.days} day${r.days > 1 ? 's' : ''} of calories${w}` : 'Garmin had no calories for those days');
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- Account ---------------- */
function timeAgo(d) {
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function renderAccount() {
  const a = sync.getAccount();
  const signedIn = Boolean(a.user);
  $('#account-off').hidden = a.configured;
  $('#account-loading').hidden = !a.configured || a.ready;
  if (a.initError && !$('#auth-status').textContent) authStatus('#auth-status', a.initError, 'error');
  $('#auth-form').hidden = !a.configured || !a.ready || signedIn;
  $('#account-info').hidden = !signedIn || a.recovering;
  $('#newpass-form').hidden = !signedIn || !a.recovering;
  $('#data-note').textContent = signedIn
    ? 'Your data is saved on this device and in your account. You can also export a backup file.'
    : 'Everything is stored on this device. Export a backup to keep a copy or move it to another browser.';
  if (!signedIn) return;
  $('#account-email').textContent = a.user.email || '';
  const text = {
    idle: 'Not synced yet',
    syncing: 'Syncing…',
    synced: a.lastSynced ? `Synced ${timeAgo(a.lastSynced)}` : 'Synced',
    offline: "Offline. Changes are saved here and will sync when you're back online.",
    error: `Sync problem: ${a.error}`,
  }[a.status];
  $('#sync-text').textContent = text;
  $('#sync-dot').className = `sync-dot ${a.status}`;
  $('#sync-btn').disabled = a.status === 'syncing';
}

function authStatus(sel, msg, kind = '') {
  const el = $(sel);
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function bindAccount() {
  const form = $('#auth-form');
  let busy = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const mode = e.submitter?.dataset.auth || 'signin';
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    busy = true;
    authStatus('#auth-status', mode === 'signup' ? 'Creating account…' : 'Signing in…');
    try {
      if (mode === 'signup') {
        const needsConfirm = await sync.signUp(email, password);
        if (needsConfirm) authStatus('#auth-status', `Check ${email} for a confirmation link, then come back and sign in.`, 'ok');
        else authStatus('#auth-status', '');
      } else {
        await sync.signIn(email, password);
        authStatus('#auth-status', '');
      }
      if (sync.getAccount().user) {
        form.reset();
        toast('Signed in. Syncing your data.');
      }
    } catch (err) {
      authStatus('#auth-status', err.message, 'error');
    } finally {
      busy = false;
    }
  };
  $('#forgot-btn').onclick = async () => {
    const email = form.elements.email.value.trim();
    if (!email) {
      authStatus('#auth-status', 'Type your email above, then tap "Forgot password?" again.', 'error');
      form.elements.email.focus();
      return;
    }
    try {
      await sync.sendPasswordReset(email);
      authStatus('#auth-status', `If ${email} has an account, a reset link is on its way.`, 'ok');
    } catch (err) {
      authStatus('#auth-status', err.message, 'error');
    }
  };
  $('#newpass-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await sync.updatePassword(e.target.elements.password.value);
      e.target.reset();
      toast('Password updated');
    } catch (err) {
      authStatus('#newpass-status', err.message, 'error');
    }
  };
  $('#sync-btn').onclick = () => sync.syncNow();
  $('#signout-btn').onclick = async () => {
    if (!confirm('Sign out? Your data stays in your account and is removed from this device.')) return;
    let result = await sync.signOut();
    if (result?.unsynced) {
      if (!confirm("Some recent changes haven't synced yet (you may be offline). Sign out anyway and lose them?")) return;
      result = await sync.signOut({ force: true });
    }
    toast('Signed out');
    renderSettings();
  };
}

function updateGoalCheck() {
  const gf = $('#goals-form');
  const v = (k) => parseFloat(gf.elements[k].value) || 0;
  const fromMacros = v('protein') * 4 + v('carbs') * 4 + v('fat') * 9;
  $('#goal-check').textContent = `Your macros add up to about ${round(fromMacros).toLocaleString()} kcal (protein and carbs 4 kcal/g, fat 9 kcal/g).`;
}

/* ---------------- Events ---------------- */
function bind() {
  $('#prev-day').onclick = () => stepDay(-1);
  $('#next-day').onclick = () => stepDay(1);
  $('#date-label').onclick = () => setDate(store.todayKey());
  // Date dialog: a month calendar that follows what you type, so picking and typing are one step.
  const cal = { y: 0, m: 0, sel: null };
  const keyOf = (y, m, d) => store.todayKey(new Date(y, m, d));
  const thisYear = () => new Date().getFullYear();
  // MM/DD alone means this year; a full MM/DD/YYYY overrides it.
  const parseTyped = (txt) => {
    const t = txt.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    if (!t) return null;
    const [mo, da, yr] = [+t[1], +t[2], t[3] ? +t[3] : thisYear()];
    const dt = new Date(yr, mo - 1, da);
    return yr >= 2000 && dt.getMonth() === mo - 1 && dt.getDate() === da ? dt : null;
  };
  function drawCal() {
    const first = new Date(cal.y, cal.m, 1);
    $('#dd-month').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const days = new Date(cal.y, cal.m + 1, 0).getDate();
    const today = store.todayKey();
    let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="cal-dow">${d}</span>`).join('') + '<span></span>'.repeat(first.getDay());
    for (let d = 1; d <= days; d++) {
      const k = keyOf(cal.y, cal.m, d);
      html += `<button type="button" class="cal-day${k === cal.sel ? ' sel' : ''}${k === today ? ' today' : ''}" data-day="${k}">${d}</button>`;
    }
    $('#dd-grid').innerHTML = html;
  }
  function showMonth(key) {
    const [y, m] = key.split('-').map(Number);
    cal.y = y;
    cal.m = m - 1;
    cal.sel = key;
    drawCal();
  }
  $('#date-pick').onclick = () => {
    $('#dd-text').value = '';
    drawGhost();
    $('#dd-error').hidden = true;
    showMonth(ui.date);
    $('#date-dialog').showModal();
    $('#dd-text').focus();
  };
  $('#dd-close').onclick = () => $('#date-dialog').close();
  $('#dd-today').onclick = () => {
    setDate(store.todayKey());
    $('#date-dialog').close();
  };
  const shiftMonth = (n) => {
    const d = new Date(cal.y, cal.m + n, 1);
    cal.y = d.getFullYear();
    cal.m = d.getMonth();
    drawCal();
  };
  $('#dd-prev').onclick = () => shiftMonth(-1);
  $('#dd-next').onclick = () => shiftMonth(1);
  $('#dd-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    setDate(b.dataset.day);
    $('#date-dialog').close();
  });
  // Typing: digits only, slashes added as you go (0412 becomes 04/12, then /2026).
  $('#dd-text').addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    $('#dd-error').hidden = true;
    drawGhost();
    // Show the month being typed as soon as month and a full year are in.
    const dt = parseTyped(e.target.value);
    if (dt) return showMonth(store.todayKey(dt));
    if (d.length >= 6) {
      const mo = +d.slice(0, 2), yr = +d.slice(4);
      if (mo >= 1 && mo <= 12 && yr >= 2000) {
        cal.y = yr;
        cal.m = mo - 1;
        cal.sel = null;
        drawCal();
      }
    }
  });
  // Faded "/2026" after MM/DD, so the default year is visible but needs no typing.
  function drawGhost() {
    const v = $('#dd-text').value;
    $('#dd-ghost').innerHTML = /^\d{2}\/\d{2}$/.test(v) ? `<i>${v}</i>/${thisYear()}` : '';
  }
  const goTyped = () => {
    const err = $('#dd-error');
    const dt = parseTyped($('#dd-text').value);
    if (!dt) {
      err.textContent = /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test($('#dd-text').value) ? "That isn't a real date." : 'Type the date as MM/DD or MM/DD/YYYY.';
      err.hidden = false;
      return;
    }
    setDate(store.todayKey(dt));
    $('#date-dialog').close();
  };
  $('#dd-go').onclick = goTyped;
  $('#dd-text').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // otherwise Enter lands on the calendar button the dialog hands focus back to
    goTyped();
  });

  $$('.tabbar button').forEach((b) => (b.onclick = () => showView(b.dataset.nav)));
  $$('#settings-home .cat-row').forEach((b) => (b.onclick = () => showSettingsSection(b.dataset.section)));
  $('#settings-back').onclick = () => showSettingsSection('');
  initSettingsSwipeBack();
  initDaySwipe();

  $('#meals').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-meal]');
    if (add) {
      ui.addMeal = add.dataset.addMeal;
      return showView('add');
    }
    const ico = e.target.closest('[data-swap-entry]');
    if (ico) {
      const entry = store.entriesFor(ui.date).find((x) => x.id === ico.dataset.swapEntry);
      if (entry) openEntrySwaps(entry);
      return;
    }
    const row = e.target.closest('[data-entry]');
    if (row) {
      const entry = store.entriesFor(ui.date).find((x) => x.id === row.dataset.entry);
      if (entry) openFood(entry.food, { entry });
    }
  });

  $('#micro-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-group]');
    if (!b) return;
    ui.microGroup = b.dataset.group;
    renderMicros();
  });

  // Add-food tabs
  $('#add-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    ui.addTab = b.dataset.tab;
    renderAddTab();
  });
  $('#fd-swap-btn').addEventListener('click', () => {
    const panel = $('#fd-swaps');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) updateFoodPreview();
  });
  $('#fd-swaps').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-swap]');
    if (!b || dlg.editing) return;
    openFood(dlg.swaps[+b.dataset.swap], { meal: dlg.meal });
  });
  $('#sw-close').addEventListener('click', () => $('#swap-dialog').close());
  $('#sw-body').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-swap]');
    if (!b) return;
    $('#swap-dialog').close();
    openFood(swapDlg.swaps[+b.dataset.swap], { meal: swapDlg.meal });
  });
  $('#fd-meal').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-meal]');
    if (!b) return;
    dlg.meal = b.dataset.meal;
    renderDialogMeals();
  });
  $('#add-meal').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-meal]');
    if (!b) return;
    ui.addMeal = b.dataset.meal;
    renderMealTabs();
  });

  // Any food list → open dialog
  $('#view-add').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-food]');
    if (li) {
      const food = ui.foodCache.get(li.dataset.food);
      if (food) openFood(food);
    }
  });

  $('#search-form').onsubmit = (e) => {
    e.preventDefault();
    $('#search-input').blur();
    runSearch($('#search-input').value);
  };

  $('#scan-start').onclick = startScanning;
  $('#barcode-form').onsubmit = (e) => {
    e.preventDefault();
    const code = $('#barcode-input').value.replace(/\D/g, '');
    if (code.length < 6) return toast('Enter the full barcode number.');
    stopScanning();
    handleBarcode(code);
  };

  $('#restaurant-grid').addEventListener('click', (e) => {
    const t = e.target.closest('[data-restaurant]');
    if (t) openRestaurant(t.dataset.restaurant);
  });
  $('#restaurant-back').onclick = () => {
    ui.restaurant = null;
    renderRestaurants();
  };
  let restTimer;
  $('#restaurant-search').oninput = (e) => {
    clearTimeout(restTimer);
    restTimer = setTimeout(() => filterRestaurant(e.target.value), 150);
  };

  buildCustomExtras();
  $('#new-food').onclick = () => openCustom();
  $('#label-take').onclick = () => $('#label-camera').click();
  $('#label-pick').onclick = () => $('#label-file').click();
  $('#label-manual').onclick = () => openCustom({ title: 'Type in a label' });
  for (const id of ['#label-camera', '#label-file']) {
    $(id).onchange = (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      handleLabelPhoto(f);
    };
  }
  $('#custom-close').onclick = () => $('#custom-dialog').close();
  $('#custom-form').onsubmit = (e) => {
    e.preventDefault();
    saveCustomFood(e.target);
  };

  // Food dialog
  $('#fd-qty').oninput = updateFoodPreview;
  $('#fd-unit').onchange = () => {
    const unit = dlg.food.units[+$('#fd-unit').value];
    if (unit.label === 'g' && dialogQty() <= 10) $('#fd-qty').value = 100;
    else if (unit.label !== 'g' && dialogQty() >= 50) $('#fd-qty').value = 1;
    updateFoodPreview();
  };
  $('#fd-save').onclick = saveFromDialog;
  $('#fd-delete').onclick = () => {
    if (!dlg.editing) return;
    store.removeEntry(dlg.editing.date, dlg.editing.id);
    $('#food-dialog').close();
    toast('Removed');
  };
  // Close sheets when tapping the backdrop
  for (const d of $$('dialog.sheet')) {
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    });
  }

  // Settings
  $('#meal-form').oninput = updateMealCheck;
  $('#meal-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target.elements;
    store.setSettings({ mealTargets: f.mealTargets.checked, mealSplit: Object.fromEntries(MEALS.map((m) => [m, Math.max(0, +f[m].value || 0)])) });
    toast('Saved');
  };
  $('#meal-reset').onclick = () => {
    store.setSettings({ mealSplit: { ...mealTargets.DEFAULT_SPLIT } });
    toast('Back to the usual split');
  };
  $('#goals-form').oninput = updateGoalCheck;
  $('#goals-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target.elements;
    store.setGoals({ kcal: +f.kcal.value || 0, protein: +f.protein.value || 0, carbs: +f.carbs.value || 0, fat: +f.fat.value || 0, restingKcal: +f.restingKcal.value || 0 });
    if (store.getProfile().autoGoals) {
      // Typing goals by hand means the user wants to set them themselves.
      store.setProfile({ autoGoals: false });
      toast('Goals saved. Automatic goals turned off.');
      renderProfile();
    } else toast('Goals saved');
  };
  // Profile
  const pf = $('#profile-form');
  pf.elements.units.onchange = () => {
    // Keep the typed height when switching units.
    fillHeight(formHeightCm(pf.elements.units.value !== 'imperial'));
    syncProfileFields(+pf.elements.rate.value);
  };
  pf.elements.plan.onchange = () => syncProfileFields(+pf.elements.rate.value);
  pf.onsubmit = (e) => {
    e.preventDefault();
    const p = readProfileForm();
    if (p.birthday && targets.ageOn(p.birthday) == null) return toast('Check your birthday.');
    store.setProfile(p);
    const changed = targets.applyIfAuto();
    toast(changed ? 'Profile saved. Goals updated.' : 'Profile saved');
    renderSettings();
  };
  pf.addEventListener('click', (e) => {
    if (e.target.id !== 'use-recommend') return;
    const r = targets.recommend();
    if (!r.ready) return;
    store.setGoals(r.goals);
    toast('Goals updated');
    renderSettings();
  });

  // Weight dialog
  $('#weight-card').addEventListener('click', (e) => {
    if (e.target.closest('[data-weight-edit]')) openWeight();
  });
  $('#weight-close').onclick = () => $('#weight-dialog').close();
  $('#weight-form').onsubmit = (e) => {
    e.preventDefault();
    const v = parseFloat(e.target.elements.weight.value);
    if (!(v > 0)) return;
    store.setWeight(weightDlg.date, { kg: targets.displayToKg(v), source: 'manual' });
    $('#weight-dialog').close();
    toast(targets.applyIfAuto() ? 'Weight saved. Goals updated.' : 'Weight saved');
  };
  $('#weight-clear').onclick = () => {
    store.removeWeight(weightDlg.date);
    $('#weight-dialog').close();
    toast('Cleared');
  };

  $('#garmin-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.target.elements.garminKey;
    const key = input.value.trim();
    if (!key) return toast('Paste your Garmin Personal API key first.');
    if (!sync.getAccount().user) return toast('Sign in first (Settings → Account).');
    authStatus('#garmin-status', 'Checking the key with Garmin…');
    try {
      await garmin.saveKey(key);
      input.value = '';
      toast('Garmin key saved to your account');
      renderGarmin();
      pullGarmin();
    } catch (err) {
      authStatus('#garmin-status', err.message, 'error');
    }
  };
  $('#garmin-pull').onclick = () => pullGarmin();
  $('#garmin-sync').onclick = syncGarminDay;
  $('#garmin-forget').onclick = async () => {
    if (!confirm('Remove the Garmin key from your account? Every device stops pulling from Garmin. Calories already pulled stay in your log.')) return;
    try {
      await garmin.removeKey();
      toast('Garmin key removed');
    } catch (err) {
      toast(err.message);
    }
    renderGarmin();
  };

  // Calories burned dialog
  $('#balance-card').addEventListener('click', (e) => {
    if (e.target.closest('[data-burn-edit]')) openBurn();
  });
  $('#burn-close').onclick = () => $('#burn-dialog').close();
  $('#burn-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target.elements;
    store.setBurn(burnDlg.date, { active: f.active.value, resting: f.resting.value, source: 'manual' });
    $('#burn-dialog').close();
    toast('Saved');
  };
  $('#burn-clear').onclick = () => {
    store.removeBurn(burnDlg.date);
    $('#burn-dialog').close();
    toast(garmin.hasKey() ? 'Cleared. Garmin will fill it in again on its next pull.' : 'Cleared');
    // Let Garmin re-fill a day the user cleared.
    garmin.forgetPulled(burnDlg.date);
    garmin.refreshAround(burnDlg.date);
  };

  $('#api-form').onsubmit = (e) => {
    e.preventDefault();
    store.setSettings({ usdaApiKey: e.target.elements.usdaApiKey.value.trim() });
    toast('Saved');
  };
  $('#export-btn').onclick = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fuel-log-backup-${store.todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importData(await file.text());
      toast('Backup restored');
      renderSettings();
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  };

  // Trends: tap a day to open it
  // Trends: pick a range; tap a day in a chart to open it
  $('#trend-range').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    ui.trendDays = +b.dataset.days;
    try { localStorage.setItem('ct.trendDays', String(ui.trendDays)); } catch {}
    renderTrends();
  });
  try {
    const savedDays = +localStorage.getItem('ct.trendDays');
    if ([7, 30, 90].includes(savedDays)) ui.trendDays = savedDays;
  } catch {}
  trends.bindTooltips($('#view-trends'));
  let lastPointer = 'mouse';
  $('#view-trends').addEventListener('pointerdown', (e) => (lastPointer = e.pointerType));
  $('#view-trends').addEventListener('click', (e) => {
    const t = e.target.closest('[data-day]');
    // On touch screens the first tap shows the tooltip; a second tap opens the day.
    if (!t || (lastPointer !== 'mouse' && !t.classList.contains('was-hot'))) {
      $$('#view-trends .was-hot').forEach((x) => x.classList.remove('was-hot'));
      t?.classList.add('was-hot');
      return;
    }
    setDate(t.dataset.day);
    showView('today');
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => ui.view === 'trends' && renderTrends(), 200);
  });

  // iPhone Safari ignores user-scalable=no; block pinch zoom directly.
  ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScanning();
    else garmin.refreshAround(ui.date);
  });
}

store.subscribe((_state, source) => {
  renderToday();
  if (ui.view === 'trends') renderTrends();
  if (ui.view === 'add') {
    mealsUI.renderStrip();
    if (ui.addTab === 'mine') renderMine();
  }
  if (ui.view === 'recipes' && source === 'sync') recipeUI.refresh();
  // Goals or settings arriving from another device: refresh the form unless
  // the user is typing in it.
  const typing = document.activeElement?.matches('#goals-form input, #api-form input, #garmin-form input, #profile-form input, #profile-form select');
  if (ui.view === 'settings' && source === 'sync' && !typing) renderSettings();
  // Another device linked Garmin: start pulling here too.
  if (source === 'sync') garmin.refreshAround(ui.date);
});

let lastUserId = null;
sync.onChange((a) => {
  // Opened from a password reset email: take them to the new-password form.
  if (a.recovering && (ui.view !== 'settings' || ui.settingsSection !== 'profile')) showView('settings', 'profile');
  if (ui.view === 'settings') {
    renderAccount();
    renderGarmin();
  }
  renderGarminSync();
  if (a.user && a.user.id !== lastUserId) garmin.refreshAround(ui.date);
  lastUserId = a.user?.id || null;
});

garmin.onChange((st) => {
  // New Garmin calories or weight can move the recommended goals.
  if (st.state === 'ok') targets.applyIfAuto();
  if (ui.view === 'settings') {
    renderGarmin();
    renderRecommend();
  }
  if (ui.view === 'today') renderBalance();
  renderGarminSync();
});

// Apple Health / Shortcuts: opening
//   …/calories/?burn=2026-11-09&active=650&resting=1720
// saves that day's calories burned. See README.md.
function importBurnFromUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has('burn')) return;
  const date = q.get('burn') || store.todayKey();
  const active = parseFloat(q.get('active'));
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(active)) {
    const resting = parseFloat(q.get('resting'));
    store.setBurn(date, { active, resting: Number.isFinite(resting) ? resting : null, source: q.get('source') === 'manual' ? 'manual' : 'health' });
    ui.date = date;
    setTimeout(() => toast(`Saved ${round(active)} active kcal for ${date === store.todayKey() ? 'today' : date}`), 300);
  }
  history.replaceState(null, '', location.pathname + location.hash);
}

theme.apply();
theme.renderPicker($('#theme-grid'));
importBurnFromUrl();
// A photo that fails to load falls back to the lettered placeholder.
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.parentElement?.classList.contains('thumb')) {
    e.target.parentElement.classList.add('none');
    e.target.remove();
  }
}, true);

bind();
bindAccount();
recipeUI.init({ openFood, toast });
mealsUI.init({
  toast,
  thumb: (f) => thumb(f, 'sm'),
  getDate: () => ui.date,
  getView: () => ui.view,
  getAddMeal: () => ui.addMeal,
  setAddMeal: (m) => { ui.addMeal = m; },
  recipeFoods: () => recipeUI.recipeFoods(),
  renderToday,
});
groceryUI.init({ toast, goSettings: () => showView('settings', 'profile') });
sync.init();
renderDate();
renderToday();
garmin.refreshAround(ui.date);
targets.applyIfAuto();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
}

// Exposed for debugging and for plugging in providers from the console.
window.fuelLog = { store, scaleNutrients };
