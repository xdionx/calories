// Local persistence. Everything lives in the browser's localStorage, so the app
// works offline. When the user signs in, js/sync.js copies changes to and from
// their account; this module tracks which pieces changed so sync can send just
// those.
//
// Food shape used across the app:
// {
//   id: 'off:3017620422003',          // unique, prefixed by source
//   source: 'Open Food Facts',        // display name of where it came from
//   name: 'Nutella', brand: 'Ferrero',
//   nutrients: { kcal, protein, ... },// amounts for ONE "base" (factor = 1)
//   units: [{ label: '100 g', factor: 1 }, { label: 'g', factor: 0.01 }, ...],
//   defaultUnit: 0,
// }
// A log entry is { id, date, meal, food, unitIndex, qty, nutrients, createdAt,
// updatedAt } where `nutrients` is the already-scaled total for that entry.
//
// Calories burned per day: burn['YYYY-MM-DD'] = { date, active, resting,
// source: 'garmin' | 'manual' | 'health', updatedAt }. `resting` may be null
// (then the "Resting burn" goal is used).
//
// Body weight per day: weights['YYYY-MM-DD'] = { date, kg, source:
// 'garmin' | 'manual', updatedAt }. Always stored in kg.
//
// settings.profile = { birthday: 'YYYY-MM-DD', sex: 'male' | 'female',
// heightCm, units: 'imperial' | 'metric', plan: 'lose' | 'maintain' | 'gain',
// rate (kg/week), autoGoals } drives the recommended goals (js/targets.js).
//
// Sync model: the state is split into "items", each with a last-changed time:
//   entry:<id>  one log entry          food:<id>  one custom food
//   burn:<date> calories burned that day
//   weight:<date> body weight that day
//   goals, settings, recent            whole objects
// Changing something stamps it and marks its item pending. Sync pushes pending
// items and applies newer remote ones (last write wins per item).

import { scaleNutrients, sumNutrients } from './nutrients.js';

const KEY = 'ct.v1';
const SYNC_KEY = 'ct.sync.v1';
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const DEFAULT_STATE = {
  // restingKcal: calories burned at rest per day (BMR), used when the
  // source of a day's burn doesn't report it.
  goals: { kcal: 2000, protein: 150, carbs: 200, fat: 67, restingKcal: 0 },
  settings: { usdaApiKey: '', profile: {} },
  log: {}, // { 'YYYY-MM-DD': [entry, ...] }
  recent: [], // recently used foods (most recent first)
  myFoods: [], // custom foods the user created
  burn: {}, // { 'YYYY-MM-DD': { date, active, resting, source, updatedAt } }
  weights: {}, // { 'YYYY-MM-DD': { date, kg, source, updatedAt } }
  stamps: { goals: 0, settings: 0, recent: 0 }, // last-changed times of whole-object items
};

// owner: account id the local data belongs to (null = not signed in yet)
// cursor: server time of the newest change already pulled
// pending: item ids changed here and not yet uploaded
// deleted: item id → time it was deleted here (until uploaded)
const DEFAULT_SYNC = { owner: null, cursor: null, pending: {}, deleted: {} };

let state = load();
let sync = loadSync();
const listeners = new Set();

function normalize(parsed) {
  return {
    ...structuredClone(DEFAULT_STATE),
    ...parsed,
    goals: { ...DEFAULT_STATE.goals, ...(parsed.goals || {}) },
    settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
    burn: parsed.burn && typeof parsed.burn === 'object' ? parsed.burn : {},
    weights: parsed.weights && typeof parsed.weights === 'object' ? parsed.weights : {},
    stamps: { ...DEFAULT_STATE.stamps, ...(parsed.stamps || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return structuredClone(DEFAULT_STATE);
}

function loadSync() {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (raw) return { ...structuredClone(DEFAULT_SYNC), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Could not read sync data', e);
  }
  return structuredClone(DEFAULT_SYNC);
}

// `source` tells listeners why the state changed: 'local' for the user's own
// edits (sync uploads these), 'sync' for changes that came from the account.
function save(source = 'local') {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  } catch (e) {
    console.warn('Could not save data', e);
  }
  listeners.forEach((fn) => fn(state, source));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getState = () => state;

/* ---------------- Change tracking ---------------- */

// Strictly increasing so two changes in the same millisecond still order.
let lastStamp = 0;
function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function touch(itemId) {
  sync.pending[itemId] = true;
}

function touchDeleted(itemId) {
  sync.pending[itemId] = true;
  sync.deleted[itemId] = stamp();
}

/* ---------------- Dates ---------------- */

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + days));
}

/* ---------------- Log ---------------- */

export function entriesFor(date) {
  return state.log[date] || [];
}

export function totalsFor(date) {
  return sumNutrients(entriesFor(date).map((e) => e.nutrients));
}

export function entryNutrients(food, unitIndex, qty) {
  const unit = food.units[unitIndex] || food.units[0];
  return scaleNutrients(food.nutrients, unit.factor * qty);
}

export function addEntry({ date, meal, food, unitIndex, qty }) {
  const now = stamp();
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    date,
    meal,
    food,
    unitIndex,
    qty,
    nutrients: entryNutrients(food, unitIndex, qty),
    createdAt: now,
    updatedAt: now,
  };
  state.log[date] = [...entriesFor(date), entry];
  touch(`entry:${entry.id}`);
  rememberRecent(food);
  save();
  return entry;
}

export function updateEntry(date, id, changes) {
  state.log[date] = entriesFor(date).map((e) => {
    if (e.id !== id) return e;
    const next = { ...e, ...changes, updatedAt: stamp() };
    next.nutrients = entryNutrients(next.food, next.unitIndex, next.qty);
    return next;
  });
  touch(`entry:${id}`);
  save();
}

export function removeEntry(date, id) {
  state.log[date] = entriesFor(date).filter((e) => e.id !== id);
  if (!state.log[date].length) delete state.log[date];
  touchDeleted(`entry:${id}`);
  save();
}

function rememberRecent(food) {
  state.recent = [food, ...state.recent.filter((f) => f.id !== food.id)].slice(0, 30);
  state.stamps.recent = stamp();
  touch('recent');
}

/* ---------------- Calories burned ---------------- */

export function burnFor(date) {
  return state.burn[date] || null;
}

// { active, resting, source }. Numbers are kcal; resting may be null.
export function setBurn(date, { active, resting = null, source }) {
  const clean = (n) => (n == null || n === '' || !Number.isFinite(+n) ? null : Math.max(0, Math.round(+n)));
  const prev = state.burn[date];
  const next = { date, active: clean(active) ?? 0, resting: clean(resting), source };
  if (prev && prev.active === next.active && prev.resting === next.resting && prev.source === next.source) return false;
  state.burn[date] = { ...next, updatedAt: stamp() };
  touch(`burn:${date}`);
  save();
  return true;
}

export function removeBurn(date) {
  if (!state.burn[date]) return;
  delete state.burn[date];
  touchDeleted(`burn:${date}`);
  save();
}

// Eaten vs burned for a day. net < 0 is a deficit, > 0 a surplus.
// Returns null when nothing burned is known for that day.
export function balanceFor(date) {
  const b = state.burn[date];
  if (!b) return null;
  const eaten = totalsFor(date).kcal || 0;
  const restingFromGoal = !(b.resting > 0);
  const resting = restingFromGoal ? state.goals.restingKcal || 0 : b.resting;
  const burned = resting + (b.active || 0);
  return { eaten, active: b.active || 0, resting, restingFromGoal, burned, net: eaten - burned, source: b.source };
}

/* ---------------- Body weight ---------------- */

export const weightFor = (date) => state.weights[date] || null;

// Most recent weight on or before `date`.
export function latestWeight(date = todayKey()) {
  let best = null;
  for (const w of Object.values(state.weights)) if (w.date <= date && (!best || w.date > best.date)) best = w;
  return best;
}

// Weights between two dates (inclusive), oldest first.
export function weightsBetween(start, end) {
  return Object.values(state.weights).filter((w) => w.date >= start && w.date <= end).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function setWeight(date, { kg, source }) {
  const value = Math.round(+kg * 100) / 100;
  if (!(value > 0)) return false;
  const prev = state.weights[date];
  if (prev && prev.kg === value && prev.source === source) return false;
  state.weights[date] = { date, kg: value, source, updatedAt: stamp() };
  touch(`weight:${date}`);
  save();
  return true;
}

export function removeWeight(date) {
  if (!state.weights[date]) return;
  delete state.weights[date];
  touchDeleted(`weight:${date}`);
  save();
}

export const getProfile = () => state.settings.profile || {};

export function setProfile(changes) {
  setSettings({ profile: { ...getProfile(), ...changes } });
}

/* ---------------- Custom foods, goals, settings ---------------- */

export function saveMyFood(food) {
  const saved = { ...food, updatedAt: stamp() };
  state.myFoods = [saved, ...state.myFoods.filter((f) => f.id !== food.id)];
  touch(`food:${food.id}`);
  save();
}

export function deleteMyFood(id) {
  state.myFoods = state.myFoods.filter((f) => f.id !== id);
  touchDeleted(`food:${id}`);
  save();
}

export function setGoals(goals) {
  state.goals = { ...state.goals, ...goals };
  state.stamps.goals = stamp();
  touch('goals');
  save();
}

export function setSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  state.stamps.settings = stamp();
  touch('settings');
  save();
}

/* ---------------- Backup ---------------- */

export function exportData() {
  return JSON.stringify(state, null, 2);
}

// Replaces this device's data with the backup. When signed in, the backup
// also replaces the account's data: everything is re-stamped as a new change,
// and anything not in the backup is deleted.
export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.log) throw new Error('That file is not a Calorie Tracker export.');
  const before = new Set(allItems(state).keys());
  state = normalize(parsed);
  const now = stamp();
  for (const day of Object.values(state.log)) {
    for (const e of day) {
      e.createdAt = e.createdAt || now;
      e.updatedAt = now;
    }
  }
  state.myFoods = state.myFoods.map((f) => ({ ...f, updatedAt: now }));
  for (const b of Object.values(state.burn)) b.updatedAt = now;
  for (const w of Object.values(state.weights)) w.updatedAt = now;
  state.stamps = { goals: now, settings: now, recent: now };
  const after = allItems(state);
  for (const id of before) if (!after.has(id)) touchDeleted(id);
  for (const id of after.keys()) touch(id);
  save();
}

/* ---------------- Sync support (used by js/sync.js) ---------------- */

// Every syncable item in a state: id → { kind, data, updatedAt }
function allItems(s) {
  const items = new Map();
  for (const day of Object.values(s.log)) {
    for (const e of day) items.set(`entry:${e.id}`, { kind: 'entry', data: e, updatedAt: e.updatedAt || 0 });
  }
  for (const f of s.myFoods) items.set(`food:${f.id}`, { kind: 'food', data: f, updatedAt: f.updatedAt || 0 });
  for (const b of Object.values(s.burn || {})) items.set(`burn:${b.date}`, { kind: 'burn', data: b, updatedAt: b.updatedAt || 0 });
  for (const w of Object.values(s.weights || {})) items.set(`weight:${w.date}`, { kind: 'weight', data: w, updatedAt: w.updatedAt || 0 });
  items.set('goals', { kind: 'goals', data: s.goals, updatedAt: s.stamps.goals || 0 });
  items.set('settings', { kind: 'settings', data: s.settings, updatedAt: s.stamps.settings || 0 });
  items.set('recent', { kind: 'recent', data: s.recent, updatedAt: s.stamps.recent || 0 });
  return items;
}

function findItem(itemId) {
  if (itemId.startsWith('entry:')) {
    const id = itemId.slice(6);
    for (const day of Object.values(state.log)) {
      const e = day.find((x) => x.id === id);
      if (e) return { kind: 'entry', data: e, updatedAt: e.updatedAt || 0 };
    }
    return null;
  }
  if (itemId.startsWith('food:')) {
    const f = state.myFoods.find((x) => x.id === itemId.slice(5));
    return f ? { kind: 'food', data: f, updatedAt: f.updatedAt || 0 } : null;
  }
  if (itemId.startsWith('burn:')) {
    const b = state.burn[itemId.slice(5)];
    return b ? { kind: 'burn', data: b, updatedAt: b.updatedAt || 0 } : null;
  }
  if (itemId.startsWith('weight:')) {
    const w = state.weights[itemId.slice(7)];
    return w ? { kind: 'weight', data: w, updatedAt: w.updatedAt || 0 } : null;
  }
  return allItems({ ...state, log: {}, myFoods: [], burn: {}, weights: {} }).get(itemId) || null;
}

const kindOf = (itemId) => {
  for (const k of ['entry', 'food', 'burn', 'weight']) if (itemId.startsWith(`${k}:`)) return k;
  return itemId;
};

export const getSyncMeta = () => ({ owner: sync.owner, cursor: sync.cursor });

export function setSyncMeta(changes) {
  Object.assign(sync, changes);
  save('sync');
}

export const hasPending = () => Object.keys(sync.pending).length > 0;

// Pending changes as rows to upload.
export function pendingItems() {
  const rows = [];
  for (const id of Object.keys(sync.pending)) {
    const item = findItem(id);
    if (item) rows.push({ id, kind: item.kind, data: item.data, updated_at: item.updatedAt, deleted: false });
    else rows.push({ id, kind: kindOf(id), data: null, updated_at: sync.deleted[id] || stamp(), deleted: true });
  }
  return rows;
}

// Clears pending marks for uploaded rows, unless they changed again meanwhile.
export function markPushed(rows) {
  for (const row of rows) {
    const item = findItem(row.id);
    const current = item ? item.updatedAt : sync.deleted[row.id];
    const sameState = item ? !row.deleted : row.deleted;
    if (current === row.updated_at && sameState) {
      delete sync.pending[row.id];
      delete sync.deleted[row.id];
    }
  }
  save('sync');
}

// Applies rows from the account. A local change that is newer wins.
export function applyRemote(rows) {
  let changed = false;
  for (const row of rows) {
    const item = findItem(row.id);
    const localTs = item ? item.updatedAt : sync.deleted[row.id] || 0;
    if (sync.pending[row.id]) {
      if (localTs > row.updated_at) continue; // ours is newer; it will be uploaded
      delete sync.pending[row.id];
      delete sync.deleted[row.id];
    }
    if (item && localTs === row.updated_at && !row.deleted) continue; // already have it
    if (!item && row.deleted) continue; // already gone
    putItem(row);
    changed = true;
  }
  save('sync');
  return changed;
}

function putItem(row) {
  const { id, kind, data, deleted } = row;
  if (kind === 'entry') {
    const entryId = id.slice(6);
    for (const [date, day] of Object.entries(state.log)) {
      if (day.some((e) => e.id === entryId)) {
        state.log[date] = day.filter((e) => e.id !== entryId);
        if (!state.log[date].length) delete state.log[date];
      }
    }
    if (!deleted) {
      const day = [...entriesFor(data.date), { ...data, updatedAt: row.updated_at }];
      day.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      state.log[data.date] = day;
    }
  } else if (kind === 'food') {
    const foodId = id.slice(5);
    state.myFoods = state.myFoods.filter((f) => f.id !== foodId);
    if (!deleted) {
      state.myFoods = [...state.myFoods, { ...data, updatedAt: row.updated_at }].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
  } else if (kind === 'weight') {
    const date = id.slice(7);
    if (deleted) delete state.weights[date];
    else state.weights[date] = { ...data, date, updatedAt: row.updated_at };
  } else if (kind === 'burn') {
    const date = id.slice(5);
    if (deleted) delete state.burn[date];
    else state.burn[date] = { ...data, date, updatedAt: row.updated_at };
  } else if (kind === 'goals' || kind === 'settings' || kind === 'recent') {
    if (deleted) return;
    if (kind === 'goals') state.goals = { ...DEFAULT_STATE.goals, ...data };
    if (kind === 'settings') state.settings = { ...DEFAULT_STATE.settings, ...data };
    if (kind === 'recent') state.recent = Array.isArray(data) ? data : [];
    state.stamps[kind] = row.updated_at;
  }
}

// Called on first sign-in on a device: everything already here gets uploaded
// to the account (merged with what is already there).
export function markAllPending() {
  // Goals, settings and recent foods saved before sync existed have no
  // timestamp. Give them the oldest possible one so they upload, but any
  // change made on another device since wins. Untouched defaults stay out.
  const isDefault = (k) => JSON.stringify(state[k]) === JSON.stringify(DEFAULT_STATE[k]);
  for (const k of ['goals', 'settings', 'recent']) {
    if (!state.stamps[k] && !isDefault(k)) state.stamps[k] = 1;
  }
  for (const [id, item] of allItems(state)) {
    if (item.updatedAt || item.kind === 'entry' || item.kind === 'food' || item.kind === 'burn' || item.kind === 'weight') touch(id);
  }
  save('sync');
}

// Wipes this device's data (used on sign-out and when a different account
// signs in).
export function resetLocal() {
  state = structuredClone(DEFAULT_STATE);
  sync = structuredClone(DEFAULT_SYNC);
  save('sync');
}
