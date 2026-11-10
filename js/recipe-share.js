// Share the recipe book with the household. Opt-in per person: your recipes are
// copied into the household's shared rows as recipe:<you>:<recipe id>, so
// everyone in the household sees them (read-only) and can copy one into their
// own book. Turning it off, or leaving the household, takes them back out.

import * as store from './store.js';
import * as hh from './household.js';
import * as sync from './sync.js';

const mine = () => (hh.getState().owner || sync.getAccount().user?.id || '').slice(0, 8);
const prefix = () => `recipe:${mine()}:`;
const inHousehold = () => Boolean(hh.getState().household);

export const isSharing = () => Boolean(store.getState().settings.shareRecipes) && inHousehold();
export const setSharing = (on) => store.setSettings({ shareRecipes: Boolean(on) });

/** Recipes other household members share: [{ ...recipe, by }]. Empty outside a household. */
export function familyRecipes() {
  if (!inHousehold()) return [];
  const own = prefix();
  return hh
    .list('recipe:')
    .filter((r) => r.recipe && !r.id.startsWith(own))
    .map((r) => ({ ...r.recipe, by: r.by || 'family' }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}

/** Make the household's copy match my book (or remove it all when not sharing). Safe to call often. */
export function publish() {
  if (!inHousehold() || !mine()) return;
  const p = prefix();
  const want = isSharing() ? store.getState().recipes : [];
  const have = new Map(hh.list(p).map((r) => [r.id, r]));
  for (const r of want) {
    const id = p + r.id;
    const h = have.get(id);
    if (!h || (h.recipe?.updatedAt || 0) !== (r.updatedAt || 0)) hh.put(id, { recipe: r });
    have.delete(id);
  }
  for (const id of have.keys()) hh.remove(id);
}

let timer = null;
const later = () => {
  clearTimeout(timer);
  timer = setTimeout(publish, 600);
};

export function init() {
  store.subscribe(later);
  hh.subscribe(later);
  hh.onBeforeLeave(() => hh.removeAll(prefix()));
}
