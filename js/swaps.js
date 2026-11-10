// "Healthier ideas": looks at what was actually logged, flags a bias towards
// sugar, saturated fat, cholesterol or sodium, and suggests swaps that fix
// exactly that and suit the kind of food. Plain logic, no DOM. Values are
// typical USDA figures, rounded.

const CONCERNS = {
  sugar: { label: 'sugar', unit: 'g', less: 'less sugar' },
  satFat: { label: 'saturated fat', unit: 'g', less: 'less saturated fat' },
  cholesterol: { label: 'cholesterol', unit: 'mg', less: 'less cholesterol' },
  sodium: { label: 'sodium', unit: 'mg', less: 'less sodium' },
};

// s(id, name, serving, tags, kcal, protein, carbs, fat, satFat, fiber, sugar, sodium, cholesterol)
const s = (id, name, serving, tags, kcal, protein, carbs, fat, satFat, fiber, sugar, sodium, cholesterol) => ({
  id: `swap:${id}`,
  source: 'Healthier swap',
  name,
  brand: '',
  category: 'Healthier idea',
  tags,
  nutrients: { kcal, protein, carbs, fat, satFat, fiber, sugar, sodium, cholesterol },
  units: [{ label: serving, factor: 1 }],
  defaultUnit: 0,
});

const SWAPS = [
  // Sweet things
  s('strawberries', 'Strawberries', '1 cup (152 g)', ['sweet', 'creamy'], 49, 1, 12, 0.5, 0, 3, 7.4, 2, 0),
  s('apple', 'Apple', '1 medium (182 g)', ['sweet', 'baked'], 95, 0.5, 25, 0.3, 0, 4.4, 19, 2, 0),
  s('blueberries', 'Blueberries', '1 cup (148 g)', ['sweet'], 84, 1.1, 21, 0.5, 0, 3.6, 15, 1, 0),
  s('yogurt-berries', 'Greek yogurt with berries', '3/4 cup yogurt + 1/2 cup berries', ['sweet', 'creamy'], 142, 17.5, 17, 0.9, 0.4, 2, 12.5, 66, 5),
  s('dark-chocolate', 'Dark chocolate (70%)', '2 squares (20 g)', ['sweet'], 120, 1.6, 9, 9, 5.4, 2.2, 5, 5, 0),
  s('applepb', 'Apple slices with peanut butter', '1 apple + 1 tbsp', ['sweet', 'baked'], 189, 4.1, 28, 8.3, 1.7, 5.4, 20.5, 72, 0),
  s('oatmeal', 'Oatmeal with cinnamon', '1 cup cooked (234 g)', ['sweet', 'baked', 'egg'], 154, 6, 27, 2.6, 0.5, 4, 1.1, 9, 0),
  s('frozen-grapes', 'Frozen grapes', '1 cup (151 g)', ['sweet', 'creamy'], 104, 1.1, 27, 0.2, 0.1, 1.4, 23, 3, 0),
  // Drinks
  s('sparkling', 'Sparkling water with lemon', '12 oz', ['drink'], 0, 0, 0, 0, 0, 0, 0, 0, 0),
  s('iced-tea', 'Unsweetened iced tea', '16 oz', ['drink'], 2, 0, 0.5, 0, 0, 0, 0, 10, 0),
  s('milk-skim', 'Skim milk', '1 cup (245 g)', ['drink', 'creamy'], 83, 8.3, 12, 0.2, 0.1, 0, 12, 103, 5),
  // Savory, meat and fried
  s('chicken-breast', 'Grilled chicken breast', '4 oz (113 g)', ['meat', 'fried'], 187, 35, 0, 4, 1.1, 0, 0, 80, 99),
  s('turkey', 'Sliced turkey breast', '3 oz (85 g)', ['meat', 'baked'], 90, 16, 3, 1, 0.3, 0, 2, 600, 40),
  s('salmon', 'Baked salmon', '4 oz (113 g)', ['meat'], 233, 25, 0, 14, 3, 0, 0, 70, 70),
  s('black-beans', 'Black beans', '1/2 cup (86 g)', ['meat', 'cheese'], 114, 7.6, 20, 0.5, 0.1, 7.5, 0.3, 1, 0),
  s('sweet-potato', 'Baked sweet potato', '1 medium (114 g)', ['fried', 'baked'], 112, 2, 26, 0.1, 0, 3.8, 5.4, 72, 0),
  s('popcorn', 'Air-popped popcorn', '3 cups (24 g)', ['fried', 'snack'], 93, 3, 19, 1.1, 0.1, 3.6, 0.2, 2, 0),
  s('carrots-hummus', 'Baby carrots with hummus', '3 oz carrots + 2 tbsp hummus', ['fried', 'snack', 'cheese'], 100, 2.8, 11, 5, 0.7, 3.5, 3.5, 180, 0),
  s('chickpeas', 'Roasted chickpeas', '1/2 cup (82 g)', ['fried', 'snack'], 134, 7, 22, 2, 0.2, 6, 4, 6, 0),
  // Eggs, cheese, bakery
  s('egg-whites', 'Scrambled egg whites', '3 large (99 g)', ['egg', 'meat'], 51, 11, 0.7, 0.2, 0, 0, 0.7, 165, 0),
  s('yogurt', 'Plain nonfat Greek yogurt', '3/4 cup (170 g)', ['creamy', 'egg', 'snack'], 100, 17, 6, 0.7, 0.4, 0, 5, 65, 5),
  s('cottage', 'Low-fat cottage cheese', '1/2 cup (113 g)', ['cheese', 'egg', 'snack'], 90, 12, 5, 2.5, 1.5, 0, 4, 330, 10),
  s('string-cheese', 'String cheese (part-skim)', '1 stick (28 g)', ['cheese', 'snack'], 80, 7, 1, 5, 3, 0, 0, 180, 15),
  s('avocado-toast', 'Whole-wheat toast with avocado', '1 slice + 1/4 avocado', ['baked', 'egg', 'cheese'], 150, 5, 17, 8, 1.2, 5, 2, 130, 0),
  s('side-salad', 'Side salad with vinaigrette', '1.5 cups', ['snack'], 80, 2, 8, 5, 0.7, 3, 3, 150, 0),
  s('almonds', 'Almonds', '1 oz (about 23 nuts)', ['snack', 'sweet'], 164, 6, 6, 14, 1.1, 3.5, 1.2, 0, 0),
];

// What kind of food is it? Drives which swaps make sense (a milkshake gets
// sweet and creamy ideas, bacon gets leaner protein, not strawberries).
const KINDS = [
  ['drink', /soda|coke|pepsi|sprite|fanta|lemonade|juice|punch|dr\.? ?pepper|tea\b|latte|mocha|frappe|coffee|energy drink|smoothie/i],
  ['creamy', /shake|frosty|mcflurry|ice cream|cone|sundae|pudding|custard|gelato|frozen yogurt|whipped/i],
  ['sweet', /cookie|brownie|cake|pie\b|candy|chocolate|donut|doughnut|syrup|pancake|waffle|cinnamon|muffin|pastry|danish|granola|cereal|jam|honey|sugar|bar\b/i],
  ['meat', /burger|bacon|sausage|ribs|steak|nugget|chicken|beef|pork|hot dog|brat|patty|ham\b|salami|pepperoni|wing|fried/i],
  ['fried', /fries|fried|crispy|onion ring|tots|chips|hash brown|nacho/i],
  ['egg', /egg|omelet|omelette|scramble|breakfast|mcmuffin|quiche|benedict/i],
  ['cheese', /cheese|pizza|quesadilla|mac\b|queso|lasagna|alfredo|cheesy/i],
  ['baked', /bagel|biscuit|croissant|toast|bread|bun\b|roll\b|sandwich/i],
];
const kindsOf = (food) => KINDS.filter(([, re]) => re.test(`${food.name || ''} ${food.category || ''}`)).map(([k]) => k);

// What the nutrient numbers say, for the amount that was logged.
function concernKeys(n) {
  const out = [];
  const sugar = n.addedSugar != null ? n.addedSugar : (n.fiber ?? 0) >= 3 ? 0 : n.sugar ?? 0; // fruit's own sugar comes with fiber: not a concern
  if (sugar >= 15) out.push('sugar');
  if ((n.satFat ?? 0) >= 6) out.push('satFat');
  if ((n.cholesterol ?? 0) >= 150) out.push('cholesterol');
  if ((n.sodium ?? 0) >= 1000) out.push('sodium');
  return out;
}

/** Plain-language reasons this food leans unhealthy on its own, or [] when it looks fine. */
export function whyHeavy(n) {
  return concernKeys(n).map((k) => CONCERNS[k].label);
}

const amount = (v, unit) => `${Math.round(v)} ${unit}`;

// Balance: does the meal have enough protein and fiber for its size?
function gapsOf(m) {
  const out = [];
  if ((m.kcal ?? 0) >= 250) {
    if ((m.protein ?? 0) < 15 || ((m.protein ?? 0) * 4) / m.kcal < 0.15) out.push('protein');
    if ((m.fiber ?? 0) < 4) out.push('fiber');
  }
  return out;
}

// Balance over the day: behind pace on protein or fiber compared with calories eaten so far.
// `day` = { kcal, kcalGoal, protein, proteinGoal, fiber, fiberGoal } for the day including this item.
function dayGaps(day) {
  const out = [];
  const notes = [];
  if (!day || !(day.kcalGoal > 0)) return { out, notes };
  const pace = day.kcal / day.kcalGoal;
  if (pace < 0.2) return { out, notes };
  for (const [key, goal, v] of [['protein', day.proteinGoal, day.protein], ['fiber', day.fiberGoal, day.fiber]]) {
    if (goal > 0 && v / goal < pace - 0.15) {
      out.push(key);
      notes.push(`You're at ${Math.round(v)} of ${Math.round(goal)} g ${key} today.`);
    }
  }
  return { out, notes };
}

/**
 * Looks at what was logged and at the meal around it. Returns:
 *   flagged  - worth offering ideas (leans on sugar/sat fat/cholesterol/sodium, or a big
 *              item with little protein or fiber). A plain apple is never flagged.
 *   concerns - what the item leans on, as words
 *   gaps     - what the meal or the day is missing: 'protein', 'fiber'
 *   notes    - plain sentences about the day, e.g. "You're at 9 of 28 g fiber today."
 *   swaps    - lighter replacements that cut what the item leans on
 *   adds     - things to add to round the meal out
 * `meal` is the totals of everything logged in that meal (including this item).
 */
export function analyze(food, n, meal = n, day = null) {
  const keys = concernKeys(n);
  const dg = dayGaps(day);
  const gaps = [...new Set([...gapsOf(meal), ...dg.out])];
  const bigAndThin = (n.kcal ?? 0) >= 300 && gapsOf(n).length > 0;
  const flagged = keys.length > 0 || bigAndThin;
  if (!flagged) return { flagged: false, concerns: [], gaps: [], notes: [], swaps: [], adds: [] };
  const kinds = kindsOf(food);

  const swaps = SWAPS.map((sw) => {
    const gains = keys
      .filter((k) => (sw.nutrients[k] ?? 0) <= (n[k] ?? 0) * 0.5 && (n[k] ?? 0) - (sw.nutrients[k] ?? 0) >= (k === 'sodium' || k === 'cholesterol' ? 50 : 3))
      .map((k) => ({ k, by: (n[k] ?? 0) - (sw.nutrients[k] ?? 0) }));
    const fit = sw.tags.filter((t) => kinds.includes(t)).length;
    // A swap that also brings protein or fiber the meal lacks is worth more.
    const bonus = (gaps.includes('protein') && sw.nutrients.protein >= 10 ? 1 : 0) + (gaps.includes('fiber') && sw.nutrients.fiber >= 3 ? 1 : 0);
    return { sw, gains, score: gains.length * 2 + fit * 3 + bonus - (sw.nutrients.kcal > n.kcal ? 4 : 0) };
  })
    .filter((x) => x.gains.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ sw, gains }) => ({ ...sw, gain: gains.map(({ k, by }) => `${amount(by, CONCERNS[k].unit)} ${CONCERNS[k].less}`).join(' · ') }));

  const taken = new Set(swaps.map((x) => x.id));
  const adds = [];
  for (const gap of gaps) {
    const field = gap === 'protein' ? 'protein' : 'fiber';
    const min = gap === 'protein' ? 10 : 3;
    // Additions should suit the food: meat-style adds only beside meat, eggs, fried or baked foods.
    const rank = (sw) => sw.nutrients[field] / (sw.nutrients.kcal + 40) + 0.15 * sw.tags.filter((t) => kinds.includes(t)).length + (sw.tags.includes('snack') ? 0.05 : 0);
    SWAPS.filter((sw) => sw.nutrients[field] >= min && !taken.has(sw.id) && sw.nutrients.kcal <= 220 && (!sw.tags.includes('meat') || sw.tags.some((t) => kinds.includes(t))))
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 2)
      .forEach((sw) => {
        taken.add(sw.id);
        adds.push({ ...sw, gain: `+${amount(sw.nutrients[field], 'g')} ${field}` });
      });
  }
  return { flagged: true, concerns: keys.map((k) => CONCERNS[k].label), gaps, notes: dg.notes, swaps, adds };
}

export const ALL_SWAPS = SWAPS;
