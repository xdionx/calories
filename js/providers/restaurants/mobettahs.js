// Mo' Bettahs, from the official nutrition page https://mobettahs.com/nutrition/
// (page last modified 2026-03-24). The page publishes calories, fat, carbs and
// protein only, per protein portion or side item. Plates are built from these
// pieces: log the protein plus the rice/mac scoops you got.

import { createStaticProvider, clean } from './provider.js';

const m = (name, category, serving, kcal, fat, carbs, protein, units) => ({
  name, category, serving, units,
  nutrients: clean({ kcal, fat, carbs, protein }),
});
const oz = (n) => [{ label: '1 oz', factor: 1 / n }];

export const mobettahs = createStaticProvider({
  id: 'mobettahs', name: "Mo' Bettahs", color: '#00857c', note: 'Official nutrition (Mar 2026)',
  items: [
    m('Katsu Chicken', 'Proteins', '4 oz', 230, 11, 12, 19, oz(4)),
    m('Pūlehu Chicken', 'Proteins', '4 oz', 150, 4.5, 2, 23, oz(4)),
    m('Teriyaki Chicken', 'Proteins', '4 oz', 230, 4, 24, 19, oz(4)),
    m('Kālua Pig', 'Proteins', '4 oz', 250, 16, 2, 23, oz(4)),
    m('Teriyaki Steak', 'Proteins', '2.5 oz', 210, 12, 5, 12, oz(2.5)),
    m('Tempura Shrimp', 'Proteins', '2 pieces', 180, 10, 18, 4, [{ label: '1 piece', factor: 0.5 }]),
    m('Mixed Vegetables (as protein)', 'Proteins', '2 scoops', 60, 0, 12, 2),

    m('White Rice', 'Sides', '1 scoop', 180, 0, 41, 3),
    m('Brown Rice', 'Sides', '1 scoop', 160, 1, 33, 3),
    m('Mac Salad', 'Sides', '1 scoop', 550, 49, 23, 4),
    m('Mixed Vegetables', 'Sides', '1 scoop', 30, 0, 6, 1),
    m('Tossed Salad (no dressing)', 'Sides', '1 salad', 20, 0, 4, 1),
    m('Spam Musubi', 'Sides', '1 musubi', 280, 13, 32, 8),
    m('Egg Roll', 'Sides', '1 egg roll', 140, 4, 21, 7),

    m('Pākē Salad (no protein)', 'Salads (no dressing)', '1 salad', 170, 4.5, 29, 5),
    m('Pākē Salad with Kālua Pig', 'Salads (no dressing)', '1 salad', 340, 14, 33, 20),
    m('Pākē Salad with Katsu Chicken', 'Salads (no dressing)', '1 salad', 410, 16, 43, 24),
    m('Pākē Salad with Pūlehu Chicken', 'Salads (no dressing)', '1 salad', 330, 9, 34, 28),
    m('Pākē Salad with Shrimp Tempura', 'Salads (no dressing)', '1 salad', 430, 20, 56, 10),
    m('Pākē Salad with Teriyaki Chicken', 'Salads (no dressing)', '1 salad', 390, 8, 53, 24),
    m('Pākē Salad with Teriyaki Steak', 'Salads (no dressing)', '1 salad', 440, 21, 33, 21),

    m('Katsu Sauce', 'Sauces & Dressings', '1 sauce cup', 70, 0, 17, 0),
    m('Spicy Mayo', 'Sauces & Dressings', '1 sauce cup', 140, 12, 7, 0),
    m('Teri Sauce', 'Sauces & Dressings', '1 sauce cup', 50, 0, 10, 2),
    m('Yeobo Sauce', 'Sauces & Dressings', '1 sauce cup', 25, 0, 10, 2),
    m('Blue Cheese Dressing', 'Sauces & Dressings', '1 pouch', 220, 23, 2, 1),
    m('Light Raspberry Dressing', 'Sauces & Dressings', '1 pouch', 100, 6, 11, 0),
    m('Oriental Dressing', 'Sauces & Dressings', '2 tbsp', 120, 10, 7, 0),
    m('Ranch Dressing', 'Sauces & Dressings', '1 pouch', 220, 23, 3, 1),
    m('Thousand Island Dressing', 'Sauces & Dressings', '1 pouch', 210, 20, 7, 1),

    m('Mango Guava Cheesecake', 'Desserts', '1 cheesecake', 600, 47, 30, 6),
    m('Small Kine Cookie Cup', 'Desserts', '1/2 container', 380, 20, 50, 4, [{ label: 'whole container', factor: 2 }]),

    m('P.O.G. Juice', 'Drinks', '8 fl oz', 170, 0, 43, 0),
    m('Coca-Cola (22 oz)', 'Drinks', '22 fl oz', 260, 0, 71, 0),
    m('Coca-Cola (32 oz)', 'Drinks', '32 fl oz', 380, 0, 103, 0),
    m('Coca-Cola Zero Sugar', 'Drinks', '22 fl oz', 0, 0, 0, 0),
    m('Diet Coke', 'Drinks', '22 fl oz', 0, 0, 1, 0),
    m('Sprite (22 oz)', 'Drinks', '22 fl oz', 250, 0, 67, 0),
    m('Sprite (32 oz)', 'Drinks', '32 fl oz', 360, 0, 97, 0),
    m('Fanta Orange (22 oz)', 'Drinks', '22 fl oz', 270, 0, 73, 0),
    m('Fanta Orange (32 oz)', 'Drinks', '32 fl oz', 390, 0, 106, 0),
    m('Hi-C Flashin\' Fruit Punch (22 oz)', 'Drinks', '22 fl oz', 270, 0, 73, 0),
    m('Hi-C Flashin\' Fruit Punch (32 oz)', 'Drinks', '32 fl oz', 390, 0, 107, 0),
    m('Powerade Mountain Berry Blast (22 oz)', 'Drinks', '22 fl oz', 150, 0, 40, 0),
    m('Powerade Mountain Berry Blast (32 oz)', 'Drinks', '32 fl oz', 220, 0, 59, 0),
    m('Barq\'s Red Creme Soda (22 oz)', 'Drinks', '22 fl oz', 310, 0, 78, 0),
    m('Barq\'s Red Creme Soda (32 oz)', 'Drinks', '32 fl oz', 450, 0, 114, 0),
  ],
});
