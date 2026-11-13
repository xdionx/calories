// Saved meals: foods usually eaten together (e.g. a fast food order, or bacon,
// eggs and a croissant), saved so they can be logged again in one tap. Not a
// recipe: each food is logged as its own entry, tagged with a group so Today
// shows them together. See store.js for the shapes.

import * as store from './store.js';
import { MEALS } from './store.js';
import { searchFoods } from './providers/index.js';
import { RESTAURANTS, getRestaurant } from './providers/restaurants/index.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (n) => Math.round(n || 0);

let deps = {}; // { toast, thumb, getDate, getAddMeal, setAddMeal, recipeFoods, rerenderAdd }
const expanded = new Set(); // logged groups opened on Today

/* ---------------- Names and totals ---------------- */

// "Chick-fil-A Chicken Sandwich" → "Chicken Sandwich", "Bacon, pan-fried" → "Bacon".
export function shortName(food) {
  let n = String(food.name || '').trim();
  for (const b of [food.brand, food.source]) {
    if (b && n.toLowerCase().startsWith(`${b.toLowerCase()} `) && n.length > b.length + 3) n = n.slice(b.length + 1);
  }
  n = n.replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  return n || food.name || 'Food';
}

// The name a meal shows when it wasn't given one.
export function autoName(foods) {
  const names = foods.map(shortName);
  if (!names.length) return 'Empty meal';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
}

export const mealName = (m) => (m.name || '').trim() || autoName(m.items.map((i) => i.food));
const itemNutrients = (it) => store.entryNutrients(it.food, it.unitIndex, it.qty);
const totals = (items) => items.reduce((t, it) => {
  const n = itemNutrients(it);
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) t[k] += n[k] || 0;
  return t;
}, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
const sumLine = (t) => `<b>${round(t.kcal).toLocaleString()}</b> kcal · P ${round(t.protein)} · C ${round(t.carbs)} · F ${round(t.fat)}`;

const stack = (foods, cls = '') => `<span class="stack ${cls}" aria-hidden="true">${foods.slice(0, 3).map((f) => deps.thumb(f)).join('')}</span>`;

function unitText(it) {
  const unit = it.food.units[it.unitIndex] || it.food.units[0];
  const qty = +(+it.qty).toFixed(2);
  if (unit.label === 'g' || unit.label === 'ml') return `${qty} ${unit.label}`;
  return qty === 1 ? unit.label : `${qty} × ${unit.label}`;
}

const stepOf = (it) => {
  const label = (it.food.units[it.unitIndex] || it.food.units[0]).label;
  return label === 'g' || label === 'ml' ? 10 : 0.5;
};
const defaultItem = (food) => {
  const unitIndex = food.defaultUnit || 0;
  return { food, unitIndex, qty: food.units[unitIndex]?.label === 'g' ? 100 : 1 };
};

const stepper = (i, qty, attr) => `<span class="step"><button type="button" data-${attr}-step="${i}" data-d="-1" aria-label="Less">−</button><b>${+(+qty).toFixed(2)}</b><button type="button" data-${attr}-step="${i}" data-d="1" aria-label="More">+</button></span>`;

// Saved meals, best first: ones usually eaten at `meal`, then most used.
function ranked(meal) {
  return [...store.getState().meals].sort((a, b) =>
    ((b.meal === meal) - (a.meal === meal)) || ((b.lastUsed || 0) - (a.lastUsed || 0)) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
}

/* ---------------- Logging ---------------- */

function logWith(mealId, { meal, items, name }) {
  const date = deps.getDate();
  const entries = store.logMeal(mealId, { date, meal, items, name });
  const saved = store.getMeal(mealId);
  deps.toast(`Added ${saved ? mealName(saved) : 'meal'} to ${meal}`, {
    label: 'Undo',
    run: () => store.removeEntries(date, entries.map((e) => e.id)),
  });
}

export function quickAdd(mealId, meal) {
  const m = store.getMeal(mealId);
  if (m) logWith(mealId, { meal });
}

/* ---------------- Add food: strip + Saved tab ---------------- */

export function renderStrip() {
  const wrap = $('#meal-strip');
  const meals = ranked(deps.getAddMeal());
  wrap.hidden = !meals.length;
  if (!meals.length) return;
  const addMeal = deps.getAddMeal();
  $('#meal-strip-hint').textContent = `Tap + to add to ${addMeal}`;
  $('#meal-strip-list').innerHTML = meals.map((m) => {
    const t = totals(m.items);
    return `<div class="mcard" data-meal-open="${esc(m.id)}" role="button" tabindex="0">
      <div class="top">${stack(m.items.map((i) => i.food))}<button class="plus" type="button" data-meal-add="${esc(m.id)}" aria-label="Add ${esc(mealName(m))} to ${esc(addMeal)}">+</button></div>
      <div class="name ${m.name ? '' : 'unnamed'}">${esc(mealName(m))}</div>
      <div class="bot"><span class="k">${round(t.kcal).toLocaleString()} <small>kcal</small></span><span class="usual">${esc(m.meal || '')}</span></div>
    </div>`;
  }).join('') + '<button type="button" class="mcard new" data-meal-new>+ New meal</button>';
}

export function renderMyMeals() {
  const meals = ranked(deps.getAddMeal());
  $('#my-meals').innerHTML = meals.map((m) => {
    const t = totals(m.items);
    return `<li data-meal-open="${esc(m.id)}">${stack(m.items.map((i) => i.food))}
      <div class="info"><div class="name one">${esc(mealName(m))}</div>
        <div class="sub one">${m.items.map((i) => esc(shortName(i.food))).join(' · ')}</div>
        <div class="sub">${m.meal ? `Usually ${esc(m.meal.toLowerCase())}` : 'Any meal'}</div></div>
      <div class="mrow-acts"><div class="kcal">${round(t.kcal).toLocaleString()}<small>kcal</small></div>
        <button class="plus ghost" type="button" data-meal-add="${esc(m.id)}" aria-label="Add ${esc(mealName(m))}">+</button></div>
    </li>`;
  }).join('');
  $('#my-meals-hint').hidden = !meals.length;
  $('#my-meals-empty').hidden = !!meals.length;
}

/* ---------------- Today ---------------- */

// Entries of one meal card, with saved-meal groups shown together.
export function entriesHtml(list, entryRow) {
  const counts = new Map();
  for (const e of list) if (e.group?.id) counts.set(e.group.id, (counts.get(e.group.id) || 0) + 1);
  const done = new Set();
  let html = '';
  for (const e of list) {
    const gid = e.group?.id;
    if (!gid || counts.get(gid) < 2) { html += entryRow(e); continue; }
    if (done.has(gid)) continue;
    done.add(gid);
    const items = list.filter((x) => x.group?.id === gid);
    const open = expanded.has(gid);
    const kcal = items.reduce((s, x) => s + (x.nutrients.kcal || 0), 0);
    const name = (e.group.name || '').trim() || autoName(items.map((x) => x.food));
    html += `<div class="grp${open ? ' open' : ''}">
      <button type="button" class="grp-head" data-mg-toggle="${esc(gid)}" aria-expanded="${open}">
        ${stack(items.map((x) => x.food))}
        <span class="info"><span class="name">${esc(name)}</span>
          <span class="sub">${open ? `Saved meal · ${items.length} foods` : items.map((x) => esc(shortName(x.food))).join(' · ')}</span></span>
        <span class="kcal">${round(kcal).toLocaleString()}</span><span class="chev" aria-hidden="true">›</span>
      </button>
      ${open ? `<div class="grp-items">${items.map(entryRow).join('')}
        <button type="button" class="linkish danger" data-mg-remove="${esc(gid)}">Remove all ${items.length}</button></div>` : ''}
    </div>`;
  }
  return html;
}

// Below a meal card's entries: "Save as meal", or the usual meal when empty.
export function cardExtras(meal, list) {
  if (!list.length) {
    const usual = store.getState().meals.filter((m) => m.meal === meal)
      .sort((a, b) => ((b.uses || 0) - (a.uses || 0)) || ((b.lastUsed || 0) - (a.lastUsed || 0)))[0];
    if (!usual) return { top: '', button: '' };
    const t = totals(usual.items);
    return {
      top: `<div class="meal-chip" data-meal-open="${esc(usual.id)}" data-for-meal="${meal}" role="button" tabindex="0">${stack(usual.items.map((i) => i.food))}
        <div class="info"><div class="lbl">Your usual · ${round(t.kcal).toLocaleString()} kcal</div><div class="name">${esc(mealName(usual))}</div></div>
        <button class="plus" type="button" data-usual-add="${esc(usual.id)}" data-for-meal="${meal}" aria-label="Add ${esc(mealName(usual))} to ${meal}">+</button></div>`,
      button: '',
    };
  }
  const groups = new Set(list.map((e) => e.group?.id || `solo:${e.id}`));
  // Hide it once these exact foods are already a saved meal.
  const key = (foods) => foods.map((f) => f.id).sort().join('|');
  const here = key(list.map((e) => e.food));
  const known = store.getState().meals.some((m) => key(m.items.map((i) => i.food)) === here);
  const canSave = list.length >= 2 && groups.size > 1 && !known;
  return { top: '', button: canSave ? `<button class="btn small save-meal" data-save-meal="${meal}">☆ Save as meal</button>` : '' };
}

/* ---------------- Meal editor (new / edit) ---------------- */

const ed = { id: null, items: [], meal: null, confirm: false, base: null };

function openEditor({ meal = null, items = [], fromEntries = false } = {}) {
  const dlg = $('#sm-dialog');
  ed.id = meal?.id || null;
  ed.base = meal;
  ed.items = (meal ? meal.items : items).map((it) => ({ ...it }));
  ed.meal = meal ? meal.meal ?? null : items.meal ?? deps.getAddMeal();
  ed.confirm = false;
  $('#sm-title').textContent = meal ? 'Edit meal' : fromEntries ? 'Save as a meal' : 'New meal';
  $('#sm-name').value = meal?.name || '';
  renderEditor();
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('form').scrollTop = 0;
  document.activeElement?.blur();
}

function renderEditor() {
  const auto = autoName(ed.items.map((i) => i.food));
  $('#sm-name').placeholder = ed.items.length ? auto : 'e.g. Saturday breakfast';
  $('#sm-name-hint').textContent = ed.id && $('#sm-name').value.trim()
    ? `Clear the name to show it as “${auto}”.`
    : 'Optional. Leave it blank and the meal is shown by its foods.';
  $('#sm-items').innerHTML = ed.items.length ? ed.items.map((it, i) => `
    <div class="mi">${deps.thumb(it.food)}
      <div class="info"><div class="name">${esc(it.food.name)}</div><div class="sub">${esc(unitText(it))}</div></div>
      ${stepper(i, it.qty, 'ed')}<span class="kcal">${round(itemNutrients(it).kcal)}</span>
      <button type="button" class="x" data-ed-remove="${i}" aria-label="Remove ${esc(it.food.name)}">✕</button>
    </div>`).join('') : '<p class="muted small" style="padding:10px 0">No foods yet. Add the foods you eat together.</p>';
  $('#sm-usual').innerHTML = [...MEALS, 'Any'].map((m) => {
    const on = (m === 'Any' ? null : m) === ed.meal;
    return `<button type="button" data-usual="${m}" aria-selected="${on}" class="${on ? 'active' : ''}">${m}</button>`;
  }).join('');
  $('#sm-total').innerHTML = sumLine(totals(ed.items));
  $('#sm-delete').hidden = !ed.id || ed.confirm;
  $('#sm-save').hidden = ed.confirm;
  $('#sm-save').textContent = ed.id ? 'Save changes' : 'Save meal';
  $('#sm-confirm').hidden = !ed.confirm;
  if (ed.confirm) $('#sm-confirm-title').textContent = `Delete “${mealName(ed.base)}”?`;
}

function saveEditor() {
  if (!ed.items.length) return deps.toast('Add at least one food.');
  const saved = store.saveMeal({ ...(ed.base || {}), id: ed.id || undefined, name: $('#sm-name').value.trim(), items: ed.items, meal: ed.meal });
  $('#sm-dialog').close();
  deps.toast(ed.id ? 'Meal updated' : `Saved “${mealName(saved)}”`);
}

/* ---------------- Food picker (several at once) ---------------- */

const pk = { mode: 'new', tab: 'recent', picked: new Map(), restaurant: null, results: [], abort: null, timer: null };

function openPicker(mode) {
  pk.mode = mode; // 'new' (then name it) or 'add' (back to the editor)
  pk.picked = new Map();
  pk.tab = 'recent';
  pk.restaurant = null;
  pk.results = [];
  $('#mp-search').value = '';
  $('#mp-status').textContent = '';
  $('#mp-next').textContent = mode === 'new' ? 'Next: name it ›' : 'Add to meal';
  renderPicker();
  $('#meal-pick-dialog').showModal();
  document.activeElement?.blur();
}

function pickRow(f) {
  const on = pk.picked.has(f.id);
  const unit = f.units[f.defaultUnit || 0];
  return `<li data-pick="${esc(f.id)}" class="${on ? 'on' : ''}" role="checkbox" aria-checked="${on}">
    <span class="pick" aria-hidden="true">${on ? '✓' : ''}</span>
    <div class="info"><div class="name">${esc(f.name)}</div><div class="sub"><span class="tag">${esc(f.source)}</span>${esc(unit.label)}</div></div>
    <div class="kcal">${round((f.nutrients.kcal || 0) * unit.factor)}<small>kcal</small></div></li>`;
}

const pkCache = new Map();
async function renderPicker() {
  $$('#mp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.pt === pk.tab));
  const q = $('#mp-search').value.trim().toLowerCase();
  const list = $('#mp-list');
  const status = $('#mp-status');
  status.className = 'status';
  $('#mp-rest').hidden = true;
  let foods = [];
  if (pk.tab === 'recent' || pk.tab === 'mine') {
    const { recent, myFoods } = store.getState();
    foods = pk.tab === 'recent' ? recent : [...deps.recipeFoods(), ...myFoods];
    foods = foods.filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i && (!q || f.name.toLowerCase().includes(q)));
    status.textContent = foods.length ? '' : q ? 'Nothing here matches. Try the Search tab.' : pk.tab === 'recent' ? 'Foods you log show up here.' : 'Foods and recipes you create show up here.';
  } else if (pk.tab === 'restaurants') {
    const rest = $('#mp-rest');
    rest.hidden = false;
    rest.innerHTML = RESTAURANTS.map((r) => `<button type="button" class="${pk.restaurant === r.id ? 'active' : ''}" data-pr="${esc(r.id)}">${esc(r.name)}</button>`).join('');
    if (!pk.restaurant) {
      status.textContent = 'Pick a restaurant to see its menu.';
    } else {
      const r = getRestaurant(pk.restaurant);
      status.textContent = 'Loading menu…';
      try {
        foods = await r.search(q);
        if (pk.tab !== 'restaurants' || pk.restaurant !== r.id) return;
        status.textContent = foods.length ? '' : 'No menu items match.';
      } catch (e) {
        status.className = 'status error';
        status.textContent = e.message;
      }
    }
  } else {
    foods = pk.results;
    if (!foods.length && !status.textContent) status.textContent = 'Type a food and press search.';
  }
  for (const f of foods) pkCache.set(f.id, f);
  list.innerHTML = foods.map(pickRow).join('');
  renderPickBar();
}

function renderPickBar() {
  const n = pk.picked.size;
  const t = totals([...pk.picked.values()].map(defaultItem));
  $('#mp-count').textContent = n ? `${n} picked` : 'Tap foods to pick them';
  $('#mp-kcal').textContent = n ? `${round(t.kcal).toLocaleString()} kcal` : '';
  $('#mp-next').disabled = !n;
}

async function pickerSearch() {
  const q = $('#mp-search').value.trim();
  if (pk.tab !== 'search' && pk.tab !== 'restaurants') { pk.tab = 'search'; }
  if (pk.tab === 'restaurants') return renderPicker();
  if (!q) return renderPicker();
  pk.abort?.abort();
  const ctrl = new AbortController();
  pk.abort = ctrl;
  $$('#mp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.pt === pk.tab));
  $('#mp-list').innerHTML = '';
  const status = $('#mp-status');
  status.className = 'status';
  status.textContent = 'Searching…';
  const { usdaFoods, offFoods, errors } = await searchFoods(q, { apiKey: store.getState().settings.usdaApiKey, signal: ctrl.signal });
  if (ctrl.signal.aborted) return;
  pk.results = [...usdaFoods, ...offFoods];
  status.className = errors.length ? 'status error' : 'status';
  status.textContent = pk.results.length ? (errors.length ? errors.join(' · ') : '') : `No foods found for “${q}”.${errors.length ? ` ${errors.join(' · ')}` : ''}`;
  renderPicker();
}

function finishPicker() {
  const items = [...pk.picked.values()].map(defaultItem);
  $('#meal-pick-dialog').close();
  if (pk.mode === 'add') {
    for (const it of items) if (!ed.items.some((x) => x.food.id === it.food.id)) ed.items.push(it);
    renderEditor();
  } else {
    openEditor({ items });
  }
}

/* ---------------- Log a meal (adjust for today) ---------------- */

const lg = { id: null, meal: null, rows: [] };

function openLog(mealId, forMeal = null) {
  const m = store.getMeal(mealId);
  if (!m) return;
  lg.id = mealId;
  lg.meal = forMeal || (deps.getView() === 'add' ? deps.getAddMeal() : m.meal || deps.getAddMeal());
  lg.rows = m.items.map((it) => ({ ...it, on: true }));
  $('#ml-stack').innerHTML = stack(m.items.map((i) => i.food), 'lg');
  $('#ml-name').textContent = mealName(m);
  $('#ml-meta').textContent = `Saved meal · ${m.items.length} food${m.items.length === 1 ? '' : 's'}`;
  renderLog();
  $('#meal-log-dialog').showModal();
  document.activeElement?.blur();
}

function renderLog() {
  $('#ml-meal').innerHTML = MEALS.map((m) => `<button type="button" data-ml-meal="${m}" aria-selected="${m === lg.meal}" class="${m === lg.meal ? 'active' : ''}">${m}</button>`).join('');
  $('#ml-items').innerHTML = lg.rows.map((it, i) => `
    <div class="mi ${it.on ? '' : 'off'}">
      <button type="button" class="chk ${it.on ? '' : 'off'}" data-ml-toggle="${i}" role="checkbox" aria-checked="${it.on}" aria-label="${esc(it.food.name)}">${it.on ? '✓' : ''}</button>
      <div class="info" data-ml-toggle="${i}"><div class="name">${esc(it.food.name)}</div><div class="sub">${esc(unitText(it))}</div></div>
      ${stepper(i, it.qty, 'ml')}<span class="kcal">${round(itemNutrients(it).kcal)}</span>
    </div>`).join('');
  const on = lg.rows.filter((r) => r.on);
  $('#ml-total').innerHTML = sumLine(totals(on));
  const btn = $('#ml-add');
  btn.disabled = !on.length;
  btn.textContent = on.length === lg.rows.length ? `Add to ${lg.meal}` : `Add ${on.length} food${on.length === 1 ? '' : 's'} to ${lg.meal}`;
}

function addFromLog() {
  const items = lg.rows.filter((r) => r.on).map(({ on, ...it }) => it);
  if (!items.length) return;
  $('#meal-log-dialog').close();
  deps.setAddMeal(lg.meal);
  logWith(lg.id, { meal: lg.meal, items });
}

/* ---------------- Events ---------------- */

// Press and hold (on a meal card or row) opens the editor.
function bindHold(root) {
  let timer = null;
  let held = false;
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-meal-open]');
    if (!el || e.target.closest('button')) return;
    held = false;
    timer = setTimeout(() => {
      held = true;
      const m = store.getMeal(el.dataset.mealOpen);
      if (m) openEditor({ meal: m });
    }, 550);
  });
  const cancel = () => clearTimeout(timer);
  ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach((t) => root.addEventListener(t, (e) => {
    if (t === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return;
    cancel();
  }));
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-meal-open]')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    if (held) { held = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
}

function mealListClick(e) {
  const add = e.target.closest('[data-meal-add]');
  if (add) {
    e.stopPropagation();
    return quickAdd(add.dataset.mealAdd, deps.getAddMeal());
  }
  if (e.target.closest('[data-meal-new]')) return openPicker('new');
  const open = e.target.closest('[data-meal-open]');
  if (open) {
    e.stopPropagation();
    openLog(open.dataset.mealOpen);
  }
}

export function init(d) {
  deps = d;

  for (const root of [$('#meal-strip'), $('#my-meals')]) {
    bindHold(root);
    root.addEventListener('click', mealListClick);
  }
  $('#my-meals-new').onclick = () => openPicker('new');

  // Today
  bindHold($('#meals'));
  $('#meals').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-mg-toggle]');
    if (toggle) {
      const id = toggle.dataset.mgToggle;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      return deps.renderToday();
    }
    const rm = e.target.closest('[data-mg-remove]');
    if (rm) {
      const date = deps.getDate();
      const list = store.entriesFor(date).filter((x) => x.group?.id === rm.dataset.mgRemove);
      if (!confirm(`Remove all ${list.length} foods of this meal from your log?`)) return;
      return store.removeEntries(date, list.map((x) => x.id));
    }
    const save = e.target.closest('[data-save-meal]');
    if (save) {
      const meal = save.dataset.saveMeal;
      const items = store.entriesFor(deps.getDate()).filter((x) => x.meal === meal).map((x) => ({ food: x.food, unitIndex: x.unitIndex, qty: x.qty }));
      items.meal = meal;
      return openEditor({ items, fromEntries: true });
    }
    const usual = e.target.closest('[data-usual-add]');
    if (usual) return quickAdd(usual.dataset.usualAdd, usual.dataset.forMeal);
    const chip = e.target.closest('.meal-chip[data-meal-open]');
    if (chip) openLog(chip.dataset.mealOpen, chip.dataset.forMeal);
  });

  // Editor
  const form = $('#sm-form');
  form.onsubmit = (e) => { e.preventDefault(); saveEditor(); };
  $('#sm-close').onclick = () => $('#sm-dialog').close();
  $('#sm-name').addEventListener('input', () => {
    $('#sm-name-hint').textContent = ed.id && $('#sm-name').value.trim()
      ? `Clear the name to show it as “${autoName(ed.items.map((i) => i.food))}”.`
      : 'Optional. Leave it blank and the meal is shown by its foods.';
  });
  form.addEventListener('click', (e) => {
    const step = e.target.closest('[data-ed-step]');
    if (step) {
      const it = ed.items[+step.dataset.edStep];
      const s = stepOf(it);
      it.qty = Math.max(s, +(it.qty + s * +step.dataset.d).toFixed(2));
      return renderEditor();
    }
    const rm = e.target.closest('[data-ed-remove]');
    if (rm) { ed.items.splice(+rm.dataset.edRemove, 1); return renderEditor(); }
    const u = e.target.closest('[data-usual]');
    if (u) { ed.meal = u.dataset.usual === 'Any' ? null : u.dataset.usual; return renderEditor(); }
  });
  $('#sm-more').onclick = () => openPicker('add');
  $('#sm-delete').onclick = () => { ed.confirm = true; renderEditor(); };
  $('#sm-keep').onclick = () => { ed.confirm = false; renderEditor(); };
  $('#sm-delete-yes').onclick = () => {
    const name = mealName(ed.base);
    store.deleteMeal(ed.id);
    $('#sm-dialog').close();
    deps.toast(`Deleted “${name}”`);
  };

  // Picker
  $('#mp-close').onclick = () => $('#meal-pick-dialog').close();
  $('#mp-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pt]');
    if (!b) return;
    pk.tab = b.dataset.pt;
    if (pk.tab === 'search' && $('#mp-search').value.trim() && !pk.results.length) return pickerSearch();
    renderPicker();
  });
  $('#mp-rest').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pr]');
    if (!b) return;
    pk.restaurant = b.dataset.pr;
    renderPicker();
  });
  $('#mp-form').onsubmit = (e) => { e.preventDefault(); $('#mp-search').blur(); pickerSearch(); };
  $('#mp-search').addEventListener('input', () => {
    clearTimeout(pk.timer);
    if (pk.tab === 'search') return;
    pk.timer = setTimeout(renderPicker, 200);
  });
  $('#mp-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-pick]');
    if (!li) return;
    const f = pkCache.get(li.dataset.pick);
    if (!f) return;
    if (pk.picked.has(f.id)) pk.picked.delete(f.id); else pk.picked.set(f.id, f);
    const on = pk.picked.has(f.id);
    li.classList.toggle('on', on);
    li.setAttribute('aria-checked', on);
    li.querySelector('.pick').textContent = on ? '✓' : '';
    renderPickBar();
  });
  $('#mp-next').onclick = finishPicker;

  // Log sheet
  $('#ml-close').onclick = () => $('#meal-log-dialog').close();
  $('#ml-add').onclick = addFromLog;
  $('#ml-edit').onclick = () => {
    const m = store.getMeal(lg.id);
    $('#meal-log-dialog').close();
    if (m) openEditor({ meal: m });
  };
  $('#meal-log-dialog').addEventListener('click', (e) => {
    const mb = e.target.closest('[data-ml-meal]');
    if (mb) { lg.meal = mb.dataset.mlMeal; return renderLog(); }
    const step = e.target.closest('[data-ml-step]');
    if (step) {
      const it = lg.rows[+step.dataset.mlStep];
      const s = stepOf(it);
      it.qty = Math.max(s, +(it.qty + s * +step.dataset.d).toFixed(2));
      it.on = true;
      return renderLog();
    }
    const t = e.target.closest('[data-ml-toggle]');
    if (t) { const r = lg.rows[+t.dataset.mlToggle]; r.on = !r.on; renderLog(); }
  });
}
