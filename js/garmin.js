// Garmin: pulls calories burned per day from Garmin Connect's Personal API,
// through the "garmin" Supabase Edge Function (supabase/functions/garmin).
//
// The Personal API key is like a password for Garmin data, so it stays on
// this device only (localStorage, not synced to the account). Each device
// that should pull from Garmin needs the key entered once.

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
export const hasKey = () => Boolean(saved.apiKey);
export const lastPulled = () => saved.lastOk || null;

export function setKey(apiKey) {
  saved = { apiKey: apiKey.trim(), pulled: {} };
  persist();
  emit({ state: 'idle', message: '' });
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
  const list = Array.isArray(response) ? response : response?.data || response?.dailySummaries || response?.summaries || [];
  return (Array.isArray(list) ? list : [list]).map(parseDay).filter(Boolean);
}

/* ---------------- Pulling ---------------- */

// Pulls startDate..endDate (inclusive) and saves each day's burn. Days the
// user typed in by hand are left alone.
export async function pull(startDate, endDate) {
  if (!saved.apiKey) throw new Error('Add your Garmin Personal API key first.');
  if (busy) return busy;
  emit({ state: 'syncing', message: '' });
  busy = (async () => {
    try {
      const response = await sync.callFunction('garmin', { apiKey: saved.apiKey, startDate, endDate });
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
      const now = Date.now();
      for (let k = startDate; k <= endDate; k = store.shiftDate(k, 1)) saved.pulled[k] = now;
      // Forget pull times older than ~2 months.
      const cutoff = store.shiftDate(store.todayKey(), -60);
      for (const k of Object.keys(saved.pulled)) if (k < cutoff) delete saved.pulled[k];
      saved.lastOk = now;
      persist();
      emit({ state: 'ok', message: '' });
      return { days: days.length, changed };
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
  if (!saved.apiKey || !sync.getAccount().user || busy) return;
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
