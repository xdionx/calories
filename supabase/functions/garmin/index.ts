// Fuel Log: Garmin proxy (Supabase Edge Function named "garmin").
//
// The browser can't call Garmin's Personal API directly, so the app sends the
// user's Garmin Personal API key here along with a date range. This function:
//   1. exchanges the key for a Garmin access token,
//   2. reads Garmin's daily summaries (calories) and, when asked, weigh-ins
//      for that range,
//   3. returns them to the app as { summaries, weight }.
// Nothing is stored. It only answers signed-in Fuel Log users (checked below
// with Supabase Auth), so it isn't an open proxy.
//
// Turn OFF "Verify JWT with legacy secret" for this function (dashboard →
// Edge Functions → garmin → Details). With it on, Supabase's gateway can turn
// requests away before this code runs, without the CORS headers the browser
// needs, and the app only sees "Failed to send a request".
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via
// editor, name it "garmin", paste this file, Deploy. See README.md.

const GARMIN = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
const SUMMARIES_PATH = '/usersummary-service/v2/dailysummaries';
const WEIGHT_PATH = '/weight-service/weight/range'; // /{start}/{end}?includeAll=true
const MAX_DAYS = 31;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Access tokens last 24 h. Keep them for this function instance's lifetime,
// keyed by a hash of the API key (never the key itself).
const tokens = new Map<string, { token: string; exp: number }>();

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jwtExp(token: string) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))).exp * 1000;
  } catch {
    return Date.now() + 60 * 60 * 1000;
  }
}

async function accessToken(apiKey: string, fresh = false) {
  const id = await sha256(apiKey);
  const cached = tokens.get(id);
  if (!fresh && cached && cached.exp - Date.now() > 10 * 60 * 1000) return cached.token;
  const res = await fetch(GARMIN + TOKEN_PATH, {
    method: 'POST',
    headers: { Accept: '*/*', Authorization: `ApiKey ${apiKey}` },
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403
      ? 'Garmin rejected the API key. It may be mistyped, expired or deleted; make a new one in Garmin Connect.'
      : `Garmin token request failed (${res.status}).`;
    throw Object.assign(new Error(why), { status: 400 });
  }
  // The endpoint returns the JWT as plain text; accept a JSON wrapper too.
  let token = text;
  if (text.startsWith('{')) {
    const j = JSON.parse(text);
    token = j.access_token || j.accessToken || j.token;
  }
  tokens.set(id, { token, exp: jwtExp(token) });
  return token;
}

async function garminGet(apiKey: string, url: string, what: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(apiKey, attempt > 0);
    const res = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
    if (res.status === 401 && attempt === 0) continue; // token revoked early: get a new one once
    if (res.status === 204) return { data: [] };
    const text = await res.text();
    if (!res.ok) {
      const why = res.status === 429 ? 'Garmin says too many requests. Try again in a few minutes.' : `Garmin ${what} failed (${res.status}).`;
      throw Object.assign(new Error(why), { status: res.status === 429 ? 429 : 502, detail: text.slice(0, 500) });
    }
    return text ? JSON.parse(text) : { data: [] };
  }
}

// Asks Supabase Auth who the caller is. Works whether or not the dashboard's
// "Verify JWT" setting is on, and with both old and new JWT signing keys.
async function signedIn(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  if (!auth.startsWith('Bearer ') || !url) return false;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: key } });
  return res.ok;
}

Deno.serve(async (req) => {
  // Browser preflight: allow whatever headers the app's Supabase client sends.
  if (req.method === 'OPTIONS') {
    const asked = req.headers.get('Access-Control-Request-Headers');
    return new Response('ok', { headers: { ...cors, ...(asked ? { 'Access-Control-Allow-Headers': asked } : {}), 'Access-Control-Max-Age': '86400' } });
  }
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!(await signedIn(req))) return reply(401, { error: 'Sign in to Fuel Log first.' });
  let body: { apiKey?: string; startDate?: string; endDate?: string; include?: string[] };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Send JSON: { apiKey, startDate, endDate }.' });
  }
  const { apiKey, startDate, endDate, include = [] } = body;
  if (!apiKey || typeof apiKey !== 'string') return reply(400, { error: 'Add your Garmin Personal API key in Settings.' });
  if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) return reply(400, { error: 'Dates must be YYYY-MM-DD, start before end.' });
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
  if (days > MAX_DAYS) return reply(400, { error: `Ask for ${MAX_DAYS} days or fewer at a time.` });
  try {
    const key = apiKey.trim();
    const summaries = await garminGet(key, `${GARMIN}${SUMMARIES_PATH}?startDate=${startDate}&endDate=${endDate}`, 'daily summaries');
    const out: Record<string, unknown> = { summaries };
    if (Array.isArray(include) && include.includes('weight')) {
      // Weight is a bonus: if it fails, still return the calories.
      try {
        out.weight = await garminGet(key, `${GARMIN}${WEIGHT_PATH}/${startDate}/${endDate}?includeAll=true`, 'weight');
      } catch (e) {
        out.weightError = (e as Error).message;
      }
    }
    return reply(200, out);
  } catch (e) {
    const err = e as Error & { status?: number; detail?: string };
    console.error('garmin', err.message, err.detail || '');
    return reply(err.status || 502, { error: err.message, detail: err.detail });
  }
});
