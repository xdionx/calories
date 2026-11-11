// A gentle per-meal calorie target: the daily goal shared out across the day's
// meals. It is a guide, not a rule, so going over reads as "fine, balance it
// later", never as a failure. The split is the user's to change in Settings.
import { MEALS } from './store.js';

// Snacks are one small allowance for the whole day, not tied to a time.
export const DEFAULT_SPLIT = { Breakfast: 28, Lunch: 32, Dinner: 32, Snacks: 8 };

export const enabled = (settings) => settings.mealTargets !== false;

/** The saved split with every meal present, scaled to add up to 100%. */
export function getSplit(settings) {
  const saved = settings.mealSplit || {};
  const raw = Object.fromEntries(MEALS.map((m) => [m, Number.isFinite(+saved[m]) && +saved[m] >= 0 ? +saved[m] : DEFAULT_SPLIT[m]]));
  const sum = Object.values(raw).reduce((s, v) => s + v, 0);
  if (!(sum > 0)) return { ...DEFAULT_SPLIT };
  return Object.fromEntries(MEALS.map((m) => [m, (raw[m] / sum) * 100]));
}

/** kcal target for one meal, rounded to the nearest 5. */
export function targetFor(meal, kcalGoal, settings) {
  if (!(kcalGoal > 0)) return 0;
  return Math.round(((kcalGoal * getSplit(settings)[meal]) / 100) / 5) * 5;
}

/** { state, pct, text } for what was eaten against the target. */
export function status(eaten, target, meal = '') {
  if (!(target > 0)) return null;
  if (meal === 'Snacks') {
    const room = Math.round(target - eaten);
    if (eaten <= 0) return { state: 'empty', pct: 0, text: `About ${target.toLocaleString()} kcal of snacks across the day` };
    if (eaten / target <= 1) return { state: 'ok', pct: eaten / target, text: `About ${room.toLocaleString()} kcal of snack room left today` };
    return { state: 'over', pct: eaten / target, text: `${Math.abs(room).toLocaleString()} over for snacks. That is fine, you can go lighter later` };
  }
  const pct = eaten / target;
  const left = Math.round(target - eaten);
  if (eaten <= 0) return { state: 'empty', pct: 0, text: `Aim for about ${target.toLocaleString()} kcal` };
  if (pct < 0.9) return { state: 'ok', pct, text: `About ${left.toLocaleString()} kcal to go` };
  if (pct <= 1.1) return { state: 'ok', pct, text: 'Right on target' };
  return { state: 'over', pct, text: `${Math.abs(left).toLocaleString()} over. That is fine, you can go lighter later` };
}
