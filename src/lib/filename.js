// Verbex filename template — supports {channel} {title} {date} {videoId}.

const ILLEGAL = /[\\/:*?"<>|\x00-\x1f]/g;
const WHITESPACE = /\s+/g;

export function safeSegment(s, max = 80) {
  return String(s ?? '')
    .replace(ILLEGAL, '')
    .replace(WHITESPACE, ' ')
    .trim()
    .slice(0, max);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function renderFilename(template, vars, ext) {
  const safe = {
    channel: safeSegment(vars.channel ?? 'Unknown channel', 60),
    title: safeSegment(vars.title ?? 'Untitled', 120),
    date: vars.date ?? todayISO(),
    videoId: safeSegment(vars.videoId ?? '', 16),
  };
  const base = (template || '{channel} — {title}')
    .replace(/\{channel\}/g, safe.channel)
    .replace(/\{title\}/g, safe.title)
    .replace(/\{date\}/g, safe.date)
    .replace(/\{videoId\}/g, safe.videoId);
  const cleaned = base.replace(WHITESPACE, ' ').trim() || safe.title || 'transcript';
  return `${cleaned}.${ext}`;
}
