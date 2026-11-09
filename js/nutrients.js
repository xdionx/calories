// Canonical nutrient list. Every food in the app is normalised to these keys.
// `dv` is the FDA Daily Value for adults (2020 label rules), used for % DV.

export const NUTRIENTS = [
  // Energy & macros
  { key: 'kcal', label: 'Calories', unit: 'kcal', group: 'macro' },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro', dv: 50 },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g', group: 'macro', dv: 275 },
  { key: 'fat', label: 'Fat', unit: 'g', group: 'macro', dv: 78 },
  { key: 'fiber', label: 'Fiber', unit: 'g', group: 'detail', dv: 28 },
  { key: 'sugar', label: 'Sugars', unit: 'g', group: 'detail' },
  { key: 'addedSugar', label: 'Added sugars', unit: 'g', group: 'detail', dv: 50 },
  { key: 'satFat', label: 'Saturated fat', unit: 'g', group: 'detail', dv: 20 },
  { key: 'transFat', label: 'Trans fat', unit: 'g', group: 'detail' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', group: 'detail', dv: 300 },
  { key: 'sodium', label: 'Sodium', unit: 'mg', group: 'mineral', dv: 2300 },

  // Vitamins
  { key: 'vitA', label: 'Vitamin A', unit: 'µg', group: 'vitamin', dv: 900 },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'vitamin', dv: 90 },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', group: 'vitamin', dv: 20 },
  { key: 'vitE', label: 'Vitamin E', unit: 'mg', group: 'vitamin', dv: 15 },
  { key: 'vitK', label: 'Vitamin K', unit: 'µg', group: 'vitamin', dv: 120 },
  { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', group: 'vitamin', dv: 1.2 },
  { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', group: 'vitamin', dv: 1.3 },
  { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', group: 'vitamin', dv: 16 },
  { key: 'vitB6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin', dv: 1.7 },
  { key: 'folate', label: 'Folate', unit: 'µg', group: 'vitamin', dv: 400 },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin', dv: 2.4 },

  // Minerals
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', dv: 1300 },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'mineral', dv: 18 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', dv: 420 },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', group: 'mineral', dv: 1250 },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'mineral', dv: 4700 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral', dv: 11 },
  { key: 'copper', label: 'Copper', unit: 'mg', group: 'mineral', dv: 0.9 },
  { key: 'selenium', label: 'Selenium', unit: 'µg', group: 'mineral', dv: 55 },
];

export const NUTRIENT_MAP = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

/** Multiply every nutrient value by `factor`, returning a new object. */
export function scaleNutrients(nutrients, factor) {
  const out = {};
  for (const [k, v] of Object.entries(nutrients || {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v * factor;
  }
  return out;
}

/** Sum a list of nutrient objects. */
export function sumNutrients(list) {
  const out = {};
  for (const n of list) {
    for (const [k, v] of Object.entries(n || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

export function formatAmount(value, unit) {
  if (value == null || !Number.isFinite(value)) return '–';
  let digits = 0;
  if (Math.abs(value) < 10 && unit !== 'kcal') digits = 1;
  if (Math.abs(value) < 1 && unit !== 'kcal') digits = 2;
  const num = value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return unit === 'kcal' ? num : `${num} ${unit}`;
}
