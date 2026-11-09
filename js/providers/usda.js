// USDA FoodData Central (https://fdc.nal.usda.gov) — free; works with the
// shared DEMO_KEY (rate limited) or your own key from
// https://fdc.nal.usda.gov/api-key-signup (set it in Settings).
// Best source for whole foods (apple, chicken breast, rice) and the most
// complete vitamin/mineral data. Search results are reported per 100 g.

const BASE = 'https://api.nal.usda.gov/fdc/v1';

// USDA nutrient numbers → our keys. Units from USDA already match ours
// (g, mg, µg) except energy, which we pick from kcal entries only.
const BY_NUMBER = {
  '203': 'protein', '204': 'fat', '205': 'carbs', '291': 'fiber', '269': 'sugar',
  '539': 'addedSugar', '606': 'satFat', '605': 'transFat', '601': 'cholesterol', '307': 'sodium',
  '320': 'vitA', '401': 'vitC', '328': 'vitD', '323': 'vitE', '430': 'vitK',
  '404': 'thiamin', '405': 'riboflavin', '406': 'niacin', '415': 'vitB6', '435': 'folate',
  '418': 'vitB12', '301': 'calcium', '303': 'iron', '304': 'magnesium', '305': 'phosphorus',
  '306': 'potassium', '309': 'zinc', '312': 'copper', '317': 'selenium',
};
const ENERGY_PRIORITY = ['208', '958', '957'];

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s,(/-])\S/g, (c) => c.toUpperCase());

export function normalizeFood(f) {
  const nutrients = {};
  const energy = {};
  for (const fn of f.foodNutrients || []) {
    const num = String(fn.nutrientNumber ?? fn.nutrient?.number ?? '');
    const value = fn.value ?? fn.amount;
    if (value == null) continue;
    if (ENERGY_PRIORITY.includes(num) && String(fn.unitName || fn.nutrient?.unitName).toUpperCase() === 'KCAL') energy[num] = value;
    else if (num === '417' && nutrients.folate == null) nutrients.folate = value; // total folate fallback
    else if (BY_NUMBER[num]) nutrients[BY_NUMBER[num]] = value;
  }
  const kcalKey = ENERGY_PRIORITY.find((k) => energy[k] != null);
  if (!kcalKey) return null;
  nutrients.kcal = energy[kcalKey];

  const units = [];
  const unit = String(f.servingSizeUnit || '').toLowerCase();
  if (f.servingSize > 0 && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt')) {
    const label = f.householdServingFullText ? `serving (${f.householdServingFullText}, ${Math.round(f.servingSize)} ${unit.startsWith('m') ? 'ml' : 'g'})` : `serving (${Math.round(f.servingSize)} g)`;
    units.push({ label, factor: f.servingSize / 100 });
  }
  for (const m of f.foodMeasures || []) {
    if (m.gramWeight > 0 && m.disseminationText && m.disseminationText !== 'Quantity not specified') {
      units.push({ label: `${m.disseminationText} (${Math.round(m.gramWeight)} g)`, factor: m.gramWeight / 100 });
    }
  }
  units.push({ label: '100 g', factor: 1 }, { label: 'g', factor: 0.01 }, { label: 'oz', factor: 28.3495 / 100 });

  const isBranded = f.dataType === 'Branded';
  return {
    id: `usda:${f.fdcId}`,
    source: `USDA ${f.dataType || ''}`.trim(),
    barcode: f.gtinUpc || '',
    name: isBranded ? titleCase(f.description || '') : f.description,
    brand: f.brandName || f.brandOwner || '',
    nutrients,
    units: dedupeUnits(units),
    defaultUnit: 0,
  };
}

function dedupeUnits(units) {
  const seen = new Set();
  return units.filter((u) => (seen.has(u.label) ? false : seen.add(u.label)));
}

export async function search(query, { apiKey, signal, includeBranded = true } = {}) {
  const types = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
  if (includeBranded) types.push('Branded');
  const params = new URLSearchParams({
    api_key: apiKey || 'DEMO_KEY',
    query,
    pageSize: '25',
    dataType: types.join(','),
  });
  const res = await fetch(`${BASE}/foods/search?${params}`, { signal });
  if (res.status === 429) throw new Error('USDA rate limit hit. Add your own free API key in Settings.');
  if (!res.ok) throw new Error(`USDA returned ${res.status}`);
  const data = await res.json();
  return (data.foods || []).map(normalizeFood).filter(Boolean);
}

/** USDA also knows many UPC barcodes (branded foods); used as a fallback. */
export async function lookupBarcode(code, opts = {}) {
  const results = await search(code, { ...opts, includeBranded: true });
  const trimmed = code.replace(/^0+/, '');
  return results.find((f) => f.barcode && f.barcode.replace(/^0+/, '') === trimmed) || null;
}
