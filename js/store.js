// Local persistence. Everything lives in the browser's localStorage, so the app
// works offline and needs no account. Export/import in Settings moves data
// between devices.
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
// A log entry is { id, date, meal, food, unitIndex, qty, nutrients } where
// `nutrients` is the already-scaled total for that entry.

import { scaleNutrients, sumNutrients } from './nutrients.js';

const KEY = 'ct.v1';
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const DEFAULT_STATE = {
  goals: { kcal: 2000, protein: 150, carbs: 200, fat: 67 },
  settings: { usdaApiKey: '' },
  log: {}, // { 'YYYY-MM-DD': [entry, ...] }
  recent: [], // recently used foods (most recent first)
  myFoods: [], // custom foods the user created
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        goals: { ...DEFAULT_STATE.goals, ...(parsed.goals || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      };
    }
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return structuredClone(DEFAULT_STATE);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save data', e);
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getState = () => state;

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
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    date,
    meal,
    food,
    unitIndex,
    qty,
    nutrients: entryNutrients(food, unitIndex, qty),
  };
  state.log[date] = [...entriesFor(date), entry];
  rememberRecent(food);
  save();
  return entry;
}

export function updateEntry(date, id, changes) {
  state.log[date] = entriesFor(date).map((e) => {
    if (e.id !== id) return e;
    const next = { ...e, ...changes };
    next.nutrients = entryNutrients(next.food, next.unitIndex, next.qty);
    return next;
  });
  save();
}

export function removeEntry(date, id) {
  state.log[date] = entriesFor(date).filter((e) => e.id !== id);
  if (!state.log[date].length) delete state.log[date];
  save();
}

function rememberRecent(food) {
  state.recent = [food, ...state.recent.filter((f) => f.id !== food.id)].slice(0, 30);
}

export function saveMyFood(food) {
  state.myFoods = [food, ...state.myFoods.filter((f) => f.id !== food.id)];
  save();
}

export function deleteMyFood(id) {
  state.myFoods = state.myFoods.filter((f) => f.id !== id);
  save();
}

export function setGoals(goals) {
  state.goals = { ...state.goals, ...goals };
  save();
}

export function setSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  save();
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.log) throw new Error('That file is not a Calorie Tracker export.');
  localStorage.setItem(KEY, JSON.stringify(parsed));
  state = load();
  save();
}
