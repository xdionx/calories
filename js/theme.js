// Looks the user can pick in Settings. The CSS for each lives in themes.css;
// the choice is kept per device (a phone and an iPad can look different).
const KEY = 'ct.theme';

export const THEMES = [
  { id: '', name: 'Classic', note: 'Clean, follows light or dark', bg: '#f4f6f5', card: '#ffffff', accent: '#0f766e', text: '#15201d' },
  { id: 'night', name: 'Night dashboard', note: 'Dark cards, neon bars', bg: '#0b111c', card: '#141c2b', accent: '#38d6a0', text: '#e8eef7' },
  { id: 'swiss', name: 'Swiss editorial', note: 'Big numbers, bold rules', bg: '#f6f4ef', card: '#f6f4ef', accent: '#e5342b', text: '#111111' },
  { id: 'soft', name: 'Soft pastel', note: 'Rounded cards, gentle color', bg: '#f4f0fb', card: '#ffffff', accent: '#6a5acd', text: '#3b3450' },
  { id: 'legal', name: 'Legal pad', note: 'Yellow paper, red margin', bg: '#fff3a6', card: '#fff9cf', accent: '#b3122f', text: '#1b2a4a' },
  { id: 'steno', name: 'Steno pad', note: 'Green paper, mono type', bg: '#e4efdc', card: '#e4efdc', accent: '#2f5a3f', text: '#1f2d24' },
  { id: 'dots', name: 'Dot-grid journal', note: 'Cream dots, serif headings', bg: '#f7f1e3', card: '#f7f1e3', accent: '#b4452e', text: '#26241f' },
  { id: 'comp', name: 'Composition book', note: 'Marble header, blue rules', bg: '#fdfdfb', card: '#fdfdfb', accent: '#141414', text: '#141414' },
  { id: 'graph', name: 'Graph pad', note: 'Squared paper, boxed cards', bg: '#eef4ea', card: '#f7faf5', accent: '#22272b', text: '#22272b' },
  { id: 'term', name: 'Terminal', note: 'Green on black', bg: '#071007', card: '#0a140c', accent: '#7dff9b', text: '#7dff9b' },
  { id: 'brut', name: 'Bold blocks', note: 'Thick outlines, flat color', bg: '#fff4d6', card: '#ffffff', accent: '#ff8fab', text: '#111111' },
];

export function current() {
  try {
    const t = localStorage.getItem(KEY) || '';
    return THEMES.some((x) => x.id === t) ? t : '';
  } catch { return ''; }
}

export function apply(id = current()) {
  const root = document.documentElement;
  if (id) root.dataset.theme = id; else delete root.dataset.theme;
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = id ? t.bg : '#0f766e';
}

export function set(id) {
  try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* private mode */ }
  apply(id);
}

// Fills the picker in Settings.
export function renderPicker(grid) {
  const cur = current();
  grid.innerHTML = THEMES.map((t) => `
    <button type="button" class="theme-opt${t.id === cur ? ' active' : ''}" data-theme-id="${t.id}" aria-pressed="${t.id === cur}">
      <span class="theme-swatch" style="background:${t.bg}">
        <i style="background:${t.card};border-color:${t.text}33"></i><i style="background:${t.accent}"></i>
      </span>
      <b>${t.name}</b><small>${t.note}</small>
    </button>`).join('');
  grid.onclick = (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    set(b.dataset.themeId);
    renderPicker(grid);
  };
}
