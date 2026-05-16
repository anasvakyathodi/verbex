// Verbex inline SVG icon set — ported from the design bundle's shared.jsx.
// Returns an SVG element string ready to drop into innerHTML.
// All icons are 24x24 viewBox, stroke 1.6, currentColor-driven.

const PATHS = {
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  chevDown: '<polyline points="6 9 12 15 18 9"/>',
  chevRight: '<polyline points="9 18 15 12 9 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11 5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07L13 19"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>',
  language: '<path d="M3 5h12"/><path d="M9 3v2c0 4.42-3.58 8-8 8"/><path d="M5 9a13 13 0 0 0 10 8"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
};

const FILLED = new Set(['play']);

export function getIcon(name, opts = {}) {
  const size = opts.size ?? 18;
  const stroke = opts.stroke ?? 1.6;
  const path = PATHS[name];
  if (!path) return '';
  const filled = FILLED.has(name);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="${filled ? 'none' : 'currentColor'}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// Verbex brand mark — violet rounded-square with downward "stream" glyph.
export function getLogo(opts = {}) {
  const size = opts.size ?? 28;
  const radius = opts.radius ?? Math.round(size * 0.28);
  const inner = Math.round(size * 0.6);
  const bg = opts.bg ?? 'var(--vx-accent)';
  const fg = opts.fg ?? 'var(--vx-accent-fg)';
  return `<span class="vx-mark" style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${bg};color:${fg}">
    <svg width="${inner}" height="${inner}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.45"/>
      <path d="M5 9h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <path d="M7 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 14v6m0 0-3.5-3.5M12 20l3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </span>`;
}

// Wordmark
export function getWordmark(opts = {}) {
  const size = opts.size ?? 16;
  return `<span style="font-family:var(--vx-sans);font-weight:800;letter-spacing:-0.02em;font-size:${size}px;color:var(--vx-fg)">Verbex</span>`;
}
