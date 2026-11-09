// Recommended daily calories and macros from your profile, latest weight and
// how active Garmin (or whatever you log) says you are.
//
// 1. Burn per day (TDEE):
//    - from your logged calories burned (resting + active) over the last 14
//      full days, when at least 3 days have data; otherwise
//    - Mifflin-St Jeor BMR × an activity factor.
// 2. Calories = TDEE − deficit to lose (or + surplus to gain) at the chosen
//    weekly rate (7,700 kcal ≈ 1 kg of body fat). Never below BMR, never a
//    deficit over 25% of TDEE, never under 1,200 (women) / 1,500 (men).
// 3. Protein: 1.6 g per kg of body weight (1.8 when very active, 2.0 when
//    losing, to keep muscle). Fat: 28% of calories, at least 0.6 g/kg.
//    Carbs: the rest.
// These are general guidelines, not medical advice.

import * as store from './store.js';

export const KCAL_PER_KG = 7700;
const LB = 0.45359237;

export const PLANS = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Gain weight',
};

export function ageOn(birthday, date = store.todayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday || '')) return null;
  const [by, bm, bd] = birthday.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function bmr({ kg, heightCm, age, sex }) {
  if (!(kg > 0) || !(heightCm > 0) || age == null || !sex) return null;
  return 10 * kg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function activityLevel(avgActive) {
  if (avgActive == null) return null;
  if (avgActive < 250) return { label: 'lightly active', factor: 1.375 };
  if (avgActive < 500) return { label: 'moderately active', factor: 1.55 };
  if (avgActive < 800) return { label: 'very active', factor: 1.725 };
  return { label: 'extremely active', factor: 1.9 };
}

// Average burn over the last `days` full days (today is still going).
export function recentBurn(today = store.todayKey(), days = 14) {
  const rows = [];
  for (let i = 1; i <= days; i++) {
    const b = store.balanceFor(store.shiftDate(today, -i));
    if (b && b.active >= 0 && b.resting > 0) rows.push(b);
  }
  if (rows.length < 3) return { days: rows.length };
  const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  return { days: rows.length, active: avg('active'), resting: avg('resting'), total: avg('burned') };
}

// Returns { ready: false, missing: [...] } or the full recommendation.
export function recommend(date = store.todayKey()) {
  const p = store.getProfile();
  const w = store.latestWeight(date);
  const age = ageOn(p.birthday, date);
  const heightCm = +p.heightCm || 0;
  const missing = [];
  if (age == null) missing.push('birthday');
  if (!p.sex) missing.push('sex');
  if (!heightCm) missing.push('height');
  if (!w) missing.push('weight');
  if (missing.length) return { ready: false, missing };

  const kg = w.kg;
  const base = bmr({ kg, heightCm, age, sex: p.sex });
  const burn = recentBurn(date);
  let tdee;
  let level;
  let basis;
  if (burn.total) {
    tdee = burn.total;
    level = activityLevel(burn.active);
    basis = `your average burn over the last ${burn.days} days`;
  } else {
    level = activityLevel(+p.typicalActive || 300);
    tdee = base * level.factor;
    basis = 'your profile (not enough days with calories burned yet)';
  }

  const plan = PLANS[p.plan] ? p.plan : 'maintain';
  const rate = plan === 'maintain' ? 0 : Math.max(0, +p.rate || 0.25);
  let adjust = (rate * KCAL_PER_KG) / 7;
  const floor = Math.max(base, p.sex === 'male' ? 1500 : 1200);
  let kcal = tdee;
  const notes = [];
  if (plan === 'lose') {
    const maxCut = Math.min(tdee * 0.25, tdee - floor);
    if (adjust > maxCut) {
      adjust = Math.max(0, maxCut);
      notes.push('Your weekly goal was eased so you eat at least your resting burn.');
    }
    kcal = tdee - adjust;
  } else if (plan === 'gain') {
    kcal = tdee + adjust;
  }
  kcal = Math.round(kcal / 10) * 10;

  let proteinPerKg = 1.6;
  if (level && level.factor >= 1.725) proteinPerKg = 1.8;
  if (plan === 'lose') proteinPerKg = 2.0;
  const protein = Math.round(kg * proteinPerKg);
  const fat = Math.round(Math.max((kcal * 0.28) / 9, kg * 0.6));
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return {
    ready: true,
    age,
    kg,
    weightDate: w.date,
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    level,
    basis,
    plan,
    rate,
    dailyChange: Math.round(plan === 'lose' ? -adjust : plan === 'gain' ? adjust : 0),
    goals: { kcal, protein, carbs, fat, restingKcal: Math.round(burn.resting || base) },
    proteinPerKg,
    notes,
  };
}

// With "keep goals updated" on, writes the recommendation into the goals
// when it has moved by more than a little. Returns true when goals changed.
export function applyIfAuto() {
  if (!store.getProfile().autoGoals) return false;
  const r = recommend();
  if (!r.ready) return false;
  const g = store.getState().goals;
  const moved = ['kcal', 'protein', 'carbs', 'fat'].some((k) => Math.abs((g[k] || 0) - r.goals[k]) > Math.max(2, r.goals[k] * 0.02));
  if (!moved && g.restingKcal) return false;
  store.setGoals(r.goals);
  return true;
}

// Units helpers for weight and height.
export const isImperial = () => (store.getProfile().units || 'imperial') === 'imperial';
export const kgToDisplay = (kg) => (isImperial() ? kg / LB : kg);
export const displayToKg = (v) => (isImperial() ? v * LB : v);
export const weightUnit = () => (isImperial() ? 'lb' : 'kg');
export const rateOptions = () =>
  isImperial()
    ? [[0.5 * LB, '½ lb a week'], [1 * LB, '1 lb a week'], [1.5 * LB, '1½ lb a week'], [2 * LB, '2 lb a week']]
    : [[0.25, '0.25 kg a week'], [0.5, '0.5 kg a week'], [0.75, '0.75 kg a week'], [1, '1 kg a week']];
