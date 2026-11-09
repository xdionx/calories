// SAMPLE restaurant menus so the Restaurants tab works out of the box.
// Values are approximate (US menus) and meant as placeholders. Replace each of
// these with a real provider (official nutrition API, JSON file, etc.) using
// createJsonProvider or your own object; see provider.js.

import { createStaticProvider, row } from './provider.js';

const NOTE = 'Sample data, approximate';

//            name                               category      kcal  P   C   F   sat  Na    fib sug
export const mcdonalds = createStaticProvider({
  id: 'mcdonalds', name: "McDonald's", color: '#da291c', note: NOTE,
  items: [
    row('Big Mac', 'Burgers', 590, 25, 46, 34, 11, 1050, 3, 9),
    row('Quarter Pounder with Cheese', 'Burgers', 520, 30, 42, 26, 12, 1140, 2, 10),
    row('Double Cheeseburger', 'Burgers', 450, 25, 34, 24, 11, 1150, 2, 7),
    row('Hamburger', 'Burgers', 250, 12, 31, 9, 3.5, 510, 1, 6),
    row('McChicken', 'Chicken & Fish', 400, 14, 39, 21, 3.5, 560, 1, 5),
    row('Filet-O-Fish', 'Chicken & Fish', 390, 16, 39, 19, 4, 560, 1, 5),
    row('Chicken McNuggets (10 pc)', 'Chicken & Fish', 410, 23, 26, 24, 4, 840, 1, 0),
    row('Egg McMuffin', 'Breakfast', 310, 17, 30, 13, 6, 770, 2, 3),
    row('Sausage McMuffin with Egg', 'Breakfast', 480, 20, 30, 31, 12, 830, 2, 2),
    row('Hash Browns', 'Breakfast', 140, 2, 18, 8, 1, 310, 2, 0),
    row('French Fries (medium)', 'Sides', 320, 5, 43, 15, 2, 260, 4, 0),
    row('French Fries (large)', 'Sides', 480, 7, 65, 23, 3, 400, 6, 0),
    row('Coca-Cola (medium)', 'Drinks', 200, 0, 55, 0, 0, 20, 0, 55),
    row('McFlurry with OREO (regular)', 'Desserts', 510, 12, 80, 16, 8, 280, 1, 64),
  ],
});

export const wendys = createStaticProvider({
  id: 'wendys', name: "Wendy's", color: '#e2203d', note: NOTE,
  items: [
    row("Dave's Single", 'Burgers', 590, 29, 39, 37, 13, 1210, 2, 9),
    row('Baconator', 'Burgers', 950, 57, 38, 66, 26, 1750, 1, 9),
    row('Jr. Cheeseburger', 'Burgers', 290, 15, 26, 14, 6, 680, 1, 6),
    row('Spicy Chicken Sandwich', 'Chicken', 490, 29, 49, 20, 3.5, 1260, 3, 6),
    row('Crispy Chicken Nuggets (10 pc)', 'Chicken', 450, 23, 25, 29, 6, 900, 0, 0),
    row('Natural-Cut Fries (medium)', 'Sides', 350, 5, 47, 16, 3, 310, 5, 0),
    row('Chocolate Frosty (small)', 'Desserts', 340, 9, 55, 9, 6, 150, 0, 47),
  ],
});

export const tacobell = createStaticProvider({
  id: 'tacobell', name: 'Taco Bell', color: '#702082', note: NOTE,
  items: [
    row('Crunchy Taco', 'Tacos', 170, 8, 13, 10, 3.5, 300, 3, 1),
    row('Soft Taco', 'Tacos', 180, 9, 18, 8, 3.5, 500, 3, 1),
    row('Burrito Supreme (Beef)', 'Burritos', 390, 16, 50, 14, 7, 1090, 7, 4),
    row('Bean Burrito', 'Burritos', 350, 13, 54, 9, 3.5, 1000, 9, 3),
    row('Crunchwrap Supreme', 'Specialties', 530, 16, 71, 21, 6, 1200, 6, 6),
    row('Chicken Quesadilla', 'Specialties', 520, 26, 40, 28, 13, 1210, 3, 4),
    row('Nachos BellGrande', 'Nachos', 740, 16, 82, 38, 7, 1050, 12, 5),
  ],
});

export const chickfila = createStaticProvider({
  id: 'chickfila', name: 'Chick-fil-A', color: '#dd0031', note: NOTE,
  items: [
    row('Chicken Sandwich', 'Entrees', 420, 29, 41, 18, 3.5, 1460, 1, 6),
    row('Spicy Chicken Sandwich', 'Entrees', 450, 28, 45, 19, 4, 1620, 3, 6),
    row('Grilled Chicken Sandwich', 'Entrees', 390, 28, 44, 12, 2.5, 770, 4, 11),
    row('Chicken Nuggets (8 ct)', 'Entrees', 250, 27, 11, 11, 2.5, 1210, 0, 1),
    row('Grilled Nuggets (8 ct)', 'Entrees', 130, 25, 1, 3, 1, 440, 0, 1),
    row('Waffle Potato Fries (medium)', 'Sides', 420, 5, 45, 24, 4, 240, 5, 1),
    row('Chick-fil-A Sauce (1 packet)', 'Sauces', 140, 0, 6, 13, 2, 170, 0, 6),
  ],
});

export const SAMPLE_PROVIDERS = [mcdonalds, wendys, tacobell, chickfila];
