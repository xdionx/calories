// Trends view: everything is computed from the local store for the chosen
// range (7, 30 or 90 days ending on the selected day) and drawn as small
// SVG/HTML charts with hover/tap tooltips. One y-axis per chart.

import * as store from './store.js';
import { MEALS } from './store.js';
import * as targets from './targets.js';
import { NUTRIENT_MAP, formatAmount } from './nutrients.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (n) => Math.round(n || 0);
const fmt = (n) => round(n).toLocaleString();
const KCAL_PER_LB = 3500;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const label = (key, opts) => dateOf(key).toLocaleDateString(undefined, opts);
const short = (key) => label(key, { month: 'short', day: 'numeric' });

/* ---------------- Data ---------------- */

export function collect(end, days) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(store.shiftDate(end, -i));
  const today = store.todayKey();
  const rows = keys.map((key) => {
    const entries = store.entriesFor(key);
    const totals = store.totalsFor(key);
    const bal = store.balanceFor(key);
    return {
      key,
      logged: entries.length > 0,
      partial: key === today, // today isn't over yet
      future: key > today,
      entries,
      totals,
      eaten: totals.kcal || 0,
      burned: bal ? bal.burned : null,
      active: bal ? bal.active : null,
      net: bal && entries.length ? bal.net : null,
      weight: store.weightFor(key)?.kg ?? null,
    };
  });
  return { keys, rows };
}

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/* ---------------- Tooltip ---------------- */

// One floating tooltip shared by every chart. Charts mark hover targets with
// data-tip (HTML) and the tooltip follows the pointer.
let tipEl;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.setAttribute('role', 'status');
    document.body.append(tipEl);
  }
  return tipEl;
}

export function bindTooltips(root) {
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !root.contains(t)) return hide();
    const el = tip();
    el.innerHTML = t.dataset.tip;
    el.classList.add('show');
    const r = el.getBoundingClientRect();
    let x = e.clientX + 12;
    let y = e.clientY - r.height - 12;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 12;
    if (y < 8) y = e.clientY + 16;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${y}px`;
    root.querySelectorAll('.hot').forEach((h) => h.classList.remove('hot'));
    t.classList.add('hot');
  };
  const hide = () => {
    tipEl?.classList.remove('show');
    root.querySelectorAll('.hot').forEach((h) => h.classList.remove('hot'));
  };
  root.addEventListener('pointermove', show);
  root.addEventListener('pointerdown', show);
  root.addEventListener('pointerleave', hide);
  document.addEventListener('scroll', hide, { passive: true });
}

/* ---------------- Chart helpers ---------------- */

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function xLabels(keys) {
  const n = keys.length;
  const picks = n <= 7 ? keys.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  return picks.map((i) => ({ i, text: n <= 7 ? label(keys[i], { weekday: 'short' }) : short(keys[i]) }));
}

// Line chart over days. series: [{ name, cls, values: [number|null] , dashed }]
// Every day gets a full-height invisible hover column with a tooltip.
function lineChart({ keys, series, width, height = 170, yFmt = fmt, unit = '', ref, minZero = true }) {
  const padL = 40;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const w = Math.max(240, width);
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (ref) all.push(ref.value);
  if (!all.length) return '';
  let lo = minZero ? 0 : Math.min(...all);
  let hi = Math.max(...all);
  if (!minZero) {
    const pad = Math.max((hi - lo) * 0.15, 0.5);
    lo -= pad;
    hi += pad;
  } else hi = niceMax(hi * 1.05);
  const n = keys.length;
  const x = (i) => padL + (n === 1 ? (w - padL - padR) / 2 : (i / (n - 1)) * (w - padL - padR));
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (height - padT - padB);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = (vals) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) return void (pen = false);
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const colW = (w - padL - padR) / Math.max(n - 1, 1);
  const showDots = n <= 31;
  return `<svg class="chart" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img">
    ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="tick" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${esc(yFmt(t))}</text>`).join('')}
    ${ref ? `<line class="ref" x1="${padL}" x2="${w - padR}" y1="${y(ref.value)}" y2="${y(ref.value)}"/>
      <text class="ref-label" x="${w - padR}" y="${y(ref.value) - 5}" text-anchor="end">${esc(ref.label)}</text>` : ''}
    ${series.map((s) => `<path class="line ${s.cls} ${s.dashed ? 'dashed' : ''}" d="${path(s.values)}"/>`).join('')}
    ${showDots ? series.filter((s) => !s.dashed).map((s) => s.values.map((v, i) => (v == null ? '' : `<circle class="dot ${s.cls}" cx="${x(i)}" cy="${y(v)}" r="3"/>`)).join('')).join('') : ''}
    ${xLabels(keys).map(({ i, text }) => `<text class="tick" x="${x(i)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(text)}</text>`).join('')}
    ${keys.map((k, i) => {
      const lines = series.map((s) => (s.values[i] == null ? '' : `<span class="tip-row"><i class="sw ${s.cls} ${s.dashed ? 'dashed' : ''}"></i>${esc(s.name)} <b>${esc(yFmt(s.values[i]))}${unit}</b></span>`)).join('');
      if (!lines) return '';
      return `<rect class="hit" data-day="${k}" data-tip="${esc(`<b>${esc(label(k, { weekday: 'short', month: 'short', day: 'numeric' }))}</b>${lines}`)}"
        x="${x(i) - colW / 2}" y="${padT}" width="${colW}" height="${height - padT - padB}"/>`;
    }).join('')}
  </svg>`;
}

// Bars that go up (surplus) or down (deficit) from zero.
function divergingBars({ keys, values, width, height = 150 }) {
  const padL = 40;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const w = Math.max(240, width);
  const vals = values.filter((v) => v != null);
  if (!vals.length) return '';
  const m = niceMax(Math.max(...vals.map(Math.abs), 100));
  const n = keys.length;
  const slot = (w - padL - padR) / n;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v) => padT + (1 - (v + m) / (2 * m)) * (height - padT - padB);
  const x = (i) => padL + i * slot + slot / 2;
  return `<svg class="chart" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img">
    ${[m, 0, -m].map((t) => `<line class="grid ${t === 0 ? 'zero' : ''}" x1="${padL}" x2="${w - padR}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="tick" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? '+' : t < 0 ? '−' : ''}${fmt(Math.abs(t))}</text>`).join('')}
    ${values.map((v, i) => {
      if (v == null) return '';
      const top = Math.min(y(v), y(0));
      const h = Math.max(1.5, Math.abs(y(v) - y(0)));
      const cls = v > 0 ? 'surplus' : 'deficit';
      const r = Math.min(4, bw / 2, h);
      // Rounded only at the data end, square at zero.
      const d = v > 0
        ? `M${x(i) - bw / 2},${top + h}V${top + r}Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + r},${top}H${x(i) + bw / 2 - r}Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + r}V${top + h}Z`
        : `M${x(i) - bw / 2},${top}V${top + h - r}Q${x(i) - bw / 2},${top + h} ${x(i) - bw / 2 + r},${top + h}H${x(i) + bw / 2 - r}Q${x(i) + bw / 2},${top + h} ${x(i) + bw / 2},${top + h - r}V${top}Z`;
      const tipHtml = `<b>${esc(label(keys[i], { weekday: 'short', month: 'short', day: 'numeric' }))}</b><span class="tip-row">${v > 0 ? 'Surplus' : 'Deficit'} <b>${fmt(Math.abs(v))} kcal</b></span>`;
      return `<path class="bar ${cls}" d="${d}"/><rect class="hit" data-day="${keys[i]}" data-tip="${esc(tipHtml)}" x="${x(i) - slot / 2}" y="${padT}" width="${slot}" height="${height - padT - padB}"/>`;
    }).join('')}
    ${xLabels(keys).map(({ i, text }) => `<text class="tick" x="${x(i)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(text)}</text>`).join('')}
  </svg>`;
}

const legend = (items) => `<div class="legend">${items.map((i) => `<span><i class="sw ${i.cls} ${i.dashed ? 'dashed' : ''}"></i>${esc(i.name)}</span>`).join('')}</div>`;

// Horizontal bar list (calories by meal, top foods, weekdays).
function barList(rows, { valueFmt = fmt, cls = '' } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="hbars">${rows.map((r) => `
    <div class="hbar" data-tip="${esc(r.tip || `<b>${esc(r.name)}</b><span class="tip-row">${esc(valueFmt(r.value))}</span>`)}">
      <span class="hb-name">${esc(r.name)}</span>
      <span class="hb-track">${r.value > 0 ? `<i class="${r.cls || cls}" style="width:${(r.value / max) * 100}%"></i>` : ''}</span>
      <span class="hb-val">${esc(r.label ?? valueFmt(r.value))}</span>
    </div>`).join('')}</div>`;
}

/* ---------------- Sections ---------------- */

function highlights(data, goals) {
  const { rows } = data;
  const full = rows.filter((r) => !r.partial && !r.future);
  const logged = full.filter((r) => r.logged);
  const burnedDays = full.filter((r) => r.burned != null);
  const netDays = full.filter((r) => r.net != null);
  const totalNet = netDays.reduce((s, r) => s + r.net, 0);
  const onTarget = logged.filter((r) => goals.kcal > 0 && Math.abs(r.eaten - goals.kcal) <= goals.kcal * 0.1).length;

  // Logging streak: consecutive logged days ending on the last day shown
  // (today counts if it has anything logged; otherwise start from yesterday).
  let streak = 0;
  let k = rows[rows.length - 1].key;
  if (!store.entriesFor(k).length) k = store.shiftDate(k, -1);
  while (store.entriesFor(k).length) {
    streak++;
    k = store.shiftDate(k, -1);
  }

  const weights = rows.filter((r) => r.weight != null);
  const wChange = weights.length >= 2 ? targets.kgToDisplay(weights[weights.length - 1].weight) - targets.kgToDisplay(weights[0].weight) : null;
  const unit = targets.weightUnit();

  const tiles = [
    { label: 'Avg eaten', value: logged.length ? fmt(avg(logged.map((r) => r.eaten))) : '–', sub: logged.length ? `kcal · ${logged.length} logged day${logged.length > 1 ? 's' : ''}` : 'no full days logged' },
    { label: 'Avg burned', value: burnedDays.length ? fmt(avg(burnedDays.map((r) => r.burned))) : '–', sub: burnedDays.length ? `kcal · active ${fmt(avg(burnedDays.map((r) => r.active)))}` : 'connect Garmin' },
    {
      label: netDays.length && totalNet > 0 ? 'Surplus' : 'Deficit',
      value: netDays.length ? fmt(Math.abs(totalNet)) : '–',
      sub: netDays.length ? `kcal total ≈ ${(Math.abs(totalNet) / KCAL_PER_LB).toFixed(1)} lb` : 'needs food + burn',
      cls: netDays.length ? (totalNet > 0 ? 'surplus' : 'deficit') : '',
    },
    { label: 'On target', value: logged.length ? `${onTarget}/${logged.length}` : '–', sub: 'days within 10% of goal' },
    { label: 'Logging streak', value: String(streak), sub: streak === 1 ? 'day' : 'days in a row' },
    {
      label: 'Weight',
      value: wChange == null ? (weights.length ? `${(Math.round(targets.kgToDisplay(weights[0].weight) * 10) / 10)}` : '–') : `${wChange > 0 ? '+' : wChange < 0 ? '−' : ''}${Math.abs(Math.round(wChange * 10) / 10)}`,
      sub: wChange == null ? (weights.length ? unit : 'log a few weigh-ins') : `${unit} in this period`,
    },
  ];
  return `<div class="tiles">${tiles.map((t) => `<div class="tile"><span class="t-label">${esc(t.label)}</span><b class="${t.cls || ''}">${esc(t.value)}</b><span class="t-sub">${esc(t.sub)}</span></div>`).join('')}</div>`;
}

function eatenVsBurned(data, goals, width) {
  const { keys, rows } = data;
  const eaten = rows.map((r) => (r.logged ? r.eaten : null));
  const burned = rows.map((r) => r.burned);
  if (!eaten.some((v) => v != null) && !burned.some((v) => v != null)) return '<div class="empty">Log food (and connect Garmin) to see this.</div>';
  const series = [{ name: 'Eaten', cls: 's-eat', values: eaten }];
  if (burned.some((v) => v != null)) series.push({ name: 'Burned', cls: 's-burn', values: burned });
  return legend(series) + lineChart({ keys, series, width, unit: ' kcal', ref: goals.kcal ? { value: goals.kcal, label: `goal ${fmt(goals.kcal)}` } : null });
}

function netChart(data, width) {
  const { keys, rows } = data;
  const values = rows.map((r) => r.net);
  if (!values.some((v) => v != null)) return '<div class="empty">Days with both food logged and calories burned show up here.</div>';
  return legend([{ name: 'Deficit', cls: 's-burn' }, { name: 'Surplus', cls: 's-eat' }]) + divergingBars({ keys, values, width });
}

// Weight: weigh-ins, a 7-day moving average, and what the logged deficit
// predicts (start weight minus cumulative net / 7,700 kcal per kg).
function weightChart(data, width) {
  const { keys, rows } = data;
  const firstIdx = rows.findIndex((r) => r.weight != null);
  if (firstIdx < 0 || rows.filter((r) => r.weight != null).length < 2) return { html: '<div class="empty">Log your weight on a few days (or let Garmin) to see the trend.</div>', note: '' };
  const disp = (kg) => (kg == null ? null : targets.kgToDisplay(kg));
  const weighIns = rows.map((r) => disp(r.weight));
  // Moving average over the 7 days ending on each day (only days with a weigh-in).
  const ma = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1).filter((r) => r.weight != null);
    return i >= firstIdx && win.length ? disp(avg(win.map((r) => r.weight))) : null;
  });
  let cum = 0;
  let netDays = 0;
  const expected = rows.map((r, i) => {
    if (i < firstIdx) return null;
    if (i > firstIdx && rows[i - 1].net != null) {
      cum += rows[i - 1].net;
      netDays++;
    }
    return r.future ? null : disp(rows[firstIdx].weight + cum / targets.KCAL_PER_KG);
  });
  const series = [
    { name: 'Weigh-ins', cls: 's-weight', values: weighIns },
    { name: '7-day average', cls: 's-avg', values: ma },
  ];
  if (netDays >= 3) series.push({ name: 'Expected from deficit', cls: 's-expect', values: expected, dashed: true });
  const unit = targets.weightUnit();
  const lastW = [...rows].reverse().find((r) => r.weight != null);
  const lastIdx = rows.indexOf(lastW);
  let note = '';
  if (netDays >= 3 && expected[lastIdx] != null) {
    const gap = disp(lastW.weight) - expected[lastIdx];
    note = Math.abs(gap) < 0.5
      ? 'Your weight is tracking what your logged deficit predicts.'
      : `You're ${Math.abs(Math.round(gap * 10) / 10)} ${unit} ${gap > 0 ? 'above' : 'below'} what your logged deficit predicts. Water weight swings day to day; ${gap > 0 ? 'a gap that keeps growing usually means some food isn\'t logged or the burn estimate runs high' : 'a gap that keeps growing usually means the burn estimate runs low'}.`;
  }
  const html = legend(series) + lineChart({ keys, series, width, minZero: false, unit: ` ${unit}`, yFmt: (v) => (Math.round(v * 10) / 10).toLocaleString() });
  return { html, note };
}

function macroSplit(data, goals) {
  const logged = data.rows.filter((r) => r.logged && !r.partial);
  if (!logged.length) return '<div class="empty">Log a full day of food to see your macro split.</div>';
  const kc = (r, k, f) => (r.totals[k] || 0) * f;
  const sum = (k, f) => logged.reduce((s, r) => s + kc(r, k, f), 0);
  const parts = [
    { key: 'protein', name: 'Protein', cls: 's-protein', kcal: sum('protein', 4), goal: goals.protein * 4 },
    { key: 'carbs', name: 'Carbs', cls: 's-carbs', kcal: sum('carbs', 4), goal: goals.carbs * 4 },
    { key: 'fat', name: 'Fat', cls: 's-fat', kcal: sum('fat', 9), goal: goals.fat * 9 },
  ];
  const total = parts.reduce((s, p) => s + p.kcal, 0) || 1;
  const goalTotal = parts.reduce((s, p) => s + p.goal, 0) || 1;
  const bar = (getPct, title) => `
    <div class="split-row"><span class="split-title">${title}</span>
      <div class="split">${parts.map((p) => {
        const pct = getPct(p);
        return `<i class="${p.cls}" style="width:${pct}%" data-tip="${esc(`<b>${p.name}</b><span class="tip-row">${title}: <b>${round(pct)}%</b> of calories</span>`)}">${pct >= 12 ? `${round(pct)}%` : ''}</i>`;
      }).join('')}</div></div>`;
  const perDay = (k) => avg(logged.map((r) => r.totals[k] || 0));
  return `${legend(parts)}
    ${bar((p) => (p.kcal / total) * 100, 'You')}
    ${bar((p) => (p.goal / goalTotal) * 100, 'Goal')}
    <p class="muted small">Daily average: protein ${round(perDay('protein'))} g (goal ${round(goals.protein)}), carbs ${round(perDay('carbs'))} g (goal ${round(goals.carbs)}), fat ${round(perDay('fat'))} g (goal ${round(goals.fat)}).</p>`;
}

function byMeal(data) {
  const logged = data.rows.filter((r) => r.logged);
  if (!logged.length) return '<div class="empty">Nothing logged in this period.</div>';
  const totals = Object.fromEntries(MEALS.map((m) => [m, 0]));
  for (const r of logged) for (const e of r.entries) totals[e.meal] = (totals[e.meal] || 0) + (e.nutrients.kcal || 0);
  const all = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  return barList(MEALS.map((m) => ({
    name: m,
    value: totals[m] / logged.length,
    label: `${fmt(totals[m] / logged.length)} · ${round((totals[m] / all) * 100)}%`,
    tip: `<b>${m}</b><span class="tip-row">${fmt(totals[m] / logged.length)} kcal a day on average</span><span class="tip-row">${round((totals[m] / all) * 100)}% of your calories</span>`,
  })), { cls: 's-eat' });
}

function topFoods(data) {
  const map = new Map();
  for (const r of data.rows) {
    for (const e of r.entries) {
      const id = e.food.id || e.food.name;
      const cur = map.get(id) || { name: e.food.name, kcal: 0, times: 0, protein: 0 };
      cur.kcal += e.nutrients.kcal || 0;
      cur.protein += e.nutrients.protein || 0;
      cur.times++;
      map.set(id, cur);
    }
  }
  const list = [...map.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 8);
  if (!list.length) return '<div class="empty">Nothing logged in this period.</div>';
  return barList(list.map((f) => ({
    name: f.name,
    value: f.kcal,
    label: `${fmt(f.kcal)} · ${f.times}×`,
    tip: `<b>${esc(f.name)}</b><span class="tip-row">${fmt(f.kcal)} kcal over ${f.times} time${f.times > 1 ? 's' : ''}</span><span class="tip-row">${round(f.protein)} g protein</span>`,
  })), { cls: 's-eat' });
}

function weekdays(data, goals) {
  const by = WEEKDAYS.map(() => []);
  for (const r of data.rows) if (r.logged && !r.partial) by[(dateOf(r.key).getDay() + 6) % 7].push(r.eaten);
  if (!by.some((d) => d.length)) return { html: '<div class="empty">Log a few full days to see your weekly pattern.</div>', note: '' };
  const rows = WEEKDAYS.map((d, i) => ({ name: d, value: avg(by[i]) || 0, n: by[i].length }));
  const withData = rows.filter((r) => r.n);
  const hi = withData.reduce((a, b) => (b.value > a.value ? b : a));
  const lo = withData.reduce((a, b) => (b.value < a.value ? b : a));
  const html = barList(rows.map((r) => ({
    name: r.name,
    value: r.value,
    label: r.n ? fmt(r.value) : '–',
    cls: r.value > goals.kcal * 1.1 ? 's-eat' : 's-burn',
    tip: `<b>${r.name}</b><span class="tip-row">${r.n ? `${fmt(r.value)} kcal on average (${r.n} day${r.n > 1 ? 's' : ''})` : 'no full days logged'}</span>`,
  })));
  const full = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const day = (r) => full[WEEKDAYS.indexOf(r.name)];
  const note = withData.length >= 3 && hi !== lo ? `You eat the most on ${day(hi)}s (${fmt(hi.value)} kcal) and the least on ${day(lo)}s (${fmt(lo.value)}).` : '';
  return { html, note };
}

function averages(data, goals) {
  const logged = data.rows.filter((r) => r.logged && !r.partial);
  if (!logged.length) return '<div class="empty">Log a full day of food to see averages.</div>';
  const a = (k) => avg(logged.map((r) => r.totals[k] || 0));
  const row = (name, v, goal, unit, overIsBad) => {
    const pct = goal > 0 ? (v / goal) * 100 : 0;
    return `<div class="macro-row"><div class="lbl"><span>${esc(name)}</span><b>${esc(formatAmount(v, unit))} / ${esc(formatAmount(goal, unit))}</b></div>
      <div class="bar"><i style="width:${Math.min(pct, 100)}%" class="${overIsBad && pct > 100 ? 'over' : ''}"></i></div></div>`;
  };
  return [
    row('Fiber', a('fiber'), NUTRIENT_MAP.fiber.dv, 'g', false),
    row('Sugar', a('sugar'), 50, 'g', true),
    row('Saturated fat', a('satFat'), NUTRIENT_MAP.satFat?.dv || 20, 'g', true),
    row('Sodium', a('sodium'), NUTRIENT_MAP.sodium.dv, 'mg', true),
  ].join('');
}

/* ---------------- Render ---------------- */

export function render(root, { end, days }) {
  const goals = store.getState().goals;
  const data = collect(end, days);
  const width = Math.round(root.querySelector('.card')?.clientWidth || root.clientWidth || 360) - 34;
  const set = (id, html) => {
    const el = root.querySelector(`#${id}`);
    if (el) el.innerHTML = html;
  };
  const range = `${short(data.keys[0])} – ${short(end)}`;
  set('tr-range', esc(range));
  set('tr-highlights', highlights(data, goals));
  set('tr-eaten', eatenVsBurned(data, goals, width));
  set('tr-net', netChart(data, width));
  const w = weightChart(data, width);
  set('tr-weight', w.html);
  set('tr-weight-note', esc(w.note));
  set('tr-macros', macroSplit(data, goals));
  set('tr-meals', byMeal(data));
  set('tr-foods', topFoods(data));
  const wd = weekdays(data, goals);
  set('tr-weekdays', wd.html);
  set('tr-weekdays-note', esc(wd.note));
  set('tr-averages', averages(data, goals));
}
