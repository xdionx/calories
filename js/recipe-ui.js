// Recipes screen: saved recipes list, a recipe's page (per-serving nutrition,
// log a serving), and the editor where a pasted recipe is worked out.
import { NUTRIENTS, formatAmount } from './nutrients.js';
import * as store from './store.js';
import * as rx from './recipes.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (n) => Math.round(n || 0);
const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
];

// deps from app.js: { openFood(food), toast(msg) }
let deps;
const view = {
  mode: 'list', // 'list' | 'detail' | 'edit'
  id: null, // recipe being viewed
  draft: null, // recipe being edited (not saved yet)
  picker: null, // index of the ingredient whose food picker is open
  matching: null, // AbortController while ingredients are looked up
  dirty: false,
  opened: false, // book opened past its cover this visit
  turn: null, // 'next' | 'prev': page-turn animation for the next render
};

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const getRecipe = (id) => store.getState().recipes.find((r) => r.id === id);
// The book's page order: alphabetical, like a contents page.
const bookOrder = () => [...store.getState().recipes].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const apiKey = () => store.getState().settings.usdaApiKey;

/* ---------------- Entry points ---------------- */

export function init(d) {
  deps = d;
  bind();
}

export function render() {
  $('#recipe-list-wrap').hidden = view.mode !== 'list';
  $('#recipe-detail').hidden = view.mode !== 'detail';
  $('#recipe-editor').hidden = view.mode !== 'edit';
  if (view.mode === 'list') renderList();
  if (view.mode === 'detail') renderDetail();
  if (view.mode === 'edit') renderEditor();
}

/** Called when recipes change from another device. */
export function refresh() {
  if (view.mode === 'list') renderList();
  else if (view.mode === 'detail') {
    if (!getRecipe(view.id)) showList();
    else renderDetail();
  }
}

/** Food rows for the Add food → Recent tab and search. */
export const recipeFoods = () => store.getState().recipes.map(rx.recipeAsFood);

/** Leave the editor? Asks if there are unsaved changes. */
export function canLeave() {
  if (view.mode !== 'edit' || !view.dirty) return true;
  return confirm('Leave without saving this recipe?');
}

/** Tapping Recipes while already there goes back to the list. */
export function home() {
  if (view.mode !== 'list' && canLeave()) showList();
}

function showList() {
  view.matching?.abort();
  view.mode = 'list';
  view.id = null;
  view.draft = null;
  view.dirty = false;
  render();
  window.scrollTo({ top: 0 });
}

function showDetail(id) {
  view.matching?.abort();
  view.mode = 'detail';
  view.id = id;
  view.draft = null;
  view.dirty = false;
  render();
  window.scrollTo({ top: 0 });
}

function showEditor(recipe = null) {
  view.mode = 'edit';
  view.picker = null;
  view.dirty = false;
  view.draft = recipe
    ? structuredClone(recipe)
    : { id: newId(), name: '', servings: 4, text: '', directions: '', ingredients: [], isNew: true };
  render();
  window.scrollTo({ top: 0 });
  if (!recipe) setTimeout(() => $('#rx-text').focus(), 50);
}

/* ---------------- Contents ---------------- */

function renderList() {
  const recipes = bookOrder();
  $('#cover-count').textContent = recipes.length ? plural(recipes.length, 'recipe') : 'Empty, for now';
  $('#book-cover').hidden = view.opened;
  $('#book-contents').hidden = !view.opened;
  $('#recipe-list').innerHTML = recipes.map((r, i) => {
    const n = rx.recipeNutrition(r);
    return `
      <li data-recipe="${esc(r.id)}" tabindex="0" role="button">
        <span class="toc-name">${esc(r.name || 'Untitled recipe')}<small>${round(n.kcal)} kcal a serving · P ${round(n.protein)} · C ${round(n.carbs)} · F ${round(n.fat)}</small></span>
        <span class="toc-dots" aria-hidden="true"></span>
        <span class="toc-page">${i + 1}</span>
      </li>`;
  }).join('');
  $('#recipe-empty').hidden = recipes.length > 0;
}

function openBook() {
  view.opened = true;
  const cover = $('#book-cover');
  cover.classList.add('opening');
  setTimeout(() => {
    cover.classList.remove('opening');
    renderList();
  }, 380);
}

/* ---------------- A recipe's page ---------------- */

function renderDetail() {
  const r = getRecipe(view.id);
  if (!r) return showList();
  const order = bookOrder();
  const idx = order.findIndex((x) => x.id === r.id);
  const n = rx.recipeNutrition(r);
  const src = rx.nutritionSource(r);
  $('#rd-name').textContent = r.name || 'Untitled recipe';
  $('#rd-meta').textContent = `Serves ${r.servings}`;
  $('#rd-summary').innerHTML = `<div class="rp-source">${src === 'recipe' ? 'Calories as printed in the recipe' : r.ingredients.length ? 'Calories worked out from the ingredients' : 'No calories yet'}</div>` + summaryHtml(n);
  $('#rd-ingredients').innerHTML = r.ingredients.map((ing) => {
    const k = rx.ingredientNutrients(ing).kcal;
    return `<li><span class="ing-line">${esc(ing.line)}</span>
      <span class="ing-match">${ing.food ? `${esc(ing.food.name)} · ${esc(amountText(ing))} · ${ing.amount ? `${round(k)} kcal` : 'not counted'}` : 'not matched, not counted'}</span></li>`;
  }).join('') || '<li class="ing-match">No ingredients listed.</li>';
  const steps = (r.directions || '').split(/\n+/).map((l) => l.trim().replace(/^(?:step\s*)?\d+[.):]\s*/i, '')).filter(Boolean);
  $('#rd-directions-card').hidden = !steps.length;
  $('#rd-directions').innerHTML = steps.map((l) => `<li>${esc(l)}</li>`).join('');
  $('#rd-num').textContent = `${idx + 1} of ${order.length}`;
  $('#rd-prev').disabled = idx <= 0;
  $('#rd-next').disabled = idx >= order.length - 1;
  const page = $('#rd-page');
  if (view.turn) {
    page.classList.remove('turn-next', 'turn-prev');
    void page.offsetWidth; // restart the animation
    page.classList.add(view.turn === 'next' ? 'turn-next' : 'turn-prev');
    view.turn = null;
  }
}

function turnPage(dir) {
  const order = bookOrder();
  const idx = order.findIndex((x) => x.id === view.id);
  const next = order[idx + (dir === 'next' ? 1 : -1)];
  if (!next) return;
  view.turn = dir;
  showDetail(next.id);
}

function amountText(ing) {
  const unit = ing.food.units[ing.unitIndex] || ing.food.units[0];
  const a = +(+ing.amount || 0).toFixed(2);
  if (unit.label === 'g') return `${a} g`;
  return a === 1 ? unit.label : `${a} × ${unit.label}`;
}

function summaryHtml(n, label = 'per serving') {
  const groups = [['Details', 'detail'], ['Vitamins', 'vitamin'], ['Minerals', 'mineral'], ['Other', 'other']];
  let table = '';
  for (const [title, g] of groups) {
    const rows = NUTRIENTS.filter((x) => x.group === g && n[x.key] != null);
    if (!rows.length) continue;
    table += `<tr class="group"><td colspan="3">${title}</td></tr>`;
    table += rows.map((x) => `<tr><td>${x.label}</td><td>${formatAmount(n[x.key], x.unit)}</td><td>${x.dv ? `${round((n[x.key] / x.dv) * 100)}%` : ''}</td></tr>`).join('');
  }
  return `
    <div class="fd-kcal"><b>${round(n.kcal || 0).toLocaleString()}</b> kcal ${esc(label)}</div>
    <div class="fd-macros">${MACROS.map((m) => `<div class="fd-macro" style="--c:${m.color}"><b>${formatAmount(n[m.key] || 0, 'g')}</b><span>${m.label}</span></div>`).join('')}</div>
    <details class="fd-more"><summary>All nutrients ${esc(label)}</summary><table>${table || '<tr><td>No vitamin or mineral data.</td></tr>'}</table></details>`;
}

/* ---------------- Editor ---------------- */

function renderEditor() {
  const d = view.draft;
  const f = $('#rx-form').elements;
  f.name.value = d.name;
  f.servings.value = d.servings;
  f.text.value = d.text || '';
  f.directions.value = d.directions || '';
  $('#rx-title').textContent = d.isNew ? 'New recipe' : 'Edit recipe';
  $('#rx-delete').hidden = Boolean(d.isNew);
  $('#rx-calc').textContent = d.ingredients.length || d.stated ? 'Read the text again' : 'Work out calories';
  renderIngredients();
}

function renderIngredients() {
  const d = view.draft;
  // Redrawing replaces the picker's search box: keep what's being typed there.
  const typing = document.activeElement?.matches('[data-picker-input]') ? document.activeElement : null;
  const typed = typing && { i: typing.dataset.pickerInput, value: typing.value, pos: typing.selectionStart };
  $('#rx-ing-card').hidden = !d.ingredients.length && !d.stated;
  $('#rx-ingredients').innerHTML = d.ingredients.map((ing, i) => ingredientRow(ing, i)).join('');
  if (typed) {
    const input = $(`[data-picker-input="${typed.i}"]`);
    if (input) {
      input.value = typed.value;
      input.focus();
      try { input.setSelectionRange(typed.pos, typed.pos); } catch { /* search inputs in some browsers */ }
    }
  }
  renderTotals();
}

function ingredientRow(ing, i) {
  const k = rx.ingredientNutrients(ing).kcal;
  const units = ing.food ? ing.food.units.map((u, j) => `<option value="${j}" ${j === ing.unitIndex ? 'selected' : ''}>${esc(u.label)}</option>`).join('') : '';
  const pickerOpen = view.picker === i;
  const status = ing.searching ? 'Looking up…' : ing.food ? `${esc(ing.food.name)}${ing.food.brand ? ` · ${esc(ing.food.brand)}` : ''}` : 'No match. Tap to search';
  return `
    <div class="rx-ing ${ing.food ? '' : 'unmatched'}" data-i="${i}">
      <div class="rx-top">
        <div class="rx-line">${esc(ing.line)}</div>
        <button type="button" class="icon-btn rx-remove" data-remove="${i}" aria-label="Remove ingredient">✕</button>
      </div>
      <button type="button" class="rx-food" data-pick="${i}" ${ing.searching ? 'disabled' : ''}>
        <span class="tag">${esc(ing.food ? shortSource(ing.food.source) : 'match')}</span>${status} <span class="chev">${pickerOpen ? '▴' : '▾'}</span>
      </button>
      ${ing.food ? `
      <div class="rx-amt">
        <input type="number" min="0" step="any" inputmode="decimal" value="${+(+ing.amount || 0).toFixed(2)}" data-amount="${i}" aria-label="Amount">
        <select data-unit="${i}" aria-label="Unit">${units}</select>
        <span class="rx-kcal">${round(k)} kcal</span>
      </div>` : ''}
      ${ing.note ? `<div class="rx-note">${esc(ing.note)}</div>` : ''}
      ${pickerOpen ? pickerHtml(ing, i) : ''}
    </div>`;
}

const shortSource = (s) => (s || '').replace(/^USDA .*/, 'USDA').replace('Open Food Facts', 'OFF');

function pickerHtml(ing, i) {
  const list = ing.candidates || [];
  return `
    <div class="rx-picker">
      <form class="search-row" data-picker-form="${i}">
        <input type="search" value="${esc(ing.query ?? ing.name)}" placeholder="Search foods" data-picker-input="${i}" enterkeyhint="search">
        <button class="btn small" type="submit">Search</button>
      </form>
      ${ing.pickStatus ? `<div class="status ${ing.pickError ? 'error' : ''}">${esc(ing.pickStatus)}</div>` : ''}
      <ul class="food-list rx-cands">${list.map((f, j) => {
        const u = f.units[f.defaultUnit || 0];
        return `<li data-cand="${j}" data-for="${i}" class="${ing.food && ing.food.id === f.id ? 'chosen' : ''}"><div class="info"><div class="name">${esc(f.name)}</div>
          <div class="sub"><span class="tag">${esc(shortSource(f.source))}</span>${esc(f.brand || '')}</div></div>
          <div class="kcal">${round((f.nutrients.kcal || 0) * u.factor)}<small>kcal / ${esc(u.label.replace(/\s*\(.*\)/, ''))}</small></div></li>`;
      }).join('')}</ul>
    </div>`;
}

function renderTotals() {
  const d = view.draft;
  const total = rx.recipeTotals(d);
  const servings = Math.max(1, d.servings || 1);
  const per = rx.perServing({ ...d, servings });
  const unmatched = d.ingredients.filter((x) => !x.food).length;
  const notCounted = d.ingredients.filter((x) => x.food && !x.amount).length;
  const flags = [];
  if (unmatched) flags.push(`${unmatched} not matched`);
  if (notCounted) flags.push(`${notCounted} with no amount`);
  $('#rx-total-note').textContent = d.ingredients.length
    ? `Estimate: ${round(total.kcal).toLocaleString()} kcal total ÷ ${servings} serving${servings === 1 ? '' : 's'}${flags.length ? ` · ${flags.join(', ')} (not counted)` : ''}`
    : '';
  if (d.stated) {
    const st = d.stated;
    const useStated = d.useStated !== false;
    $('#rx-source').innerHTML = `
      <p class="rp-source">The recipe prints its own nutrition: <b>${round(st.kcal)} kcal</b> a serving${st.protein != null ? ` · P ${round(st.protein)}` : ''}${st.carbs != null ? ` · C ${round(st.carbs)}` : ''}${st.fat != null ? ` · F ${round(st.fat)}` : ''}.</p>
      <div class="seg small-seg" role="radiogroup">
        <button type="button" data-use-stated="1" class="${useStated ? 'active' : ''}">Use the recipe's numbers</button>
        <button type="button" data-use-stated="0" class="${useStated ? '' : 'active'}" ${d.ingredients.some((x) => x.food) ? '' : 'disabled'}>Use my estimate${d.ingredients.length ? ` (${round(per.kcal)})` : ''}</button>
      </div>`;
  } else {
    $('#rx-source').innerHTML = d.ingredients.length ? '<p class="rp-source">The recipe doesn\'t print calories, so they\'re worked out from the ingredients.</p>' : '';
  }
  $('#rx-summary').innerHTML = summaryHtml(rx.recipeNutrition({ ...d, servings }));
}

function readForm() {
  const f = $('#rx-form').elements;
  const d = view.draft;
  d.name = f.name.value.trim();
  d.servings = Math.max(1, Math.round(parseFloat(f.servings.value) || 1));
  d.text = f.text.value;
  d.directions = f.directions.value.trim();
}

/** Reads the pasted text, fills name/servings/directions, and matches each ingredient. */
async function calculate() {
  readForm();
  const d = view.draft;
  const parsed = rx.splitRecipe(d.text);
  const stated = rx.extractNutrition(d.text, parsed.servings || d.servings);
  if (!parsed.ingredientLines.length && stated) {
    if (!d.name && parsed.title) d.name = parsed.title;
    if (parsed.servings) d.servings = parsed.servings;
    if (parsed.directions && !d.directions) d.directions = parsed.directions;
    d.stated = stated;
    d.useStated = true;
    view.dirty = true;
    renderEditor();
    setStatus(`Using the recipe's own nutrition: ${round(stated.kcal)} kcal a serving. No ingredient list found to check it against.`);
    return;
  }
  if (!parsed.ingredientLines.length) {
    setStatus("Couldn't find any ingredients. Paste the ingredient list with one ingredient per line (an \"Ingredients\" heading helps).", true);
    return;
  }
  if (d.ingredients.length && !confirm('Recalculate from the pasted text? Changes you made to the ingredient matches will be replaced.')) return;
  if (!d.name && parsed.title) d.name = parsed.title;
  if (parsed.servings && (d.isNew || !d.ingredients.length)) d.servings = parsed.servings;
  if (parsed.directions && !d.directions) d.directions = parsed.directions;
  d.stated = stated;
  d.useStated = Boolean(stated);
  view.dirty = true;

  const items = parsed.ingredientLines.map(rx.parseIngredient);
  const { myFoods } = store.getState();
  d.ingredients = items.map((p) => {
    const known = rx.recalledMatch(p.name, myFoods);
    const ing = rx.buildIngredient(p, known);
    if (!known) ing.searching = true;
    return ing;
  });
  view.picker = null;
  renderEditor();

  const todo = d.ingredients.map((ing, i) => ({ ing, i, p: items[i] })).filter((x) => x.ing.searching);
  if (!todo.length) {
    setStatus(`Found ${items.length} ingredients. Check the matches below, then save.`);
    return;
  }
  view.matching?.abort();
  const ctrl = new AbortController();
  view.matching = ctrl;
  let done = 0;
  let lastError = null;
  setStatus(`Looking up ${todo.length} ingredient${todo.length === 1 ? '' : 's'}…`);

  // Two at a time so the shared USDA demo key isn't hit all at once.
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const { ing, p } = queue.shift();
      try {
        const { foods, error } = await rx.findCandidates(p.name, { apiKey: apiKey(), signal: ctrl.signal });
        if (ctrl.signal.aborted || view.draft !== d) return;
        if (error) lastError = error;
        const idx = d.ingredients.indexOf(ing);
        if (idx < 0) continue;
        const next = rx.buildIngredient(p, foods[0] || null, foods);
        d.ingredients[idx] = next;
      } catch (e) {
        if (e.name === 'AbortError') return;
        lastError = e.message;
        ing.searching = false;
      }
      done++;
      if (view.draft === d && view.mode === 'edit') {
        setStatus(`Looked up ${done} of ${todo.length}…`);
        renderIngredients();
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (ctrl.signal.aborted || view.draft !== d) return;
  view.matching = null;
  const missing = d.ingredients.filter((x) => !x.food).length;
  const msg = missing
    ? `Matched ${d.ingredients.length - missing} of ${d.ingredients.length} ingredients. Tap the others to search for them.`
    : `Matched all ${d.ingredients.length} ingredients. Check the matches and amounts, then save.`;
  setStatus(lastError && missing ? `${msg} (${lastError})` : msg, Boolean(lastError && missing));
  renderIngredients();
}

function setStatus(msg, error = false) {
  const el = $('#rx-status');
  el.textContent = msg;
  el.className = `status ${error ? 'error' : ''}`;
}

async function searchPicker(i, query) {
  const d = view.draft;
  const ing = d.ingredients[i];
  if (!ing) return;
  ing.query = query;
  const token = (ing.pickToken = (ing.pickToken || 0) + 1);
  ing.pickStatus = 'Searching…';
  ing.pickError = false;
  renderIngredients();
  try {
    const { foods, error } = await rx.findCandidates(query, { apiKey: apiKey() });
    if (view.draft !== d || ing.pickToken !== token) return; // a newer search replaced this one
    ing.candidates = foods;
    ing.pickStatus = foods.length ? '' : error || `No foods found for “${query}”.`;
    ing.pickError = !foods.length;
  } catch (e) {
    if (ing.pickToken !== token) return;
    ing.pickStatus = e.message;
    ing.pickError = true;
  }
  renderIngredients();
}

function chooseCandidate(i, j) {
  const d = view.draft;
  const ing = d.ingredients[i];
  const food = ing?.candidates?.[j];
  if (!food) return;
  const parsed = rx.parseIngredient(ing.line);
  const next = rx.buildIngredient(parsed, food, ing.candidates);
  // Keep the user's own name edits if they changed the line.
  d.ingredients[i] = next;
  rx.rememberMatch(parsed.name, food);
  view.picker = null;
  view.dirty = true;
  renderIngredients();
}

function addIngredientLine(line) {
  line = line.trim();
  if (!line) return;
  const d = view.draft;
  const p = rx.parseIngredient(line);
  const known = rx.recalledMatch(p.name, store.getState().myFoods);
  const ing = rx.buildIngredient(p, known);
  d.ingredients.push(ing);
  view.dirty = true;
  if (known) return renderIngredients();
  ing.searching = true;
  renderIngredients();
  rx.findCandidates(p.name, { apiKey: apiKey() }).then(({ foods, error }) => {
    if (view.draft !== d) return;
    const idx = d.ingredients.indexOf(ing);
    if (idx < 0) return;
    d.ingredients[idx] = rx.buildIngredient(p, foods[0] || null, foods);
    if (!foods.length && error) setStatus(error, true);
    renderIngredients();
  }).catch((e) => {
    ing.searching = false;
    setStatus(e.message, true);
    renderIngredients();
  });
}

function saveDraft() {
  readForm();
  const d = view.draft;
  if (view.matching) return deps.toast('Still looking up ingredients…');
  if (!d.ingredients.length && !d.stated) return deps.toast('Paste a recipe and tap "Work out calories" first.');
  if (!d.name) {
    $('#rx-form').elements.name.focus();
    return deps.toast('Give the recipe a name.');
  }
  // Remember the matches the user kept, for next time.
  for (const ing of d.ingredients) if (ing.food) rx.rememberMatch(ing.name, ing.food);
  const clean = {
    id: d.id,
    name: d.name,
    servings: d.servings,
    text: d.text,
    directions: d.directions,
    stated: d.stated || null,
    useStated: d.stated ? d.useStated !== false : undefined,
    createdAt: d.createdAt,
    ingredients: d.ingredients.map(({ line, name, qty, unit, size, grams, counted, food, unitIndex, amount, note }) =>
      ({ line, name, qty, unit, size, grams, counted, food: food ? rx.slimFood(food) : null, unitIndex, amount: +amount || 0, note: note || '' })),
  };
  store.saveRecipe(clean);
  view.dirty = false;
  view.opened = true;
  deps.toast('Saved to your recipe book');
  showDetail(d.id);
}

/* ---------------- Events ---------------- */

function bind() {
  $('#rx-new').onclick = () => showEditor();
  $('#book-cover').onclick = openBook;
  $('#book-close').onclick = () => {
    view.opened = false;
    renderList();
  };
  $('#recipe-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-recipe]');
    if (li) showDetail(li.dataset.recipe);
  });
  $('#recipe-list').addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-recipe]');
    if (li && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      showDetail(li.dataset.recipe);
    }
  });
  $('#rd-prev').onclick = () => turnPage('prev');
  $('#rd-next').onclick = () => turnPage('next');
  // Swipe sideways on a recipe page to turn it.
  let touch = null;
  $('#rd-page').addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  $('#rd-page').addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) turnPage(dx < 0 ? 'next' : 'prev');
  }, { passive: true });
  $('#rx-source').addEventListener('click', (e) => {
    const b = e.target.closest('[data-use-stated]');
    if (!b || b.disabled) return;
    view.draft.useStated = b.dataset.useStated === '1';
    view.dirty = true;
    renderTotals();
  });

  // Detail
  $('#rd-back').onclick = showList;
  $('#rd-edit').onclick = () => showEditor(getRecipe(view.id));
  $('#rd-log').onclick = () => {
    const r = getRecipe(view.id);
    if (r) deps.openFood(rx.recipeAsFood(r));
  };

  // Editor
  $('#rx-back').onclick = () => {
    if (!canLeave()) return;
    if (view.draft?.isNew) showList();
    else showDetail(view.draft.id);
  };
  $('#rx-calc').onclick = calculate;
  $('#rx-form').addEventListener('submit', (e) => e.preventDefault());
  $('#recipe-editor textarea[name=directions]').addEventListener('input', () => (view.dirty = true));
  $('#rx-form').addEventListener('input', (e) => {
    view.dirty = true;
    if (e.target.name === 'servings') {
      readForm();
      renderTotals();
    }
  });
  $('#rx-save').onclick = saveDraft;
  $('#rx-delete').onclick = () => {
    const d = view.draft;
    if (!confirm(`Tear “${d.name || 'this recipe'}” out of the book? Servings you already logged stay in your log.`)) return;
    store.deleteRecipe(d.id);
    view.dirty = false;
    deps.toast('Recipe removed');
    showList();
  };
  $('#rx-add-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('#rx-add-input');
    addIngredientLine(input.value);
    input.value = '';
  };

  const list = $('#rx-ingredients');
  list.addEventListener('click', (e) => {
    const d = view.draft;
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      d.ingredients.splice(+rm.dataset.remove, 1);
      if (view.picker != null) view.picker = null;
      view.dirty = true;
      return renderIngredients();
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const i = +pick.dataset.pick;
      view.picker = view.picker === i ? null : i;
      renderIngredients();
      const ing = d.ingredients[i];
      if (view.picker === i && !ing.candidates?.length) searchPicker(i, ing.query ?? ing.name);
      else if (view.picker === i) setTimeout(() => $(`[data-picker-input="${i}"]`)?.focus(), 30);
      return;
    }
    const cand = e.target.closest('[data-cand]');
    if (cand) chooseCandidate(+cand.dataset.for, +cand.dataset.cand);
  });
  list.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-picker-form]');
    if (!form) return;
    e.preventDefault();
    const i = +form.dataset.pickerForm;
    const q = form.querySelector('input').value.trim();
    if (q) searchPicker(i, q);
  });
  list.addEventListener('input', (e) => {
    const a = e.target.closest('[data-amount]');
    if (!a) return;
    const ing = view.draft.ingredients[+a.dataset.amount];
    const v = parseFloat(a.value);
    ing.amount = Number.isFinite(v) && v >= 0 ? v : 0;
    ing.note = '';
    view.dirty = true;
    a.closest('.rx-ing').querySelector('.rx-kcal').textContent = `${round(rx.ingredientNutrients(ing).kcal)} kcal`;
    a.closest('.rx-ing').querySelector('.rx-note')?.remove();
    renderTotals();
  });
  list.addEventListener('change', (e) => {
    const u = e.target.closest('[data-unit]');
    if (!u) return;
    const ing = view.draft.ingredients[+u.dataset.unit];
    const prev = ing.food.units[ing.unitIndex];
    const next = ing.food.units[+u.value];
    // Keep the same amount of food when switching units.
    if (prev && next && next.factor > 0) ing.amount = Math.round(((ing.amount || 0) * prev.factor / next.factor) * 100) / 100;
    ing.unitIndex = +u.value;
    ing.note = '';
    view.dirty = true;
    renderIngredients();
  });
}
