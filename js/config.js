// Account and sync settings. Fill these in from your Supabase project
// (Project Settings → API). Both values are meant to be public: the
// publishable/anon key only lets signed-in users reach their own rows, which
// the database rules in supabase/schema.sql enforce. Never put the
// service_role / secret key here.
//
// Leave them empty and the app runs device-only, with no sign-in.
//
// The test site (/calories/test/) uses its own Supabase project, so nothing
// tried there can change your real log. Until TEST_URL and TEST_KEY are filled
// in, the test site runs device-only (no sign-in, no Garmin).
const LIVE_URL = 'https://ngqlzubijorakbslwqaw.supabase.co';
const LIVE_KEY = 'sb_publishable_gr42LWVgID0hn7ZrAIbaig_4-YHiTrv';
const TEST_URL = '';
const TEST_KEY = '';

export const ENV = window.FUEL_ENV || 'live';
const isTest = ENV !== 'live';
export const SUPABASE_URL = isTest ? TEST_URL : LIVE_URL;
export const SUPABASE_KEY = isTest ? TEST_KEY : LIVE_KEY;
