// Little Caesars, from the official US nutrition guide
// https://littlecaesars.com/static/usnutritionguide.pdf (©2026, data by MenuTrinfo).
// The guide lists whole large (14") pizzas; servings here are 1 slice (1/8) with
// a "whole pizza" option. Rows the guide printed illegibly are left out (see README).

import { createStaticProvider, clean } from './provider.js';

// Full-label row: kcal, fat, satFat, transFat, cholesterol, sodium, carbs, fiber, sugar, protein.
const full = (kcal, fat, satFat, transFat, cholesterol, sodium, carbs, fiber, sugar, protein) =>
  clean({ kcal, fat, satFat, transFat, cholesterol, sodium, carbs, fiber, sugar, protein });
const per = (n, nutrients) => Object.fromEntries(Object.entries(nutrients).map(([k, v]) => [k, Math.round((v / n) * 10) / 10]));

// Whole-pizza values divided into 8 slices.
const pizza = (name, category, ...vals) => ({
  name, category, serving: '1 slice (1/8 pizza)',
  units: [{ label: 'whole pizza', factor: 8 }],
  nutrients: per(8, full(...vals)),
});
// Whole-order values with a per-piece unit.
const order = (name, category, serving, pieces, pieceLabel, ...vals) => ({
  name, category, serving,
  units: pieces > 1 ? [{ label: `1 ${pieceLabel}`, factor: 1 / pieces }] : [],
  nutrients: full(...vals),
});
// Topping added to a whole large pizza, served per slice.
const topping = (name, category, ...vals) => ({
  name, category, serving: '1 slice worth (1/8 pizza)',
  units: [{ label: 'whole pizza', factor: 8 }],
  nutrients: per(8, full(...vals)),
});

const CLASSIC = 'Classic Pizza (Large 14")';
const EMB = 'ExtraMostBestest (Large 14")';
const SPEC = 'Specialty Pizza (Large 14")';
const DDD = 'Detroit-Style Deep Dish';
const THIN = 'Thin Crust (Large 14")';

export const littlecaesars = createStaticProvider({
  id: 'littlecaesars', name: 'Little Caesars', color: '#f26b21', note: 'Official nutrition guide (2026)',
  items: [
    //                                                kcal  fat  sat  trans chol  Na     carb fib sug prot
    pizza('Cheese', CLASSIC,                          1950, 65,  31,  2,   150, 3740,  248, 12, 17, 95),
    pizza('Pepperoni', CLASSIC,                       2300, 97,  42,  3,   230, 5050,  250, 13, 19, 109),
    pizza('Italian Sausage', CLASSIC,                 2270, 91,  40,  2,   225, 4480,  255, 13, 17, 111),

    pizza('ExtraMostBestest Cheese', EMB,             2220, 84,  42,  3,   215, 4430,  252, 13, 17, 117),
    pizza('ExtraMostBestest Pepperoni', EMB,          2500, 113, 50,  3.5, 275, 5640,  252, 13, 19, 122),
    pizza('ExtraMostBestest Italian Sausage', EMB,    2660, 128, 53,  2.5, 310, 5680,  252, 13, 19, 129),

    pizza('5 Meat Feast', SPEC,                       2830, 142, 58,  3.5, 345, 7120,  252, 13, 20, 139),
    pizza('3 Meat Treat', SPEC,                       2860, 147, 61,  3,   340, 6590,  252, 13, 20, 135),
    pizza('Ultimate Supreme', SPEC,                   2500, 112, 47,  3,   265, 5780,  259, 15, 23, 118),
    pizza('Hula Hawaiian', SPEC,                      2180, 70,  31,  2,   220, 5570,  272, 13, 35, 121),
    pizza('Veggie', SPEC,                             2240, 84,  38,  2,   155, 5430,  266, 20, 25, 100),
    pizza('Slices-N-Stix', SPEC,                      2300, 97,  41,  2.5, 205, 5220,  253, 13, 20, 107),
    pizza('Slices-N-Stix Jalapeño', SPEC,             2330, 99,  41,  2.5, 205, 6000,  255, 15, 20, 107),
    pizza('Stuffed Crust Pepperoni', SPEC,            2980, 153, 70,  4.5, 385, 7040,  259, 13, 20, 144),
    pizza('Pretzel Crust Pizza with Pizza Sauce', SPEC, 2080, 85, 34, 2,   170, 10500, 240, 11, 14, 91),
    pizza('Pretzel Crust Pizza with Cheese Sauce', SPEC, 2190, 93, 36, 2,  180, 10980, 244, 9,  13, 94),
    pizza('Cheese Pretzel Crust Pizza with Cheese Sauce', SPEC, 1940, 71, 28, 1.5, 125, 10080, 243, 9, 12, 85),

    pizza('Deep Dish Cheese', DDD,                    2500, 85,  38,  2.5, 175, 4230,  317, 16, 19, 118),
    pizza('Deep Dish Pepperoni', DDD,                 2770, 111, 47,  3,   240, 5280,  319, 16, 20, 129),
    pizza('Deep Dish Italian Sausage', DDD,           2820, 114, 48,  2.5, 250, 5130,  319, 16, 20, 133),
    pizza('Deep Dish 5 Meat Feast', DDD,              3500, 172, 69,  4,   400, 8140,  322, 16, 23, 171),
    pizza('Deep Dish 3 Meat Treat', DDD,              3480, 175, 70,  3.5, 365, 7240,  321, 16, 22, 159),
    pizza('Deep Dish Ultimate Supreme', DDD,          3050, 130, 54,  3,   290, 6270,  332, 20, 27, 141),
    pizza('Deep Dish Hula Hawaiian', DDD,             2690, 88,  38,  2.5, 230, 5610,  341, 17, 37, 137),
    pizza('Deep Dish Veggie', DDD,                    2730, 99,  43,  2.5, 180, 5760,  333, 22, 26, 123),

    pizza('Thin Crust Cheese', THIN,                  1980, 109, 48,  3,   225, 3390,  150, 10, 3,  99),
    pizza('Thin Crust Pepperoni', THIN,               2130, 128, 50,  3.5, 255, 4270,  148, 9,  5,  94),

    topping('Add Stuffed Crust (round pizza)', 'Add-ons',  560, 46, 23, 1.5, 130, 1610, 8, 0, 1, 29),
    topping('Add Stuffed Crust (Deep Dish)', 'Add-ons',    530, 40, 24, 1.5, 145, 1710, 9, 0, 1, 33),

    order('Crazy Bread', 'Sides', '8 bread sticks', 8, 'stick',                 800, 22, 4.5, undefined, undefined, 1290, 128, 5, 6, 25),
    order('Crazy Combo', 'Sides', '1 combo', 1, '',                             840, 22, 4.5, undefined, undefined, 1860, 135, 6, 10, 26),
    order('Stuffed Crazy Bread (with Crazy Sauce)', 'Sides', '3 bread sticks', 3, 'stick', 980, 38, 13, 1, 60, 2200, 126, 6, 10, 36),
    order('Italian Cheese Bread', 'Sides', '10 bread sticks', 10, 'stick',      1340, 54, 21, 1.5, 90, 2250, 156, 7, 8, 59),
    order('Pepperoni Cheese Bread', 'Sides', '10 bread sticks', 10, 'stick',    1520, 71, 27, 2, 130, 2840, 155, 7, 7, 66),
    order('Zesty Cheese Bread', 'Sides', '10 bread sticks', 10, 'stick',        1490, 71, 24, 1.5, 90, 2540, 158, 7, 10, 55),
    order('Pepperoni Crazy Puffs', 'Sides', '1 order', 1, '',                   680, 36, 16, 1, 85, 1520, 56, 3, 4, 34),
    order('4 Cheese Crazy Puffs', 'Sides', '1 order', 1, '',                    580, 26, 13, 1, 60, 1230, 56, 3, 3, 30),

    order('Caesar Wings, Oven Roasted', 'Caesar Wings', '1 order (8 wings)', 8, 'wing', 510, 35, 9, 0, undefined, 1740, 3, 0, 0, 47),
    order('Caesar Wings, Buffalo', 'Caesar Wings', '1 order (8 wings)', 8, 'wing',      520, 35, 9, 0, undefined, 3330, 7, 0, 0, 47),
    order('Caesar Wings, BBQ', 'Caesar Wings', '1 order (8 wings)', 8, 'wing',          620, 35, 9, 0, undefined, 2300, 32, 0, 24, 48),
    order('Caesar Wings, Garlic Parmesan', 'Caesar Wings', '1 order (8 wings)', 8, 'wing', 670, 51, 13, 0, 29, 2510, 5, 0, 0, 49),

    order('Cheezy Jalapeño Dip', 'Dips', '1 cup', 1, '', 210, 21, 3.5, 0, 15, 460, 3, undefined, undefined, undefined),
    order('Butter Garlic Flavor Dip', 'Dips', '1 cup', 1, '', 370, 42, 8, 0, 0, 330, 0, 0, 0, 0),

    order('Cookie Dough Brownie with M&M\'s Minis', 'Desserts', 'full package', 4, 'piece (1/4)', 840, 44, 22, 0, 40, 300, 96, undefined, undefined, 12),
  ],
});
