// Grocery list logic: turns the week's meals plus standalone items into one
// list, puts each item in a store department, and estimates what it costs.
// Plain logic, no DOM, so it can be tested on its own.
//
// Honest limits: prices are rough US averages and the department order follows
// a typical store layout. Real aisle numbers come from the people shopping
// (they can type them in per store).

import { parseIngredient } from './recipes.js';

/* ---------------- Departments and stores ---------------- */

export const DEPARTMENTS = [
  ['produce', 'Produce'],
  ['bakery', 'Bakery & bread'],
  ['meat', 'Meat & seafood'],
  ['deli', 'Deli'],
  ['dairy', 'Dairy & eggs'],
  ['frozen', 'Frozen'],
  ['pantry', 'Pantry & canned'],
  ['grains', 'Pasta, rice & grains'],
  ['baking', 'Baking'],
  ['spices', 'Spices & oils'],
  ['condiments', 'Sauces & condiments'],
  ['snacks', 'Snacks'],
  ['drinks', 'Drinks'],
  ['other', 'Other'],
];
const DEPT_LABEL = Object.fromEntries(DEPARTMENTS);
export const deptLabel = (id) => DEPT_LABEL[id] || 'Other';

// Walk order for a typical store, and a price factor against a national average.
const TYPICAL = ['produce', 'bakery', 'deli', 'meat', 'dairy', 'frozen', 'pantry', 'grains', 'baking', 'spices', 'condiments', 'snacks', 'drinks', 'other'];
export const STORES = [
  { id: 'walmart-draper', name: 'Walmart Neighborhood Market, Draper', short: 'Walmart', factor: 0.92, order: TYPICAL },
  { id: 'smiths', name: "Smith's, Draper", short: "Smith's", factor: 1, order: TYPICAL },
  { id: 'maceys', name: "Macey's, Draper", short: "Macey's", factor: 1.03, order: TYPICAL },
  { id: 'harmons', name: 'Harmons, Draper', short: 'Harmons', factor: 1.15, order: TYPICAL },
];
export const getStore = (id) => STORES.find((s) => s.id === id) || STORES[0];

/** Price of every row at every store: [{ store, total, prices: { key: price } }], cheapest first. */
export function compareStores(lines, realByStore = {}) {
  const rows = mergeLines(lines);
  return STORES.map((store) => {
    const prices = {};
    let total = 0;
    for (const r of rows) {
      prices[r.key] = estimate(r, store.id, realByStore[store.id]?.get(r.key)).price;
      total += prices[r.key];
    }
    return { store, total: Math.round(total * 100) / 100, prices };
  }).sort((a, b) => a.total - b.total);
}

export { mergeLines as rowsFor };

/* ---------------- What things are and cost ---------------- */
// [pattern, department, package size, package unit, package price (USD), density g/ml (dry goods)]
// Package unit: 'g' (weight), 'ml' (volume) or 'ea' (count).
const G = (lb) => lb * 453.592;
const OZ = (n) => n * 28.3495;
const FLOZ = (n) => n * 29.574;
const GAL = 3785.41;
const CATALOG = [
  // Canned and jarred things first, so "diced tomatoes" isn't taken for fresh produce.
  [/\b(tomato sauce|tomato paste|crushed tomato|diced tomato|marinara|passata|canned tomato)/, 'pantry', OZ(15), 'g', 1.6],
  [/\b(canned|can of)\b|\b(kidney|black|pinto|cannellini|garbanzo|navy) beans?|\bchickpeas?|\blentils?/, 'pantry', OZ(15), 'g', 1.3],
  // Produce
  [/\b(banana)/, 'produce', 6, 'ea', 1.8],
  [/\b(apple)s?\b/, 'produce', 6, 'ea', 5],
  [/\b(orange|clementine|tangerine)/, 'produce', 4, 'ea', 4],
  [/\blemon/, 'produce', 1, 'ea', 0.7],
  [/\blime/, 'produce', 1, 'ea', 0.5],
  [/\b(strawberr|blueberr|raspberr|blackberr)/, 'produce', OZ(16), 'g', 4.5, 0.6],
  [/\bgrape/, 'produce', G(2), 'g', 5],
  [/\bavocado/, 'produce', 1, 'ea', 1.3],
  [/\b(tomato)/, 'produce', 1, 'ea', 0.8],
  [/\b(onion|shallot)/, 'produce', 1, 'ea', 0.9],
  [/\bgarlic/, 'produce', 10, 'ea', 0.8],
  [/\bginger/, 'produce', OZ(4), 'g', 1.5],
  [/\b(potato)/, 'produce', G(5), 'g', 4.5],
  [/\bsweet potato/, 'produce', G(3), 'g', 3.5],
  [/\bcarrot/, 'produce', G(2), 'g', 2.2],
  [/\bcelery/, 'produce', 1, 'ea', 2.5],
  [/\b(bell pepper|pepper)s?\b.*(red|green|yellow|orange)|\b(red|green|yellow|orange) (bell )?pepper/, 'produce', 1, 'ea', 1.2],
  [/\b(jalapeno|serrano|chile|chili) pepper|\bjalapeno/, 'produce', 1, 'ea', 0.3],
  [/\bcucumber/, 'produce', 1, 'ea', 1],
  [/\b(zucchini|squash)/, 'produce', 1, 'ea', 1.3],
  [/\b(broccoli|cauliflower)/, 'produce', 1, 'ea', 2.8],
  [/\b(spinach|kale|arugula|salad|lettuce|romaine|greens|cabbage|coleslaw)/, 'produce', OZ(10), 'g', 3.5, 0.15],
  [/\b(mushroom)/, 'produce', OZ(8), 'g', 2.8, 0.4],
  [/\b(cilantro|parsley|basil|mint|dill|rosemary|thyme|chives|sage)\b/, 'produce', 1, 'ea', 2],
  [/\b(green onion|scallion)/, 'produce', 1, 'ea', 1.3],
  [/\b(corn on the cob)/, 'produce', 1, 'ea', 0.8],
  // Meat & seafood
  [/\bchicken (breast|thigh|tender)|\bchicken\b/, 'meat', G(1), 'g', 4.2],
  [/\b(ground )?turkey/, 'meat', G(1), 'g', 4.8],
  [/\bground beef|\bbeef\b|\bsteak|\broast\b/, 'meat', G(1), 'g', 6.5],
  [/\b(pork|ham|sausage|bacon|brats?)\b/, 'meat', G(1), 'g', 5.5],
  [/\b(salmon|cod|tilapia|fish|trout|halibut)/, 'meat', G(1), 'g', 9],
  [/\b(shrimp|prawn)/, 'meat', G(1), 'g', 9],
  // Dairy & eggs
  [/\beggs?\b/, 'dairy', 12, 'ea', 3.8],
  [/\bmilk\b/, 'dairy', GAL, 'ml', 4.2],
  [/\b(half and half|half-and-half|heavy cream|cream)\b/, 'dairy', FLOZ(16), 'ml', 3.8],
  [/\byogurt|\byoghurt/, 'dairy', OZ(32), 'g', 4.5],
  [/\bbutter\b/, 'dairy', G(1), 'g', 5],
  [/\b(cheese|mozzarella|cheddar|parmesan|feta|ricotta|cream cheese)/, 'dairy', OZ(8), 'g', 3.5, 0.48],
  [/\b(cottage cheese)/, 'dairy', OZ(16), 'g', 3.4],
  [/\b(sour cream)/, 'dairy', OZ(16), 'g', 2.6],
  [/\b(tofu)/, 'dairy', OZ(14), 'g', 2.5],
  // Bakery
  [/\b(bread|bun|buns|roll|rolls|bagel|tortilla|pita|wrap|english muffin)/, 'bakery', 1, 'ea', 3.5],
  // Frozen
  [/\b(frozen|ice cream|popsicle)/, 'frozen', OZ(16), 'g', 3.5],
  // Pantry
  [/\b(beans?|chickpeas?|lentils?)\b.*(can|canned)?|\bcan(ned)? (beans|chickpeas|tomato|corn)/, 'pantry', OZ(15), 'g', 1.3],
  [/\b(broth|stock)/, 'pantry', FLOZ(32), 'ml', 2.8],
  [/\b(tomato sauce|tomato paste|crushed tomato|diced tomato|marinara|passata)/, 'pantry', OZ(15), 'g', 1.6],
  [/\b(tuna|sardine|salmon can)/, 'pantry', OZ(5), 'g', 1.4],
  [/\b(coconut milk)/, 'pantry', FLOZ(13.5), 'ml', 2.3],
  [/\b(peanut butter|almond butter|nut butter)/, 'pantry', OZ(16), 'g', 3.5],
  [/\b(oats|oatmeal|granola|cereal)/, 'grains', OZ(18), 'g', 4, 0.4],
  [/\b(almond|walnut|pecan|cashew|peanut|nuts?|seeds?)\b/, 'pantry', OZ(10), 'g', 6.5],
  [/\b(honey|maple syrup|syrup|jam|jelly)/, 'pantry', OZ(12), 'g', 5],
  // Grains
  [/\b(rice)\b/, 'grains', G(2), 'g', 3, 0.85],
  [/\b(pasta|spaghetti|penne|macaroni|noodle|fettuccine|rotini)/, 'grains', OZ(16), 'g', 1.8, 0.4],
  [/\b(quinoa|couscous|barley|farro)/, 'grains', OZ(16), 'g', 4.5, 0.8],
  // Baking
  [/\bflour\b/, 'baking', G(5), 'g', 3.6, 0.53],
  [/\b(sugar)\b/, 'baking', G(4), 'g', 3.8, 0.85],
  [/\b(baking powder|baking soda|yeast|cornstarch|vanilla)/, 'baking', 1, 'ea', 3],
  [/\b(chocolate chips?|cocoa)/, 'baking', OZ(12), 'g', 3.8],
  // Spices & oils
  [/\b(olive oil|vegetable oil|canola oil|avocado oil|coconut oil|oil)\b/, 'spices', FLOZ(16.9), 'ml', 6.5],
  [/\bvinegar/, 'spices', FLOZ(16), 'ml', 3],
  [/\b(salt|pepper|paprika|cumin|oregano|cinnamon|chili powder|garlic powder|onion powder|turmeric|nutmeg|spice|seasoning|cayenne|curry)/, 'spices', 1, 'ea', 3],
  // Sauces
  [/\b(soy sauce|salsa|ketchup|mustard|mayo|mayonnaise|dressing|hot sauce|bbq|sauce|hummus|pesto)/, 'condiments', 1, 'ea', 3.5],
  // Snacks and drinks
  [/\b(chips|crackers|popcorn|pretzel|bar|cookies?)\b/, 'snacks', 1, 'ea', 4],
  [/\b(juice|soda|water|coffee|tea|kombucha|sparkling)/, 'drinks', 1, 'ea', 4],
];

/** { dept, pkg, pkgUnit, price, density } for an item name. */
export function describe(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, dept, pkg, pkgUnit, price, density] of CATALOG) {
    if (re.test(n)) return { dept, pkg, pkgUnit, price, density: density || 1, known: true };
  }
  return { dept: 'other', pkg: 1, pkgUnit: 'ea', price: 3, density: 1, known: false };
}
export const classify = (name) => describe(name).dept;

/* ---------------- Amounts ---------------- */

const TO_G = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };
const TO_ML = { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 236.588, floz: 29.574, pint: 473.176, quart: 946.353, gallon: 3785.41 };

/** { kind: 'g' | 'ml' | 'ea', amount } for a quantity and unit. */
export function toBase(qty, unit) {
  const q = Number.isFinite(qty) ? qty : 1;
  if (unit && TO_G[unit]) return { kind: 'g', amount: q * TO_G[unit] };
  if (unit && TO_ML[unit]) return { kind: 'ml', amount: q * TO_ML[unit] };
  return { kind: 'ea', amount: q };
}

const nice = (n) => {
  const r = Math.round(n * 100) / 100;
  const frac = { 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾' };
  const whole = Math.floor(r);
  const rest = Math.round((r - whole) * 100) / 100;
  if (frac[rest]) return `${whole || ''}${frac[rest]}`;
  return String(r);
};
const UNIT_LABEL = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', l: 'L', tsp: 'tsp', tbsp: 'tbsp', cup: 'cup', floz: 'fl oz', pint: 'pint', quart: 'quart', gallon: 'gal', can: 'can', jar: 'jar', package: 'pkg', clove: 'clove', slice: 'slice', piece: 'pc', stick: 'stick', head: 'head', bunch: 'bunch', sprig: 'sprig', stalk: 'stalk', fillet: 'fillet' };
const pluralUnit = (u, q) => (q > 1 && /^(cup|can|jar|pkg|clove|slice|pc|stick|head|bunch|sprig|stalk|fillet|pint|quart)$/.test(u) ? `${u}s` : u);

/** "2 cups", "1½ lb", "3". */
export function formatQty(qty, unit) {
  if (!Number.isFinite(qty) || qty <= 0) return '';
  const label = unit ? pluralUnit(UNIT_LABEL[unit] || unit, qty) : '';
  return `${nice(qty)}${label ? ` ${label}` : ''}`;
}

/* ---------------- Building the list ---------------- */

const SIZE_OK = /^(large|medium|small|extra large|jumbo)$/;
export const keyOf = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SIZE_OK.test(w) && !/^(fresh|organic|raw|whole|ripe|extra|virgin|boneless|skinless|lean|low-fat|nonfat|plain|unsalted|salted)$/.test(w))
    .map((w) => w.replace(/ies$/, 'y').replace(/(ch|sh|x|ss|oes)es$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1'))
    .join(' ')
    .trim();

/** A line typed by a person: "milk", "2 lb chicken thighs", "3 apples". */
export function parseTyped(text) {
  const p = parseIngredient(String(text || '').trim());
  const name = (p.name || String(text || '')).trim();
  return { name, qty: p.qty == null ? null : p.qty, unit: p.unit || null };
}

/** Meal ingredients scaled to the servings planned: [{ name, qty, unit, mealId }]. */
export function mealLines(meal) {
  const base = meal.baseServings > 0 ? meal.baseServings : 1;
  const scale = (meal.servings > 0 ? meal.servings : base) / base;
  return (meal.ingredients || [])
    .filter((i) => i.name)
    .map((i) => ({ name: i.name, qty: Number.isFinite(i.qty) ? i.qty * scale : null, unit: i.unit || null, mealId: meal.id, from: meal.name }));
}

/**
 * Merges lines that are the same thing into one row:
 * [{ key, name, parts: [{qty, unit}], sources: [...], manualIds: [...] }]
 */
export function mergeLines(lines) {
  const rows = new Map();
  for (const l of lines) {
    const key = keyOf(l.name);
    if (!key) continue;
    let row = rows.get(key);
    if (!row) {
      row = { key, name: l.name.trim(), parts: [], sources: [], manualIds: [], base: {} };
      rows.set(key, row);
    }
    const part = row.parts.find((p) => (p.unit || '') === (l.unit || ''));
    if (part && Number.isFinite(part.qty) && Number.isFinite(l.qty)) part.qty += l.qty;
    else if (!part) row.parts.push({ qty: Number.isFinite(l.qty) ? l.qty : null, unit: l.unit || null });
    const b = toBase(l.qty, l.unit);
    row.base[b.kind] = (row.base[b.kind] || 0) + b.amount;
    if (l.from && !row.sources.includes(l.from)) row.sources.push(l.from);
    if (l.manualId) row.manualIds.push(l.manualId);
    if (l.by && !row.by) row.by = l.by;
  }
  return [...rows.values()];
}

/** Estimated cost of a merged row: whole packages needed times the package price. */
export function estimate(row, store, real = null) {
  const d = describe(row.name);
  const f = getStore(store).factor;
  let packages = 1;
  const need = row.base;
  if (d.pkgUnit === 'g') {
    const grams = (need.g || 0) + (need.ml || 0) * d.density;
    if (grams > 0) packages = Math.max(1, Math.ceil(grams / d.pkg - 0.05));
    else if (need.ea) packages = Math.max(1, Math.ceil(need.ea / 3)); // "2 chicken breasts"
  } else if (d.pkgUnit === 'ml') {
    const ml = (need.ml || 0) + (need.g || 0) / d.density;
    if (ml > 0) packages = Math.max(1, Math.ceil(ml / d.pkg - 0.05));
  } else {
    const each = need.ea || 0;
    if (each > 0) packages = Math.max(1, Math.ceil(each / d.pkg - 0.05));
  }
  // A price read from the store's own site replaces the typical price (and its store factor).
  const unit = real && Number.isFinite(real.price) ? real.price : d.price * f;
  const price = Math.round(packages * unit * 100) / 100;
  return { price, packages, known: d.known, real: Boolean(real && Number.isFinite(real.price)) };
}

/**
 * The shopping list for a store: sections in the store's walk order.
 * lines: every needed line (from meals and typed items); have: Set of keys already checked off.
 * Returns { sections: [{ dept, label, total, items: [...] }], total }.
 */
export function buildList(lines, { store = 'typical', have = new Set(), real = new Map() } = {}) {
  const profile = getStore(store);
  const rows = mergeLines(lines).map((row) => {
    const d = describe(row.name);
    const found = real.get(row.key) || null;
    const est = estimate(row, store, found);
    return {
      ...row,
      real: est.real ? found : null,
      dept: d.dept,
      qtyText: row.parts.map((p) => formatQty(p.qty, p.unit)).filter(Boolean).join(' + '),
      price: est.price,
      guess: !est.known && !est.real,
      checked: have.has(row.key),
    };
  });
  const sections = profile.order
    .map((dept) => {
      const items = rows.filter((r) => r.dept === dept).sort((a, b) => a.name.localeCompare(b.name));
      return { dept, label: deptLabel(dept), items, total: Math.round(items.reduce((s, r) => s + r.price, 0) * 100) / 100 };
    })
    .filter((s) => s.items.length);
  const total = Math.round(rows.reduce((s, r) => s + r.price, 0) * 100) / 100;
  const left = Math.round(rows.filter((r) => !r.checked).reduce((s, r) => s + r.price, 0) * 100) / 100;
  return { sections, total, left, count: rows.length };
}

export const STAPLES = ['Milk', 'Eggs', 'Greek yogurt', 'Bread', 'Bananas', 'Apples', 'Butter', 'Cheese', 'Chicken breast', 'Rice', 'Spinach', 'Strawberries'];

/* ---------------- Real prices from the store's own site ---------------- */
// The app can't read walmart.com itself (browsers block one site from reading
// another, and Walmart blocks automated visits). So the app writes a small
// script for the person to run in their own browser on walmart.com, where the
// page already knows their store. The script looks each item up like a person
// would, and copies the results to paste back into the app.

/** Script text to paste into the browser console on walmart.com. items: [{ key, name }] */
export function walmartScript(items) {
  const list = JSON.stringify(items.map((i) => [i.key, i.name]));
  return `(async () => {
  const items = ${list};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  for (const [key, q] of items) {
    out[key] = [];
    try {
      const html = await (await fetch('/search?q=' + encodeURIComponent(q))).text();
      const ids = [...new Set([...html.matchAll(/\\/ip\\/(?:[^\\/"?]+\\/)?(\\d{6,})/g)].map((m) => m[1]))].slice(0, 3);
      for (const id of ids) {
        const page = await (await fetch('/ip/' + id)).text();
        const m = page.match(/id="__NEXT_DATA__"[^>]*>(.*?)<\\/script>/s);
        if (!m) continue;
        const p = JSON.parse(m[1])?.props?.pageProps?.initialData?.data?.product;
        if (!p) continue;
        const cur = p.priceInfo?.currentPrice || {};
        const price = typeof cur.price === 'number' ? cur.price : parseFloat(String(cur.priceString || '').replace(/[^0-9.]/g, ''));
        const a = page.replace(/<[^>]+>/g, ' ').match(/Aisle\\s?([A-Z]?\\d{1,3})/);
        out[key].push({ id, name: p.name, price, stock: p.availabilityStatus, aisle: a ? a[1] : null });
        await sleep(600);
      }
    } catch (e) {}
    console.log(key, out[key].length);
    await sleep(800);
  }
  const text = JSON.stringify({ store: 'walmart-draper', at: Date.now(), items: out });
  try { copy(text); console.log('Copied. Paste it into the app.'); } catch (e) { console.log(text); }
})();`;
}

const wordsOf = (s) => keyOf(s).split(' ').filter(Boolean);

/**
 * Reads what the script copied. Returns { found: { key: { price, aisle, name, url, stock } }, missed: [keys] }.
 * Of the top matches, prefers in-stock ones whose name shares the most words with the item.
 */
export function parseWalmartResults(text) {
  let data;
  try {
    data = JSON.parse(String(text).trim());
  } catch {
    throw new Error("That doesn't look like the copied results. Run the script again and paste everything it copied.");
  }
  if (!data || typeof data.items !== 'object') throw new Error('No items in what you pasted.');
  const found = {};
  const missed = [];
  for (const [key, cands] of Object.entries(data.items)) {
    const want = wordsOf(key);
    const ok = (Array.isArray(cands) ? cands : []).filter((c) => Number.isFinite(c.price) && c.price > 0);
    if (!ok.length) {
      missed.push(key);
      continue;
    }
    const score = (c) => {
      const have = new Set(wordsOf(c.name || ''));
      const hit = want.filter((w) => have.has(w)).length;
      const inStock = !c.stock || /in_stock|in stock/i.test(c.stock) ? 1 : 0;
      return inStock * 10 + hit;
    };
    const best = [...ok].sort((a, b) => score(b) - score(a))[0];
    found[key] = { price: best.price, aisle: best.aisle || null, name: best.name || key, url: `https://www.walmart.com/ip/${best.id}`, stock: best.stock || '', at: data.at || Date.now() };
  }
  return { found, missed };
}
