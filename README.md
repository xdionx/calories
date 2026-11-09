# Fuel Log

A phone-friendly web app (installable PWA) for tracking calories, macros, vitamins and minerals.

- **Daily log** by meal (breakfast, lunch, dinner, snacks) with a calorie ring, protein/carb/fat bars, and a vitamins & minerals panel showing % Daily Value.
- **Barcode scanning** with the phone camera. Uses the browser's built-in `BarcodeDetector` when available (Android Chrome) and the bundled ZXing reader everywhere else (iPhone Safari, Firefox). You can also type the barcode number.
- **Food database search** across USDA FoodData Central (whole foods, best vitamin/mineral data) and Open Food Facts (packaged foods).
- **Restaurants**: pick a restaurant, then browse or filter its menu. Full menus from official nutrition guides for Mo' Bettahs, Little Caesars and Domino's, plus Jurassic Tacos (estimated: they publish no nutrition). McDonald's, Wendy's, Taco Bell and Chick-fil-A are still short sample menus. More sources plug in through a small provider interface.
- **Calories burned and daily deficit/surplus**: pulls active and resting calories from Garmin Connect (or takes them from Apple Health via a Shortcut, or typed in) and shows eaten − burned for each day, plus a 7-day deficit/surplus chart on Trends.
- **Trends** for 7, 30 or 90 days: highlights (averages, total deficit, days on target, logging streak, weight change), eaten vs burned, daily deficit/surplus, weight with a 7-day average and the weight your logged deficit predicts, macro split vs goal, calories by meal, top foods, weekday pattern and nutrient averages. Hover or tap for details; tap again to open that day.
- **Custom foods**, recent foods, editable goals, and JSON backup/restore.
- **Accounts and sync** (optional): sign in with email and password and your log, goals, custom foods, recent foods and settings sync across devices. Without an account, data stays in the browser's local storage on the device.

## Run it

It is plain HTML, CSS and JavaScript modules with no build step. Serve the folder over HTTP:

```sh
cd calorie-tracker
python3 -m http.server 8080
# open http://localhost:8080
```

The camera only works on `https://` (or `localhost`), so to use it on a phone, host the folder on any static host with HTTPS, for example GitHub Pages, Netlify or Cloudflare Pages. On the phone, use "Add to Home Screen" to install it like an app.

## Accounts and sync

Sync uses [Supabase](https://supabase.com) (free tier) for sign-in and a single database table. The app keeps working offline: changes are saved on the device first and upload when there's a connection. Each log entry, custom food, and your goals/settings/recent list sync separately, so edits on two devices merge instead of overwriting each other (the newest change to the same item wins).

Until it's configured, the app runs device-only and Settings says accounts aren't set up. To turn it on:

1. Create a free project at [supabase.com](https://supabase.com/dashboard) (any name, any region close to you).
2. In the project, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Authentication → URL Configuration**. Set **Site URL** to `https://xdionx.github.io/calories/` and add the same URL under **Redirect URLs**. This is where the confirmation and password-reset emails send people.
4. Open **Project Settings → API Keys** and copy the **Project URL** and the **publishable** key (older projects call it the `anon` `public` key).
5. Put them in [`js/config.js`](js/config.js) and push to `main`.

Both values are designed to be public: the database rules only let a signed-in user read and write their own rows. Never put the `service_role` / secret key in the app.

Optional: Supabase's built-in email sender is limited to a few emails an hour. If you expect several people to sign up, add your own SMTP server under **Authentication → Emails**, or turn off **Confirm email** under **Authentication → Sign In / Providers** to skip the confirmation step.

Signing out uploads any remaining changes and then removes the account's data from that device. A backup imported while signed in replaces the account's data too.

## Calories burned (Garmin, Apple Health, manual)

The Today screen shows **eaten − burned = deficit or surplus**, where burned is resting calories (BMR) plus active calories. Days come from one of three places:

### Garmin (Personal API)

Garmin opened a free Personal API in October 2026: any Garmin Connect user can make a key for their own data, with no application. The browser can't call Garmin directly, so the app goes through a small Supabase Edge Function ([`supabase/functions/garmin/index.ts`](supabase/functions/garmin/index.ts)) that swaps the key for a Garmin token and reads Garmin's daily summaries (`/usersummary-service/v2/dailysummaries`). It stores nothing and only answers signed-in users.

One-time setup:

1. **Deploy the function.** Supabase dashboard → **Edge Functions → Deploy a new function → Via editor**. Name it `garmin`, replace the sample code with the contents of `supabase/functions/garmin/index.ts`, and click **Deploy**. Then open the function's **Details** and turn **Verify JWT with legacy secret** **off**: the function checks the caller is signed in itself, and with the setting on, the gateway can reject the app's requests without CORS headers, which shows up as "Failed to send a request". (Or with the CLI: `supabase functions deploy garmin --no-verify-jwt`.) No secrets to set.
2. **Make a Garmin key.** On a computer, sign in at [Garmin Connect → Settings → Personal API](https://connect.garmin.com/app/settings/personalApiToken), create a key (choose 1 year), and copy it. Garmin shows it once.
3. **Paste it in the app**: Settings → Garmin → Save key. The app pulls the last 14 days once. After that, each time you open the app (or come back to it) it pulls the last 3 days, at most every 15 minutes. An older day you open is fetched once if it has no calories yet, and **Pull last 14 days** in Settings goes further back.

The key is checked with Garmin and saved to your account (table `garmin_keys`, see [`supabase/schema.sql`](supabase/schema.sql); run that file's Garmin block once in the SQL Editor), so every device you sign in on pulls from Garmin without pasting it again. Only the function reads it; the app never shows it back. Remove it in Settings → Garmin. A day you edit by hand is left alone by Garmin until you clear it. When the key expires, Garmin emails you; make a new one and paste it again.

### Apple Health (iPhone Shortcut)

Garmin Connect can write to Apple Health, and so can an Apple Watch. A Shortcut can send a day's numbers to the app by opening a link:

```
https://xdionx.github.io/calories/?burn=2026-11-09&active=650&resting=1720
```

Build it in the Shortcuts app: **Find Health Samples** (Type: Active Energy, Start Date is today) → **Calculate Statistics** (Sum) → repeat for **Resting Energy** → **URL** with the link above, using the date and the two sums → **Open URLs**. Add it as a daily automation if you like. iPhone keeps a home-screen app's storage separate from Safari, so sign in to your account in both and the numbers sync across.

### By hand

Tap **Add burned** / **Edit** on the Today card and type active and resting calories. If you leave resting empty (or a source only reports active), the app uses **Resting burn** from Settings → Daily goals.

## Profile, weight and recommended goals

Settings → **Your profile** takes your birthday, sex, height, units (lb/ft-in or kg/cm) and goal (lose, maintain or gain, with a weekly rate). Log your weight on the Today screen; if Garmin has a weigh-in for a day (from an Index scale or one entered in Garmin Connect), it's pulled in and replaces a typed one for that day. Trends shows the last 30 days of weight.

The recommendation (`js/targets.js`):

- **Daily burn**: your average calories burned (resting + active) over the last 14 full days when at least 3 days have data, which with Garmin reflects how active you really are. Without that, Mifflin-St Jeor BMR × an activity factor.
- **Calories**: burn minus the deficit for your weekly rate (7,700 kcal ≈ 1 kg), or plus a surplus to gain. Never below your resting burn, never more than a 25% cut, never under 1,200 (women) / 1,500 (men).
- **Protein** 1.6 g/kg (1.8 if very active, 2.0 while losing), **fat** ~28% of calories (at least 0.6 g/kg), **carbs** the rest.

Tap **Use these goals**, or tick **Keep my daily goals updated** so they follow your weight and Garmin activity automatically. Editing goals by hand turns that off. General guidelines, not medical advice.

Garmin weigh-ins need the latest `supabase/functions/garmin/index.ts` deployed (paste it into the existing `garmin` function and deploy). An older deployment still returns calories, just no weight.

## Data sources

| Source | Used for | Key |
| --- | --- | --- |
| [Open Food Facts](https://world.openfoodfacts.org) | Barcodes, packaged foods | None |
| [USDA FoodData Central](https://fdc.nal.usda.gov) | Search, whole foods, vitamins & minerals, barcode fallback | Works with the shared `DEMO_KEY`; add your own free key in Settings for higher limits |

All nutrient values are normalised to the keys in `js/nutrients.js` (calories, protein, carbs, fat, fiber, sugars, saturated/trans fat, cholesterol, sodium, vitamins A, C, D, E, K, B1, B2, B3, B6, folate, B12, calcium, iron, magnesium, phosphorus, potassium, zinc, copper, selenium).

## Plugging in a restaurant

Restaurant data lives in `js/providers/restaurants/`.

- `provider.js` describes the interface and has two helpers.
- `mobettahs.js`, `littlecaesars.js`, `dominos.js` are full menus copied from each chain's official nutrition page or guide (source URL and date at the top of each file).
- `jurassictacos.js` is the Jurassic Tacos menu with ESTIMATED nutrition, built from typical ingredient portions listed in the file, because the chain publishes none.
- `sample-menus.js` holds the placeholder menus (approximate values).
- `index.js` is the registry the app reads.

A provider is any object with `id`, `name`, an optional `color` and `note`, and an async `search(query)` that returns foods. The quickest way to add a real source is a JSON menu:

```js
// js/providers/restaurants/index.js
import { createJsonProvider } from './provider.js';

const burgerKing = createJsonProvider({
  id: 'burgerking',
  name: 'Burger King',
  color: '#d62300',
  url: 'https://example.com/menus/burger-king.json',
});

export const RESTAURANTS = [...SAMPLE_PROVIDERS, burgerKing];
```

where the JSON looks like:

```json
{
  "items": [
    { "name": "Whopper", "category": "Burgers", "serving": "1 sandwich", "grams": 270,
      "nutrients": { "kcal": 670, "protein": 31, "carbs": 54, "fat": 40, "sodium": 1010 } }
  ]
}
```

Nutrients are per one menu item, using the keys from `js/nutrients.js`. If an API returns a different shape, pass `mapResponse: (json) => items` or write the `search` function yourself (for example to call a live API per query). Remove a sample provider from `sample-menus.js` once a real one replaces it.

## Files

```
index.html                 UI shell
styles.css                 Styles (light and dark)
sw.js, manifest.webmanifest  Offline support and install metadata
js/app.js                  UI logic
js/store.js                Local storage: log, goals, recent and custom foods, change tracking
js/sync.js                 Accounts and sync (Supabase)
js/config.js               Supabase project URL and publishable key
supabase/schema.sql        Database table and access rules for sync
js/nutrients.js            Nutrient list and Daily Values
js/scanner.js              Camera barcode scanning
js/providers/              Open Food Facts, USDA, and restaurant providers
vendor/zxing.min.js        ZXing barcode reader (Apache-2.0)
vendor/supabase.js         Supabase JS client 2.118.0 (MIT)
```
