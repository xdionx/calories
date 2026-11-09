// Recipes: turn a pasted recipe (title, ingredients, directions) into a list
// of ingredients with amounts, match each one to a food in the database, and
// work out nutrition per serving.
//
// Everything here is plain logic with no DOM, so it can be tested on its own.
// js/recipe-ui.js draws the screens.
//
// A recipe ingredient is { line, name, qty, unit, food, unitIndex, amount,
// note } where `line` is the text as pasted, `qty`/`unit` what the line said
// ("2", "cup"), and `food`/`unitIndex`/`amount` the matched food and how much
// of it (same model as a log entry: nutrients = food unit factor × amount).

import * as usda from './providers/usda.js';
import * as off from './providers/openfoodfacts.js';
import { scaleNutrients, sumNutrients } from './nutrients.js';

/* ---------------- Units ---------------- */

const WEIGHT = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };
const VOLUME = { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 236.588, floz: 29.574, pint: 473.176, quart: 946.353, gallon: 3785.41 };

// Words people write → canonical unit.
const UNIT_WORDS = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g', grm: 'g',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', cc: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', t: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', T: 'tbsp',
  cup: 'cup', cups: 'cup', c: 'cup',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
  // Count-like units: matched against the food's own portions.
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  jar: 'jar', jars: 'jar',
  package: 'package', packages: 'package', pkg: 'package', packet: 'package', packets: 'package', bag: 'package', bags: 'package', box: 'package', boxes: 'package',
  stick: 'stick', sticks: 'stick',
  head: 'head', heads: 'head',
  bunch: 'bunch', bunches: 'bunch',
  sprig: 'sprig', sprigs: 'sprig',
  stalk: 'stalk', stalks: 'stalk', rib: 'stalk', ribs: 'stalk',
  leaf: 'leaf', leaves: 'leaf',
  fillet: 'fillet', fillets: 'fillet',
  breast: 'breast', breasts: 'breast',
  thigh: 'thigh', thighs: 'thigh',
  strip: 'strip', strips: 'strip',
  pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash',
  handful: 'handful', handfuls: 'handful',
  scoop: 'scoop', scoops: 'scoop',
  serving: 'serving', servings: 'serving',
};
// "fl oz" / "fluid ounces" are two words; handled before the table.
const SIZE_WORDS = ['small', 'medium', 'large', 'extra-large', 'jumbo'];
// Tiny amounts: counted as a gram or so rather than skipped.
const TINY = { pinch: 0.3, dash: 0.6 };

/* ---------------- Quantities ---------------- */

const UNICODE_FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, half: 0.5 };
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
// 1, 1.5, 1/2, 1 1/2, 1½, ½
const NUM = `(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?|[${FRACTION_CHARS}])`;
const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:-|–|—|to|or)\\s*(${NUM}))?`, 'i');

export function parseNumber(s) {
  s = String(s).trim().replace(',', '.');
  let total = 0;
  const uf = s.match(new RegExp(`[${FRACTION_CHARS}]`));
  if (uf) {
    total += UNICODE_FRACTIONS[uf[0]];
    s = s.replace(uf[0], '').trim();
    if (!s) return total;
  }
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return total + +mixed[1] + +mixed[2] / +mixed[3];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return total + +frac[1] / +frac[2];
  const n = parseFloat(s);
  return Number.isFinite(n) ? total + n : null;
}

/* ---------------- Parsing a pasted recipe ---------------- */

const INGREDIENTS_HEAD = /^(?:ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|shopping list)\s*:?\s*$/i;
const DIRECTIONS_HEAD = /^(?:directions?|instructions?|method|preparation|prep|steps|how to make(?: it)?|to make|procedure)\s*:?\s*$/i;
const OTHER_HEAD = /^(?:notes?|nutrition(?: facts| information)?|tips?|equipment|serving suggestions?|storage)\s*:?\s*$/i;
const SERVINGS_RE = /\b(?:serves|servings?|yields?|makes|portions?)\b\s*:?\s*(?:about\s+|approx\.?\s+)?(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i;
const SERVINGS_AFTER_RE = /\b(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s+(?:servings|portions|people)\b/i;
const BULLET_RE = /^\s*(?:[-–—•*·▢□☐◦‣⁃]|\d+[.)]\s+(?=\D)|\[\s?\]|\(\s?\))\s*/;

function cleanLine(line) {
  return line.replace(BULLET_RE, '').replace(/\s+/g, ' ').trim();
}

/** Does the line start with something that looks like an amount? */
function startsWithAmount(line) {
  return QTY_RE.test(line) || /^(?:a|an|one|two|three|four|five|six|half|dozen)\s/i.test(line);
}

/**
 * Splits pasted text into { title, servings, ingredientLines, directions }.
 * Works with "Ingredients" / "Directions" headings, and falls back to
 * picking out lines that start with an amount.
 */
export function splitRecipe(text) {
  const raw = String(text || '').replace(/\r/g, '').split('\n');
  const lines = raw.map((l) => l.trim());
  let servings = null;
  for (const l of lines) {
    const m = l.match(SERVINGS_RE) || (l.length < 60 && l.match(SERVINGS_AFTER_RE));
    if (m) {
      const a = +m[1];
      const b = m[2] ? +m[2] : null;
      if (a > 0 && a < 500) {
        servings = b ? Math.round((a + b) / 2) : a;
        break;
      }
    }
  }

  const ingHead = lines.findIndex((l) => INGREDIENTS_HEAD.test(l));
  const dirHead = lines.findIndex((l, i) => i > ingHead && DIRECTIONS_HEAD.test(l));
  let ingredientLines = [];
  let directions = '';

  const endOf = (start) => {
    for (let i = start; i < lines.length; i++) {
      if (DIRECTIONS_HEAD.test(lines[i]) || OTHER_HEAD.test(lines[i])) return i;
    }
    return lines.length;
  };

  if (ingHead >= 0) {
    const end = endOf(ingHead + 1);
    ingredientLines = lines.slice(ingHead + 1, end).map(cleanLine).filter((l) => l && !isSubheading(l) && !SERVINGS_RE.test(l));
  } else {
    // No heading: take the lines before the directions that start with an
    // amount (or look like a short ingredient after a bullet).
    const stop = dirHead >= 0 ? dirHead : lines.length;
    ingredientLines = raw.slice(0, stop)
      .filter((l) => BULLET_RE.test(l) || startsWithAmount(cleanLine(l)))
      .map(cleanLine)
      .filter((l) => l && l.length < 140 && !isSubheading(l) && !SERVINGS_RE.test(l) && (startsWithAmount(l) || l.split(' ').length <= 8));
  }

  if (dirHead >= 0) {
    const stop = (() => {
      for (let i = dirHead + 1; i < lines.length; i++) if (OTHER_HEAD.test(lines[i]) || INGREDIENTS_HEAD.test(lines[i])) return i;
      return lines.length;
    })();
    directions = raw.slice(dirHead + 1, stop).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } else if (ingredientLines.length) {
    // No heading: the text after the last ingredient is the method.
    const last = Math.max(...ingredientLines.map((l) => lines.findIndex((x) => cleanLine(x) === l)));
    directions = raw.slice(last + 1).filter((l) => !OTHER_HEAD.test(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Title: the first short line that isn't a heading, an ingredient, or the
  // servings line.
  let title = '';
  for (const l of lines) {
    if (!l) continue;
    if (INGREDIENTS_HEAD.test(l) || DIRECTIONS_HEAD.test(l)) break;
    if (startsWithAmount(cleanLine(l)) || ingredientLines.includes(cleanLine(l))) break;
    if (SERVINGS_RE.test(l) || /^(?:prep|cook|total|active)\s*time\b/i.test(l)) continue;
    if (l.length <= 80) {
      title = l.replace(/^#+\s*/, '');
      break;
    }
  }

  return { title, servings, ingredientLines, directions };
}

function isSubheading(l) {
  // "For the sauce:" / "Topping:" — a label, not an ingredient.
  return /:$/.test(l) && !startsWithAmount(l);
}

const PREP_WORDS = new Set([
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed', 'cubed', 'julienned', 'halved', 'quartered',
  'peeled', 'seeded', 'cored', 'trimmed', 'rinsed', 'drained', 'divided', 'softened', 'melted', 'beaten', 'whisked',
  'packed', 'sifted', 'toasted', 'thawed', 'frozen', 'fresh', 'freshly', 'finely', 'roughly', 'coarsely', 'thinly', 'thickly',
  'lightly', 'very', 'about', 'approximately', 'heaping', 'heaped', 'level', 'scant', 'generous', 'optional', 'room', 'temperature',
  'cut', 'into', 'pieces', 'plus', 'more', 'extra', 'needed', 'taste', 'garnish', 'serving', 'cold', 'warm', 'hot', 'boiling', 'ripe',
]);

/**
 * "1 1/2 cups (190 g) all-purpose flour, sifted" →
 * { line, qty: 1.5, unit: 'cup', size: null, grams: 190, name: 'all-purpose flour', counted: true }
 */
export function parseIngredient(line) {
  const original = line;
  let s = cleanLine(line);
  let qty = null;
  let unit = null;
  let size = null;
  let grams = null; // weight given in the line, e.g. "(190 g)" or "1 can (15 oz)"

  // Weight in parentheses, e.g. "(15 oz)", "(about 400 g)".
  const paren = s.match(/\((?:about |approx\.? |~)?(\d+(?:[.,]\d+)?)\s*(g|grams?|kg|oz|ounces?|lbs?|pounds?)\.?\)/i);
  if (paren) {
    const u = UNIT_WORDS[paren[2].toLowerCase()];
    grams = parseNumber(paren[1]) * WEIGHT[u];
  }

  const m = s.match(QTY_RE);
  if (m) {
    const a = parseNumber(m[1]);
    const b = m[2] ? parseNumber(m[2]) : null;
    qty = b != null ? (a + b) / 2 : a;
    s = s.slice(m[0].length).trim();
  } else {
    const w = s.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|dozen)\b\s*(?:of\s+)?/i);
    if (w) {
      qty = NUMBER_WORDS[w[1].toLowerCase()];
      s = s.slice(w[0].length).trim();
      // "half a cup"
      const a2 = s.match(/^(?:a|an)\s+/i);
      if (a2) s = s.slice(a2[0].length);
    }
  }
  // "2 x 400g tins", "2 × 15 oz cans"
  const times = s.match(/^[x×]\s*(\d+(?:[.,]\d+)?)\s*(g|kg|oz|ml|lb)\b\.?/i);
  if (times && qty != null) {
    const u = UNIT_WORDS[times[2].toLowerCase()];
    if (WEIGHT[u]) grams = parseNumber(times[1]) * WEIGHT[u];
    s = s.slice(times[0].length).trim();
  }
  // Glued units like "200g" are split by the number regex already; "200g" leaves "g ...".
  s = s.replace(/^\((?:[^)]*)\)\s*/, (p) => (paren ? '' : p));

  if (/^(?:fl\.?\s*oz|fluid\s+ounces?)\b\.?/i.test(s)) {
    unit = 'floz';
    s = s.replace(/^(?:fl\.?\s*oz|fluid\s+ounces?)\b\.?/i, '').trim();
  } else {
    for (let i = 0; i < 2; i++) {
      const word = s.match(/^([a-zA-Z-]+)\.?(?=\s|$|,)/);
      if (!word) break;
      const w = word[1];
      if (!size && SIZE_WORDS.includes(w.toLowerCase())) {
        size = w.toLowerCase();
        s = s.slice(word[0].length).trim();
        continue;
      }
      // Single letters only count as units in their usual case (t = tsp, T = tbsp, c = cup) and when a number came first.
      const key = w.length <= 1 ? (qty != null ? w : null) : w.toLowerCase();
      if (!unit && key && UNIT_WORDS[key]) {
        unit = UNIT_WORDS[key];
        s = s.slice(word[0].length).trim();
        continue;
      }
      break;
    }
  }
  s = s.replace(/^of\s+/i, '');

  const lower = original.toLowerCase();
  const toTaste = /\bto taste\b|\bas needed\b|\bfor (?:serving|garnish|greasing|frying|dusting|the pan)\b|\boptional\b/.test(lower);

  const name = cleanName(s);
  // "Pinch of salt", "1 can (15 oz) beans": one of them.
  if (qty == null && (unit || grams != null)) qty = 1;
  // Nothing measured ("Salt and pepper to taste") → not counted until the user adds an amount.
  const counted = qty != null && !(toTaste && !unit && grams == null && !m);
  return { line: original.trim(), qty, unit, size, grams, name, counted };
}

function cleanName(s) {
  let n = s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*[,;]\s*.*$/, '') // drop prep notes after the first comma
    .replace(/\s+-\s+.*$/, '')
    .replace(/\b(?:or|and\/or)\s+(?:more|less|so)\b.*$/i, '')
    .replace(/\bto taste\b.*$/i, '')
    .replace(/\bfor (?:serving|garnish|greasing|frying|dusting)\b.*$/i, '');
  const words = n.split(/\s+/).filter(Boolean).filter((w) => !PREP_WORDS.has(w.toLowerCase().replace(/[^a-z-]/g, '')));
  n = words.join(' ').replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9)]+$/g, '').trim();
  return n || s.trim();
}

/* ---------------- Matching to foods ---------------- */

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'with', 'in', 'for', 'to', 'style']);
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
const stem = (w) => w.replace(/(?:ies)$/, 'y').replace(/(?:oes|ses|xes)$/, (m) => m.slice(0, 1)).replace(/s$/, '');
const COOKED = /\b(cooked|boiled|baked|fried|roasted|grilled|braised|stewed|steamed|broiled|microwaved|canned|prepared|sauteed|scrambled|poached)\b/;
const AVOID = /\b(baby ?food|infant|toddler|fast foods?|restaurant|school lunch|formula|imitation|substitute|ready-to-feed)\b/i;

/** Higher is a better match for the ingredient name. */
export function scoreMatch(name, food) {
  const q = words(name).map(stem);
  const desc = `${food.name} ${food.brand || ''}`.toLowerCase();
  const d = words(desc).map(stem);
  if (!q.length) return 0;
  const dSet = new Set(d);
  const hits = q.filter((w) => dSet.has(w)).length;
  let score = (hits / q.length) * 10;
  if (d[0] && q.includes(d[0])) score += 2; // "Onions, raw" for "onion"
  score -= Math.max(0, d.length - q.length) * 0.25; // prefer plain descriptions
  if (/\braw\b/.test(desc) && !COOKED.test(name.toLowerCase())) score += 1.5;
  if (COOKED.test(desc) && !COOKED.test(name.toLowerCase())) score -= 1;
  if (AVOID.test(desc)) score -= 5;
  if (/USDA (Foundation|SR Legacy)/.test(food.source)) score += 1;
  if (/Survey/.test(food.source)) score += 0.5;
  if (food.units.some((u) => /\bcup|tbsp|tsp|large|medium|clove|slice\b/i.test(u.label))) score += 0.5;
  return score;
}

/**
 * Searches for an ingredient. USDA whole foods first (they have cup/tbsp/each
 * portions), Open Food Facts if USDA has nothing. Returns { foods, error }.
 */
export async function findCandidates(name, { apiKey, signal } = {}) {
  let foods = [];
  let error = null;
  try {
    foods = await usda.search(name, { apiKey, signal, includeBranded: false });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    error = e.message;
  }
  if (!foods.length) {
    try {
      foods = await off.search(name, { signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      error = error || e.message;
    }
  }
  foods = foods
    .map((f) => ({ f, s: scoreMatch(name, f) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f)
    .slice(0, 10)
    .map(slimFood);
  return { foods, error: foods.length ? null : error };
}

/** Keep what a recipe needs to store about a food. */
export function slimFood(f) {
  return { id: f.id, source: f.source, name: f.name, brand: f.brand || '', nutrients: f.nutrients, units: f.units, defaultUnit: f.defaultUnit || 0 };
}

/* ---------------- Amounts ---------------- */

// "1 cup (128 g)" / "1 tbsp" / "serving (1 cup, 240 g)" → { qty, unit, grams }
export function parsePortionLabel(label) {
  const g = label.match(/(\d+(?:\.\d+)?)\s*g\)?\s*$/);
  const grams = g ? +g[1] : null;
  let body = label.replace(/^serving\s*\(/i, '').replace(/\([^)]*\)\s*$/, '').trim();
  const m = body.match(QTY_RE);
  let qty = 1;
  if (m) {
    qty = parseNumber(m[1]) || 1;
    body = body.slice(m[0].length).trim();
  }
  const word = body.match(/^(fl\.?\s*oz|[a-zA-Z-]+)/);
  let unit = null;
  let size = null;
  if (word) {
    const w = word[1].toLowerCase();
    if (/^fl/.test(w)) unit = 'floz';
    else if (SIZE_WORDS.includes(w)) size = w;
    else unit = UNIT_WORDS[w] || null;
  }
  return { qty, unit, size, grams, text: body.toLowerCase() };
}

/** Grams per one of the food's base units, via its 'g' unit (or a portion with grams). */
function gramUnitIndex(food) {
  return food.units.findIndex((u) => u.label === 'g');
}

/**
 * Picks the food unit and amount for a parsed ingredient.
 * Returns { unitIndex, amount, note } where note explains any guess.
 */
export function resolveAmount(ing, food) {
  const gi = gramUnitIndex(food);
  const qty = ing.qty ?? 0;
  if (!ing.counted) return { unitIndex: gi >= 0 ? gi : 0, amount: 0, note: 'Not counted. Add an amount if you use some.' };

  const portions = food.units.map((u, i) => ({ i, ...parsePortionLabel(u.label) }));

  // 1) Weight units, or a weight given in the line ("1 can (15 oz)").
  if (ing.unit && WEIGHT[ing.unit] && gi >= 0) return { unitIndex: gi, amount: round1(qty * WEIGHT[ing.unit]), note: '' };
  if (ing.grams && gi >= 0 && (!ing.unit || !VOLUME[ing.unit])) {
    return { unitIndex: gi, amount: round1(ing.grams * (qty || 1)), note: '' };
  }

  // 2) Volume: use the food's own cup/tbsp/tsp portion to get its density.
  if (ing.unit && VOLUME[ing.unit]) {
    const ml = qty * VOLUME[ing.unit];
    const same = portions.find((p) => p.unit === ing.unit && p.grams);
    if (same) {
      const u = food.units[same.i];
      if (u.label !== 'g') return { unitIndex: same.i, amount: round2(qty / same.qty), note: '' };
    }
    const vol = portions.find((p) => p.unit && VOLUME[p.unit] && p.grams);
    if (vol && gi >= 0) {
      const gPerMl = vol.grams / (vol.qty * VOLUME[vol.unit]);
      return { unitIndex: gi, amount: round1(ml * gPerMl), note: '' };
    }
    if (gi >= 0) return { unitIndex: gi, amount: round1(ml), note: 'Estimated by volume (like water). Check the grams.' };
  }

  // 3) Pinch / dash.
  if (ing.unit && TINY[ing.unit] && gi >= 0) return { unitIndex: gi, amount: round1(TINY[ing.unit] * qty), note: '' };

  // 4) Counts: "2 large eggs", "3 cloves garlic", "1 onion".
  const wanted = [ing.unit, ing.size].filter(Boolean);
  for (const w of wanted) {
    const p = portions.find((x) => x.unit === w || x.size === w || x.text.includes(w));
    if (p) return { unitIndex: p.i, amount: round2(qty / p.qty), note: '' };
  }
  const nameWords = words(ing.name).map(stem);
  const counted = portions.find((p) => p.grams && !(p.unit && (VOLUME[p.unit] || WEIGHT[p.unit])) && !/^serving/i.test(food.units[p.i].label) &&
    (p.size || ['each', 'whole', 'item', 'piece', 'fruit', 'egg', 'clove', 'slice'].includes(p.text.split(' ')[0]) || nameWords.some((w) => p.text.includes(w))));
  if (counted) return { unitIndex: counted.i, amount: round2(qty / counted.qty), note: '' };
  const medium = portions.find((p) => p.size === 'medium') || portions.find((p) => p.size);
  if (medium) return { unitIndex: medium.i, amount: round2(qty / medium.qty), note: ing.size ? '' : `Assumed ${medium.size}.` };
  const serving = food.units.findIndex((u) => /^serving/i.test(u.label));
  if (serving >= 0) return { unitIndex: serving, amount: qty, note: 'Assumed one serving each. Check the amount.' };
  if (gi >= 0) return { unitIndex: gi, amount: 100 * (qty || 1), note: 'No portion size found, so 100 g each was assumed. Check the grams.' };
  return { unitIndex: food.defaultUnit || 0, amount: qty || 1, note: '' };
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------------- Totals ---------------- */

export function ingredientNutrients(ing) {
  if (!ing.food) return {};
  const unit = ing.food.units[ing.unitIndex] || ing.food.units[0];
  return scaleNutrients(ing.food.nutrients, unit.factor * (ing.amount || 0));
}

export function recipeTotals(recipe) {
  return sumNutrients((recipe.ingredients || []).map(ingredientNutrients));
}

export function perServing(recipe) {
  return scaleNutrients(recipeTotals(recipe), 1 / Math.max(1, recipe.servings || 1));
}

/** The recipe as a food the log can use: one serving per unit. */
export function recipeAsFood(recipe) {
  const servings = Math.max(1, recipe.servings || 1);
  return {
    id: `recipe:${recipe.id}`,
    source: 'Recipe',
    name: recipe.name || 'Recipe',
    brand: '',
    nutrients: recipeNutrition(recipe),
    units: [
      { label: 'serving', factor: 1 },
      { label: `whole recipe (${servings} servings)`, factor: servings },
    ],
    defaultUnit: 0,
  };
}

/* ---------------- Ingredient memory ---------------- */
// Remembers which food you matched an ingredient to, so the next recipe with
// "olive oil" picks the same one without a search. Device only.

const MEMORY_KEY = 'ct.ingredients.v1';
function readMemory() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
  } catch {
    return {};
  }
}
const memoKey = (name) => words(name).map(stem).sort().join(' ');

export function rememberMatch(name, food) {
  const key = memoKey(name);
  if (!key || !food) return;
  const mem = readMemory();
  mem[key] = slimFood(food);
  const keys = Object.keys(mem);
  if (keys.length > 300) delete mem[keys[0]];
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch { /* storage full: skip */ }
}

export function recalledMatch(name, extraFoods = []) {
  const key = memoKey(name);
  if (!key) return null;
  const mem = readMemory();
  if (mem[key]) return mem[key];
  // Your own custom foods by exact name.
  const own = extraFoods.find((f) => memoKey(f.name) === key);
  return own ? slimFood(own) : null;
}

/** Parsed line + food → a recipe ingredient. */
export function buildIngredient(parsed, food, candidates = null) {
  const ing = { line: parsed.line, name: parsed.name, qty: parsed.qty, unit: parsed.unit, size: parsed.size, grams: parsed.grams, counted: parsed.counted, food: food || null, unitIndex: 0, amount: 0, note: '' };
  if (food) Object.assign(ing, resolveAmount(parsed, food));
  else ing.note = parsed.counted ? 'Not counted until you pick a food.' : '';
  if (candidates) Object.defineProperty(ing, 'candidates', { value: candidates, enumerable: false, writable: true });
  return ing;
}

/* ---------------- Nutrition printed in the recipe ---------------- */
// Many recipes (blogs, cookbooks, meal kits) print a nutrition line like
// "Calories: 450 | Protein: 32g | Carbs: 41g | Fat: 14g" or
// "Per serving: 450 calories, 32 g protein". When they do, those numbers are
// used; the ingredient estimate covers whatever they leave out.

const STATED_LABELS = [
  ['kcal', /^(?:calories|cals?|kcals?|energy)$/i],
  ['protein', /^proteins?$/i],
  ['carbs', /^(?:total\s+)?carb(?:ohydrate)?s?$/i],
  ['fat', /^(?:total\s+)?fats?$/i],
  ['satFat', /^sat(?:urated)?\.?\s*fats?$/i],
  ['fiber', /^(?:dietary\s+)?fib(?:er|re)s?$/i],
  ['sugar', /^(?:total\s+)?sugars?$/i],
  ['sodium', /^sodium$/i],
  ['cholesterol', /^cholesterol$/i],
];
const LABEL_WORDS = '(calories|cals?|kcals?|energy|proteins?|(?:total\\s+)?carb(?:ohydrate)?s?|sat(?:urated)?\\.?\\s*fats?|(?:total\\s+)?fats?|(?:dietary\\s+)?fib(?:er|re)s?|(?:total\\s+)?sugars?|sodium|cholesterol)';
const AMOUNT = '(\\d+(?:[.,]\\d+)?)\\s*(kcal|cal|calories|g|grams?|mg|milligrams?)?';
const LABEL_FIRST = new RegExp(`${LABEL_WORDS}\\s*[:=\\-–]?\\s*${AMOUNT}`, 'gi');
const AMOUNT_FIRST = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(kcal|cal|g|grams?|mg)?\\s+(?:of\\s+)?${LABEL_WORDS}\\b`, 'gi');

function labelKey(label) {
  const l = label.trim().replace(/\s+/g, ' ');
  for (const [key, re] of STATED_LABELS) if (re.test(l)) return key;
  return null;
}

/**
 * Nutrition per serving printed in the text, e.g. { kcal: 450, protein: 32 },
 * or null when the recipe doesn't give calories.
 */
export function extractNutrition(text, servings = 1) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = {};
  let inSection = false;
  let wholeRecipe = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^nutrition\b/i.test(line)) {
      inSection = true;
      if (/\b(?:per|whole|entire)\s+recipe\b|\btotal\b/i.test(line)) wholeRecipe = true;
    } else if (INGREDIENTS_HEAD.test(line) || DIRECTIONS_HEAD.test(line)) inSection = false;
    // Only lines that are about nutrition: inside a Nutrition section, or
    // starting with a label / "per serving", so "1 cup fat-free milk" in the
    // ingredient list is never read as "fat: 1".
    const looksLikeNutrition = inSection || /^(?:per serving|nutrition|calories|cals?\b|kcal|energy|protein|carb|total|fat|sat|fib|sugar|sodium|cholesterol|\d+\s*(?:kcal|cal(?:ories)?)\b)/i.test(line);
    if (!looksLikeNutrition) continue;
    if (/\b(?:per|whole|entire)\s+recipe\b/i.test(line)) wholeRecipe = true;
    for (const m of line.matchAll(LABEL_FIRST)) {
      const key = labelKey(m[1]);
      if (key && out[key] == null) out[key] = toUnit(key, parseNumber(m[2]), m[3]);
    }
    for (const m of line.matchAll(AMOUNT_FIRST)) {
      const key = labelKey(m[3]);
      if (key && out[key] == null) out[key] = toUnit(key, parseNumber(m[1]), m[2]);
    }
  }
  for (const k of Object.keys(out)) if (!Number.isFinite(out[k])) delete out[k];
  if (!(out.kcal > 0)) return null;
  if (wholeRecipe && servings > 1) for (const k of Object.keys(out)) out[k] /= servings;
  return out;
}

function toUnit(key, value, unit) {
  if (value == null) return null;
  const u = (unit || '').toLowerCase();
  if (key === 'sodium' || key === 'cholesterol') return u.startsWith('g') ? value * 1000 : value; // stored in mg
  if (key !== 'kcal' && u.startsWith('m')) return value / 1000; // mg of a gram nutrient
  return value;
}

/**
 * The per-serving nutrition the app uses for a recipe: the recipe's own
 * printed numbers when it has them (and you haven't switched to the
 * estimate), filled in with the ingredient estimate for everything else.
 */
export function recipeNutrition(recipe) {
  const est = perServing(recipe);
  if (recipe.stated && recipe.useStated !== false) return { ...est, ...recipe.stated };
  return est;
}

/** 'recipe' when the printed numbers are used, 'estimate' otherwise. */
export const nutritionSource = (recipe) => (recipe.stated && recipe.useStated !== false ? 'recipe' : 'estimate');
