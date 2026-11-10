// "Healthier swap": easy snack ideas shown only when someone asks for them.
// Plain logic, no DOM. Portions and values are typical USDA figures, rounded.

const s = (id, name, serving, kcal, protein, carbs, fat, satFat, fiber, sugar, sodium) => ({
  id: `swap:${id}`,
  source: 'Healthier swap',
  name,
  brand: '',
  category: 'Snack',
  nutrients: { kcal, protein, carbs, fat, satFat, fiber, sugar, sodium },
  units: [{ label: serving, factor: 1 }],
  defaultUnit: 0,
});

const SWAPS = {
  strawberries: s('strawberries', 'Strawberries', '1 cup (152 g)', 49, 1, 12, 0.5, 0, 3, 7.4, 2),
  apple: s('apple', 'Apple', '1 medium (182 g)', 95, 0.5, 25, 0.3, 0, 4.4, 19, 2),
  banana: s('banana', 'Banana', '1 medium (118 g)', 105, 1.3, 27, 0.4, 0.1, 3.1, 14, 1),
  grapes: s('grapes', 'Grapes', '1 cup (151 g)', 104, 1.1, 27, 0.2, 0.1, 1.4, 23, 3),
  blueberries: s('blueberries', 'Blueberries', '1 cup (148 g)', 84, 1.1, 21, 0.5, 0, 3.6, 15, 1),
  yogurt: s('greek-yogurt', 'Plain nonfat Greek yogurt', '3/4 cup (170 g)', 100, 17, 6, 0.7, 0.4, 0, 5, 65),
  cottage: s('cottage-cheese', 'Low-fat cottage cheese', '1/2 cup (113 g)', 90, 12, 5, 2.5, 1.5, 0, 4, 330),
  carrots: s('carrots-hummus', 'Baby carrots with hummus', '3 oz carrots + 2 tbsp hummus', 100, 2.8, 11, 5, 0.7, 3.5, 3.5, 180),
  popcorn: s('popcorn', 'Air-popped popcorn', '3 cups (24 g)', 93, 3, 19, 1.1, 0.1, 3.6, 0.2, 2),
  almonds: s('almonds', 'Almonds', '1 oz (about 23 nuts)', 164, 6, 6, 14, 1.1, 3.5, 1.2, 0),
  cheese: s('string-cheese', 'String cheese (part-skim)', '1 stick (28 g)', 80, 7, 1, 5, 3, 0, 0, 180),
  egg: s('boiled-egg', 'Hard-boiled egg', '1 large (50 g)', 78, 6.3, 0.6, 5.3, 1.6, 0, 0.6, 62),
  chocolate: s('dark-chocolate', 'Dark chocolate (70%)', '2 squares (20 g)', 120, 1.6, 9, 9, 5.4, 2.2, 5, 5),
  applepb: s('apple-pb', 'Apple slices with peanut butter', '1 apple + 1 tbsp', 189, 4.1, 28, 8.3, 1.7, 5.4, 20.5, 72),
};

const SWEET_WORDS = /shake|frosty|mcflurry|cookie|brownie|cake|pie|ice cream|cone|candy|chocolate|donut|doughnut|soda|coke|sprite|fanta|lemonade|tea|frappe|latte|mocha|juice|syrup|pancake|waffle|cinnamon|parfait/i;

/**
 * Is this food (the amount being looked at) on the heavier side? Nutrients are
 * for that amount. Returns the reasons, or [] when it looks fine.
 */
export function whyHeavy(n) {
  const why = [];
  if ((n.sugar ?? 0) >= 20) why.push('sugar');
  if ((n.satFat ?? 0) >= 8) why.push('saturated fat');
  if ((n.sodium ?? 0) >= 900) why.push('sodium');
  if ((n.fat ?? 0) >= 25) why.push('fat');
  return why;
}

/** Up to four easy swaps for a food. Sweet foods get sweet swaps, the rest get savory ones. */
export function suggestSwaps(food, n) {
  const sweet = (n.sugar ?? 0) >= 15 || SWEET_WORDS.test(food.name || '');
  const keys = sweet
    ? ['strawberries', 'yogurt', 'apple', 'chocolate']
    : ['yogurt', 'apple', 'carrots', 'popcorn'];
  return keys.map((k) => SWAPS[k]);
}

export const ALL_SWAPS = SWAPS;
