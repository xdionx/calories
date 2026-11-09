// Restaurant registry. To plug in a real data source, write a provider (see
// provider.js for the interface and helpers) and add it to this list. Remove
// the matching sample provider when the real one replaces it.
//
// Example, a menu served as JSON from your own endpoint:
//
//   import { createJsonProvider } from './provider.js';
//   const burgerKing = createJsonProvider({
//     id: 'burgerking', name: 'Burger King', color: '#d62300',
//     url: 'https://example.com/menus/burger-king.json',
//   });

import { SAMPLE_PROVIDERS } from './sample-menus.js';
import { mobettahs } from './mobettahs.js';
import { jurassictacos } from './jurassictacos.js';
import { littlecaesars } from './littlecaesars.js';
import { dominos } from './dominos.js';

export const RESTAURANTS = [
  mobettahs,
  jurassictacos,
  littlecaesars,
  dominos,
  ...SAMPLE_PROVIDERS,
];

export const getRestaurant = (id) => RESTAURANTS.find((r) => r.id === id);
