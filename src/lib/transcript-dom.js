// Verbex DOM-scraping fallback.
//
// YouTube has locked down api/timedtext (200 OK with empty body to
// non-player fetches). The reliable workaround is to open YouTube's own
// transcript engagement panel and read the segments off the DOM.

// Modern YouTube has used a few different element names over the years.
// Match any of them, plus a generic fallback by class pattern.
const SEG_SELECTORS = [
  'ytd-transcript-segment-renderer',
  '[class*="ytd-transcript-segment-renderer"]',
  'ytd-transcript-search-panel-renderer ytd-transcript-segment-list-renderer > *:not(ytd-spinner):not([hidden])',
  '#segments-container > *:not(ytd-spinner):not([hidden])',
];
const SEG_SELECTOR = SEG_SELECTORS.join(', ');
const PANEL_SELECTOR = [
  'ytd-engagement-panel-section-list-renderer[target-id*="searchable-transcript"]',
  'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
  'ytd-transcript-renderer',
  'ytd-transcript-segment-list-renderer',
  'ytd-transcript-search-panel-renderer',
].join(', ');

// Timestamp-then-text row, e.g. "0:00  Hello world" or "1:23:45  Long talk".
const TS_RE = /^\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?)\s+(.+?)\s*$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
  return true;
}

function parseTsToSec(ts) {
  const parts = String(ts || '').trim().split(':').map((n) => parseInt(n, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function fillEnds(out) {
  for (let i = 0; i < out.length - 1; i++) out[i].end = out[i + 1].start || (out[i].start + 4);
  if (out.length) {
    const last = out[out.length - 1];
    if (!last.end) last.end = last.start + 4;
  }
  return out;
}

function readStructured() {
  const segs = document.querySelectorAll(SEG_SELECTOR);
  if (!segs.length) return [];
  const out = [];
  const seen = new Set();
  for (const s of segs) {
    if (s.closest('.vx-host')) continue;
    const tsEl = s.querySelector('.segment-timestamp, [class*="timestamp" i]');
    const txtEl = s.querySelector('yt-formatted-string.segment-text, .segment-text, [class*="segment-text" i]');
    const dataStart = parseInt(s.getAttribute('start-ms') || s.dataset?.startMs || '0', 10);
    const ts = tsEl?.textContent?.trim() || '';
    const txt = (txtEl?.textContent || '').trim();
    if (!txt) continue;
    const start = dataStart > 0 ? dataStart / 1000 : parseTsToSec(ts);
    const key = `${start}|${txt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ start, end: 0, text: txt.replace(/\s+/g, ' ') });
  }
  return fillEnds(out);
}

// Fallback: walk anything inside the engagement panel that looks like a
// "timestamp  text" row. Works no matter what custom element names YouTube
// is currently using.
function readByTextPattern() {
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) return [];
  const candidates = panel.querySelectorAll('div, li, ytd-transcript-segment-renderer, [role="button"]');
  const out = [];
  const seen = new Set();
  for (const el of candidates) {
    if (el.closest('.vx-host')) continue;
    // Only consider "leaf-ish" elements: skip if any descendant also matches.
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const m = text.match(TS_RE);
    if (!m) continue;
    // Avoid matching the same content multiple times via wrapper ancestors.
    if (m[2].length > 240) continue;
    const start = parseTsToSec(m[1]);
    const key = `${start}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ start, end: 0, text: m[2] });
  }
  out.sort((a, b) => a.start - b.start);
  return fillEnds(out);
}

function readSegmentsFromPanel() {
  const a = readStructured();
  if (a.length) return a;
  return readByTextPattern();
}

// Find any visible clickable on the page whose label/text mentions "transcript".
function findTranscriptClickable() {
  const sel = 'button, a, yt-button-shape, ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-button-renderer';
  const all = document.querySelectorAll(sel);
  for (const el of all) {
    if (el.closest('.vx-host, .vx-menu-host, .vx-toast-stack')) continue;
    const aria = el.getAttribute('aria-label') || '';
    const text = (el.textContent || '').trim();
    const combined = (aria + ' ' + text).toLowerCase();
    // "Show transcript" is the explicit label; also catch single-word "Transcript"
    // chips. Exclude anything that's only labeled "transcripts" plural in nav.
    if (!combined.match(/\btranscript\b/)) continue;
    if (combined.includes('subscript')) continue;
    if (!isVisible(el)) continue;
    return el;
  }
  return null;
}

async function expandDescription() {
  // YouTube hides the description "Show transcript" chip until the description
  // is expanded. Click the "...more" expand button.
  const candidates = [
    'ytd-text-inline-expander tp-yt-paper-button#expand',
    'ytd-text-inline-expander #expand',
    '#description-inline-expander #expand',
    'tp-yt-paper-button#expand',
  ];
  for (const s of candidates) {
    const el = document.querySelector(s);
    if (el && isVisible(el)) {
      el.click();
      await sleep(200);
      return true;
    }
  }
  return false;
}

function findMoreActionsButton() {
  // The "..." overflow menu under the player title row.
  const sels = [
    'ytd-menu-renderer.ytd-watch-metadata yt-button-shape > button[aria-label*="ore actions" i]',
    'ytd-menu-renderer.ytd-watch-metadata button[aria-label*="ore actions" i]',
    '#actions-inner button[aria-label*="ore actions" i]',
    'button[aria-label="More actions"]',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && isVisible(el)) return el;
  }
  // Last resort: walk all visible buttons and find one whose label = "more"
  const all = document.querySelectorAll('ytd-menu-renderer button, #actions button');
  for (const el of all) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('more') && !aria.includes('comment') && !el.closest('.vx-host')) {
      if (isVisible(el)) return el;
    }
  }
  return null;
}

function findMenuItemByText(needle) {
  const items = document.querySelectorAll(
    'tp-yt-paper-listbox ytd-menu-service-item-renderer, ' +
    'tp-yt-paper-listbox a, ' +
    'ytd-menu-popup-renderer ytd-menu-service-item-renderer, ' +
    'ytd-menu-popup-renderer tp-yt-paper-item'
  );
  const n = needle.toLowerCase();
  for (const it of items) {
    if ((it.textContent || '').toLowerCase().includes(n)) {
      return it;
    }
  }
  return null;
}

async function waitFor(predicate, timeoutMs, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const result = predicate();
    if (result) return result;
    await sleep(step);
  }
  return null;
}

function closeTranscriptPanel() {
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) return;

  // First, dismiss any open dropdowns (e.g. the language picker) so they
  // don't keep the panel anchored open after our close attempts.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));

  // 1. Click any plausible close button on the panel header.
  const closeBtn = panel.querySelector([
    'button[aria-label="Close transcript" i]',
    'button[aria-label*="close" i]',
    'yt-icon-button#dismiss-button button',
    'yt-icon-button#visibility-button button',
    '#dismiss-button button',
    '#visibility-button button',
  ].join(', '));
  if (closeBtn) closeBtn.click();

  // 2. Dispatch YouTube's close-panel command as a safety net.
  const ytdApp = document.querySelector('ytd-app');
  if (ytdApp) {
    try {
      ytdApp.dispatchEvent(new CustomEvent('yt-action', {
        detail: {
          actionName: 'yt-close-engagement-panel-command',
          args: [{ panelIdentifier: 'engagement-panel-searchable-transcript' }],
          optionalAction: false,
          returnValue: [],
        },
        bubbles: true,
        composed: true,
      }));
    } catch { /* ignore */ }
  }

  // 3. Flip the attribute back so Polymer hides the panel.
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');

  // 4. Re-verify on a short delay. If the panel is still expanded
  //    (e.g. because the user clicked into the language picker mid-scrape),
  //    hammer it again and hard-hide via inline style as a last resort.
  setTimeout(() => {
    const p = document.querySelector(PANEL_SELECTOR);
    if (!p) return;
    const vis = (p.getAttribute('visibility') || '').includes('EXPANDED');
    if (!vis) return;

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    p.querySelector('button[aria-label*="close" i], button[aria-label*="Close" i]')?.click();
    p.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  }, 300);

  setTimeout(() => {
    const p = document.querySelector(PANEL_SELECTOR);
    if (!p) return;
    const vis = (p.getAttribute('visibility') || '').includes('EXPANDED');
    if (!vis) return;
    // Truly stuck — force-hide via CSS so the user isn't left with a
    // panel they never asked to open.
    p.style.display = 'none';
    setTimeout(() => { p.style.display = ''; p.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN'); }, 1500);
  }, 800);
}

function panelExpanded(panel) {
  if (!panel) return false;
  const v = panel.getAttribute('visibility') || '';
  return v.includes('EXPANDED');
}

// Try YouTube's own command system to open the engagement panel, as a
// fallback when clicking the trigger button didn't actually flip visibility.
function dispatchOpenTranscriptCommand() {
  const ytdApp = document.querySelector('ytd-app');
  if (!ytdApp) return false;
  try {
    ytdApp.dispatchEvent(new CustomEvent('yt-action', {
      detail: {
        actionName: 'yt-open-engagement-panel-command',
        args: [{ panelIdentifier: 'engagement-panel-searchable-transcript' }],
        optionalAction: false,
        returnValue: [],
      },
      bubbles: true,
      composed: true,
    }));
    return true;
  } catch { return false; }
}

// Last-resort: flip the panel attribute directly. Polymer's
// attributeChangedCallback typically triggers data fetch + render.
function forcePanelExpanded(panel) {
  if (!panel) return;
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  panel.removeAttribute('hidden');
  if (panel.style.display === 'none') panel.style.display = '';
}

// Force the virtualised segment list to render rows by scrolling.
function nudgeScroll(panel) {
  if (!panel) return;
  const scroller = panel.querySelector('#segments-container, ytd-transcript-segment-list-renderer, .ytd-transcript-segment-list-renderer');
  if (!scroller) return;
  scroller.scrollTop = scroller.scrollHeight;
  setTimeout(() => { scroller.scrollTop = 0; }, 50);
}

/**
 * Open and scrape YouTube's native transcript panel.
 * @returns {Promise<Array<{start:number,end:number,text:string}>>}
 */
export async function scrapeTranscriptFromPanel({ timeoutMs = 15000, closeAfter = true } = {}) {
  // 0. Already populated? Use it.
  let existing = readSegmentsFromPanel();
  if (existing.length) return existing;

  const weOpenedIt = !document.querySelector(SEG_SELECTOR);

  // 1. Try direct trigger.
  let trigger = findTranscriptClickable();

  // 2. Expand description if needed.
  if (!trigger) {
    await expandDescription();
    await sleep(250);
    trigger = findTranscriptClickable();
  }

  // 3. ⋯ menu.
  let menuOpened = false;
  if (!trigger) {
    const more = findMoreActionsButton();
    if (more) {
      more.click();
      menuOpened = true;
      await sleep(400);
      trigger = findMenuItemByText('transcript') || findTranscriptClickable();
    }
  }

  if (trigger) {
    trigger.click();
  } else if (menuOpened) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  // 4. Wait briefly for click to flip the panel. If still not expanded,
  //    try YouTube's command dispatch + direct attribute flip.
  let panel = await waitFor(() => document.querySelector(PANEL_SELECTOR), 2000) || null;
  let expanded = await waitFor(() => {
    const p = document.querySelector(PANEL_SELECTOR);
    return p && panelExpanded(p) ? p : null;
  }, 2500);
  if (!expanded) {
    dispatchOpenTranscriptCommand();
    await sleep(300);
    expanded = await waitFor(() => {
      const p = document.querySelector(PANEL_SELECTOR);
      return p && panelExpanded(p) ? p : null;
    }, 1500);
  }
  if (!expanded) {
    const p = document.querySelector(PANEL_SELECTOR);
    if (p) {
      forcePanelExpanded(p);
      expanded = panelExpanded(p) ? p : null;
    }
  }

  panel = expanded || panel;
  if (!panel) {
    throw trigger
      ? new Error('Clicked transcript trigger but panel never appeared')
      : new Error('NO_TRANSCRIPT_BUTTON');
  }

  // 5. Poll for segments. If a body container never even appears within a
  //    short window, YouTube has no transcript for this video — bail with
  //    NO_TRANSCRIPT so the UI shows the proper empty state.
  const BODY_SEL = '#body, ytd-engagement-panel-content-renderer, ytd-transcript-renderer, ytd-transcript-search-panel-renderer, ytd-transcript-segment-list-renderer';
  const bodyDeadline = Date.now() + 4000;
  const deadline = Date.now() + timeoutMs;
  let got = null;
  let bodyFound = false;

  while (Date.now() < deadline) {
    got = readSegmentsFromPanel();
    if (got.length) break;

    if (!bodyFound) {
      bodyFound = !!panel.querySelector(BODY_SEL);
      if (!bodyFound && Date.now() > bodyDeadline) {
        if (closeAfter) closeTranscriptPanel();
        throw new Error('NO_TRANSCRIPT');
      }
    }

    nudgeScroll(panel);
    await sleep(250);
  }

  if (!got || !got.length) {
    // Diagnostics for the "panel had a body but segments never rendered" path.
    const body = panel.querySelector(BODY_SEL);
    console.error('[Verbex] panel visibility:', panel.getAttribute('visibility'));
    console.error('[Verbex] panel header sample:', (panel.outerHTML || '').slice(0, 1500));
    if (body) {
      console.error('[Verbex] panel body sample:', (body.outerHTML || '').slice(0, 4000));
    } else {
      console.error('[Verbex] no body container inside panel — text content:', (panel.textContent || '').trim().slice(0, 400));
    }
    if (closeAfter) closeTranscriptPanel();
    throw new Error('NO_TRANSCRIPT');
  }

  // Close after a successful scrape — the panel opened as a side effect.
  if (closeAfter) closeTranscriptPanel();
  return got;
}
