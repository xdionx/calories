// McDonald's, Wendy's and Taco Bell (US) from THIRD-PARTY tables, not the chains' own
// sites (those load nutrition with JavaScript or block automated reads).
// Source: caloriedetails.com ("sourced from the USDA FoodData Central database"),
// read 2026-11-10. They cover popular items only. Where a menu has older sample
// items this table lacks, the sample is kept and marked "(approx.)".

import { createStaticProvider, row } from './provider.js';
import { mcdonalds as mcdSample, wendys as wendysSample, tacobell as tacoSample } from './sample-menus.js';

const NOTE = 'Third-party data (USDA-based), Nov 2026';
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Merges a table with the old sample provider: the table wins, leftover samples stay as "(approx.)".
function withLeftovers(table, sample) {
  return {
    ...table,
    async search(query, opts) {
      const [fresh, old] = await Promise.all([table.search(query, opts), sample.search(query, opts)]);
      const have = new Set(fresh.map((f) => norm(f.name)));
      const extra = old.filter((f) => !have.has(norm(f.name))).map((f) => ({ ...f, name: `${f.name} (approx.)` }));
      return [...fresh, ...extra];
    },
  };
}

export const mcdonalds = withLeftovers(createStaticProvider({
  id: 'mcdonalds', name: "McDonald's", color: '#da291c', note: NOTE,
  items: [
    row("Hamburger", 'Burgers', 250, 12, 29, 10, 3, 469, 1, 6),
    row("Cheeseburger", 'Burgers', 313, 15, 33, 14, 5, 745, 1, 7),
    row("Double Cheeseburger", 'Burgers', 437, 24, 29, 25, 11, 1035, 1.2, 7),
    row("Quarter Pounder with Cheese", 'Burgers', 520, 24, 38, 20, 7, 730, 2.7, 9),
    row("Big Mac", 'Burgers', 563, 26, 44, 33, 8, 1007, 3.5, 9),
    row("McChicken", 'Chicken & Fish', 357, 14, 37, 17, 3.1, 817, 1.7, 4.7),
    row("McCrispy", 'Chicken & Fish', 470, 26, 46, 20, 5, 1140, 1, 9),
    row("Chicken McNuggets (6 pc)", 'Chicken & Fish', 197, 10, 10, 13, 2.1, 362, 0, 0.1),
    row("Filet-O-Fish", 'Chicken & Fish', 390, 15, 35, 20, 3.8, 582, 1.9, 4.9),
    row("Egg McMuffin", 'Breakfast', 288, 17, 27, 12, 4.5, 777, 1.4, 2.7),
    row("McGriddle", 'Breakfast', 448, 20, 43, 22, 7, 1110, 1.3, 16),
    row("Bacon, Egg & Cheese Biscuit", 'Breakfast', 460, 17, 39, 26, 13, 1330, 2, 3),
    row("Sausage Biscuit", 'Breakfast', 460, 11, 37, 30, 13, 1090, 2, 2),
    row("Hash Browns", 'Breakfast', 147, 1.3, 15, 9, 1.3, 307, 1.6, 0),
    row("French Fries (medium)", 'Sides', 378, 4, 50, 18, 2.7, 221, 4.6, 0.2),
    row("McFlurry with OREO (regular)", 'Desserts', 510, 13, 86, 16, 8, 253, 0.3, 71),
    row("Sweet Tea (medium)", 'Drinks', 150, 1, 37, 0, 0, 20, 0, 35),
    row("Caramel Frappe (medium)", 'Drinks', 490, 8, 70, 20, 13, 90, 1, 62),
  ],
}), mcdSample);

export const wendys = withLeftovers(createStaticProvider({
  id: 'wendys', name: "Wendy's", color: '#e2203d', note: NOTE,
  items: [
    row("Jr. Hamburger", 'Burgers', 250, 13, 25, 11, 4, 440, 1, 5),
    row("Jr. Cheeseburger Deluxe", 'Burgers', 340, 15, 27, 20, 7, 630, 1, 6),
    row("Jr. Bacon Cheeseburger", 'Burgers', 370, 18, 25, 23, 8, 670, 1, 5),
    row("Double Stack", 'Burgers', 410, 23, 26, 24, 10, 740, 1, 6),
    row("Bacon Double Stack", 'Burgers', 440, 26, 26, 26, 11, 870, 1, 6),
    row("Dave's Single", 'Burgers', 590, 29, 37, 37, 15, 1050, 2, 8),
    row("Son of Baconator", 'Burgers', 630, 32, 36, 40, 16, 1260, 1, 7),
    row("Big Bacon Classic", 'Burgers', 650, 33, 38, 41, 16, 1260, 2, 8),
    row("Breakfast Baconator", 'Breakfast', 710, 33, 37, 48, 19, 1670, 1, 7),
    row("Dave's Double", 'Burgers', 860, 49, 37, 57, 23, 1250, 2, 8),
    row("Crispy Chicken Sandwich", 'Chicken', 330, 13, 32, 17, 3, 540, 4, 4),
    row("Crispy Chicken BLT", 'Chicken', 420, 18, 35, 23, 6, 880, 4, 5),
    row("Spicy Chicken Sandwich", 'Chicken', 490, 28, 50, 20, 3.5, 1160, 3, 3),
    row("Classic Chicken Sandwich", 'Chicken', 490, 28, 49, 21, 3.5, 1450, 2, 5),
    row("Ghost Pepper Ranch Chicken Sandwich", 'Chicken', 690, 32, 61, 35, 8, 1650, 3, 7),
    row("Chicken Nuggets (6 pc)", 'Chicken', 270, 15, 14, 17, 3.5, 570, 1, 0),
    row("Buffalo Nuggs (6 pc)", 'Chicken', 310, 15, 16, 21, 4, 1500, 1, 1),
    row("BBQ Nuggs (6 pc)", 'Chicken', 330, 15, 29, 17, 3.5, 810, 1, 14),
    row("Spicy Ghost Pepper Nuggs (6 pc)", 'Chicken', 490, 16, 17, 40, 8, 1130, 1, 1),
    row("Garlic Parm Nuggs (6 pc)", 'Chicken', 500, 16, 17, 41, 9, 880, 1, 0),
    row("Grilled Chicken Ranch Wrap", 'Chicken', 420, 27, 42, 16, 5, 1170, 2, 2),
    row("Asiago Ranch Classic Chicken Club", 'Chicken', 620, 36, 50, 31, 8, 1740, 2, 6),
    row("Spicy Asiago Ranch Chicken Club", 'Chicken', 620, 36, 51, 30, 8, 1510, 3, 6),
    row("Taco Salad", 'Salads & Soups', 690, 30, 68, 34, 13, 1870, 12, 16),
    row("Breakfast Burrito with Bacon", 'Breakfast', 720, 32, 54, 41, 16, 2220, 2, 4),
    row("Breakfast Burrito with Sausage", 'Breakfast', 830, 31, 54, 53, 20, 2130, 3, 4),
    row("Egg & Cheese Biscuit", 'Breakfast', 360, 11, 27, 23, 10, 970, 1, 2),
    row("Bacon, Egg & Cheese English Muffin", 'Breakfast', 380, 17, 30, 20, 7, 820, 1, 4),
    row("Bacon, Egg & Cheese Biscuit", 'Breakfast', 420, 16, 28, 27, 11, 1170, 1, 3),
    row("Bacon, Egg & Swiss Croissant", 'Breakfast', 430, 18, 35, 23, 11, 840, 0, 7),
    row("Sausage Biscuit", 'Breakfast', 450, 11, 27, 33, 13, 950, 1, 3),
    row("French Toast Sticks (4 pc)", 'Breakfast', 460, 10, 63, 18, 4, 380, 1, 21),
    row("Honey Butter Chicken Biscuit", 'Breakfast', 470, 12, 41, 29, 9, 970, 4, 8),
    row("Sausage, Egg & Cheese English Muffin", 'Breakfast', 540, 20, 31, 37, 13, 930, 1, 5),
    row("Maple Bacon Chicken Croissant", 'Breakfast', 550, 19, 49, 30, 11, 920, 3, 13),
    row("Sausage, Egg & Cheese Biscuit", 'Breakfast', 580, 19, 28, 43, 17, 1290, 1, 3),
    row("Sausage, Egg & Swiss Croissant", 'Breakfast', 590, 21, 35, 40, 16, 960, 0, 7),
    row("Chili", 'Salads & Soups', 240, 16, 22, 11, 4.5, 910, 6, 6),
    row("Parmesan Caesar Salad", 'Salads & Soups', 530, 33, 15, 37, 10.5, 1340, 4, 4),
    row("Apple Pecan Salad", 'Salads & Soups', 540, 31, 44, 27, 10, 1360, 6, 34),
    row("Cobb Salad", 'Salads & Soups', 670, 37, 18, 49, 12.5, 1270, 3, 5),
    row("Sour Cream & Chive Baked Potato", 'Sides', 310, 8, 63, 2.5, 1.5, 55, 7, 4),
    row("Bacon Cheese Baked Potato", 'Sides', 440, 17, 64, 13, 6, 600, 7, 4),
    row("Chili & Cheese Baked Potato", 'Sides', 500, 20, 74, 14, 7, 840, 9, 7),
    row("Natural-Cut Fries (medium)", 'Sides', 350, 5, 47, 16, 2.5, 550, 4, 0),
    row("Baconator Fries", 'Sides', 460, 14, 43, 26, 9, 1030, 3, 1),
    row("Chili Cheese Fries", 'Sides', 520, 17, 53, 27, 9, 1270, 6, 3),
    row("Chocolate Frosty (medium)", 'Desserts', 390, 12, 61, 11, 7, 230, 1, 52),
  ],
}), wendysSample);

export const tacobell = withLeftovers(createStaticProvider({
  id: 'tacobell', name: 'Taco Bell', color: '#702082', note: NOTE,
  items: [
    row("Double Stacked Taco", 'Tacos', 320, 11, 34, 16, 5, 600, 4, 2),
    row("3 Cheese Chicken Flatbread Melt", 'Specialties', 330, 20, 29, 15, 6, 760, 2, 4),
    row("Cheesy Double Beef Burrito", 'Burritos', 570, 21, 63, 26, 10, 1330, 7, 4),
    row("Hash Brown", 'Sides', 160, 1, 14, 11, 1, 280, 1, 0),
    row("Crunchy Taco", 'Tacos', 170, 8, 13, 10, 4, 300, 3, 1),
    row("Nacho Cheese Doritos Locos Taco", 'Tacos', 170, 8, 12, 10, 4, 360, 3, 1),
    row("Cinnamon Twists", 'Desserts', 170, 1, 27, 6, 0.5, 115, 1, 10),
    row("Cheesy Roll Up", 'Specialties', 180, 8, 17, 9, 6, 430, 1, 1),
    row("Soft Taco", 'Tacos', 180, 9, 18, 8, 4, 490, 3, 1),
    row("Crunchy Taco Supreme", 'Tacos', 190, 8, 15, 11, 5, 320, 3, 2),
    row("Nacho Cheese Doritos Locos Taco Supreme", 'Tacos', 190, 8, 14, 11, 5, 380, 3, 2),
    row("Soft Taco Supreme", 'Tacos', 210, 9, 20, 10, 5, 510, 3, 2),
    row("Cheesy Fiesta Potatoes", 'Sides', 240, 3, 28, 13, 2, 520, 3, 1),
    row("Spicy Potato Soft Taco", 'Tacos', 240, 5, 28, 13, 3, 470, 2, 1),
    row("Cantina Chicken Crispy Taco", 'Tacos', 290, 16, 17, 16, 6, 520, 3, 1),
    row("Nacho Fries", 'Sides', 330, 4, 36, 19, 1.5, 770, 4, 1),
    row("Black Bean Chalupa Supreme", 'Specialties', 340, 10, 36, 18, 4, 460, 6, 4),
    row("Cheesy Toasted Breakfast Burrito", 'Breakfast', 350, 13, 38, 16, 5, 900, 2, 3),
    row("Chalupa Supreme", 'Specialties', 360, 12, 31, 20, 6, 570, 4, 4),
    row("Bean Burrito", 'Burritos', 360, 13, 54, 10, 4.5, 1080, 8, 3),
    row("Chicken Enchilada Burrito", 'Burritos', 380, 19, 49, 12, 6, 1150, 3, 3),
    row("Burrito Supreme", 'Burritos', 400, 16, 51, 14, 7, 1160, 7, 4),
    row("Stacker", 'Specialties', 400, 17, 42, 18, 9, 1060, 4, 3),
    row("Cheesy Bean and Rice Burrito", 'Burritos', 420, 9, 55, 17, 4.5, 940, 6, 3),
    row("Loaded Beef Nachos", 'Nachos', 450, 12, 44, 25, 5, 930, 9, 3),
    row("Veggie Mexican Pizza", 'Specialties', 470, 14, 46, 25, 7, 760, 6, 3),
    row("Cheesy Gordita Crunch", 'Specialties', 490, 20, 41, 28, 11, 840, 5, 5),
    row("Cantina Chicken Bowl", 'Specialties', 490, 25, 44, 24, 7, 1150, 11, 3),
    row("Doritos Cheesy Gordita Crunch", 'Specialties', 500, 20, 41, 28, 11, 890, 5, 5),
    row("5 Layer Burrito", 'Burritos', 500, 18, 65, 19, 8, 1280, 7, 5),
    row("Breakfast Quesadilla", 'Breakfast', 510, 28, 41, 25, 14, 1310, 3, 4),
    row("Quesadilla", 'Specialties', 520, 26, 41, 26, 13, 1260, 3, 3),
    row("Cantina Chicken Burrito", 'Burritos', 540, 25, 43, 30, 9, 1170, 6, 4),
    row("Mexican Pizza", 'Specialties', 540, 19, 48, 30, 9, 1010, 7, 4),
    row("Grande Toasted Breakfast Burrito", 'Breakfast', 570, 23, 51, 30, 11, 1320, 4, 3),
    row("Cantina Chicken Quesadilla", 'Specialties', 570, 29, 43, 32, 16, 1330, 4, 3),
    row("Breakfast California Crunchwrap", 'Breakfast', 640, 21, 53, 38, 12, 1330, 5, 3),
    row("Black Bean Grilled Cheese Burrito", 'Burritos', 700, 23, 69, 37, 15, 1390, 8, 5),
    row("Grilled Cheese Burrito", 'Burritos', 720, 26, 64, 40, 16, 1500, 6, 5),
    row("Nachos BellGrande", 'Nachos', 740, 17, 80, 39, 6, 1180, 13, 4),
  ],
}), tacoSample);
