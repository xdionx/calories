// Domino's, from the official US Nutrition Guide (September 2025, includes
// Breads update):
// https://cache.dominos.com/olo/6_164_0/assets/build/market/US/_en/pdf/DominosNutritionGuide.pdf
// Pizza servings follow the guide (e.g. 1/8 pizza); "slice" and "whole pizza"
// units are added from the standard cut (S 6, M 8, L 8, XL 12, NY Large 6).
// Build-your-own pizzas are summed from the guide's crust, sauce, cheese and
// topping rows, the same way the guide tells you to add them up.

import { createStaticProvider, clean } from './provider.js';

const KEYS = ['grams', 'kcal', 'fat', 'satFat', 'transFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'sugar', 'addedSugar', 'protein'];
// Guide column order: grams, kcal, fat, sat, trans, chol, sodium, carbs, fiber, sugar, added sugar, protein.
const n = (...vals) => Object.fromEntries(KEYS.map((k, i) => [k, vals[i]]));
const split = ({ grams, ...nutrients }) => ({ grams, nutrients: clean(nutrients) });
const sum = (...parts) => {
  const out = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = Math.round(((out[k] || 0) + v) * 10) / 10;
  return out;
};

const item = (name, category, serving, data, units = []) => {
  const { grams, nutrients } = split(data);
  return { name, category, serving, grams, units, nutrients };
};

/* ---------- Specialty pizzas (Hand Tossed) ---------- */

const SIZES = {
  S: { label: 'Small 10"', serving: '1/4 pizza', perPizza: 4, slices: 6 },
  M: { label: 'Medium 12"', serving: '1/5 pizza', perPizza: 5, slices: 8 },
  L: { label: 'Large 14"', serving: '1/8 pizza', perPizza: 8, slices: 8 },
  XL: { label: 'X-Large 16"', serving: '1/8 pizza', perPizza: 8, slices: 12 },
};
const pizzaUnits = ({ perPizza, slices }) => [
  ...(perPizza !== slices ? [{ label: '1 slice', factor: perPizza / slices }] : []),
  { label: 'whole pizza', factor: perPizza },
];

//                                      g    kcal fat sat trn chol  Na   carb fib sug add prot
// The guide prints these blocks in alphabetical order; mapping checked against
// per-slice figures published from the same guide (all 11 comparable rows match).
const SPECIALTY = {
  'Buffalo Chicken': {
    S: n(131, 370, 17, 8, 0, 45, 960, 37, 1, 3, 1, 16), M: n(142, 410, 19, 10, 0.5, 55, 1030, 38, 1, 3, 1, 18),
    L: n(121, 340, 15, 8, 0, 45, 850, 34, 1, 2, 1, 15), XL: n(158, 450, 20, 10, 0.5, 60, 1110, 44, 1, 3, 1, 20) },
  'Cali Chicken Bacon Ranch': {
    S: n(138, 420, 22, 8, 0, 50, 900, 36, 1, 3, 1, 17), M: n(155, 480, 27, 10, 0.5, 60, 1060, 37, 1, 3, 2, 19),
    L: n(134, 410, 23, 8, 0, 50, 890, 33, 1, 3, 1, 16), XL: n(174, 530, 29, 11, 0.5, 65, 1160, 44, 1, 3, 2, 22) },
  'Deluxe': {
    S: n(142, 360, 16, 7, 0, 35, 700, 38, 1, 3, 1, 14), M: n(153, 390, 19, 8, 0, 40, 780, 39, 2, 4, 1, 15),
    L: n(135, 340, 16, 7, 0, 35, 680, 35, 1, 3, 1, 13), XL: n(177, 450, 21, 9, 0, 45, 900, 46, 2, 4, 2, 18) },
  'ExtravaganZZa': {
    S: n(154, 400, 19, 8, 0, 45, 900, 38, 2, 3, 1, 16), M: n(174, 440, 22, 9, 0.5, 50, 1040, 40, 2, 4, 1, 18),
    L: n(153, 380, 19, 8, 0, 45, 900, 36, 2, 3, 1, 16), XL: n(202, 500, 25, 10, 0.5, 60, 1220, 47, 2, 4, 2, 21) },
  'Honolulu Hawaiian': {
    S: n(137, 350, 15, 6, 0, 35, 780, 39, 1, 4, 2, 15), M: n(150, 380, 17, 7, 0, 45, 910, 40, 1, 5, 2, 17),
    L: n(132, 330, 14, 6, 0, 35, 760, 36, 1, 4, 2, 14), XL: n(173, 430, 18, 8, 0, 45, 1010, 47, 2, 6, 2, 19) },
  'MeatZZa': {
    S: n(139, 390, 19, 8, 0, 45, 870, 38, 1, 3, 1, 16), M: n(151, 420, 21, 9, 0.5, 50, 1000, 38, 1, 3, 1, 18),
    L: n(133, 370, 18, 8, 0, 45, 850, 34, 1, 3, 1, 15), XL: n(176, 480, 24, 10, 0.5, 60, 1160, 45, 2, 4, 2, 20) },
  'Memphis BBQ Chicken': {
    S: n(131, 360, 14, 7, 0, 40, 680, 41, 1, 7, 5, 15), M: n(147, 410, 17, 8, 0, 50, 800, 44, 1, 8, 7, 18),
    L: n(128, 350, 14, 7, 0, 40, 680, 39, 1, 7, 6, 15), XL: n(166, 460, 18, 9, 0, 55, 880, 51, 2, 9, 7, 20) },
  'Pacific Veggie': {
    S: n(131, 330, 13, 6, 0, 30, 620, 38, 1, 3, 1, 13), M: n(149, 360, 15, 7, 0, 35, 730, 39, 2, 4, 1, 14),
    L: n(131, 310, 13, 6, 0, 30, 630, 35, 1, 3, 1, 12), XL: n(168, 400, 16, 8, 0, 40, 790, 46, 2, 4, 1, 16) },
  'Philly Cheese Steak': {
    S: n(124, 340, 15, 7, 0, 40, 790, 36, 1, 3, 1, 14), M: n(136, 370, 16, 8, 0, 45, 890, 37, 1, 3, 1, 15),
    L: n(118, 310, 13, 7, 0, 35, 720, 33, 1, 3, 1, 13), XL: n(152, 400, 17, 8, 0, 45, 920, 43, 2, 3, 1, 17) },
  'Spinach & Feta': {
    S: n(119, 340, 15, 8, 0, 35, 620, 36, 1, 2, 1, 14), M: n(130, 370, 17, 9, 0, 45, 710, 37, 1, 2, 1, 15),
    L: n(115, 320, 15, 8, 0, 40, 610, 33, 1, 2, 1, 13), XL: n(149, 420, 19, 10, 0.5, 50, 770, 43, 2, 3, 1, 17) },
  'Ultimate Pepperoni': {
    S: n(131, 380, 18, 8, 0, 40, 850, 38, 1, 3, 1, 16), M: n(142, 420, 21, 9, 0.5, 50, 960, 38, 1, 3, 1, 17),
    L: n(125, 360, 18, 8, 0, 40, 830, 34, 1, 3, 1, 15), XL: n(165, 480, 23, 10, 0.5, 55, 1110, 45, 2, 4, 2, 20) },
  'Wisconsin 6 Cheese': {
    S: n(124, 340, 14, 7, 0, 35, 660, 38, 1, 3, 1, 14), M: n(141, 390, 18, 9, 0, 45, 790, 39, 1, 3, 1, 17),
    L: n(122, 330, 15, 7, 0, 35, 670, 35, 1, 3, 1, 14), XL: n(161, 440, 19, 10, 0.5, 50, 880, 46, 2, 4, 2, 19) },
};

const specialtyItems = Object.entries(SPECIALTY).flatMap(([name, bySize]) =>
  Object.entries(bySize).map(([size, data]) => {
    const s = SIZES[size];
    return item(`${name} (${s.label})`, 'Specialty Pizzas (Hand Tossed)', s.serving, data, pizzaUnits(s));
  }));

/* ---------- Build your own (per slice) ---------- */

// Large Hand Tossed and Large Crunchy Thin share sauce/cheese/topping rows in the guide.
const LARGE_TOPS = {
  sauce: n(21, 10, 0, 0, 0, 0, 90, 2, 0, 2, 1, 0),
  cheeseOnly: n(37, 100, 7, 4.5, 0, 25, 310, 2, 0, 0, 0, 6),
  cheese: n(25, 70, 5, 3, 0, 20, 210, 1, 0, 0, 0, 4),
  toppings: {
    Pepperoni: n(9, 40, 3.5, 1.5, 0, 10, 170, 0, 0, 0, 0, 2),
    'Italian Sausage': n(18, 70, 7, 2, 0, 10, 115, 0, 0, 0, 0, 2),
    Beef: n(18, 60, 5, 2, 0, 15, 130, 0, 0, 0, 0, 3),
    Ham: n(12, 15, 0.5, 0, 0, 5, 170, 0, 0, 0, 0, 2),
    Bacon: n(12, 70, 5, 2, 0, 15, 220, 0, 0, 0, 0, 4),
    'Premium Chicken': n(18, 25, 1, 0, 0, 10, 95, 1, 0, 0, 0, 4),
    Mushrooms: n(18, 5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1),
    Onions: n(11, 5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0),
    'Green Peppers': n(11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    'Black Olives': n(11, 20, 1.5, 0, 0, 0, 85, 1, 0, 0, 0, 0),
    Pineapple: n(18, 15, 0, 0, 0, 0, 0, 3, 0, 3, 1, 0),
    'Jalapeño Peppers': n(11, 5, 0, 0, 0, 0, 180, 1, 0, 0, 0, 0),
  },
};
const MEDIUM_TOPS = {
  toppings: {
    Pepperoni: n(7, 30, 2.5, 1, 0, 5, 125, 0, 0, 0, 0, 1),
    'Italian Sausage': n(12, 50, 4.5, 1.5, 0, 5, 80, 0, 0, 0, 0, 2),
    Beef: n(12, 40, 3.5, 1.5, 0, 10, 90, 0, 0, 0, 0, 2),
    Ham: n(9, 10, 0.5, 0, 0, 5, 125, 0, 0, 0, 0, 1),
    Bacon: n(9, 45, 3.5, 1.5, 0, 10, 160, 0, 0, 0, 0, 3),
    'Premium Chicken': n(12, 20, 0.5, 0, 0, 10, 70, 0, 0, 0, 0, 2),
    Mushrooms: n(12, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    Onions: n(7, 5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0),
    'Green Peppers': n(7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    'Black Olives': n(7, 15, 1, 0, 0, 0, 55, 0, 0, 0, 0, 0),
    Pineapple: n(12, 10, 0, 0, 0, 0, 0, 2, 0, 2, 1, 0),
    'Jalapeño Peppers': n(7, 0, 0, 0, 0, 0, 120, 0, 0, 0, 0, 0),
  },
};

const BYO = [
  { label: 'Medium 12" Hand Tossed', serving: '1 slice (1/8 pizza)', perPizza: 8,
    crust: n(42, 110, 1.5, 0, 0, 0, 115, 21, 1, 1, 0, 4),
    sauce: n(15, 10, 0, 0, 0, 0, 65, 2, 0, 1, 0, 0),
    cheeseOnly: n(27, 70, 5, 3.5, 0, 20, 220, 1, 0, 0, 0, 4),
    cheese: n(18, 50, 3.5, 2, 0, 15, 150, 1, 0, 0, 0, 3),
    toppings: MEDIUM_TOPS.toppings },
  { label: 'Medium 12" Handmade Pan', serving: '1 slice (1/8 pizza)', perPizza: 8,
    crust: n(61, 190, 7, 3.5, 0, 0, 160, 26, 1, 1, 1, 5),
    sauce: n(11, 5, 0, 0, 0, 0, 45, 1, 0, 1, 0, 0),
    cheeseOnly: n(30, 100, 7, 4.5, 0, 25, 260, 1, 0, 0, 0, 5),
    cheese: n(25, 80, 6, 4, 0, 20, 210, 1, 0, 0, 0, 4),
    toppings: MEDIUM_TOPS.toppings },
  { label: 'Large 14" Hand Tossed', serving: '1 slice (1/8 pizza)', perPizza: 8,
    crust: n(61, 160, 2, 0, 0, 0, 170, 30, 1, 1, 0, 5), ...LARGE_TOPS },
  { label: 'Large 14" Crunchy Thin', serving: '1 slice (1/8 pizza)', perPizza: 8,
    crust: n(28, 100, 4, 0.5, 0, 0, 35, 13, 0, 0, 0, 2), ...LARGE_TOPS },
  { label: 'Large 14" New York Style', serving: '1 slice (1/6 pizza)', perPizza: 6,
    crust: n(56, 150, 2, 0, 0, 0, 160, 28, 1, 1, 0, 5),
    sauce: n(28, 15, 0, 0, 0, 0, 120, 3, 1, 2, 1, 1),
    cheeseOnly: n(35, 110, 9, 5, 0, 30, 300, 2, 0, 0, 0, 6),
    cheese: n(35, 110, 9, 5, 0, 30, 300, 2, 0, 0, 0, 6),
    toppings: {
      Pepperoni: n(12, 50, 4.5, 2, 0, 10, 220, 0, 0, 0, 0, 2),
      'Italian Sausage': n(24, 90, 9, 3, 0, 10, 150, 0, 0, 0, 0, 3),
      Beef: n(24, 80, 7, 2.5, 0, 20, 170, 0, 0, 0, 0, 4),
      Ham: n(16, 20, 1, 0, 0, 5, 230, 0, 0, 0, 0, 2),
      Bacon: n(17, 90, 6, 3, 0, 15, 300, 1, 0, 1, 1, 5),
      'Premium Chicken': n(24, 35, 1, 0, 0, 15, 130, 1, 0, 0, 0, 5),
      Mushrooms: n(24, 5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1),
      Onions: n(14, 5, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0),
      'Green Peppers': n(14, 5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0),
      'Black Olives': n(14, 25, 2, 0, 0, 0, 115, 1, 0, 0, 0, 0),
      Pineapple: n(24, 15, 0, 0, 0, 0, 0, 4, 0, 4, 1, 0),
      'Jalapeño Peppers': n(14, 5, 0, 0, 0, 0, 240, 1, 0, 0, 0, 0),
    } },
];

const byoItems = BYO.flatMap((c) => {
  const cat = `Build Your Own: ${c.label}`;
  const units = [{ label: 'whole pizza', factor: c.perPizza }];
  const base = sum(c.crust, c.sauce, c.cheese);
  return [
    item('Cheese Pizza', cat, c.serving, sum(c.crust, c.sauce, c.cheeseOnly), units),
    item('Pepperoni Pizza', cat, c.serving, sum(base, c.toppings.Pepperoni), units),
    item('Sausage Pizza', cat, c.serving, sum(base, c.toppings['Italian Sausage']), units),
    item('Pepperoni & Sausage Pizza', cat, c.serving, sum(base, c.toppings.Pepperoni, c.toppings['Italian Sausage']), units),
    item('Ham & Pineapple Pizza', cat, c.serving, sum(base, c.toppings.Ham, c.toppings.Pineapple), units),
    item('Crust only (no sauce or cheese)', cat, c.serving, c.crust, units),
    ...Object.entries(c.toppings).map(([t, data]) => item(`+ ${t} (add-on)`, cat, c.serving, data, units)),
  ];
});

/* ---------- Everything else ---------- */

const rest = [
  ['Oven-Baked Sandwiches', '1/2 sandwich', [{ label: 'whole sandwich', factor: 2 }], {
    'Buffalo Chicken Sandwich': n(174, 420, 20, 7, 0, 55, 1300, 39, 0, 2, 0, 20),
    'Chicken Bacon Ranch Sandwich': n(157, 450, 22, 8, 0, 60, 1190, 37, 0, 2, 1, 23),
    'Chicken Parm Sandwich': n(161, 400, 15, 7, 0, 60, 1050, 38, 0, 2, 0, 24),
    'Italian Sandwich': n(163, 420, 20, 9, 0.5, 60, 1530, 37, 0, 1, 0, 21),
    'Philly Cheese Steak Sandwich': n(164, 380, 15, 8, 0.5, 50, 1280, 38, 0, 3, 1, 20),
    'Sweet & Spicy Chicken Habanero Sandwich': n(170, 390, 14, 7, 0, 55, 1080, 44, 0, 6, 4, 21),
  }],
  ['Loaded Tots', '1/4 order', [{ label: 'whole order', factor: 4 }], {
    'Cheddar Bacon Loaded Tots': n(83, 240, 16, 5, 0, 20, 590, 17, 1, 1, 1, 7),
    'Melty 3-Cheese Loaded Tots': n(84, 210, 13, 6, 0, 25, 510, 17, 1, 1, 0, 6),
    'Philly Cheese Steak Loaded Tots': n(90, 200, 12, 5, 0, 20, 530, 18, 1, 1, 0, 6),
  }],
  ['Breads', '4 pieces', [{ label: '1 piece', factor: 0.25 }], {
    'Garlic Bread Bites': n(62, 210, 9, 4, 0, 0, 200, 27, 1, 1, 1, 5),
    'Parmesan Bread Bites': n(63, 210, 9, 4.5, 0, 0, 220, 27, 1, 1, 1, 5),
    'Cinnamon Bread Bites': n(65, 230, 9, 4, 0, 0, 160, 30, 1, 4, 4, 5),
  }],
  ['Breads', '1 piece', [], {
    'Stuffed Cheesy Bread': n(49, 150, 7, 3, 0, 15, 250, 16, 1, 1, 0, 6),
    'Bacon & Jalapeño Stuffed Cheesy Bread': n(54, 170, 8, 3.5, 0, 20, 350, 17, 1, 1, 0, 7),
    'Pepperoni Stuffed Cheesy Bread': n(52, 170, 8, 3.5, 0, 15, 310, 16, 1, 1, 0, 7),
    'Spinach & Feta Stuffed Cheesy Bread': n(52, 160, 7, 3.5, 0, 15, 270, 17, 1, 1, 0, 6),
  }],
  ['Chicken', '3 pieces', [{ label: '1 piece', factor: 1 / 3 }], {
    'Boneless Chicken': n(75, 170, 7, 1.5, 0, 35, 660, 18, 0, 1, 1, 9),
  }],
  ['Chicken', '4 pieces', [{ label: '1 piece', factor: 0.25 }], {
    'Plain Wings (no sauce)': n(91, 250, 20, 5, 0, 110, 720, 8, 0, 0, 0, 14),
    'Honey BBQ Wings': n(119, 310, 20, 5, 0, 110, 940, 22, 0, 13, 12, 15),
    'Hot Buffalo Wings': n(119, 260, 20, 5, 0, 110, 1520, 9, 0, 0, 0, 15),
    'Mild Buffalo Wings': n(119, 260, 20, 5, 0, 110, 1420, 10, 0, 0, 0, 15),
    'Garlic Parmesan Wings': n(119, 390, 34, 8, 0, 120, 960, 10, 0, 1, 0, 15),
    'Sweet Mango Habanero Wings': n(119, 310, 20, 5, 0, 110, 790, 21, 0, 10, 10, 15),
    'Classic Hot Buffalo Loaded Chicken': n(85, 190, 11, 3.5, 0, 35, 1030, 14, 0, 1, 1, 9),
    'Crispy Bacon & Tomato Loaded Chicken': n(90, 260, 17, 5, 0, 45, 810, 14, 0, 1, 1, 11),
    'Spicy Jalapeño & Pineapple Loaded Chicken': n(90, 190, 8, 2.5, 0, 35, 670, 21, 0, 7, 6, 9),
    'Sweet BBQ Bacon Loaded Chicken': n(85, 210, 10, 3.5, 0, 40, 790, 20, 0, 7, 7, 11),
  }],
  ['Pasta', '1 dish', [], {
    '5-Cheese Mac & Cheese': n(360, 830, 50, 31, 1.5, 145, 1680, 64, 2, 6, 0, 30),
    'Spicy Buffalo 5-Cheese Mac & Cheese': n(374, 840, 50, 31, 1.5, 145, 2090, 64, 2, 6, 0, 31),
  }],
  ['Salads', '1 salad', [], {
    'Classic Garden Salad': n(100, 80, 4, 2, 0, 10, 125, 8, 1, 2, 0, 3),
    'Chicken Caesar Salad': n(198, 220, 8, 3, 0, 50, 490, 14, 2, 3, 1, 19),
  }],
  ['Dressings', '1.5 oz packet', [], {
    'Garden Ranch Dressing (Marzetti)': n(43, 220, 24, 4, 0, 10, 400, 2, 0, 1, 1, 1),
    'Cardini Caesar Dressing (Marzetti)': n(43, 230, 25, 4, 0, 40, 270, 0, 0, 0, 0, 1),
    'Balsamic Vinaigrette (Marzetti)': n(43, 130, 12, 2, 0, 0, 470, 4, 0, 4, 4, 0),
    'Ranch Dressing (Ken\'s)': n(43, 190, 20, 3, 0, 15, 270, 2, 0, 1, 1, 1),
    'Caesar Dressing (Ken\'s)': n(43, 210, 23, 4, 0, 5, 400, 1, 0, 1, 1, 1),
    'Lite Balsamic with Olive Oil (Ken\'s)': n(43, 100, 8, 1, 0, 0, 370, 4, 0, 3, 3, 0),
  }],
  ['Dipping Cups', '1 cup', [], {
    'Honey BBQ Dip': n(35, 70, 0, 0, 0, 0, 310, 17, 1, 15, 14, 0),
    'Blue Cheese Dip': n(35, 200, 21, 4, 0, 20, 270, 2, 0, 1, 1, 1),
    'Garlic Dip': n(28, 250, 28, 5, 0, 0, 170, 0, 0, 0, 0, 0),
    'Hot Buffalo Dip': n(35, 15, 1, 0, 0, 0, 860, 1, 0, 0, 0, 0),
    'Marinara Dip': n(57, 30, 0, 0, 0, 0, 290, 6, 0, 4, 1, 0),
    'Ranch Dip': n(35, 160, 17, 3, 0, 5, 300, 1, 0, 1, 1, 0),
    'Sweet Icing': n(64, 220, 4, 1, 0, 0, 110, 52, 0, 52, 52, 0),
    'Sweet Mango Habanero Dip': n(35, 70, 0, 0, 0, 0, 65, 17, 0, 13, 13, 0),
    'Nacho Cheese Dip': n(57, 120, 8, 5, 0, 25, 830, 5, 0, 0, 0, 6),
  }],
  ['Desserts', '1 piece', [], {
    'Chocolate Lava Crunch Cake': n(85, 350, 17, 10, 0, 60, 180, 47, 1, 30, 29, 4),
    'Marbled Cookie Brownie': n(43, 200, 10, 5, 0, 20, 125, 26, 1, 18, 18, 2),
  }],
].flatMap(([cat, serving, units, items]) =>
  Object.entries(items).map(([name, data]) => item(name, cat, serving, data, units)));

export const dominos = createStaticProvider({
  id: 'dominos', name: "Domino's", color: '#006491', note: 'Official nutrition guide (Sep 2025)',
  items: [...specialtyItems, ...byoItems, ...rest],
});
