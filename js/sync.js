// Accounts and cloud sync, backed by Supabase (auth + one Postgres table).
// See supabase/schema.sql for the table and README.md for setup.
//
// The app always reads and writes local storage (js/store.js); this module
// copies changes between this device and the signed-in account:
//   pull: fetch rows changed on the server since the last pull, apply them
//   push: upload rows changed on this device since the last push
// It runs on sign-in, shortly after each local change, when the app comes
// back to the foreground or online, and when another device makes a change.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import * as store from './store.js';

const TABLE = 'sync_items';
const PAGE = 1000;
const PUSH_BATCH = 200;
const CURSOR_OVERLAP_MS = 60_000; // re-read a minute back so no slow commit slips past

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

const account = {
  configured,
  ready: !configured, // false until the saved session has been checked
  user: null,
  status: 'idle', // idle | syncing | synced | offline | error
  error: '',
  lastSynced: null,
  recovering: false, // came back from a password-reset email
  initError: '', // why sync could not start, shown on the sign-in form
};
const listeners = new Set();
let client = null;
let channel = null;
let running = false;
let again = false;
let timer = null;

export const getAccount = () => account;
export const getClient = () => client;

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(changes = {}) {
  Object.assign(account, changes);
  listeners.forEach((fn) => fn(account));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

const redirectUrl = () => location.origin + location.pathname;

export async function init() {
  if (!configured) return;
  // Never leave the Account card stuck on "Loading…".
  setTimeout(() => {
    if (!account.ready) emit({ ready: true });
  }, 8000);
  try {
    await loadScript(new URL('../vendor/supabase.js', import.meta.url).href);
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    client.auth.onAuthStateChange((event, session) => {
      // Supabase advises not to await its own calls inside this callback.
      setTimeout(() => handleAuth(event, session), 0);
    });
  } catch (e) {
    console.warn('Sync could not start', e);
    client = null;
    const offline = !navigator.onLine;
    emit({
      ready: true,
      status: offline ? 'offline' : 'error',
      initError: offline
        ? 'You are offline. Sign-in will work once you are connected; reopen the app then.'
        : `Sign-in could not start on this browser (${e.message || e}). Try reloading the page.`,
    });
    return;
  }

  store.subscribe((_state, source) => {
    if (source === 'local') schedule(1500);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(0);
  });
  window.addEventListener('online', () => schedule(0));
}

function handleAuth(event, session) {
  if (event === 'PASSWORD_RECOVERY') emit({ recovering: true });
  const user = session?.user || null;
  const wasId = account.user?.id;
  emit({ ready: true, user });
  if (!user) {
    stopLive();
    return;
  }
  if (user.id === wasId) return; // token refresh etc.

  const { owner } = store.getSyncMeta();
  if (owner !== user.id) {
    // Data on this device belongs to someone else: start clean.
    if (owner) store.resetLocal();
    // Data from before signing in joins this account.
    store.markAllPending();
    store.setSyncMeta({ owner: user.id, cursor: null });
  }
  startLive(user.id);
  schedule(0);
}

function startLive(userId) {
  stopLive();
  channel = client
    .channel(`sync-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, () => schedule(400))
    .subscribe();
}

function stopLive() {
  if (channel) client.removeChannel(channel);
  channel = null;
}

function schedule(delay) {
  if (!account.user) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

const isOffline = (e) => !navigator.onLine || /fetch|network|load failed/i.test(e?.message || '');

export async function syncNow() {
  if (!client || !account.user) return false;
  if (running) {
    again = true;
    return false;
  }
  running = true;
  emit({ status: 'syncing', error: '' });
  let ok = false;
  try {
    await pull();
    await push();
    ok = true;
    emit({ status: 'synced', lastSynced: new Date() });
  } catch (e) {
    console.warn('Sync failed', e);
    emit(isOffline(e) ? { status: 'offline' } : { status: 'error', error: e.message || String(e) });
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(0);
    }
  }
  return ok;
}

async function pull() {
  const { cursor } = store.getSyncMeta();
  const since = cursor ? new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
  let newest = cursor;
  for (let from = 0; ; from += PAGE) {
    let q = client.from(TABLE).select('id,kind,data,deleted,updated_at,modified_at');
    if (since) q = q.gt('modified_at', since);
    const { data, error } = await q.order('modified_at').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data.map((r) => ({ ...r, updated_at: Number(r.updated_at) }));
    store.applyRemote(rows);
    for (const r of rows) if (!newest || Date.parse(r.modified_at) > Date.parse(newest)) newest = r.modified_at;
    if (rows.length < PAGE) break;
  }
  if (newest !== cursor) store.setSyncMeta({ cursor: newest });
}

async function push() {
  const rows = store.pendingItems();
  const userId = account.user.id;
  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    const batch = rows.slice(i, i + PUSH_BATCH);
    const { error } = await client
      .from(TABLE)
      .upsert(batch.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,id' });
    if (error) throw error;
    store.markPushed(batch);
  }
}

/* ---------------- Edge functions ---------------- */

// Calls a Supabase Edge Function as the signed-in user (used by js/garmin.js).
export async function callFunction(name, body) {
  if (!client || !account.user) throw new Error('Sign in first (Settings → Account).');
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    // Pull the function's own error message out of the response when there is one.
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.error) msg = j.error;
    } catch {}
    if (/failed to send|fetch/i.test(msg) && navigator.onLine) {
      msg = `Couldn't reach the "${name}" function. In Supabase → Edge Functions, check it is deployed with exactly that name and that "Verify JWT" is turned off for it.`;
    }
    throw new Error(msg);
  }
  return data;
}

/* ---------------- Account actions ---------------- */

function friendly(error) {
  const msg = error?.message || String(error);
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: open the link we sent you.';
  if (/already registered/i.test(msg)) return 'That email already has an account. Sign in instead.';
  if (isOffline(error)) return 'You are offline. Try again when connected.';
  return msg;
}

async function run(fn) {
  if (!client) throw new Error('Sync is not available right now.');
  const { data, error } = await fn();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function signIn(email, password) {
  await run(() => client.auth.signInWithPassword({ email, password }));
}

// Returns true when the account needs email confirmation before first sign-in.
export async function signUp(email, password) {
  const data = await run(() => client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } }));
  // Supabase hides "already registered" by returning a user with no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('That email already has an account. Sign in instead.');
  }
  return !data.session;
}

export async function sendPasswordReset(email) {
  await run(() => client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }));
}

export async function updatePassword(password) {
  await run(() => client.auth.updateUser({ password }));
  emit({ recovering: false });
}

// Uploads anything left, signs out, and removes the account's data from this
// device. With `force`, signs out even if the last changes could not upload.
export async function signOut({ force = false } = {}) {
  if (!client) return;
  if (store.hasPending()) {
    const ok = await syncNow();
    if (!ok && !force) return { unsynced: true };
  }
  stopLive();
  clearTimeout(timer);
  await client.auth.signOut({ scope: 'local' });
  store.resetLocal();
  emit({ user: null, status: 'idle', lastSynced: null, recovering: false });
  return { unsynced: false };
}
