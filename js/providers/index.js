// Food database facade: combines USDA and Open Food Facts.
import * as off from './openfoodfacts.js';
import * as usda from './usda.js';

/**
 * Search both databases in parallel. Returns { results, errors } where results
 * interleave USDA (whole foods) first, then Open Food Facts (packaged foods).
 */
export async function searchFoods(query, { apiKey, signal } = {}) {
  const [u, o] = await Promise.allSettled([
    usda.search(query, { apiKey, signal }),
    off.search(query, { signal }),
  ]);
  const errors = [];
  if (u.status === 'rejected' && u.reason?.name !== 'AbortError') errors.push(`USDA: ${u.reason.message}`);
  if (o.status === 'rejected' && o.reason?.name !== 'AbortError') errors.push(`Open Food Facts: ${o.reason.message}`);
  const usdaFoods = u.status === 'fulfilled' ? u.value : [];
  const offFoods = o.status === 'fulfilled' ? o.value : [];
  return { results: [...usdaFoods, ...offFoods], usdaFoods, offFoods, errors };
}

/** Barcode → Food. Tries Open Food Facts, then USDA branded foods. */
export async function lookupBarcode(code, { apiKey, signal } = {}) {
  try {
    const hit = await off.lookupBarcode(code, { signal });
    if (hit) return hit;
  } catch (e) {
    console.warn('Open Food Facts lookup failed', e);
  }
  try {
    return await usda.lookupBarcode(code, { apiKey, signal });
  } catch (e) {
    console.warn('USDA lookup failed', e);
    return null;
  }
}
