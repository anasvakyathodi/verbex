// Verbex transcript fetching. Runs inside the content script.

const BRIDGE_TAG_HOST = 'verbex.host.v1';
const BRIDGE_TAG_PAGE = 'verbex.bridge.v1';

let _latest = null;
let _waiters = [];

function pushSnapshot(snap) {
  _latest = snap;
  const waiters = _waiters;
  _waiters = [];
  for (const fn of waiters) fn(snap);
}

export function initPageBridge() {
  // Inject the bridge script tag into the page world. The file is web-accessible.
  if (document.documentElement.dataset.verbexBridge === '1') return;
  document.documentElement.dataset.verbexBridge = '1';
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('src/content/page-bridge.js');
  s.async = false;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.source !== BRIDGE_TAG_PAGE) return;
    if (!e.data.payload) return;
    pushSnapshot(e.data.payload);
  });
}

export function pullSnapshot() {
  window.postMessage({ source: BRIDGE_TAG_HOST, type: 'pull' }, '*');
}

// Page-world fetch (routed through page-bridge.js). YouTube's caption
// endpoint silently returns an empty body when fetched from a content
// script's isolated world — going through the page world fixes it.
let _fetchSeq = 0;
const _fetchPending = new Map();
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.source !== BRIDGE_TAG_PAGE) return;
  if (e.data.type !== 'fetch-result') return;
  const waiter = _fetchPending.get(e.data.id);
  if (!waiter) return;
  _fetchPending.delete(e.data.id);
  clearTimeout(waiter.to);
  if (!e.data.ok) {
    waiter.reject(new Error(`HTTP ${e.data.status || 0}: ${e.data.error || ''}`.trim()));
  } else {
    waiter.resolve({ ok: e.data.ok, status: e.data.status, text: e.data.text || '' });
  }
});
function bridgeFetch(url, timeoutMs = 10000) {
  const id = ++_fetchSeq;
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      _fetchPending.delete(id);
      reject(new Error('bridge fetch timeout'));
    }, timeoutMs);
    _fetchPending.set(id, { resolve, reject, to });
    window.postMessage({ source: BRIDGE_TAG_HOST, type: 'fetch', id, url }, '*');
  });
}

export function getSnapshotNow() { return _latest; }

export function waitForSnapshot(timeoutMs = 4000) {
  if (_latest?.videoDetails?.videoId) return Promise.resolve(_latest);
  pullSnapshot();
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      _waiters = _waiters.filter((f) => f !== onSnap);
      reject(new Error('Timed out waiting for player data'));
    }, timeoutMs);
    function onSnap(snap) {
      clearTimeout(to);
      resolve(snap);
    }
    _waiters.push(onSnap);
  });
}

// ───────────────────────── Track picking ─────────────────────────

export function listLanguages(snap) {
  const tracks = snap?.captions?.captionTracks || [];
  return tracks.map((t) => ({
    name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
    languageCode: t.languageCode,
    kind: t.kind === 'asr' ? 'auto' : 'human',
    baseUrl: t.baseUrl,
    isTranslatable: !!t.isTranslatable,
  }));
}

export function pickTrack(snap, settings) {
  const tracks = listLanguages(snap);
  if (!tracks.length) return null;
  const lang = settings.languageMode;
  const pref = settings.captionPreference;

  const matchLang = (t) => lang === 'auto' ? true : t.languageCode?.startsWith(lang);

  const candidates = tracks.filter(matchLang);
  const pool = candidates.length ? candidates : tracks;

  const order = pref === 'auto'
    ? ['auto', 'human']
    : pref === 'human'
      ? ['human', 'auto']
      : ['human', 'auto'];

  for (const kind of order) {
    const hit = pool.find((t) => t.kind === kind);
    if (hit) return hit;
  }
  return pool[0];
}

// ───────────────────────── Caption parsing ─────────────────────────

export async function fetchTrack(track) {
  if (!track?.baseUrl) throw new Error('No caption track URL');

  // YouTube's caption endpoint can return different shapes depending on
  // whether fmt is set and whether the host is authenticated. Try a few
  // variants in order and return the first that yields segments.
  const attempts = [
    { url: setFormat(track.baseUrl, 'json3'), label: 'json3' },
    { url: stripFormat(track.baseUrl), label: 'default-xml' },
    { url: setFormat(track.baseUrl, 'srv3'), label: 'srv3' },
    { url: setFormat(track.baseUrl, 'vtt'), label: 'vtt' },
  ];

  const errors = [];
  for (const a of attempts) {
    let text = '';
    let status = 0;
    // Try page-world fetch first (routes through page-bridge.js).
    try {
      const res = await bridgeFetch(a.url);
      status = res.status;
      text = res.text;
    } catch (e) {
      errors.push(`${a.label} bridge: ${e?.message || e}`);
    }
    // Fall back to isolated-world fetch if the bridge gave nothing.
    if (!text || !text.trim()) {
      try {
        const res = await fetch(a.url, { credentials: 'same-origin' });
        status = res.status;
        if (res.ok) text = await res.text();
        else errors.push(`${a.label} direct: HTTP ${res.status}`);
      } catch (e) {
        errors.push(`${a.label} direct: ${e?.message || e}`);
      }
    }
    try {
      if (status && status >= 400) {
        errors.push(`${a.label}: HTTP ${status}`);
        continue;
      }
      if (!text || !text.trim()) {
        errors.push(`${a.label}: empty body`);
        continue;
      }
      const trimmed = text.trim();
      let segs = [];
      if (trimmed.startsWith('<')) {
        segs = parseTimedXml(text);
      } else if (trimmed.startsWith('{')) {
        segs = parseJson3(text);
      } else if (trimmed.startsWith('WEBVTT')) {
        segs = parseVtt(text);
      } else {
        // Unknown — try JSON3, then XML, defensively.
        segs = parseJson3(text);
        if (!segs.length) segs = parseTimedXml(text);
      }
      if (segs.length) return segs;
      errors.push(`${a.label}: parsed 0 segments (len=${text.length})`);
    } catch (e) {
      errors.push(`${a.label}: ${e?.message || e}`);
    }
  }
  // Surface a real reason rather than a generic empty array.
  const detail = errors.length ? ' (' + errors.join('; ').slice(0, 200) + ')' : '';
  const err = new Error('CAPTION_FETCH_EMPTY' + detail);
  err.code = 'CAPTION_FETCH_EMPTY';
  throw err;
}

function setFormat(url, fmt) {
  const u = new URL(url, 'https://www.youtube.com');
  u.searchParams.set('fmt', fmt);
  return u.toString();
}
function stripFormat(url) {
  const u = new URL(url, 'https://www.youtube.com');
  u.searchParams.delete('fmt');
  return u.toString();
}

function parseJson3(raw) {
  let json;
  try { json = JSON.parse(raw); } catch { return []; }
  const events = json.events || [];
  const out = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const start = (ev.tStartMs || 0) / 1000;
    const end = ((ev.tStartMs || 0) + (ev.dDurationMs || ev.dDurationMS || 2000)) / 1000;
    const text = ev.segs.map((s) => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
    if (!text) continue;
    out.push({ start, end, text });
  }
  return out;
}

function parseTimedXml(raw) {
  const doc = new DOMParser().parseFromString(raw, 'text/xml');
  const nodes = doc.querySelectorAll('text');
  const out = [];
  for (const n of nodes) {
    const start = parseFloat(n.getAttribute('start') || '0');
    const dur = parseFloat(n.getAttribute('dur') || '2');
    const text = decodeHtml(n.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({ start, end: start + dur, text });
  }
  return out;
}

const _ta = document.createElement('textarea');
function decodeHtml(s) {
  _ta.innerHTML = s;
  return _ta.value;
}

function parseVtt(raw) {
  const lines = raw.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line && line.match(/(\d{1,2}:)?(\d{1,2}):(\d{2})\.(\d{3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})\.(\d{3})/);
    if (m) {
      const start = toSec(m[1], m[2], m[3], m[4]);
      const end = toSec(m[5], m[6], m[7], m[8]);
      i += 1;
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '') {
        buf.push(lines[i].replace(/<[^>]+>/g, ''));
        i += 1;
      }
      const text = buf.join(' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ start, end, text });
    }
    i += 1;
  }
  return out;
}
function toSec(h, m, s, ms) {
  const hh = h ? parseInt(h, 10) : 0;
  return hh * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
}

// ───────────────────────── Chapters ─────────────────────────

export function extractChapters(snap) {
  const map = snap?.chaptersMap;
  if (!Array.isArray(map)) return [];
  for (const m of map) {
    const chapters = m?.value?.chapters;
    if (Array.isArray(chapters) && chapters.length) {
      return chapters.map((c) => {
        const r = c.chapterRenderer || c;
        return {
          title: r.title?.simpleText || r.title?.runs?.[0]?.text || 'Chapter',
          start: (r.timeRangeStartMillis ?? 0) / 1000,
        };
      });
    }
  }
  return [];
}

// ───────────────────────── Meta ─────────────────────────

export function buildMeta(snap, track) {
  const v = snap?.videoDetails || {};
  return {
    videoId: v.videoId,
    title: v.title,
    channel: v.author,
    url: v.videoId ? `https://www.youtube.com/watch?v=${v.videoId}` : null,
    language: track?.languageCode,
    languageName: track?.name,
    isAuto: track?.kind === 'auto',
    isLive: !!v.isLiveContent,
    durationSeconds: parseInt(v.lengthSeconds || '0', 10) || 0,
  };
}
