// Turns the text read from a Nutrition Facts photo into nutrient values.
// Plain logic, no DOM, so it can be tested on its own.
//
// OCR on a phone photo makes predictable mistakes, and this copes with the
// common ones: a "g" read as "9" ("37g" → "379"), a zero read as the letter O
// ("Omg"), split or misspelled words ("Cafteine", "Carbohy drate"), and a
// label's rows coming back in a different order. Anything it had to guess is
// flagged so the review screen can ask you to check it.

import { NUTRIENT_MAP } from './nutrients.js';

// Label phrases → nutrient key. Matching ignores spaces and allows a typo or two.
const PHRASES = [
  ['kcal', ['calories']],
  ['fat', ['total fat', 'fat']],
  ['satFat', ['saturated fat', 'sat fat', 'saturated']],
  ['transFat', ['trans fat', 'trans']],
  ['cholesterol', ['cholesterol']],
  ['sodium', ['sodium', 'salt']],
  ['carbs', ['total carbohydrate', 'total carbohydrates', 'carbohydrate', 'carbohydrates', 'total carbs', 'carbs']],
  ['fiber', ['dietary fiber', 'dietary fibre', 'fiber', 'fibre']],
  ['sugar', ['total sugars', 'total sugar', 'sugars', 'sugar']],
  ['addedSugar', ['added sugars', 'added sugar', 'includes added sugars']],
  ['protein', ['protein', 'proteins']],
  ['vitD', ['vitamin d']],
  ['calcium', ['calcium']],
  ['iron', ['iron']],
  ['potassium', ['potassium']],
  ['caffeine', ['caffeine']],
  ['vitA', ['vitamin a']],
  ['vitC', ['vitamin c']],
  ['vitE', ['vitamin e']],
  ['vitK', ['vitamin k']],
  ['thiamin', ['thiamin', 'thiamine']],
  ['riboflavin', ['riboflavin']],
  ['niacin', ['niacin']],
  ['vitB6', ['vitamin b6']],
  ['folate', ['folate', 'folic acid']],
  ['vitB12', ['vitamin b12']],
  ['magnesium', ['magnesium']],
  ['phosphorus', ['phosphorus']],
  ['zinc', ['zinc']],
  ['copper', ['copper']],
  ['selenium', ['selenium']],
];
const MICRO = new Set(['vitD', 'calcium', 'iron', 'potassium', 'vitA', 'vitC', 'vitE', 'vitK', 'thiamin', 'riboflavin', 'niacin', 'vitB6', 'folate', 'vitB12', 'magnesium', 'phosphorus', 'zinc', 'copper', 'selenium']);
const GRAM_KEYS = new Set(['fat', 'satFat', 'transFat', 'carbs', 'fiber', 'sugar', 'addedSugar', 'protein']);
// Values above these are certainly misreads for one serving.
const MAX = { kcal: 3000, fat: 250, satFat: 100, transFat: 50, carbs: 500, fiber: 100, sugar: 300, addedSugar: 300, protein: 200, cholesterol: 2000, sodium: 10000, caffeine: 1000, potassium: 10000, calcium: 5000, iron: 200, vitD: 500 };

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Supplement labels print vitamins as "B3 (as Niacinamide) 15mg" or
// "Vitamin B12 ...", often after other text from the pouch. Finds the vitamin
// at any word position: returns { key, at } or null.
function bVitamin(words) {
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    const next = norm(words[i + 1] || '');
    if (/^(vitamin)?b12$/.test(w)) return { key: 'vitB12', at: i };
    if (/^(vitamin)?b3$/.test(w)) return { key: 'niacin', at: i };
    if (/^(vitamin)?b5?6$/.test(w)) return { key: 'vitB6', at: i };
    if (w === 'vitamin' && /^b-?12$/i.test(words[i + 1] || '')) return { key: 'vitB12', at: i + 1 };
    if (w.length >= 6 && distance(w.replace(/[^a-z]/g, ''), 'niacinamide') <= 2) return { key: 'niacin', at: i };
    if (w.length >= 6 && distance(w.replace(/[^a-z]/g, ''), 'pyridoxine') <= 2 && next) return { key: 'vitB6', at: i };
  }
  return null;
}

// The nutrient a row is about, judged by its first one to four words.
function rowKey(row, minLen = 0) {
  const words = row.split(/\s+/).map(norm).filter(Boolean);
  if (!words.length) return null;
  let best = null;
  for (let take = 1; take <= Math.min(4, words.length); take++) {
    const cand = words.slice(0, take).join('');
    if (cand.length < 3) continue;
    for (const [key, phrases] of PHRASES) {
      for (const phrase of phrases) {
        const p = norm(phrase);
        if (p.length < minLen) continue;
        const d = distance(cand, p);
        const tol = p.length <= 3 ? 0 : p.length <= 7 ? 1 : 2;
        if (d <= tol) {
          // Prefer the longest phrase that fits, then the closest.
          const score = p.length * 10 - d;
          if (!best || score > best.score) best = { key, score, take };
        }
      }
    }
  }
  return best;
}

/* ---------------- Numbers ---------------- */

// A reading like "379", "Og", "O.5g", "160mg", "2mcg", "10%".
const TOKEN = /^<?([0-9OoQDIl|]{1,5}(?:[.,][0-9OoQD]{1,2})?)\s*(mg|mcg|meg|mog|mcq|µg|μg|ug|m9|mq|rng|g|q|9|%|y0|0\/0|o\/o)?[.,;:*]*$/i;

function digits(s) {
  return s.replace(/[OoQD]/g, '0').replace(/[Il|]/g, '1').replace(',', '.');
}

/**
 * Reads one token. Returns { value, unit, fixed } or null. `unit` is 'g',
 * 'mg', 'mcg', '%' or '' (none). `fixed` is true when a unit was guessed.
 */
export function readToken(token, wantGrams = false) {
  const m = token.match(TOKEN);
  if (!m) return null;
  let raw = m[1];
  // Letters standing in for digits only count when the token has a real digit
  // or is a lone O with a unit ("Og").
  if (!/\d/.test(raw) && !(raw.length === 1 && /[Oo]/.test(raw) && m[2])) return null;
  let unit = (m[2] || '').toLowerCase();
  let fixed = false;
  if (unit === 'm9' || unit === 'mq' || unit === 'rng') unit = 'mg';
  if (unit === 'q') unit = 'g';
  if (unit === 'y0' || unit === '0/0' || unit === 'o/o') unit = '%';
  if (unit === 'μg' || unit === 'µg' || unit === 'ug' || unit === 'meg' || unit === 'mog' || unit === 'mcq') unit = 'mcg';
  if (unit === '9') {
    // "3" + "g" read as one "9"? A trailing 9 with another digit before it.
    unit = 'g';
    fixed = true;
  }
  let value = parseFloat(digits(raw));
  if (!Number.isFinite(value)) return null;
  if (!unit && wantGrams && /^\d+(\.\d)?9$/.test(digits(raw)) && digits(raw).replace('.', '').length >= 2) {
    // "379" with no unit where a gram amount belongs: the 9 is a "g".
    value = parseFloat(digits(raw).slice(0, -1));
    unit = 'g';
    fixed = true;
  }
  if (Number.isNaN(value)) return null;
  return { value, unit, fixed };
}

function convert(value, from, to) {
  if (!from || from === to) return value;
  const f = from === 'mcg' ? 'µg' : from;
  if (f === to) return value;
  if (f === 'g' && to === 'mg') return value * 1000;
  if (f === 'mg' && to === 'g') return value / 1000;
  if (f === 'mg' && to === 'µg') return value * 1000;
  if (f === 'µg' && to === 'mg') return value / 1000;
  if (f === 'g' && to === 'µg') return value * 1e6;
  if (f === 'µg' && to === 'g') return value / 1e6;
  return value;
}

/* ---------------- The label ---------------- */

// "(as Niacinamide)" and "(from Coffee Fruit Extract)" name the source, not an amount.
function stripSource(tokens) {
  const out = [];
  let skipping = false;
  for (const t of tokens) {
    if (!skipping && /^\((as|from)$/i.test(t)) skipping = true;
    if (skipping) {
      if (t.includes(')')) skipping = false;
      continue;
    }
    out.push(t);
  }
  return out;
}

// A supplement panel also lists things the app does not track ("L-Theanine 100mg").
function noteOther(row, list) {
  const m = row.replace(/\([^)]*\)?/g, ' ').match(/([A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*){0,2})[®™*]*\s+(\d{1,5}(?:\.\d+)?)\s*(mg|mcg|g)\b/i);
  if (!m) return;
  const name = m[1].replace(/\b(ou|ow|o|a)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (name.length < 4 || /^(powder|extract|blend|root|leaf|acid)$/i.test(name) || /serving|size|net|wt|per|value|daily/i.test(name)) return;
  list.push(`${name} ${m[2]} ${m[3].toLowerCase()}`);
}

/**
 * Parses text from a Nutrition Facts panel.
 * Returns { nutrients, fixed, estimated, serving, perContainer, warnings, count }.
 *  - nutrients: key → value for ONE serving, in the app's units
 *  - fixed: keys whose reading needed a guess (check these)
 *  - estimated: keys worked out from % Daily Value (rough)
 */
export function parseLabel(text) {
  const rows = String(text || '').replace(/\r/g, '').split('\n').map((r) => r.trim()).filter(Boolean);
  const out = { nutrients: {}, fixed: new Set(), estimated: new Set(), serving: { text: '', grams: null }, perContainer: null, warnings: [], count: 0 };

  // Serving size and servings per container.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sm = r.match(/serv\w*\s*size\s*[:\-]?\s*(.*)$/i);
    if (sm && !out.serving.text) {
      let t = sm[1].replace(/[|_—–\-]{2,}/g, ' ').trim();
      if (!t && rows[i + 1] && !/amount|calor/i.test(rows[i + 1])) t = rows[i + 1];
      // "(559)" / "(55g)" / "(355 mL)": the grams or millilitres.
      const pm = t.match(/\(\s*([0-9OoQD]{1,4}(?:[.,]\d)?)\s*(g|ml|mL|oz|9)?\s*[A-Za-z]{0,2}\s*\)/);
      if (pm) {
        let amount = parseFloat(digits(pm[1]));
        let unit = (pm[2] || '').toLowerCase();
        if (!unit && pm[1].length >= 2 && /9$/.test(pm[1])) {
          amount = parseFloat(digits(pm[1]).slice(0, -1));
          unit = 'g';
        } else if (unit === '9') unit = 'g';
        if (unit === 'g' && amount > 0) out.serving.grams = amount;
        t = t.replace(pm[0], `(${amount} ${unit === 'ml' ? 'mL' : unit || 'g'})`);
      }
      out.serving.text = t.replace(/\s+/g, ' ').trim();
    }
    const pc = r.match(/(?:about\s+)?(\d+(?:\.\d+)?)\s*serv\w*\s*per\s*(?:container|package|pack|bottle|can)/i) || r.match(/serv\w*\s*per\s*(?:container|package|pack|bottle|can)\s*[:\-]?\s*(?:about\s+)?(\d+(?:\.\d+)?)/i);
    if (pc && out.perContainer == null) out.perContainer = parseFloat(pc[1]);
    // Supplement labels: "Servings Per Container: Approx. 30".
    const ap = r.match(/\bap+rox\.?\s*(\d{1,3})\b/i) || r.match(/\ba\s*p+rox\.?\s*(\d{1,3})\b/i);
    if (ap && out.perContainer == null) out.perContainer = parseFloat(ap[1]);
  }

  // Calories: a row that begins with "Calories". The number may be on this
  // row or (when the big number was read separately) on a neighbour.
  for (let i = 0; i < rows.length; i++) {
    // "Calories 150  Calories from Fat 45": keep the first part only.
    const r = rows[i].replace(/^[^A-Za-z]*/, '').replace(/calor\w*\s*from\s*fat.*$/i, '').trim();
    if (distance(norm(r.split(/\s+/)[0] || ''), 'calories') > 2 || norm(r.split(/\s+/)[0] || '').length < 5 || /per\s*day|a\s*day|2,?000/i.test(r) || r.split(/\s+/).length > 5) continue;
    let k = null;
    for (const t of r.split(/\s+/).slice(1)) {
      const v = readToken(t);
      if (v && v.unit === '' && Number.isInteger(v.value)) {
        k = v.value;
        break;
      }
    }
    if (k == null) {
      for (const j of [i - 1, i + 1]) {
        const lone = rows[j] && rows[j].match(/^([0-9OoQD]{1,4})$/);
        if (lone) {
          k = parseFloat(digits(lone[1]));
          break;
        }
      }
    }
    if (k != null && k <= MAX.kcal) {
      out.nutrients.kcal = k;
      break;
    }
  }

  // Everything else, row by row.
  const others = [];
  for (const row of rows) {
    const clean = row.replace(/^[^A-Za-z]*/, '');
    let rk = rowKey(clean);
    let tokens = clean.split(/\s+/);
    if (!rk) {
      // Rows from a supplement panel can start with text from the pouch beside it.
      const bv = bVitamin(row.split(/\s+/));
      if (bv) {
        rk = { key: bv.key, take: 1 };
        tokens = row.split(/\s+/).slice(bv.at);
      }
    }
    if (!rk) {
      // Text from the pouch can sit in front of a long nutrient name ("... Caffeine (from ...) 100mg").
      const ws = clean.split(/\s+/);
      for (let i = 1; i < ws.length && !rk; i++) {
        const hit = rowKey(ws.slice(i).join(' '), 7);
        if (hit && hit.take === 1) {
          rk = hit;
          tokens = ws.slice(i);
        }
      }
    }
    if (!rk) {
      noteOther(row, others);
      continue;
    }
    if (rk.key === 'kcal') continue;
    const key = rk.key;
    if (key in out.nutrients) continue;
    let cands;
    if (key === 'addedSugar') {
      // "Includes 10g Added Sugars 20%": the amount comes before the words.
      const idx = tokens.findIndex((t) => /^added/i.test(t));
      cands = tokens.slice(0, idx < 0 ? tokens.length : idx).reverse().concat(tokens.slice(idx < 0 ? tokens.length : idx + 1));
    } else {
      cands = stripSource(tokens).slice(Math.max(1, rk.take));
    }
    const wantGrams = GRAM_KEYS.has(key);
    let amount = null;
    let pct = null;
    for (const t of cands) {
      const v = readToken(t, wantGrams);
      if (!v) continue;
      if (v.unit === '' && (MICRO.has(key) || key === 'caffeine') && !/%$/.test(t)) continue;
      if (v.unit === '%') {
        pct ??= v.value;
        continue;
      }
      // A bare number followed later by "%": that is a percentage, not an amount.
      if (v.unit === '' && key !== 'kcal' && /%$/.test(t)) continue;
      amount = v;
      break;
    }
    const unit = NUTRIENT_MAP[key].unit;
    if (amount && (amount.unit || wantGrams || key === 'sodium' || key === 'cholesterol')) {
      let from = amount.unit;
      // Without a unit, take the unit the nutrient is normally printed in.
      if (!from) {
        from = unit === 'µg' ? 'mcg' : unit;
        out.fixed.add(key);
      }
      const val = convert(amount.value, from, unit);
      if (MAX[key] != null && val > MAX[key]) continue;
      out.nutrients[key] = Math.round(val * 100) / 100;
      if (amount.fixed) out.fixed.add(key);
    } else if (MICRO.has(key) && pct != null && NUTRIENT_MAP[key].dv) {
      // Older labels give only "Vitamin C 10%": a rough amount from the Daily Value.
      const dv = NUTRIENT_MAP[key].dv;
      out.nutrients[key] = Math.round(((pct / 100) * dv) * 100) / 100;
      out.estimated.add(key);
    }
  }

  // Old-style rows hold two or four vitamins: "Vitamin A 10%  Vitamin C 4%".
  for (const row of rows) {
    for (const m of row.matchAll(/(vitamin\s*[acdek]|calcium|iron)\s+(\d{1,3})\s*(?:%|y0)/gi)) {
      const rk = rowKey(m[1]);
      if (!rk || rk.key in out.nutrients || !NUTRIENT_MAP[rk.key].dv) continue;
      out.nutrients[rk.key] = Math.round((parseFloat(m[2]) / 100) * NUTRIENT_MAP[rk.key].dv * 100) / 100;
      out.estimated.add(rk.key);
    }
  }

  out.count = Object.keys(out.nutrients).length;
  out.others = others.slice(0, 12);
  const n = out.nutrients;
  const macroKcal = (n.protein ?? 0) * 4 + (n.carbs ?? 0) * 4 + (n.fat ?? 0) * 9;
  if (n.kcal != null && (n.protein != null || n.carbs != null || n.fat != null)) {
    const missing = ['protein', 'carbs', 'fat'].filter((k) => n[k] == null);
    if (!missing.length && Math.abs(macroKcal - n.kcal) > Math.max(40, n.kcal * 0.3)) {
      out.warnings.push(`The calories (${Math.round(n.kcal)}) don't match the protein, carbs and fat (about ${Math.round(macroKcal)}). Check the numbers against the label.`);
    } else if (missing.length && n.kcal > 20) {
      out.warnings.push(`Couldn't read ${missing.map((k) => NUTRIENT_MAP[k].label.toLowerCase()).join(' or ')}. Fill it in from the label.`);
    }
  }
  if (n.kcal == null) out.warnings.push("Couldn't find the calories. Fill them in from the label.");
  if (n.satFat != null && n.fat != null && n.satFat > n.fat + 0.5) out.warnings.push('Saturated fat is more than total fat. One of them was misread.');
  if (n.sugar != null && n.carbs != null && n.sugar > n.carbs + 0.5) out.warnings.push('Sugar is more than total carbs. One of them was misread.');
  return out;
}

/** How good a reading is: used to decide whether to try another view of the photo. */
export function scoreReading(text) {
  const p = parseLabel(text);
  const core = ['kcal', 'fat', 'carbs', 'protein', 'sodium'].filter((k) => p.nutrients[k] != null).length;
  const base = core + Math.min(3, p.count - core) * 0.5 + (p.nutrients.kcal != null ? 1 : 0);
  // A supplement panel has few of the core rows but several vitamins.
  return Math.max(base, p.count >= 5 ? p.count + 2 : 0);
}
