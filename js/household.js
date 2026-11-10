// A household: the people you shop and cook with. Shared data (the grocery
// list, the week's meals, the chosen store, aisle numbers) lives in one table,
// household_items, that every member can read and change. See
// supabase/schema.sql and README.md.
//
// Like the rest of the app, this works on this device first (local storage)
// and syncs when you're signed in and in a household. Before you join or
// create a household the list is just yours, and joining shares it.
//
// Rows are { kind, data, deleted, updatedAt, pending }, keyed by id. The last
// write wins per row, same as js/sync.js.

import * as sync from './sync.js';

const KEY = 'ct.household.v1';
const PAGE = 1000;
const PUSH_BATCH = 200;
const CURSOR_OVERLAP_MS = 60_000;

const fresh = () => ({ owner: null, household: null, members: [], cursor: null, items: {} });
let state = fresh();
const listeners = new Set();
const status = { sync: 'idle', error: '' };
let timer = null;
let running = false;
let again = false;
let channel = null;
let liveFor = null;

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && typeof saved === 'object') state = { ...fresh(), ...saved, items: saved.items || {} };
} catch {}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

function emit(source = 'local') {
  save();
  listeners.forEach((fn) => fn(state, source));
}

export const getState = () => state;
export const getStatus = () => status;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const stamp = () => Date.now();
const me = () => {
  const email = sync.getAccount().user?.email || '';
  return email ? email.split('@')[0] : '';
};
export const currentName = me;

/* ---------------- Reading and writing items ---------------- */

/** Live (not deleted) items whose id starts with the prefix, as [{ id, ...data }]. */
export function list(prefix) {
  return Object.entries(state.items)
    .filter(([id, row]) => !row.deleted && id.startsWith(prefix))
    .map(([id, row]) => ({ id, ...row.data }));
}
export const get = (id) => {
  const row = state.items[id];
  return row && !row.deleted ? { id, ...row.data } : null;
};

export function put(id, data) {
  const { id: _drop, ...rest } = data;
  state.items[id] = { kind: id.split(':')[0], data: { by: me() || undefined, ...rest }, deleted: false, updatedAt: stamp(), pending: true };
  emit('local');
  schedule(1200);
}

export function remove(id) {
  if (!state.items[id]) return;
  state.items[id] = { ...state.items[id], data: null, deleted: true, updatedAt: stamp(), pending: true };
  emit('local');
  schedule(1200);
}

/** Removes every item with the prefix (e.g. "Clear the list"). */
export function removeAll(prefix) {
  let changed = false;
  for (const [id, row] of Object.entries(state.items)) {
    if (id.startsWith(prefix) && !row.deleted) {
      state.items[id] = { ...row, data: null, deleted: true, updatedAt: stamp(), pending: true };
      changed = true;
    }
  }
  if (changed) {
    emit('local');
    schedule(1200);
  }
}

/* ---------------- Household actions ---------------- */

const client = () => {
  const c = sync.getClient();
  if (!c || !sync.getAccount().user) throw new Error('Sign in first (Settings → Account) to share with family.');
  return c;
};
const clean = (e) => (/failed to fetch|network|load failed/i.test(e?.message || '') ? 'You are offline. Try again when connected.' : e?.message || String(e));

function adopt(h) {
  state.household = { id: h.id, name: h.name, code: h.code };
  state.members = [];
  state.cursor = null;
  state.owner = sync.getAccount().user?.id || state.owner;
  // Whatever is on this device joins the household.
  for (const row of Object.values(state.items)) row.pending = true;
  emit('local');
  startLive();
  schedule(0);
  refreshMembers().catch(() => {});
}

export async function createHousehold(name) {
  const { data, error } = await client().rpc('create_household', { household_name: name.trim() || 'Our household' });
  if (error) throw new Error(clean(error));
  adopt(data);
}

export async function joinHousehold(code) {
  const { data, error } = await client().rpc('join_household', { join_code: code.trim() });
  if (error) throw new Error(clean(error));
  adopt(data);
}

export async function leaveHousehold() {
  const h = state.household;
  if (!h) return;
  if (hasPending()) await syncNow();
  const { error } = await client().rpc('leave_household', { hid: h.id });
  if (error) throw new Error(clean(error));
  stopLive();
  // The list stays on this device, no longer shared.
  for (const row of Object.values(state.items)) row.pending = false;
  state.household = null;
  state.members = [];
  state.cursor = null;
  emit('local');
}

export async function refreshMembers() {
  const h = state.household;
  if (!h) return;
  const { data, error } = await client().from('household_members').select('user_id,email,joined_at').eq('household_id', h.id).order('joined_at');
  if (error) throw new Error(clean(error));
  state.members = data;
  emit('remote');
}

const hasPending = () => Object.values(state.items).some((r) => r.pending);

/* ---------------- Sync ---------------- */

function schedule(delay) {
  clearTimeout(timer);
  if (!state.household || !sync.getAccount().user) return;
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  const c = sync.getClient();
  const h = state.household;
  if (!c || !h || !sync.getAccount().user) return false;
  if (running) {
    again = true;
    return false;
  }
  running = true;
  status.sync = 'syncing';
  let ok = false;
  try {
    await pull(c, h);
    await push(c, h);
    status.sync = 'synced';
    status.error = '';
    ok = true;
  } catch (e) {
    console.warn('Household sync failed', e);
    status.sync = !navigator.onLine ? 'offline' : 'error';
    status.error = clean(e);
  } finally {
    running = false;
    emit('status');
    if (again) {
      again = false;
      schedule(0);
    }
  }
  return ok;
}

async function pull(c, h) {
  const since = state.cursor ? new Date(Date.parse(state.cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
  let newest = state.cursor;
  for (let from = 0; ; from += PAGE) {
    let q = c.from('household_items').select('id,kind,data,deleted,updated_at,modified_at').eq('household_id', h.id);
    if (since) q = q.gt('modified_at', since);
    const { data, error } = await q.order('modified_at').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) {
      const mine = state.items[r.id];
      const updatedAt = Number(r.updated_at);
      if (!mine || updatedAt > mine.updatedAt) {
        state.items[r.id] = { kind: r.kind, data: r.deleted ? null : r.data, deleted: !!r.deleted, updatedAt, pending: false };
      } else if (mine && updatedAt === mine.updatedAt) mine.pending = false;
      if (!newest || Date.parse(r.modified_at) > Date.parse(newest)) newest = r.modified_at;
    }
    if (data.length < PAGE) break;
  }
  if (newest !== state.cursor) state.cursor = newest;
  emit('remote');
}

async function push(c, h) {
  const rows = Object.entries(state.items).filter(([, r]) => r.pending);
  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    const batch = rows.slice(i, i + PUSH_BATCH);
    const { error } = await c.from('household_items').upsert(
      batch.map(([id, r]) => ({ household_id: h.id, id, kind: r.kind, data: r.data, deleted: r.deleted, updated_at: r.updatedAt })),
      { onConflict: 'household_id,id' },
    );
    if (error) throw error;
    // Only clear the mark if the row wasn't changed again while uploading.
    for (const [id, sent] of batch) if (state.items[id]?.updatedAt === sent.updatedAt) state.items[id].pending = false;
  }
  if (rows.length) save();
}

function startLive() {
  const c = sync.getClient();
  const h = state.household;
  if (!c || !h || liveFor === h.id) return;
  stopLive();
  liveFor = h.id;
  channel = c
    .channel(`household-${h.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_items', filter: `household_id=eq.${h.id}` }, () => schedule(300))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter: `household_id=eq.${h.id}` }, () => refreshMembers().catch(() => {}))
    .subscribe();
}

function stopLive() {
  const c = sync.getClient();
  if (channel && c) c.removeChannel(channel);
  channel = null;
  liveFor = null;
}

/* ---------------- Account changes ---------------- */

export function init() {
  let last = null;
  sync.onChange((account) => {
    const id = account.user?.id || null;
    if (id === last) return;
    last = id;
    if (!id) {
      stopLive();
      return;
    }
    if (state.owner && state.owner !== id) {
      // Someone else signed in on this device: don't mix their household in.
      stopLive();
      state = fresh();
    }
    state.owner = id;
    emit('local');
    if (state.household) {
      startLive();
      schedule(0);
      refreshMembers().catch(() => {});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(0);
  });
  window.addEventListener('online', () => schedule(0));
}
