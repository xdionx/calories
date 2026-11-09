// Open Food Facts (https://world.openfoodfacts.org) — free, no API key.
// Best source for packaged foods and barcode lookups.
// OFF stores *_100g nutriments in grams (energy in kcal), so we convert
// vitamins and minerals into mg / µg here.

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = [
  'code', 'product_name', 'product_name_en', 'generic_name', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'nutriments', 'image_front_small_url',
].join(',');

// [our key, OFF key, multiplier from grams → our unit]
const MAP = [
  ['kcal', 'energy-kcal', 1],
  ['protein', 'proteins', 1],
  ['carbs', 'carbohydrates', 1],
  ['fat', 'fat', 1],
  ['fiber', 'fiber', 1],
  ['sugar', 'sugars', 1],
  ['addedSugar', 'added-sugars', 1],
  ['satFat', 'saturated-fat', 1],
  ['transFat', 'trans-fat', 1],
  ['cholesterol', 'cholesterol', 1000],
  ['sodium', 'sodium', 1000],
  ['vitA', 'vitamin-a', 1e6],
  ['vitC', 'vitamin-c', 1000],
  ['vitD', 'vitamin-d', 1e6],
  ['vitE', 'vitamin-e', 1000],
  ['vitK', 'vitamin-k', 1e6],
  ['thiamin', 'vitamin-b1', 1000],
  ['riboflavin', 'vitamin-b2', 1000],
  ['niacin', 'vitamin-pp', 1000],
  ['vitB6', 'vitamin-b6', 1000],
  ['folate', 'vitamin-b9', 1e6],
  ['vitB12', 'vitamin-b12', 1e6],
  ['calcium', 'calcium', 1000],
  ['iron', 'iron', 1000],
  ['magnesium', 'magnesium', 1000],
  ['phosphorus', 'phosphorus', 1000],
  ['potassium', 'potassium', 1000],
  ['caffeine', 'caffeine', 1000],
  ['zinc', 'zinc', 1000],
  ['copper', 'copper', 1000],
  ['selenium', 'selenium', 1e6],
];

export function normalizeProduct(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const nutrients = {};
  for (const [key, off, mult] of MAP) {
    let v = n[`${off}_100g`];
    if (key === 'kcal' && v == null && n['energy_100g'] != null) v = n['energy_100g'] / 4.184; // kJ → kcal
    if (v != null && v !== '' && Number.isFinite(Number(v))) nutrients[key] = Number(v) * mult;
  }
  const name = p.product_name || p.product_name_en || p.generic_name;
  if (!name || nutrients.kcal == null) return null;

  const units = [];
  const servingG = Number(p.serving_quantity);
  if (servingG > 0) units.push({ label: `serving${p.serving_size ? ` (${p.serving_size})` : ` (${servingG} g)`}`, factor: servingG / 100 });
  units.push({ label: '100 g', factor: 1 });
  units.push({ label: 'g', factor: 0.01 });
  units.push({ label: 'oz', factor: 28.3495 / 100 });

  return {
    id: `off:${p.code}`,
    source: 'Open Food Facts',
    barcode: p.code,
    name: name.trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    image: p.image_front_small_url || '',
    nutrients,
    units,
    defaultUnit: 0,
  };
}

export async function lookupBarcode(code, { signal } = {}) {
  const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 && data.status !== 'success') return null;
  return normalizeProduct({ ...data.product, code: data.product?.code || code });
}

export async function search(query, { signal } = {}) {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const data = await res.json();
  return (data.products || []).map(normalizeProduct).filter(Boolean);
}
