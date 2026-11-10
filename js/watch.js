// "Keep an eye on": the nutrients people aim to stay UNDER (sodium, saturated fat,
// added sugar, cholesterol), with plain red/amber/green status. Limits are the FDA
// Daily Values used elsewhere in the app. No DOM here.

export const LIMITS = [
  { key: 'sodium', label: 'Sodium', unit: 'mg', limit: 2300 },
  { key: 'satFat', label: 'Saturated fat', unit: 'g', limit: 20 },
  { key: 'addedSugar', label: 'Added sugar', unit: 'g', limit: 50 },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', limit: 300 },
];

/** Over the day: green under 75% of the limit, amber 75 to 100, red over. */
export const dayStatus = (pct) => (pct > 100 ? 'over' : pct >= 75 ? 'warn' : 'ok');

/** For one food: the label rule, 20% of the limit or more is "high", 40% or more is "very high". */
export const foodStatus = (pct) => (pct >= 40 ? 'over' : pct >= 20 ? 'warn' : 'ok');

/**
 * Rows for the day. Added sugar is often missing from food data; when no logged
 * food reports it, total sugars stand in (shown as "Sugars").
 */
export function dayRows(totals) {
  return LIMITS.map((l) => {
    let { key, label } = l;
    let value = totals[key];
    if (key === 'addedSugar' && !(value > 0) && totals.sugar > 0) {
      key = 'sugar';
      label = 'Sugars';
      value = totals.sugar;
    }
    if (value == null) return null;
    const pct = (value / l.limit) * 100;
    return { key, label, unit: l.unit, limit: l.limit, value, pct, status: dayStatus(pct) };
  }).filter(Boolean);
}

/** Limit nutrients one food is high in, for the amounts in `n`. */
export function foodFlags(n) {
  return LIMITS.map((l) => {
    const value = n[l.key];
    if (value == null) return null;
    const pct = (value / l.limit) * 100;
    return { key: l.key, label: l.label, pct, status: foodStatus(pct) };
  }).filter((x) => x && x.status !== 'ok');
}
