// Groceries screen: the week's meals, standalone items, and the shopping list
// sorted by store department with estimated cost. Logic is in groceries.js;
// shared storage and sync are in household.js.
import * as store from './store.js';
import * as hh from './household.js';
import * as share from './recipe-share.js';
import * as sync from './sync.js';
import { STORES, getStore, mealLines, parseTyped, buildList, STAPLES, deptLabel, compareStores, rowsFor } from './groceries.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const DEFAULT_STORE = 'walmart-draper';


let deps = { toast: () => {}, goSettings: () => {} };
let hideDone = false;

export function init(d) {
  deps = { ...deps, ...d };
  hh.init();
  share.init();
  hh.subscribe(() => {
    if (!$('#view-groceries').hidden) render();
  });
  sync.onChange(() => {
    if (!$('#view-groceries').hidden) renderHeader();
  });
  bind();
}

const currentStore = () => hh.get('setting:store')?.store || DEFAULT_STORE;

/* ---------------- Drawing ---------------- */

export function render() {
  renderHeader();
  renderMeals();
  renderList();
}

function renderHeader() {
  const s = hh.getState();
  const account = sync.getAccount();
  let line;
  if (s.household) {
    const n = s.members.length;
    line = `Shared with ${esc(s.household.name)}${n ? `: ${n} ${n === 1 ? 'person' : 'people'}` : ''}. Code ${esc(s.household.code)}`;
  } else if (account.user) {
    line = 'Just you for now. Tap Family to share this list with your household.';
  } else {
    line = 'Just on this device. Sign in (Settings) to share the list with family.';
  }
  const st = hh.getStatus();
  if (s.household && st.sync === 'error') line += ` · Sync problem: ${esc(st.error)}`;
  else if (s.household && st.sync === 'offline') line += ' · Offline';
  $('#gl-house-line').innerHTML = line;
  $('#gl-house-btn').textContent = s.household ? 'Family' : 'Share';

  const active = currentStore();
  $('#gl-stores').innerHTML = STORES.map((x) => `<button type="button" class="gl-chip ${x.id === active ? 'active' : ''}" data-store="${x.id}">${esc(x.short || x.name)}</button>`).join('');
  $('#gl-store-note').textContent = `${getStore(active).name}. Department order follows a typical layout; prices are estimates.`;
}

function renderMeals() {
  const meals = hh.list('meal:');
  $('#gl-meals').innerHTML = meals.length
    ? meals.map((m) => `
      <li class="gl-meal" data-id="${esc(m.id)}">
        <b>${esc(m.name)}</b>
        <span class="gl-step"><button type="button" data-step="-1" aria-label="Fewer servings">−</button><span>${m.servings}</span><button type="button" data-step="1" aria-label="More servings">+</button></span>
        <button type="button" class="gl-x" data-remove-meal aria-label="Remove">✕</button>
      </li>`).join('')
    : '<li class="gl-empty">No meals yet. Add recipes from your recipe book and their ingredients go on the list.</li>';
  $('#gl-staples').innerHTML = STAPLES.map((n) => `<button type="button" class="gl-chip" data-staple="${esc(n)}">+ ${esc(n)}</button>`).join('');
}

function neededLines() {
  const lines = [];
  for (const m of hh.list('meal:')) lines.push(...mealLines(m));
  for (const it of hh.list('item:')) lines.push({ name: it.name, qty: it.qty, unit: it.unit, manualId: it.id, by: it.by });
  return lines;
}

function renderList() {
  const storeId = currentStore();
  const have = new Set(hh.list('have:').map((h) => h.key));
  const list = buildList(neededLines(), { store: storeId, have });
  $('#gl-total').textContent = list.count ? `${money(list.left)} left · ${money(list.total)} total` : '';
  if (!list.count) {
    $('#gl-list').innerHTML = '<p class="gl-empty">Nothing on the list yet.</p>';
    return;
  }
  const html = list.sections.map((sec) => {
    const items = hideDone ? sec.items.filter((i) => !i.checked) : sec.items;
    if (!items.length) return '';
    const aisle = hh.get(`aisle:${storeId}:${sec.dept}`)?.label || '';
    return `<div class="gl-sec">
      <div class="gl-sec-head"><button type="button" data-aisle="${sec.dept}">${esc(sec.label)}<small>${aisle ? esc(aisle) : 'add aisle'}</small></button><span>${money(sec.total)}</span></div>
      ${items.map((i) => `
        <div class="gl-item ${i.checked ? 'done' : ''}" data-key="${esc(i.key)}">
          <button type="button" class="tick" data-tick aria-label="Got it">✓</button>
          <div class="what"><b>${esc(i.name)}</b><small>${[i.qtyText, i.sources.length ? `for ${esc(i.sources.join(', '))}` : '', i.by && !i.sources.length ? `added by ${esc(i.by)}` : ''].filter(Boolean).join(' · ')}</small></div>
          <span class="cost">${i.guess ? '~' : ''}${money(i.price)}</span>
          ${i.manualIds.length ? `<button type="button" class="gl-x" data-remove-item="${esc(i.manualIds.join(','))}" aria-label="Remove">✕</button>` : ''}
        </div>`).join('')}
    </div>`;
  }).join('');
  $('#gl-list').innerHTML = html || '<p class="gl-empty">Everything is checked off.</p>';
}

/* ---------------- Actions ---------------- */

function addTyped(text) {
  const t = parseTyped(text);
  if (!t.name) return;
  hh.put(`item:${newId()}`, { name: t.name, qty: t.qty, unit: t.unit });
}

function addRecipe(id) {
  const r = store.getState().recipes.find((x) => x.id === id) || share.familyRecipes().find((x) => x.id === id);
  if (!r) return;
  const base = r.servings > 0 ? r.servings : 4;
  hh.put(`meal:${newId()}`, {
    recipeId: r.id,
    name: r.name || 'Recipe',
    servings: base,
    baseServings: base,
    ingredients: (r.ingredients || []).map((i) => ({ name: i.name, qty: i.qty ?? null, unit: i.unit || null })),
  });
}

function openRecipePicker() {
  const recipes = [...store.getState().recipes].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const have = new Set(recipes.map((r) => (r.name || '').trim().toLowerCase()));
  const family = share.familyRecipes().filter((r) => !have.has((r.name || '').trim().toLowerCase())); // already copied into my book
  const row = (r, by = '') => `<li><button type="button" class="food-row" data-recipe="${esc(r.id)}"><span class="grow"><b>${esc(r.name || 'Untitled')}</b><span class="muted small"> ${by ? `from ${esc(by)} · ` : ''}${r.servings ? `${r.servings} servings` : ''}</span></span><span>+</span></button></li>`;
  $('#gl-recipe-list').innerHTML = recipes.length || family.length
    ? recipes.map((r) => row(r)).join('') + family.map((r) => row(r, r.by)).join('')
    : '<li class="gl-empty">Your recipe book is empty. Paste a recipe under Recipes first.</li>';
  $('#gl-recipe-dialog').showModal();
}

function renderHouseDialog() {
  const s = hh.getState();
  const account = sync.getAccount();
  const body = $('#gl-house-body');
  if (!account.configured || !account.user) {
    body.innerHTML = `<p>To share, everyone signs in with their own account first (Settings → Account), then joins the same household with a code.</p>
      <button type="button" class="btn primary" id="gl-go-settings">Open Settings</button>`;
  } else if (s.household) {
    body.innerHTML = `<p>You're in <b>${esc(s.household.name)}</b>. Give this code to anyone you shop with. They sign in, open Groceries → Share, and enter it.</p>
      <div class="gl-code">${esc(s.household.code)}</div>
      <button type="button" class="btn" id="gl-copy-code">Copy code</button>
      <label class="gl-hide"><input type="checkbox" id="gl-share-recipes" ${share.isSharing() ? 'checked' : ''}> Share my recipe book with this household</label>
      <p class="muted small">${s.members.length ? `Members: ${s.members.map((m) => esc(m.email || 'someone')).join(', ')}` : ''}</p>
      <button type="button" class="btn danger" id="gl-leave">Leave household</button>
      <p class="status error" id="gl-house-err" hidden></p>`;
  } else {
    body.innerHTML = `<p>Share one grocery list and meal plan with your family.</p>
      <form id="gl-create-form" class="gl-add"><input name="name" placeholder="Household name, e.g. The Smiths" autocomplete="off"><button class="btn primary" type="submit">Create</button></form>
      <p class="muted small">Or join one someone already made:</p>
      <form id="gl-join-form" class="gl-add"><input name="code" placeholder="Join code" autocapitalize="characters" autocomplete="off"><button class="btn" type="submit">Join</button></form>
      <p class="status error" id="gl-house-err" hidden></p>`;
  }
}

const showErr = (e) => {
  const el = $('#gl-house-err');
  if (el) {
    el.textContent = e.message || String(e);
    el.hidden = false;
  }
};

function bind() {
  $('#gl-stores').addEventListener('click', (e) => {
    const b = e.target.closest('[data-store]');
    if (!b) return;
    hh.put('setting:store', { store: b.dataset.store });
  });
  $('#gl-meals').addEventListener('click', (e) => {
    const li = e.target.closest('.gl-meal');
    if (!li) return;
    const m = hh.get(li.dataset.id);
    if (!m) return;
    if (e.target.closest('[data-remove-meal]')) return hh.remove(m.id);
    const step = e.target.closest('[data-step]');
    if (step) hh.put(m.id, { ...m, servings: Math.max(1, m.servings + +step.dataset.step) });
  });
  $('#gl-add-meal').onclick = openRecipePicker;
  $('#gl-recipe-close').onclick = () => $('#gl-recipe-dialog').close();
  $('#gl-recipe-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-recipe]');
    if (!b) return;
    addRecipe(b.dataset.recipe);
    $('#gl-recipe-dialog').close();
    deps.toast('Added to this week');
  });
  $('#gl-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#gl-add-input');
    addTyped(input.value);
    input.value = '';
  });
  $('#gl-staples').addEventListener('click', (e) => {
    const b = e.target.closest('[data-staple]');
    if (b) {
      addTyped(b.dataset.staple);
      deps.toast(`${b.dataset.staple} added`);
    }
  });
  $('#gl-list').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-item]');
    if (rm) return rm.dataset.removeItem.split(',').forEach((id) => hh.remove(id));
    const aisle = e.target.closest('[data-aisle]');
    if (aisle) {
      const dept = aisle.dataset.aisle;
      const id = `aisle:${currentStore()}:${dept}`;
      const label = prompt(`Aisle for ${deptLabel(dept)} at ${getStore(currentStore()).short || getStore(currentStore()).name} (e.g. "Aisle 7"). Leave empty to clear.`, hh.get(id)?.label || '');
      if (label == null) return;
      if (label.trim()) hh.put(id, { label: label.trim() });
      else hh.remove(id);
      return;
    }
    const row = e.target.closest('.gl-item');
    if (row && e.target.closest('[data-tick]')) {
      const id = `have:${row.dataset.key}`;
      if (hh.get(id)) hh.remove(id);
      else hh.put(id, { key: row.dataset.key });
    }
  });
  $('#gl-compare').onclick = () => {
    const lines = neededLines();
    const rows = rowsFor(lines);
    if (!rows.length) return deps.toast('Add some items first');
    const cmp = compareStores(lines);
    const cheapest = cmp[0].total;
    $('#gl-compare-body').innerHTML = `
      <div class="gl-cmp-totals">${cmp.map((c, i) => `<div class="${i === 0 ? 'best' : ''}"><b>${esc(c.store.short)}</b><span>${money(c.total)}</span><small>${i === 0 ? 'cheapest' : `+${money(c.total - cheapest)}`}</small></div>`).join('')}</div>
      <div class="gl-cmp-scroll"><table class="gl-cmp"><thead><tr><th>Item</th>${cmp.map((c) => `<th>${esc(c.store.short)}</th>`).join('')}</tr></thead><tbody>
        ${rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
          const best = Math.min(...cmp.map((c) => c.prices[r.key]));
          return `<tr><td>${esc(r.name)}</td>${cmp.map((c) => `<td class="${c.prices[r.key] === best ? 'best' : ''}">${money(c.prices[r.key])}</td>`).join('')}</tr>`;
        }).join('')}
      </tbody></table></div>
      <p class="muted small">These are estimates from typical prices and each store's usual price level, not the stores' own prices. Use them to compare roughly, and check the shelf.</p>`;
    $('#gl-compare-dialog').showModal();
  };
  $('#gl-compare-close').onclick = () => $('#gl-compare-dialog').close();
  $('#gl-hide-done').onchange = (e) => {
    hideDone = e.target.checked;
    renderList();
  };
  $('#gl-clear').onclick = () => {
    if (!confirm('Start a new week? This clears the meals, the other items and the checkmarks for everyone sharing this list.')) return;
    for (const p of ['meal:', 'item:', 'have:']) hh.removeAll(p);
  };

  $('#gl-house-btn').onclick = () => {
    renderHouseDialog();
    $('#gl-house-dialog').showModal();
  };
  $('#gl-house-close').onclick = () => $('#gl-house-dialog').close();
  $('#gl-house-body').addEventListener('click', async (e) => {
    if (e.target.id === 'gl-go-settings') {
      $('#gl-house-dialog').close();
      deps.goSettings();
    } else if (e.target.id === 'gl-copy-code') {
      try {
        await navigator.clipboard.writeText(hh.getState().household.code);
        deps.toast('Code copied');
      } catch {
        deps.toast('Copy the code from the screen');
      }
    } else if (e.target.id === 'gl-leave') {
      if (!confirm('Leave this household? The list stays on this device but is no longer shared.')) return;
      try {
        await hh.leaveHousehold();
        renderHouseDialog();
      } catch (err) {
        showErr(err);
      }
    }
  });
  $('#gl-house-body').addEventListener('change', (e) => {
    if (e.target.id !== 'gl-share-recipes') return;
    share.setSharing(e.target.checked);
    deps.toast(e.target.checked ? 'Your recipes are shared' : 'Your recipes are private again');
  });
  $('#gl-house-body').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === 'gl-create-form') await hh.createHousehold(f.elements.name.value);
      else if (f.id === 'gl-join-form') await hh.joinHousehold(f.elements.code.value);
      renderHouseDialog();
    } catch (err) {
      showErr(err);
    }
  });
}
