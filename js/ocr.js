// On-device text reading for nutrition label photos, using Tesseract (WebAssembly).
// Nothing is uploaded: the photo is read inside the browser. The engine files
// live in vendor/tesseract/ and only load the first time you use Label.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;

let loading = null;
function loadScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${BASE}tesseract.min.js`;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the label reader. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

let workerPromise = null;
let onProgress = null;

async function getWorker() {
  const T = await loadScript();
  workerPromise ||= T.createWorker('eng', 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: `${BASE}tesseract-core-simd-lstm.wasm.js`,
    langPath: BASE,
    gzip: true,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    },
  }).then(async (w) => {
    // Labels are columns of short lines, not paragraphs.
    await w.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT ?? '11', preserve_interword_spaces: '1' });
    return w;
  }).catch((e) => {
    workerPromise = null;
    throw new Error(`Could not start the label reader (${e.message || e}).`);
  });
  return workerPromise;
}

/** Free the reader's memory (it is a few hundred MB while loaded). */
export async function release() {
  const p = workerPromise;
  workerPromise = null;
  if (p) {
    try {
      (await p).terminate();
    } catch { /* already gone */ }
  }
}

/* ---------------- Picture preparation ---------------- */

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

const TARGET = 2000; // longest side, pixels: big enough for small print, small enough to be quick

/**
 * Returns canvases to try, best guess first. Photos are uneven (shadows, a
 * curved can), so the first is thresholded against its local surroundings.
 */
export async function prepare(file) {
  const bmp = await loadBitmap(file);
  const w0 = bmp.width || bmp.naturalWidth;
  const h0 = bmp.height || bmp.naturalHeight;
  const scale = Math.min(2.5, TARGET / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const ctx = base.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  const gray = toGray(img.data, w * h);
  return { w, h, gray };
}

function toGray(rgba, n) {
  const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 151 + rgba[j + 2] * 28) >> 8;
  return g;
}

function toCanvas(gray, w, h, rotate = 0) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    out.data[j] = out.data[j + 1] = out.data[j + 2] = gray[i];
    out.data[j + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  if (!rotate) return c;
  const r = document.createElement('canvas');
  r.width = h;
  r.height = w;
  const rc = r.getContext('2d');
  rc.translate(h / 2, w / 2);
  rc.rotate((rotate * Math.PI) / 180);
  rc.drawImage(c, -w / 2, -h / 2);
  return r;
}

// Black text on white from a photo with uneven light: a pixel is "ink" when it
// is clearly darker than the average of its neighbourhood (integral image).
function adaptive(gray, w, h) {
  const win = Math.max(15, Math.round(Math.min(w, h) / 14)) | 1;
  const half = win >> 1;
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += gray[(y - 1) * w + (x - 1)];
      sum[y * (w + 1) + x] = sum[(y - 1) * (w + 1) + x] + row;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const area = (x1 - x0) * (y1 - y0);
      const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / area;
      out[y * w + x] = gray[y * w + x] < mean * 0.86 ? 0 : 255;
    }
  }
  return out;
}

// Stretch contrast so the darkest 1% is black and the lightest 1% is white.
function stretch(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  const cut = gray.length * 0.01;
  let lo = 0;
  let acc = 0;
  while (lo < 254 && (acc += hist[lo]) < cut) lo++;
  let hi = 255;
  acc = 0;
  while (hi > lo + 1 && (acc += hist[hi]) < cut) hi--;
  const out = new Uint8ClampedArray(gray.length);
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * k;
  return out;
}

// Label rows read as "name ... amount ... %", with the columns far apart. The
// engine often returns each column separately, so lines are rebuilt from the
// word positions: words that sit at the same height belong to the same row.
export function rowsText(data) {
  const words = [];
  const slopes = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const bl = line.baseline;
        if (bl && bl.x1 - bl.x0 > 150) slopes.push((bl.y1 - bl.y0) / (bl.x1 - bl.x0));
        for (const wd of line.words || []) {
          if (wd.text && wd.text.trim()) words.push({ t: wd.text.trim(), x0: wd.bbox.x0, x1: wd.bbox.x1, y0: wd.bbox.y0, y1: wd.bbox.y1 });
        }
      }
    }
  }
  if (!words.length) return data.text || '';
  // A crooked photo tilts every row; undo the median tilt of the lines so
  // the label's columns line up again.
  slopes.sort((a, b) => a - b);
  const tilt = slopes.length ? slopes[slopes.length >> 1] : 0;
  for (const w of words) w.cy = (w.y0 + w.y1) / 2 - tilt * ((w.x0 + w.x1) / 2);
  const heights = words.map((x) => x.y1 - x.y0).sort((a, b) => a - b);
  const med = heights[heights.length >> 1] || 20;
  words.sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const w of words) {
    const row = rows.find((r) => Math.abs(w.cy - r.cy) < Math.max(med, w.y1 - w.y0) * 0.5);
    if (row) {
      row.words.push(w);
      row.cy = row.words.reduce((s, x) => s + x.cy, 0) / row.words.length;
    } else rows.push({ cy: w.cy, words: [w] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  return rows.map((r) => r.words.sort((a, b) => a.x0 - b.x0).map((x) => x.t).join(' ')).join('\n');
}

/**
 * Reads the photo. `score(text)` says how good a reading is (how many fields
 * it found); the first reading that is good enough wins, otherwise the best
 * of the attempts is returned. Attempts: adaptive, plain, then the photo
 * turned a quarter each way (labels on cans are often sideways).
 */
export async function readLabel(file, { score, good = 6, progress } = {}) {
  onProgress = null;
  const { w, h, gray } = await prepare(file);
  const bw = adaptive(gray, w, h);
  const plain = stretch(gray);
  const attempts = [
    { name: 'adaptive', make: () => toCanvas(bw, w, h) },
    { name: 'plain', make: () => toCanvas(plain, w, h) },
    { name: 'adaptive 90', make: () => toCanvas(bw, w, h, 90) },
    { name: 'adaptive 270', make: () => toCanvas(bw, w, h, 270) },
  ];
  const worker = await getWorker();
  let best = null;
  for (let i = 0; i < attempts.length; i++) {
    onProgress = (p) => progress?.((i + p) / attempts.length, i);
    const { data } = await worker.recognize(attempts[i].make(), {}, { text: true, blocks: true });
    const text = rowsText(data);
    const s = score(text);
    if (!best || s > best.score) best = { text, score: s, attempt: attempts[i].name };
    if (s >= good) break;
  }
  onProgress = null;
  progress?.(1, attempts.length);
  return best;
}
