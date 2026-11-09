// Garmin: pulls calories burned per day from Garmin Connect's Personal API,
// through the "garmin" Supabase Edge Function (supabase/functions/garmin).
//
// The Personal API key is saved once to the user's account (the function
// stores it in the garmin_keys table) and never comes back to the browser.
// settings.garminLinked (synced) tells every signed-in device a key exists.
// Older versions kept the key in this device's storage; it's moved to the
// account on the next pull.

import * as store from './store.js';
import * as sync from './sync.js';

const KEY = 'ct.garmin.v1';
const FRESH_MS = 15 * 60 * 1000; // re-pull today at most every 15 min

let saved = load();
const listeners = new Set();
let busy = null;
export const status = { state: 'idle', message: '' }; // idle | syncing | ok | error

function load() {
  try {
    return { apiKey: '', pulled: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { apiKey: '', pulled: {} };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {}
}

function emit(changes) {
  Object.assign(status, changes);
  listeners.forEach((fn) => fn(status));
}

export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const hasKey = () => Boolean(store.getState().settings.garminLinked || saved.apiKey);
export const lastPulled = () => saved.lastOk || null;
// Set when a key saved by an older version is still only on this device.
export const localOnly = () => (saved.apiKey ? saved.migrateError || 'not moved yet' : null);

// Checks the key with Garmin and saves it to the account.
export async function saveKey(apiKey) {
  await sync.callFunction('garmin', { action: 'saveKey', apiKey: apiKey.trim() });
  saved = { apiKey: '', pulled: {} };
  persist();
  store.setSettings({ garminLinked: true });
  emit({ state: 'idle', message: '' });
}

export async function removeKey() {
  if (store.getState().settings.garminLinked) await sync.callFunction('garmin', { action: 'deleteKey' });
  saved = { apiKey: '', pulled: {} };
  persist();
  store.setSettings({ garminLinked: false });
  emit({ state: 'idle', message: '' });
}

// A key left on this device by an older version: move it to the account.
// If that isn't possible yet (table not created), keep using it from here.
async function migrateLocalKey() {
  if (!saved.apiKey) return;
  try {
    await sync.callFunction('garmin', { action: 'saveKey', apiKey: saved.apiKey });
    saved.apiKey = '';
    persist();
    store.setSettings({ garminLinked: true });
    delete saved.migrateError;
  } catch (e) {
    console.warn('Garmin key stays on this device for now:', e.message);
    saved.migrateError = e.message;
    persist();
  }
}

// Marks a day as never pulled, so the next refresh fetches it again.
export function forgetPulled(date) {
  delete saved.pulled[date];
  persist();
}

/* ---------------- Reading Garmin's daily summary ---------------- */

// Garmin's daily summary format isn't fully documented, so look for the
// calorie numbers by name anywhere in each day's object, e.g.
// activeKilocalories / bmrKilocalories / totalKilocalories, or
// calories: { active, bmr, total }.
function leaves(obj, path = '', out = []) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) leaves(v, path ? `${path}.${k}` : k, out);
  } else if (typeof obj === 'number' && Number.isFinite(obj)) {
    out.push([path.toLowerCase(), obj]);
  }
  return out;
}

const SKIP = /goal|consum|intake|food|remaining|net|target|percent|average|avg|max|min|count|time|second|minute|duration/;

export function parseDay(day) {
  const date = day.calendarDate || day.date || day.summaryDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const cal = leaves(day).filter(([p]) => /cal/.test(p) && !SKIP.test(p));
  const pick = (re) => cal.find(([p]) => re.test(p))?.[1];
  let active = pick(/active/);
  let resting = pick(/bmr|resting/);
  const total = pick(/total/);
  if (active == null && total != null && resting != null) active = total - resting;
  if (resting == null && total != null && active != null) resting = total - active;
  if (active == null) return null;
  return { date: date.slice(0, 10), active, resting: resting ?? null };
}

function daysFrom(response) {
  // The function returns { summaries, weight }; older deployments return the
  // summaries directly.
  if (response && !Array.isArray(response) && 'summaries' in response) response = response.summaries;
  const list = Array.isArray(response) ? response : response?.data || response?.dailySummaries || response?.summaries || [];
  return (Array.isArray(list) ? list : [list]).map(parseDay).filter(Boolean);
}

// Garmin's weight response isn't documented either. Look for objects that
// carry a date and a weight (Garmin usually reports grams), e.g.
// { summaryDate, latestWeight: { weight: 81500 } } or { calendarDate, weight }.
export function parseWeights(response) {
  const found = new Map();
  const toKg = (n) => (n > 1000 ? n / 1000 : n);
  const visit = (o) => {
    if (Array.isArray(o)) return o.forEach(visit);
    if (!o || typeof o !== 'object') return;
    const date = [o.calendarDate, o.summaryDate, o.date].find((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d));
    const raw = [o.weight, o.latestWeight?.weight, o.weightInGrams].find((n) => typeof n === 'number' && n > 0);
    if (date && raw != null) {
      const kg = toKg(raw);
      if (kg >= 20 && kg <= 400 && !found.has(date.slice(0, 10))) found.set(date.slice(0, 10), kg);
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
  };
  visit(response);
  return [...found].map(([date, kg]) => ({ date, kg }));
}

/* ---------------- Pulling ---------------- */

// Pulls startDate..endDate (inclusive) and saves each day's burn. Days the
// user typed in by hand are left alone.
export async function pull(startDate, endDate) {
  if (!hasKey()) throw new Error('Add your Garmin Personal API key first.');
  if (busy) return busy;
  emit({ state: 'syncing', message: '' });
  busy = (async () => {
    try {
      await migrateLocalKey();
      const body = { startDate, endDate, include: ['weight'] };
      if (saved.apiKey) body.apiKey = saved.apiKey;
      let response;
      try {
        response = await sync.callFunction('garmin', body);
      } catch (e) {
        // The account has no key (removed on another device): stop asking.
        if (/no garmin key saved/i.test(e.message)) store.setSettings({ garminLinked: false });
        throw e;
      }
      const days = daysFrom(response);
      if (!days.length && response && JSON.stringify(response).length > 20) {
        console.warn('Garmin response had no calories Fuel Log recognised', response);
        throw new Error("Garmin answered, but Fuel Log couldn't find calories in it. The response is in the browser console.");
      }
      let changed = 0;
      for (const d of days) {
        if (store.burnFor(d.date)?.source === 'manual') continue;
        if (store.setBurn(d.date, { active: d.active, resting: d.resting, source: 'garmin' })) changed++;
      }
      // Weigh-ins: Garmin's number wins over one typed in for the same day.
      let weights = 0;
      if (response?.weight) {
        for (const w of parseWeights(response.weight)) if (store.setWeight(w.date, { kg: w.kg, source: 'garmin' })) weights++;
      }
      if (response?.weightError) console.warn('Garmin weight:', response.weightError);
      const now = Date.now();
      for (let k = startDate; k <= endDate; k = store.shiftDate(k, 1)) saved.pulled[k] = now;
      // Forget pull times older than ~2 months.
      const cutoff = store.shiftDate(store.todayKey(), -60);
      for (const k of Object.keys(saved.pulled)) if (k < cutoff) delete saved.pulled[k];
      saved.lastOk = now;
      persist();
      emit({ state: 'ok', message: '' });
      return { days: days.length, changed, weights };
    } catch (e) {
      emit({ state: 'error', message: e.message || String(e) });
      throw e;
    } finally {
      busy = null;
    }
  })();
  return busy;
}

// Called when the app opens or comes back, and when a day is shown. Quietly
// pulls the last 3 days (at most every 15 minutes). An older day you open
// is fetched once if it has no calories yet. "Pull last 14 days" in
// Settings goes further back. Does nothing without a key or an account.
export const RECENT_DAYS = 3;

export function refreshAround(date = store.todayKey()) {
  if (!hasKey() || !sync.getAccount().user || busy) return;
  const today = store.todayKey();
  if (date > today) return;
  const recentStart = store.shiftDate(today, -(RECENT_DAYS - 1));
  let range = null;
  if (Date.now() - (saved.pulled[today] || 0) > FRESH_MS) range = [recentStart, today];
  else if (date < recentStart && !saved.pulled[date] && !store.burnFor(date)) range = [date, date];
  if (!range) return;
  // After a failed pull, wait FRESH_MS before trying again.
  if (status.state === 'error' && Date.now() - (saved.lastTry || 0) < FRESH_MS) return;
  saved.lastTry = Date.now();
  persist();
  pull(range[0], range[1]).catch((e) => console.warn('Garmin pull failed', e));
}
