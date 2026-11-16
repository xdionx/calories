// Raising Cane's. The official nutrition page (raisingcanes.com/nutrition) could not be
// reached when this was added, so values come from FastFoodNutrition.org, which cites
// Raising Cane's as its source: https://fastfoodnutrition.org/raising-canes
// (pages marked "Updated 2/14/2021", read 2026-11-16). Combos are the published combo
// totals, without a drink. Drinks list only calories per size there, so their carbs and
// sugar are estimated as calories / 4 (they are fat- and protein-free).

import { createStaticProvider, row } from './provider.js';

// name, category, kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, cholesterol
const rc = (name, category, kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, cholesterol) =>
  row(name, category, kcal, protein, carbs, fat, satFat, sodium, fiber, sugar, { cholesterol });

// Sweet drinks: all calories from sugar.
const drink = (name, kcal) => rc(name, 'Drinks', kcal, 0, Math.round(kcal / 4), 0, 0, 0, 0, Math.round(kcal / 4), 0);

export const raisingcanes = createStaticProvider({
  id: 'raisingcanes', name: "Raising Cane's", color: '#c8102e', note: 'Published nutrition via FastFoodNutrition',
  items: [
    rc('Box Combo (4 fingers, fries, toast, slaw, sauce)', 'Combos', 1250, 61, 97, 68, 11, 2130, 12, 16, 170),
    rc('3 Finger Combo (3 fingers, fries, toast, sauce)', 'Combos', 1020, 47, 81, 56, 9, 1640, 10, 9, 125),
    rc('Caniac Combo (6 fingers, fries, toast, slaw, 2 sauces)', 'Combos', 1790, 89, 124, 104, 16, 3160, 15, 21, 255),
    rc('Kids Combo (2 fingers, fries, sauce)', 'Combos', 630, 29, 38, 40, 6, 1100, 5, 5, 85),
    rc('Chicken Sandwich (3 fingers, sauce, lettuce, bun)', 'Sandwich', 780, 48, 66, 39, 6, 1470, 5, 13, 120),
    { ...rc('Chicken Finger', 'Chicken & sides', 130, 13, 5, 6, 1, 190, 1, 0, 40), serving: '1 finger' },
    { ...rc("Cane's Sauce", 'Chicken & sides', 190, 0, 6, 19, 3, 580, 0, 4, 10), serving: '1 cup' },
    rc('Crinkle-Cut Fries', 'Chicken & sides', 390, 5, 49, 19, 2, 310, 7, 1, 0),
    { ...rc('Texas Toast', 'Chicken & sides', 140, 4, 23, 4, 1.5, 260, 1, 4, 0), serving: '1 slice' },
    rc('Coleslaw', 'Chicken & sides', 100, 1, 11, 6, 1, 310, 1, 7, 5),
    drink('Lemonade, kids', 90),
    drink('Lemonade, regular', 180),
    drink('Lemonade, large', 240),
    drink('Lemonade, gallon jug', 1750),
    drink('Sweet Tea, kids', 90),
    drink('Sweet Tea, regular', 140),
    drink('Sweet Tea, large', 190),
    drink('Sweet Tea, gallon jug', 1380),
    rc('Unsweet Tea', 'Drinks', 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ],
});
