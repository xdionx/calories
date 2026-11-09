# Fuel Log

A phone-friendly web app (installable PWA) for tracking calories, macros, vitamins and minerals.

- **Daily log** by meal (breakfast, lunch, dinner, snacks) with a calorie ring, protein/carb/fat bars, and a vitamins & minerals panel showing % Daily Value.
- **Barcode scanning** with the phone camera. Uses the browser's built-in `BarcodeDetector` when available (Android Chrome) and the bundled ZXing reader everywhere else (iPhone Safari, Firefox). You can also type the barcode number.
- **Food database search** across USDA FoodData Central (whole foods, best vitamin/mineral data) and Open Food Facts (packaged foods).
- **Restaurants**: pick a restaurant, then browse or filter its menu. Ships with sample menus for McDonald's, Wendy's, Taco Bell and Chick-fil-A; real data sources plug in through a small provider interface.
- **Custom foods**, recent foods, 7-day trends, editable goals, and JSON backup/restore.
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

## Data sources

| Source | Used for | Key |
| --- | --- | --- |
| [Open Food Facts](https://world.openfoodfacts.org) | Barcodes, packaged foods | None |
| [USDA FoodData Central](https://fdc.nal.usda.gov) | Search, whole foods, vitamins & minerals, barcode fallback | Works with the shared `DEMO_KEY`; add your own free key in Settings for higher limits |

All nutrient values are normalised to the keys in `js/nutrients.js` (calories, protein, carbs, fat, fiber, sugars, saturated/trans fat, cholesterol, sodium, vitamins A, C, D, E, K, B1, B2, B3, B6, folate, B12, calcium, iron, magnesium, phosphorus, potassium, zinc, copper, selenium).

## Plugging in a restaurant

Restaurant data lives in `js/providers/restaurants/`.

- `provider.js` describes the interface and has two helpers.
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
