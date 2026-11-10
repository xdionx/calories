// Like-for-like swaps from the same restaurant's own menu: log a Baconator and
// get the lighter burgers and sandwiches on Wendy's menu, not a generic snack.
// Compares one serving of the logged item with one serving of each menu item.

import { RESTAURANTS } from './providers/restaurants/index.js';

// What job does a menu item do? Items only swap with the same job.
function roleOf(f) {
  const cat = (f.category || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  if (/dessert|treat/.test(cat) || /mcflurry|frosty|shake|sundae|cone/.test(name)) return 'dessert';
  if (/drink|beverage/.test(cat)) return 'drink';
  if (/breakfast/.test(cat) || /breakfast|mcmuffin|egg|biscuit|hotcake|pancake|omelet|scramble|croissan|bagel/.test(name)) return /hash brown/.test(name) ? 'side' : 'breakfast';
  if (/salad|soup/.test(cat)) return 'salad';
  if (/pizza|crust|deep dish/.test(cat) || /pizza/.test(name)) return 'pizza';
  if (/nugget|tender|strip|wing|bites/.test(name)) return 'bites';
  if (/side|tots|breads|dip|sauce|dressing/.test(cat) || /fries|hash brown|tots/.test(name)) return 'side';
  if (/breakfast/.test(cat)) return 'breakfast';
  if (/burger/.test(cat) || /burger|sandwich|wrap|club|blt|mcchicken|filet|whopper|baconator|single|double|stack|mcmuffin|biscuit|croissant/.test(name)) return 'sandwich';
  return cat || 'other';
}

// A lighter pick shouldn't be the same signature item in another size (Baconator -> Son of Baconator).
const GENERIC = /^(chicken|sandwich|burger|cheeseburger|hamburger|cheese|bacon|double|single|crispy|spicy|classic|grilled|ranch|large|medium|small|regular|original|breakfast)$/;
const keyWords = (name) => (name.toLowerCase().match(/[a-z]{5,}/g) || []).filter((w) => !GENERIC.test(w));

const cut = (was, now) => (was > 0 ? 1 - now / was : 0);
const pretty = (v, unit) => `${Math.round(v)} ${unit}`;

/**
 * Lighter items from the same menu that do the same job. `one` is the logged
 * item's nutrients for ONE serving. Returns up to 3 foods with a `gain` line.
 */
export async function menuAlternatives(food, one) {
  const rest = RESTAURANTS.find((r) => r.name === food.brand || r.name === food.source);
  if (!rest || !one?.kcal) return [];
  let menu;
  try {
    menu = await rest.search('');
  } catch {
    return [];
  }
  const role = roleOf(food);
  const mine = keyWords(food.name);
  const clean = (s) => (s || '').replace(/\s*\(approx\.\)/i, '').trim().toLowerCase();
  const scored = menu
    .filter((m) => m.id !== food.id && clean(m.name) !== clean(food.name) && roleOf(m) === role && !keyWords(m.name).some((w) => mine.includes(w)))
    .map((m) => {
      const c = { ...m.nutrients };
      const kcalCut = cut(one.kcal, c.kcal);
      const satCut = cut(one.satFat ?? 0, c.satFat ?? one.satFat ?? 0);
      const sodiumCut = cut(one.sodium ?? 0, c.sodium ?? one.sodium ?? 0);
      const sugarCut = cut(one.sugar ?? 0, c.sugar ?? one.sugar ?? 0);
      // Keeping protein makes it a real replacement, not just a smaller version.
      const keep = one.protein > 5 ? Math.min((c.protein ?? 0) / one.protein, 1) : 1;
      const worth = kcalCut >= 0.2 || satCut >= 0.3 || (sugarCut >= 0.4 && (one.sugar ?? 0) >= 15);
      // Better macros: protein per calorie should go up, not just calories down.
      const dens = c.kcal > 0 && one.protein > 0 ? Math.min(c.protein / c.kcal / (one.protein / one.kcal), 1.6) : 1;
      return { m, kcalCut, satCut, sodiumCut, sugarCut, worth, keep, score: Math.min(kcalCut, 0.6) + Math.min(satCut, 0.5) + 0.5 * sodiumCut + 0.5 * sugarCut + 0.6 * keep + 1.0 * dens };
    })
    .filter((x) => x.worth && x.kcalCut > 0 && x.keep >= 0.5)
    .sort((a, b) => b.score - a.score)
    // Near-identical items (same calories and protein, e.g. spicy and classic) count once.
    .filter((x, i, all) => all.findIndex((y) => y.m.nutrients.kcal === x.m.nutrients.kcal && y.m.nutrients.protein === x.m.nutrients.protein) === i)
    .slice(0, 3);
  return scored.map(({ m }) => {
    const c = m.nutrients;
    const parts = [];
    const d = (k) => (one[k] ?? 0) - (c[k] ?? one[k] ?? 0); // a missing value on the menu is not counted as a saving
    if (d('kcal') >= 40) parts.push(`${pretty(d('kcal'), 'kcal')} fewer`);
    if (d('satFat') >= 2) parts.push(`${pretty(d('satFat'), 'g')} less saturated fat`);
    if (d('sodium') >= 200) parts.push(`${pretty(d('sodium'), 'mg')} less sodium`);
    if (d('sugar') >= 10) parts.push(`${pretty(d('sugar'), 'g')} less sugar`);
    return { ...m, restaurant: rest.name, gain: parts.slice(0, 3).join(' · ') };
  });
}

/** Is this a chain-restaurant item we have a menu for? */
export const isRestaurantFood = (food) => RESTAURANTS.some((r) => r.name === food.brand || r.name === food.source);
