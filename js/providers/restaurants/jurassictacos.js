// Jurassic Tacos (Utah: Spanish Fork, Highland, Pleasant Grove, Draper).
// The menu is from https://jurassictacos.com/menu. Jurassic Tacos publishes NO
// nutrition information, so every number here is an ESTIMATE built from typical
// portions of each listed ingredient (below). Adjust the portions if you know
// better; every item is recomputed from them.

import { createStaticProvider } from './provider.js';

// Per portion: kcal, protein, carbs, fat, satFat, sodium, fiber, sugar.
const c = (kcal, protein, carbs, fat, satFat, sodium, fiber, sugar) =>
  ({ kcal, protein, carbs, fat, satFat, sodium, fiber, sugar });
const P = {
  flour6: c(90, 2.5, 15, 2.5, 1, 200, 1, 1),        // 6" flour tortilla
  flour12: c(300, 8, 50, 8, 3, 700, 2, 2),          // 12" flour tortilla
  corn: c(100, 2, 20, 1.5, 0, 20, 3, 0),            // two small corn tortillas
  steak: c(120, 14, 0, 7, 2.5, 300, 0, 0),          // 2 oz cooked
  chicken: c(90, 16, 1, 2.5, 0.5, 280, 0, 0),       // 2 oz cooked
  alPastor: c(130, 12, 3, 8, 2.5, 380, 0, 2),       // 2 oz
  chorizo: c(170, 9, 1, 14, 5, 450, 0, 0),          // 2 oz
  shrimp: c(150, 8, 12, 8, 1, 350, 0, 1),           // 2 oz tempura
  mahi: c(140, 10, 10, 7, 1, 300, 0, 1),            // 2 oz battered
  bacon: c(90, 6, 0, 7, 2.5, 350, 0, 0),            // 2 strips
  ham: c(50, 8, 1, 1.5, 0.5, 500, 0, 0.5),          // 1.5 oz
  egg: c(180, 12, 2, 14, 4, 200, 0, 1),             // 2 eggs scrambled
  mozz: c(40, 3, 0.5, 3, 2, 90, 0, 0),              // 1/2 oz shredded
  meltCheese: c(110, 6, 1, 9, 5, 180, 0, 0),        // 1 oz melted cheese
  cotija: c(25, 1.5, 0, 2, 1.2, 110, 0, 0),         // 1 tbsp
  guac: c(45, 0.5, 2.5, 4, 0.6, 80, 2, 0),          // 1 oz
  pico: c(5, 0.2, 1, 0, 0, 60, 0.3, 0.6),           // 1 oz
  sauce: c(50, 0, 4, 4, 0.6, 110, 0, 3),            // 1 tbsp sweet chipotle / house sauce
  veg: c(15, 0.5, 3, 0, 0, 5, 0.8, 1.5),            // 1 oz cabbage, corn, onion or peppers
  pineapple: c(7, 0, 2, 0, 0, 0, 0, 1.5),           // 1/2 oz
  refried: c(70, 4, 11, 1, 0.3, 250, 4, 0.5),       // 2 oz
  rice: c(130, 2.5, 27, 1.5, 0.2, 200, 0.5, 0),     // 1/2 cup cilantro-lime rice
  blackBeans: c(110, 7, 20, 0.5, 0, 250, 7, 0.5),   // 1/2 cup
  sourCream: c(55, 0.6, 1.3, 5.5, 3.2, 10, 0, 1),   // 1 oz
  chips: c(420, 6, 54, 21, 2.5, 300, 4, 0),         // 3 oz basket
  queso: c(220, 8, 8, 17, 9, 900, 0, 3),            // 4 oz
  salsa: c(25, 1, 5, 0, 0, 400, 1, 3),              // 3 oz
  fries: c(480, 6, 62, 23, 3.5, 600, 6, 0),         // 6 oz
  tots: c(280, 3, 30, 17, 3, 600, 3, 0),            // 4 oz
};

/** Sum [portion, multiplier] pairs (a bare key means x1). */
const build = (...parts) => {
  const out = {};
  for (const part of parts) {
    const [key, x = 1] = Array.isArray(part) ? part : [part, 1];
    for (const [k, v] of Object.entries(P[key])) out[k] = (out[k] || 0) + v * x;
  }
  for (const k of Object.keys(out)) out[k] = k === 'kcal' || k === 'sodium' ? Math.round(out[k] / 5) * 5 : Math.round(out[k] * 2) / 2;
  return out;
};
const it = (name, category, serving, ...parts) => ({ name, category, serving, nutrients: build(...parts) });
const fixed = (name, category, serving, nutrients) => ({ name, category, serving, nutrients });

const MEATS = { Steak: 'steak', Chicken: 'chicken', 'Al Pastor': 'alPastor' };
const withMeat = (name, category, serving, meatX, parts, meats = MEATS) =>
  Object.entries(meats).map(([label, key]) => it(`${name} (${label})`, category, serving, [key, meatX], ...parts));

const TACOS = 'Hand-Crafted Tacos';
const XL = 'Dino Bites XL';
const SPEC = 'Specialties';
const BFAST = 'Breakfast';
const SIDES = 'Sides';

export const jurassictacos = createStaticProvider({
  id: 'jurassictacos', name: 'Jurassic Tacos', color: '#3f8f3a', note: 'Estimated, no official nutrition published',
  items: [
    it('Premium Steak Taco', TACOS, '1 taco', 'flour6', 'steak', 'mozz', 'cotija', ['guac', 0.5], 'pico', 'sauce'),
    it('Grilled Chicken Taco', TACOS, '1 taco', 'flour6', 'chicken', 'veg', 'mozz', 'cotija', 'sauce'),
    it('Al Pastor Taco', TACOS, '1 taco', 'flour6', 'alPastor', 'pineapple', ['veg', 0.5], 'cotija', 'sauce'),
    it('Tempura Shrimp Taco', TACOS, '1 taco', 'flour6', 'shrimp', 'veg', 'cotija', 'sauce'),
    it('Fajita Steak Taco', TACOS, '1 taco', 'flour6', 'steak', 'veg', ['guac', 0.5], ['salsa', 0.3], 'cotija', 'mozz'),
    it('Mahi Mahi Taco', TACOS, '1 taco', 'flour6', 'mahi', 'mozz', 'veg', 'sauce', 'cotija'),
    it('Fajitasaurus Chicken Taco', TACOS, '1 taco', 'flour6', 'chicken', 'veg', 'sauce', 'cotija', 'mozz'),

    ...withMeat('Jurassic Taco', XL, '1 XL taco', 2, [['flour12', 0.8], 'meltCheese', 'refried', 'pico', 'sauce']),
    it('T-Rex Taco', XL, '1 XL taco', ['flour12', 0.8], 'refried', 'meltCheese', ['steak', 1.5], 'chorizo', 'pico', 'sauce'),
    ...withMeat('Raptor Taco', XL, '1 XL taco', 2, [['flour12', 0.8], 'refried', 'veg', 'meltCheese', 'sauce']),
    ...withMeat('Ketosaurus', XL, '1 XL taco', 2, [['meltCheese', 2.5], 'pico', ['guac', 0.5], 'sauce']),
    it('Cheese Quesadilla', XL, '1 quesadilla', 'flour12', ['meltCheese', 3]),
    it('Veggie Jurassic', XL, '1 XL taco', ['flour12', 0.8], ['meltCheese', 1.5], ['veg', 2], 'sauce'),

    ...withMeat('Burrosaurus', SPEC, '1 burrito', 2, ['flour12', 'rice', 'blackBeans', ['mozz', 2], 'guac', 'pico']),
    ...withMeat('Dino Nachos', SPEC, '1 order', 2, [['chips', 1.3], ['refried', 1.5], 'queso', ['guac', 1.5], ['pico', 1.5], 'sourCream']),
    ...withMeat('Dino Fries', SPEC, '1 order', 2, ['fries', 'queso', ['guac', 1.5], ['pico', 1.5], 'sourCream']),

    it('Breakfast Taco (Bacon)', BFAST, '1 taco', 'flour6', ['egg', 0.5], ['bacon', 0.5], 'mozz', 'pico'),
    it('Breakfast Taco (Chorizo)', BFAST, '1 taco', 'flour6', ['egg', 0.5], ['chorizo', 0.5], 'mozz', 'pico'),
    it('Breakfast Taco (Ham)', BFAST, '1 taco', 'flour6', ['egg', 0.5], ['ham', 0.67], 'mozz', 'pico'),
    it('Morning Tots', BFAST, '1 order', 'tots', ['egg', 0.5], 'mozz', 'pico', 'sauce'),
    it('Breakfast Burrito (Bacon)', BFAST, '1 burrito', 'flour12', 'egg', 'meltCheese', ['tots', 0.5], 'pico', 'bacon'),
    it('Breakfast Burrito (Chorizo)', BFAST, '1 burrito', 'flour12', 'egg', 'meltCheese', ['tots', 0.5], 'pico', 'chorizo'),
    it('Breakfast Burrito (Ham)', BFAST, '1 burrito', 'flour12', 'egg', 'meltCheese', ['tots', 0.5], 'pico', ['ham', 1.3]),
    it('Breakfast Burrito (Steak)', BFAST, '1 burrito', 'flour12', 'egg', 'meltCheese', ['tots', 0.5], 'pico', ['steak', 1.5]),

    ...withMeat('Street Taco', SIDES, '1 taco', 1, ['corn', ['veg', 0.3], ['salsa', 0.3]], { ...MEATS, Chorizo: 'chorizo' }),
    it('Chips & Queso', SIDES, '1 order', 'chips', 'queso'),
    it('Chips & Guac', SIDES, '1 order', 'chips', ['guac', 3]),
    it('Chips & Salsa', SIDES, '1 order', 'chips', 'salsa'),
    it('Utahn Chips & Queso with Chorizo', SIDES, '1 order', 'chips', 'queso', 'chorizo'),
    it('Cilantro-Lime Rice & Beans', SIDES, '1 side', 'rice', 'blackBeans'),

    fixed('Churro Bites (with dip)', 'Desserts', '1 order', { kcal: 450, protein: 5, carbs: 60, fat: 21, satFat: 5, sodium: 350, fiber: 2, sugar: 28 }),
    fixed('Jarritos', 'Drinks', '12.5 fl oz bottle', { kcal: 170, protein: 0, carbs: 43, fat: 0, sodium: 50, sugar: 43 }),
    fixed('Topo Chico', 'Drinks', '12 fl oz bottle', { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 20, sugar: 0 }),
    fixed('Agua Fresca, Horchata', 'Drinks', '16 fl oz', { kcal: 230, protein: 1, carbs: 46, fat: 4, sodium: 60, sugar: 40 }),
    fixed('Agua Fresca, Pineapple / Hibiscus / Lemonade', 'Drinks', '16 fl oz', { kcal: 150, protein: 0, carbs: 38, fat: 0, sodium: 10, sugar: 36 }),
    fixed('Fountain Soda (regular)', 'Drinks', '22 fl oz', { kcal: 260, protein: 0, carbs: 71, fat: 0, sodium: 50, sugar: 71 }),
  ],
});
