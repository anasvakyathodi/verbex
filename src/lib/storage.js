// Verbex storage — chrome.storage.sync wrapper with defaults.

export const DEFAULTS = Object.freeze({
  defaultFormat: 'txt',              // 'txt' | 'srt' | 'md' | 'clip'
  includeTimestamps: true,
  timestampGranularity: 'every-line', // 'every-line' | 'every-10s' | 'every-30s' | 'chapter-only'
  includeChapterMarkers: true,
  filenameTemplate: '{channel} — {title}',
  languageMode: 'auto',              // 'auto' | <bcp47 code>
  captionPreference: 'human',        // 'human' | 'auto' | 'any'
  firstRunTooltipShown: false,
  recentExports: [],                 // [{ videoId, title, channel, format, at }]
});

const RECENT_MAX = 12;

function area() {
  return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) || null;
}

export async function getSettings() {
  const a = area();
  if (!a) return { ...DEFAULTS };
  return new Promise((resolve) => {
    a.get(DEFAULTS, (got) => resolve({ ...DEFAULTS, ...got }));
  });
}

export async function setSettings(patch) {
  const a = area();
  if (!a) return;
  return new Promise((resolve) => a.set(patch, resolve));
}

export async function resetSettings() {
  const a = area();
  if (!a) return;
  return new Promise((resolve) => a.clear(() => a.set(DEFAULTS, resolve)));
}

export async function recordExport(entry) {
  const cur = await getSettings();
  const next = [entry, ...cur.recentExports.filter((e) => e.videoId !== entry.videoId)].slice(0, RECENT_MAX);
  await setSettings({ recentExports: next });
  return next;
}

export function onSettingsChange(cb) {
  if (typeof chrome === 'undefined' || !chrome.storage) return () => {};
  const handler = (changes, areaName) => {
    if (areaName !== 'sync') return;
    cb(changes);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
