// Café Zupas. The menu and nutrition come straight from Zupas' own ordering API
// (api.zupas.net/api/v1/getLocationMenu, the data behind cafezupas.com), which lists
// every item with official nutrition per size (half / full) or per required choice
// (bread, rice). It is read live, so seasonal items stay current, and the last good
// copy is kept on the device for offline use.
//
// If the API can't be reached (offline on first use, or the browser blocks the
// request), the bundled items below are shown instead. They are copied from that same
// API (Kimball Junction, Park City UT store; read 2026-11-16) and only cover the part
// of the menu that could be read when this was added.

import { menuItemToFood } from './provider.js';

const ID = 'zupas';
const NAME = 'Café Zupas';
const API = 'https://api.zupas.net/api/v1/getLocationMenu';
const CACHE_KEY = 'zupas-menu-v1';
const MAX_AGE = 7 * 24 * 3600 * 1000; // refresh weekly when online

const ORDER = ['Soups', 'Salads', 'Protein Bowls', 'Sandwiches', 'Kids', 'Sides', 'Desserts', 'Drinks'];

const titleCase = (s) => String(s || '').trim().toLowerCase()
  .replace(/(^|[\s\-/(&"])([a-z])/g, (m, p, c) => p + c.toUpperCase())
  .replace(/\b(And|Or|Of|With|The|A)\b/g, (w, _x, i) => (i ? w.toLowerCase() : w));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (v != null && v !== '' && Number.isFinite(+v) ? +v : undefined));

function nutrientsOf(n, category) {
  const out = {
    kcal: num(n.calories), protein: num(n.protein_g), carbs: num(n.carbs_g), fat: num(n.total_fat_g),
    satFat: num(n.saturated_fat_g), transFat: num(n.trans_fat_g), sodium: num(n.sodium_mg),
    fiber: num(n.fiber_g), sugar: num(n.sugar_g), cholesterol: num(n.cholesterol_mg),
  };
  // Drinks often leave fat/protein blank; those are zero, not unknown.
  if (/drink/i.test(category)) for (const k of ['protein', 'fat', 'satFat', 'cholesterol']) if (n[k === 'protein' ? 'protein_g' : k === 'fat' ? 'total_fat_g' : k === 'satFat' ? 'saturated_fat_g' : 'cholesterol_mg'] === null) out[k] = 0;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

const sizeLabel = (size, category) => {
  const s = String(size || '').toLowerCase();
  if (s === 'half') return 'half';
  if (s === 'full') return /soup|salad/i.test(category) ? 'large' : 'full';
  return s;
};

/** Turn the API response (any nesting) into menu items for menuItemToFood. */
export function parseZupasMenu(json) {
  const modifiers = new Map();
  const items = new Map();

  (function walk(node, inModifiers, catName) {
    if (Array.isArray(node)) { node.forEach((n) => walk(n, inModifiers, catName)); return; }
    if (!node || typeof node !== 'object') return;
    const hasNutrition = Array.isArray(node.nutrition) && node.nutrition.length;
    if (inModifiers && node.id != null && typeof node.name === 'string' && !hasNutrition && !modifiers.has(node.id)) {
      modifiers.set(node.id, node.name);
    }
    if (hasNutrition && typeof node.name === 'string') {
      const category = titleCase(node.category_name || catName || '');
      const key = node.id ?? node.name;
      const prev = items.get(key);
      // Items show up twice (e.g. under "Limited Time" too); keep their real category.
      if (!prev || (/limited time/i.test(prev.category) && !/limited time/i.test(category))) {
        items.set(key, { name: titleCase(node.name), category, nutrition: node.nutrition });
      }
    }
    const nextCat = Array.isArray(node.items) && typeof node.name === 'string' ? node.name : catName;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'nutrition' || !v || typeof v !== 'object') continue;
      walk(v, inModifiers || /modifier/i.test(k), nextCat);
    }
  })(json, false, '');

  const out = [];
  for (const it of items.values()) {
    const seen = new Set();
    const entries = it.nutrition.filter((n) => num(n.calories) !== undefined);
    for (const n of entries) {
      const parts = [];
      if (entries.length > 1) {
        const size = sizeLabel(n.item_size, it.category);
        if (size) parts.push(size);
        if (n.required_modifier_id != null) parts.push(modifiers.get(n.required_modifier_id) ? titleCase(modifiers.get(n.required_modifier_id)) : `option ${n.required_modifier_id}`);
      }
      const serving = parts.join(', ');
      if (seen.has(serving)) continue;
      seen.add(serving);
      out.push({
        name: serving ? `${it.name} (${serving})` : it.name,
        category: it.category,
        serving: '1 order',
        nutrients: nutrientsOf(n, it.category),
      });
    }
  }
  const rank = (c) => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };
  return out.map((x, i) => [x, i]).sort((a, b) => rank(a[0].category) - rank(b[0].category) || a[1] - b[1]).map(([x]) => x);
}

// name, category, kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, cholesterol
const z = (name, category, kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, cholesterol) => ({
  name, category, serving: '1 order',
  nutrients: { kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, cholesterol },
});

export const ZUPAS_FALLBACK = [
  z('Italian Sausage Gnocchi Soup (half)', 'Soups', 640, 22, 68, 30, 11, 1100, 4, 19, 50),
  z('Italian Sausage Gnocchi Soup (large)', 'Soups', 1210, 19, 88, 86, 46, 2450, 7, 5, 270),
  z('Athlete Bowl (White Basmati Rice)', 'Protein Bowls', 930, 54, 86, 43, 5, 2610, 3, 5, 110),
  z('Athlete Bowl (Wild Rice)', 'Protein Bowls', 1080, 61, 132, 38, 4.5, 1580, 9, 5, 110),
  z('Fall Bacon Grilled Cheese (Italian Ciabatta)', 'Sandwiches', 640, 21, 69, 30, 11, 1130, 3, 19, 50),
  z('Fall Bacon Grilled Cheese (Ancient Grain)', 'Sandwiches', 640, 22, 68, 30, 11, 1100, 4, 19, 50),
  z('Hot Honey Pizza Melt (Italian Ciabatta)', 'Sandwiches', 620, 18, 61, 30, 13, 1300, 3, 11, 60),
  z('Hot Honey Pizza Melt (Ancient Grain)', 'Sandwiches', 620, 19, 60, 30, 13, 1270, 4, 11, 60),
  z('Chocolate Duo Cup', 'Desserts', 980, 12, 114, 56, 35, 210, 7, 102, 30),
  z('Golden Spice Cup', 'Desserts', 890, 11, 100, 51, 32, 270, 5, 91, 20),
  z('Triple Berry Spritz', 'Drinks', 110, 0, 28, 0, 0, 10, 0, 26, 0),
  z('Pumpkin Cinnamon Roll', 'Drinks', 190, 0, 44, 1.5, 0, 180, 0, 40, 0),
];

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
};
const writeCache = (items) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items })); } catch { /* full or blocked */ }
};

const matches = (food, q) => {
  if (!q) return true;
  const hay = `${food.name} ${food.category || ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

let foods = null;
let loading = null;

async function load(signal) {
  const cached = readCache();
  if (cached?.items?.length && Date.now() - cached.at < MAX_AGE) return cached.items;
  try {
    const res = await fetch(API, { signal });
    if (!res.ok) throw new Error(`Zupas menu returned ${res.status}`);
    const items = parseZupasMenu(await res.json());
    if (!items.length) throw new Error('Zupas menu had no nutrition');
    writeCache(items);
    return items;
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return cached?.items?.length ? cached.items : ZUPAS_FALLBACK;
  }
}

export const zupas = {
  id: ID, name: NAME, color: '#e2231a', note: "Official nutrition from Zupas' menu",
  async search(query, { signal } = {}) {
    if (!foods) {
      loading ||= load(signal).then((items) => items.map((it, i) => menuItemToFood(ID, NAME, it, i)))
        .finally(() => { loading = null; });
      foods = await loading;
    }
    return foods.filter((f) => matches(f, query));
  },
};
