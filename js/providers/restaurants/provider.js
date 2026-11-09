// Restaurant provider interface.
//
// A restaurant provider is any object shaped like this:
//
//   {
//     id: 'mcdonalds',                  // unique, url-safe
//     name: "McDonald's",               // shown in the restaurant list
//     color: '#da291c',                 // accent for the list tile (optional)
//     note: 'Sample data',              // shown under the name (optional)
//     async search(query, { signal }) { // '' means "list everything"
//       return [Food, ...];             // foods in the shape described in store.js
//     },
//   }
//
// Register it in ./index.js and it shows up in the Restaurants tab.
// Two helpers below cover the common cases: a static menu baked into the app,
// and a menu loaded from a JSON URL (your own API, a scraped file, etc.).

const matches = (food, q) => {
  if (!q) return true;
  const hay = `${food.name} ${food.category || ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

/**
 * Turn a simple menu item into a Food.
 * item: { name, category?, serving?, grams?, nutrients: { kcal, protein, ... } }
 * Nutrients are per ONE menu item.
 */
export function menuItemToFood(providerId, providerName, item, index) {
  const units = [{ label: item.serving || '1 item', factor: 1 }];
  if (item.grams > 0) units.push({ label: 'g', factor: 1 / item.grams });
  return {
    id: `rest:${providerId}:${item.id || index}`,
    source: providerName,
    name: item.name,
    brand: providerName,
    category: item.category || '',
    nutrients: { ...item.nutrients },
    units,
    defaultUnit: 0,
  };
}

/** A provider whose menu is bundled with the app. */
export function createStaticProvider({ id, name, color, note, items }) {
  const foods = items.map((it, i) => menuItemToFood(id, name, it, i));
  return {
    id, name, color, note,
    async search(query) {
      return foods.filter((f) => matches(f, query));
    },
  };
}

/**
 * A provider that loads its menu from a URL returning JSON:
 *   { "items": [{ "name": "...", "category": "...", "serving": "...", "nutrients": { "kcal": 0, ... } }] }
 * Pass `mapResponse` if the JSON has a different shape.
 */
export function createJsonProvider({ id, name, color, note, url, mapResponse = (j) => j.items }) {
  let cache = null;
  return {
    id, name, color, note,
    async search(query, { signal } = {}) {
      if (!cache) {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`${name} menu returned ${res.status}`);
        cache = mapResponse(await res.json()).map((it, i) => menuItemToFood(id, name, it, i));
      }
      return cache.filter((f) => matches(f, query));
    },
  };
}

/** Compact row helper used by the bundled sample menus. */
export const row = (name, category, kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, extra = {}) => ({
  name, category,
  nutrients: { kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, ...extra },
});
