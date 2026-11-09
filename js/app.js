import { NUTRIENTS, NUTRIENT_MAP, formatAmount, scaleNutrients } from './nutrients.js';
import * as store from './store.js';
import { MEALS } from './store.js';
import { searchFoods, lookupBarcode } from './providers/index.js';
import { RESTAURANTS, getRestaurant } from './providers/restaurants/index.js';
import { startScanner } from './scanner.js';
import * as sync from './sync.js';
import * as garmin from './garmin.js';

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
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------------- Navigation ---------------- */
function showView(view) {
  ui.view = view;
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== view));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  if (view !== 'add') stopScanning();
  if (view === 'add') renderAddTab();
  if (view === 'trends') renderTrends();
  if (view === 'settings') renderSettings();
  window.scrollTo({ top: 0 });
}

function setDate(key) {
  ui.date = key;
  renderDate();
  renderToday();
  if (ui.view === 'trends') renderTrends();
  garmin.refreshAround(key);
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

  $('#macro-bars').innerHTML = MACROS.map((m) => macroBar(m, totals[m.key] || 0, goals[m.key])).join('');

  const entries = store.entriesFor(ui.date);
  $('#meals').innerHTML = MEALS.map((meal) => {
    const list = entries.filter((e) => e.meal === meal);
    const kcal = list.reduce((s, e) => s + (e.nutrients.kcal || 0), 0);
    return `
      <div class="card meal">
        <div class="card-head"><h2>${meal}</h2><span class="meal-kcal">${round(kcal).toLocaleString()} kcal</span></div>
        ${list.length ? list.map(entryRow).join('') : '<div class="empty">Nothing logged yet.</div>'}
        <button class="btn small add-to-meal" data-add-meal="${meal}">+ Add food</button>
      </div>`;
  }).join('');

  renderMicros(totals);
  renderBalance();
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

function entryRow(e) {
  return `
    <div class="entry" data-entry="${e.id}">
      <div class="info">
        <div class="name">${esc(e.food.name)}</div>
        <div class="sub">${esc(e.food.brand ? `${e.food.brand} · ` : '')}${esc(unitText(e))}</div>
      </div>
      <div class="kcal">${round(e.nutrients.kcal)}</div>
    </div>`;
}

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
        <span class="pct">${pct != null ? `${round(pct)}%` : ''}</span>
        <div class="bar"><i style="width:${Math.min(pct || 0, 100)}%;background:${color}"></i></div>
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
const dlg = { food: null, editing: null };

function openFood(food, { entry = null, meal = ui.addMeal } = {}) {
  dlg.food = food;
  dlg.editing = entry;
  $('#fd-name').textContent = food.name;
  $('#fd-meta').textContent = [food.brand, food.source, food.barcode ? `#${food.barcode}` : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  $('#fd-unit').innerHTML = food.units.map((u, i) => `<option value="${i}">${esc(u.label)}</option>`).join('');
  $('#fd-meal').innerHTML = MEALS.map((m) => `<option ${m === (entry?.meal || meal) ? 'selected' : ''}>${m}</option>`).join('');
  $('#fd-unit').value = String(entry ? entry.unitIndex : food.defaultUnit || 0);
  $('#fd-qty').value = entry ? +entry.qty.toFixed(2) : (food.units[food.defaultUnit || 0].label === 'g' ? 100 : 1);
  $('#fd-delete').hidden = !entry;
  $('#fd-save').textContent = entry ? 'Save changes' : 'Add to log';
  $('.fd-more').open = false;
  updateFoodPreview();
  $('#food-dialog').showModal();
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

  const groups = [['Details', 'detail'], ['Vitamins', 'vitamin'], ['Minerals', 'mineral']];
  let html = '';
  for (const [title, g] of groups) {
    const rows = NUTRIENTS.filter((x) => x.group === g && n[x.key] != null);
    if (!rows.length) continue;
    html += `<tr class="group"><td colspan="3">${title}</td></tr>`;
    html += rows.map((x) => `<tr><td>${x.label}</td><td>${formatAmount(n[x.key], x.unit)}</td><td>${x.dv ? `${round((n[x.key] / x.dv) * 100)}%` : ''}</td></tr>`).join('');
  }
  $('#fd-table').innerHTML = html || '<tr><td>No vitamin or mineral data for this food.</td></tr>';
}

function saveFromDialog() {
  const unitIndex = +$('#fd-unit').value;
  const qty = dialogQty();
  const meal = $('#fd-meal').value;
  if (qty <= 0) return toast('Enter an amount above zero.');
  if (dlg.editing) {
    store.updateEntry(dlg.editing.date, dlg.editing.id, { unitIndex, qty, meal });
    toast('Updated');
  } else {
    store.addEntry({ date: ui.date, meal, food: dlg.food, unitIndex, qty });
    ui.addMeal = meal;
    toast(`Added to ${meal}`);
  }
  $('#food-dialog').close();
}

/* ---------------- Add food: tabs ---------------- */
function renderAddTab() {
  $('#add-meal').innerHTML = MEALS.map((m) => `<option ${m === ui.addMeal ? 'selected' : ''}>${m}</option>`).join('');
  $$('#add-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.addTab));
  $$('#view-add .tab').forEach((t) => (t.hidden = t.dataset.tab !== ui.addTab));
  if (ui.addTab !== 'scan') stopScanning();
  if (ui.addTab === 'restaurants') renderRestaurants();
  if (ui.addTab === 'mine') renderMine();
  if (ui.addTab === 'search' && !$('#search-input').value) setTimeout(() => $('#search-input').focus(), 50);
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
  const local = [...myFoods, ...recent].filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i && f.name.toLowerCase().includes(q)).slice(0, 5);

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
    status.textContent = 'Scanning… hold the barcode inside the box.';
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
  const food = await lookupBarcode(code, { apiKey: store.getState().settings.usdaApiKey });
  if (food) {
    status.textContent = `Barcode ${code}: ${food.name}`;
    openFood(food);
  } else {
    status.className = 'status error';
    status.textContent = `No nutrition data found for barcode ${code}. Try searching by name, or create it under Recent → Create food.`;
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
  const { myFoods, recent } = store.getState();
  $('#my-foods').innerHTML = myFoods.map(foodRow).join('');
  $('#recent-foods').innerHTML = recent.map(foodRow).join('');
  if (!myFoods.length && !recent.length) {
    $('#recent-foods').innerHTML = '<li class="list-label" style="text-transform:none">Foods you add will show up here for one-tap logging.</li>';
  }
}

function saveCustomFood(form) {
  const data = Object.fromEntries(new FormData(form));
  const nutrients = {};
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium', 'satFat']) {
    if (data[k] !== '' && data[k] != null) nutrients[k] = parseFloat(data[k]);
  }
  const food = {
    id: `custom:${Date.now()}`,
    source: 'My food',
    name: data.name.trim(),
    brand: '',
    nutrients,
    units: [{ label: data.serving.trim() || '1 serving', factor: 1 }],
    defaultUnit: 0,
  };
  store.saveMyFood(food);
  form.reset();
  $('#custom-dialog').close();
  renderMine();
  openFood(food);
}

/* ---------------- Trends ---------------- */
function renderTrends() {
  const { goals } = store.getState();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = store.shiftDate(ui.date, -i);
    days.push({ key, totals: store.totalsFor(key) });
  }
  const max = Math.max(goals.kcal * 1.15, ...days.map((d) => d.totals.kcal || 0), 1);
  const logged = days.filter((d) => d.totals.kcal > 0);
  const avg = (k) => (logged.length ? logged.reduce((s, d) => s + (d.totals[k] || 0), 0) / logged.length : 0);

  $('#trend-chart').innerHTML = `
    <div class="goal-line" style="bottom:0"><span>goal ${round(goals.kcal)}</span></div>
    ${days.map((d) => {
      const k = d.totals.kcal || 0;
      const [y, m, dd] = d.key.split('-').map(Number);
      const label = new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'narrow' });
      return `<div class="tcol" data-day="${d.key}" title="${d.key}">
        <span class="tval">${k ? round(k) : ''}</span>
        <div class="tbar ${k > goals.kcal ? 'over' : ''}" style="height:${(k / max) * 75}%"></div>
        <span class="tday">${label}</span>
      </div>`;
    }).join('')}`;
  // Position the goal line against the bar area precisely after layout.
  requestAnimationFrame(() => {
    const chart = $('#trend-chart');
    const col = chart.querySelector('.tcol');
    const bar = col?.querySelector('.tbar');
    const line = chart.querySelector('.goal-line');
    if (!col || !bar || !line) return;
    const colRect = col.getBoundingClientRect();
    const barBottom = bar.getBoundingClientRect().bottom;
    const chartRect = chart.getBoundingClientRect();
    const usable = colRect.height * 0.75;
    line.style.bottom = `${chartRect.bottom - barBottom + (goals.kcal / max) * usable}px`;
  });

  renderTrendNet(days.map((d) => d.key));

  $('#trend-avg').textContent = logged.length ? `avg ${round(avg('kcal')).toLocaleString()} kcal on ${logged.length} logged day${logged.length > 1 ? 's' : ''}` : 'No days logged yet';
  $('#trend-macros').innerHTML = MACROS.map((m) => macroBar(m, avg(m.key), goals[m.key])).join('') +
    ['fiber', 'sodium'].map((k) => {
      const n = NUTRIENT_MAP[k];
      const v = avg(k);
      const pct = (v / n.dv) * 100;
      return `<div class="macro-row"><div class="lbl"><span>${n.label}</span><b>${formatAmount(v, n.unit)} / ${formatAmount(n.dv, n.unit)}</b></div>
        <div class="bar"><i style="width:${Math.min(pct, 100)}%" class="${k === 'sodium' && pct > 100 ? 'over' : ''}"></i></div></div>`;
    }).join('');
}

function renderTrendNet(keys) {
  const rows = keys.map((key) => ({ key, bal: store.balanceFor(key) })).filter((r) => r.bal && r.bal.eaten > 0);
  const biggest = Math.max(500, ...rows.map((r) => Math.abs(r.bal.net)));
  const sum = rows.reduce((s, r) => s + r.bal.net, 0);
  $('#trend-net-sum').textContent = rows.length
    ? `${fmt(Math.abs(sum))} kcal ${sum > 0 ? 'surplus' : 'deficit'} over ${rows.length} day${rows.length > 1 ? 's' : ''} (≈ ${(Math.abs(sum) / 3500).toFixed(1)} lb)`
    : '';
  $('#trend-net').innerHTML = rows.length
    ? rows.map(({ key, bal }) => {
      const [y, m, d] = key.split('-').map(Number);
      const day = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      const cls = bal.net > 0 ? 'surplus' : 'deficit';
      const w = (Math.abs(bal.net) / biggest) * 50;
      const pos = bal.net > 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`;
      return `<div class="tn-row" data-day="${key}"><span class="day">${esc(day)}</span>
        <div class="tn-track"><i class="${cls}" style="${pos}"></i></div>
        <span class="val ${cls}">${bal.net > 0 ? '+' : '−'}${fmt(Math.abs(bal.net))}</span></div>`;
    }).join('')
    : '<div class="empty">Days with both food logged and calories burned show up here.</div>';
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const { goals, settings } = store.getState();
  const gf = $('#goals-form');
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) gf.elements[k].value = goals[k];
  gf.elements.restingKcal.value = goals.restingKcal || '';
  $('#api-form').elements.usdaApiKey.value = settings.usdaApiKey || '';
  updateGoalCheck();
  renderAccount();
  renderGarmin();
}

function renderGarmin() {
  const form = $('#garmin-form');
  const has = garmin.hasKey();
  const signedIn = Boolean(sync.getAccount().user);
  form.elements.garminKey.placeholder = has ? 'Key saved on this device' : 'Paste key';
  $('#garmin-pull').disabled = !has || !signedIn || garmin.status.state === 'syncing';
  $('#garmin-forget').hidden = !has;
  const st = garmin.status;
  let msg = '';
  let kind = '';
  if (!signedIn) msg = 'Sign in above to use Garmin.';
  else if (st.state === 'syncing') msg = 'Getting calories from Garmin…';
  else if (st.state === 'error') [msg, kind] = [st.message, 'error'];
  else if (has && garmin.lastPulled()) [msg, kind] = [`Last pulled from Garmin ${timeAgo(new Date(garmin.lastPulled()))}.`, 'ok'];
  else if (has) msg = 'Key saved. Tap "Pull last 14 days" to fetch.';
  authStatus('#garmin-status', msg, kind);
}

async function pullGarmin(days = 14) {
  const end = store.todayKey();
  try {
    const r = await garmin.pull(store.shiftDate(end, -(days - 1)), end);
    toast(r.days ? `Garmin: ${r.days} day${r.days > 1 ? 's' : ''} of calories` : 'Garmin had no calories for those days');
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
  $('#prev-day').onclick = () => setDate(store.shiftDate(ui.date, -1));
  $('#next-day').onclick = () => setDate(store.shiftDate(ui.date, 1));
  $('#date-label').onclick = () => setDate(store.todayKey());

  $$('.tabbar button').forEach((b) => (b.onclick = () => showView(b.dataset.nav)));

  $('#meals').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-meal]');
    if (add) {
      ui.addMeal = add.dataset.addMeal;
      return showView('add');
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
  $('#add-meal').onchange = (e) => (ui.addMeal = e.target.value);

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

  $('#new-food').onclick = () => $('#custom-dialog').showModal();
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
  $('#goals-form').oninput = updateGoalCheck;
  $('#goals-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target.elements;
    store.setGoals({ kcal: +f.kcal.value || 0, protein: +f.protein.value || 0, carbs: +f.carbs.value || 0, fat: +f.fat.value || 0, restingKcal: +f.restingKcal.value || 0 });
    toast('Goals saved');
  };
  $('#garmin-form').onsubmit = (e) => {
    e.preventDefault();
    const input = e.target.elements.garminKey;
    const key = input.value.trim();
    if (!key) return toast('Paste your Garmin Personal API key first.');
    garmin.setKey(key);
    input.value = '';
    toast('Garmin key saved on this device');
    renderGarmin();
    if (sync.getAccount().user) pullGarmin();
  };
  $('#garmin-pull').onclick = () => pullGarmin();
  $('#garmin-forget').onclick = () => {
    if (!confirm('Remove the Garmin key from this device? Calories already pulled stay in your log.')) return;
    garmin.setKey('');
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
  $('#trend-net').addEventListener('click', (e) => {
    const row = e.target.closest('[data-day]');
    if (row) {
      setDate(row.dataset.day);
      showView('today');
    }
  });
  $('#trend-chart').addEventListener('click', (e) => {
    const col = e.target.closest('[data-day]');
    if (col) {
      setDate(col.dataset.day);
      showView('today');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScanning();
    else garmin.refreshAround(ui.date);
  });
}

store.subscribe((_state, source) => {
  renderToday();
  if (ui.view === 'trends') renderTrends();
  if (ui.view === 'add' && source === 'sync' && ui.addTab === 'mine') renderMine();
  // Goals or settings arriving from another device: refresh the form unless
  // the user is typing in it.
  const typing = document.activeElement?.matches('#goals-form input, #api-form input, #garmin-form input');
  if (ui.view === 'settings' && source === 'sync' && !typing) renderSettings();
});

let lastUserId = null;
sync.onChange((a) => {
  // Opened from a password reset email: take them to the new-password form.
  if (a.recovering && ui.view !== 'settings') showView('settings');
  if (ui.view === 'settings') {
    renderAccount();
    renderGarmin();
  }
  if (a.user && a.user.id !== lastUserId) garmin.refreshAround(ui.date);
  lastUserId = a.user?.id || null;
});

garmin.onChange(() => {
  if (ui.view === 'settings') renderGarmin();
  if (ui.view === 'today') renderBalance();
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

importBurnFromUrl();
bind();
bindAccount();
sync.init();
renderDate();
renderToday();
garmin.refreshAround(ui.date);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
}

// Exposed for debugging and for plugging in providers from the console.
window.fuelLog = { store, scaleNutrients };
