// Verbex Settings page.

import { getIcon, getLogo } from '../lib/icons.js';
import { getSettings, setSettings, resetSettings, DEFAULTS } from '../lib/storage.js';
import { renderFilename } from '../lib/filename.js';
import { extForFormat } from '../lib/formats.js';

const root = document.getElementById('root');

function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

let s = {};
let toastTimer = null;

function flashToast(msg) {
  let bar = document.querySelector('.toast-bar');
  if (!bar) {
    bar = h('div', { class: 'toast-bar', role: 'status' });
    document.body.appendChild(bar);
  }
  bar.innerHTML = '';
  bar.appendChild(h('span', { class: 'ok', html: getIcon('check', { size: 14 }) }));
  bar.appendChild(h('span', {}, msg));
  bar.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => bar.classList.remove('is-on'), 1800);
}

async function save(patch, message = 'Saved') {
  Object.assign(s, patch);
  await setSettings(patch);
  flashToast(message);
}

function radio({ name, checked, label, sub, onChange }) {
  const wrap = h('label', { class: 'vx-radio' }, [
    h('input', { type: 'radio', name, checked: checked ? 'checked' : null, onchange: onChange }),
    h('span', { class: 'mark' }),
    h('span', { class: 'text' }, [
      h('div', { class: 't' }, label),
      sub ? h('div', { class: 's' }, sub) : null,
    ]),
  ]);
  return wrap;
}

function toggle({ on, onChange, ariaLabel }) {
  const btn = h('button', {
    class: 'vx-toggle',
    type: 'button',
    role: 'switch',
    'aria-checked': on ? 'true' : 'false',
    'aria-label': ariaLabel || 'Toggle',
    onclick: () => onChange(!on),
  }, [h('span', { class: 'knob' })]);
  return btn;
}

function section({ id, label, hint, body }) {
  return h('section', { id, class: 'row' }, [
    h('div', { class: 'hd' }, [
      h('div', { class: 't' }, label),
      hint ? h('div', { class: 'h' }, hint) : null,
    ]),
    h('div', { class: 'bd' }, body),
  ]);
}

function defaultFormat() {
  const opts = [
    { id: 'txt', label: 'Plain text (.txt)', sub: 'Most universal — text editors, notes apps' },
    { id: 'srt', label: 'Subtitles (.srt)', sub: 'For captioning and video editors' },
    { id: 'md', label: 'Markdown (.md)', sub: 'With headings for chapters' },
    { id: 'clip', label: 'Copy to clipboard', sub: 'Ready to paste anywhere' },
  ];
  return h('div', { class: 'radios' }, opts.map((o) =>
    radio({
      name: 'fmt',
      checked: s.defaultFormat === o.id,
      label: o.label,
      sub: o.sub,
      onChange: () => save({ defaultFormat: o.id }, 'Default format updated'),
    }),
  ));
}

function timestamps() {
  const granOpts = [
    { id: 'every-line', label: 'Every line' },
    { id: 'every-10s', label: 'Every 10s' },
    { id: 'every-30s', label: 'Every 30s' },
    { id: 'chapter-only', label: 'Chapter only' },
  ];
  return h('div', {}, [
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' } }, [
      toggle({
        on: s.includeTimestamps,
        ariaLabel: 'Include timestamps',
        onChange: (v) => { save({ includeTimestamps: v }, v ? 'Timestamps on' : 'Timestamps off'); rerender(); },
      }),
      h('span', { style: { fontSize: '13px' } }, 'Include timestamps'),
    ]),
    h('div', { class: 'gran-card', style: !s.includeTimestamps ? { opacity: 0.55, pointerEvents: 'none' } : {} }, [
      h('div', { class: 'hd' }, 'Granularity'),
      h('div', { class: 'gran-pills' }, granOpts.map((o) =>
        h('button', {
          class: `gran-pill ${s.timestampGranularity === o.id ? 'is-on' : ''}`,
          type: 'button',
          onclick: () => { save({ timestampGranularity: o.id }, 'Granularity updated'); rerender(); },
        }, o.label),
      )),
    ]),
    h('div', { style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' } }, [
      toggle({
        on: s.includeChapterMarkers,
        ariaLabel: 'Include chapter markers',
        onChange: (v) => save({ includeChapterMarkers: v }, v ? 'Chapter markers on' : 'Chapter markers off'),
      }),
      h('span', { style: { fontSize: '13px' } }, 'Include chapter markers'),
    ]),
  ]);
}

function filenameSection() {
  const ext = extForFormat(s.defaultFormat || 'txt');
  const preview = renderFilename(s.filenameTemplate, {
    channel: 'Sustained Focus',
    title: 'Why slow productivity beats hustle culture',
    videoId: 'A7b3xK2Mz9',
  }, ext);

  const input = h('input', {
    type: 'text',
    value: s.filenameTemplate,
    spellcheck: 'false',
    'aria-label': 'Filename template',
  });
  input.addEventListener('input', () => {
    s.filenameTemplate = input.value || '';
    document.querySelector('#filename-preview').textContent = `Preview · ${renderFilename(s.filenameTemplate, {
      channel: 'Sustained Focus',
      title: 'Why slow productivity beats hustle culture',
      videoId: 'A7b3xK2Mz9',
    }, ext)}`;
  });
  input.addEventListener('change', () => {
    save({ filenameTemplate: input.value.trim() || DEFAULTS.filenameTemplate }, 'Filename template saved');
  });

  const insertTag = (tag) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = `${before}{${tag}}${after}`;
    input.focus();
    const newPos = start + tag.length + 2;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event('input'));
  };

  return h('div', { class: 'tpl-wrap' }, [
    h('div', { class: 'tpl-input' }, [input]),
    h('div', { class: 'tpl-preview', id: 'filename-preview' }, `Preview · ${preview}`),
    h('div', { class: 'tpl-help' }, [
      h('span', { style: { color: 'var(--vx-fg-dim)' } }, 'Variables:'),
      ...['channel', 'title', 'date', 'videoId'].map((t) =>
        h('span', { class: 'tag', role: 'button', tabindex: '0', onclick: () => insertTag(t), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), insertTag(t)) }, `{${t}}`),
      ),
    ]),
  ]);
}

function languageSection() {
  const langs = [
    { code: 'auto', name: 'Auto — match video' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ko', name: 'Korean' },
  ];

  const sel = h('select', { 'aria-label': 'Preferred language' });
  for (const l of langs) {
    const opt = h('option', { value: l.code }, l.name);
    if (s.languageMode === l.code) opt.setAttribute('selected', 'selected');
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => save({ languageMode: sel.value }, 'Language preference updated'));

  return h('div', {}, [
    h('label', { class: 'lang-select' }, [
      h('span', { html: getIcon('language', { size: 16 }) }),
      sel,
      h('span', { html: getIcon('chevDown', { size: 14 }) }),
    ]),
    h('div', { class: 'caption-prefs' }, [
      radio({ name: 'cap', checked: s.captionPreference === 'human', label: 'Prefer human captions', onChange: () => save({ captionPreference: 'human' }, 'Caption preference updated') }),
      radio({ name: 'cap', checked: s.captionPreference === 'auto', label: 'Prefer auto-generated', onChange: () => save({ captionPreference: 'auto' }, 'Caption preference updated') }),
      radio({ name: 'cap', checked: s.captionPreference === 'any', label: 'No preference', onChange: () => save({ captionPreference: 'any' }, 'Caption preference updated') }),
    ]),
  ]);
}

function shortcutsSection() {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return h('div', { class: 'kbd-row' }, [
    h('span', { class: 'kbd' }, mac ? '⌃' : 'Ctrl'),
    h('span', { style: { color: 'var(--vx-fg-dim)' } }, '+'),
    h('span', { class: 'kbd' }, '⇧'),
    h('span', { style: { color: 'var(--vx-fg-dim)' } }, '+'),
    h('span', { class: 'kbd' }, 'Y'),
    h('button', {
      class: 'vx-btn ghost',
      type: 'button',
      style: { color: 'var(--vx-accent)' },
      onclick: () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }),
    }, [h('span', {}, 'Change in Chrome'), h('span', { style: { marginLeft: '4px' } }, '→')]),
  ]);
}

function aboutSection() {
  const m = chrome.runtime.getManifest();
  return h('div', { style: { color: 'var(--vx-fg-muted)', fontSize: '13px', lineHeight: '1.6' } }, [
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } }, [
      h('span', { html: getLogo({ size: 36 }) }),
      h('div', {}, [
        h('div', { style: { fontWeight: 700, color: 'var(--vx-fg)' } }, 'Verbex'),
        h('div', { class: 'vx-mono', style: { fontSize: '11px', color: 'var(--vx-fg-dim)' } }, `v${m.version}`),
      ]),
    ]),
    h('p', { style: { margin: '0 0 6px' } }, 'A free Chrome extension that adds a Transcript button to every YouTube watch page. No accounts, no tracking, no AI bills.'),
    h('p', { style: { margin: '0 0 6px' } }, 'Permissions: activeTab, downloads, storage — scoped to youtube.com only.'),
    h('div', { style: { display: 'flex', gap: '12px', marginTop: '14px', flexWrap: 'wrap' } }, [
      h('button', { class: 'vx-btn', type: 'button', onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html?returning=1') }) }, 'Open welcome'),
    ]),
    h('div', {
      style: {
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid var(--vx-border)',
        fontSize: '12px',
        color: 'var(--vx-fg-muted)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px',
      },
    }, [
      h('span', {}, 'Built by'),
      h('a', {
        href: 'https://anasvakyathodi.github.io/',
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { color: 'var(--vx-accent)', textDecoration: 'none', fontWeight: '600' },
      }, 'Anas Vakyathodi'),
      h('span', { style: { color: 'var(--vx-fg-dim)' } }, '·'),
      h('a', {
        href: 'https://github.com/anasvakyathodi',
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { color: 'var(--vx-fg-muted)', textDecoration: 'none' },
      }, 'GitHub'),
      h('span', { style: { color: 'var(--vx-fg-dim)' } }, '·'),
      h('a', {
        href: 'https://anasvakyathodi.github.io/',
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { color: 'var(--vx-fg-muted)', textDecoration: 'none' },
      }, 'Portfolio'),
    ]),
  ]);
}

let activeSection = 'export';
function setActive(id) {
  activeSection = id;
  document.querySelectorAll('.side .it').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.section === id);
  });
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sidebar() {
  const items = [
    ['export', 'Export'],
    ['timestamps', 'Timestamps'],
    ['filename', 'Filename'],
    ['language', 'Language'],
    ['shortcuts', 'Shortcuts'],
    ['about', 'About'],
  ];
  return h('aside', { class: 'side' }, [
    ...items.map(([id, label]) =>
      h('button', {
        class: `it ${activeSection === id ? 'is-on' : ''}`,
        type: 'button',
        'data-section': id,
        onclick: () => setActive(id),
      }, label),
    ),
    h('div', { class: 'div' }),
    h('button', { class: 'danger', type: 'button', onclick: openResetModal }, 'Reset all settings'),
  ]);
}

function openResetModal() {
  let bg = document.querySelector('.modal-bg');
  if (!bg) {
    bg = h('div', { class: 'modal-bg' });
    document.body.appendChild(bg);
  }
  bg.innerHTML = '';
  const modal = h('div', { class: 'modal' }, [
    h('h3', {}, 'Reset all settings?'),
    h('p', {}, 'This will restore the defaults for export format, timestamps, filename, language, and shortcuts. Your recent exports list will also be cleared.'),
    h('div', { class: 'actions' }, [
      h('button', { class: 'vx-btn ghost', type: 'button', onclick: () => bg.classList.remove('is-on') }, 'Cancel'),
      h('button', { class: 'vx-btn primary danger', type: 'button', onclick: async () => {
        await resetSettings();
        s = { ...DEFAULTS };
        rerender();
        bg.classList.remove('is-on');
        flashToast('Settings reset');
      } }, 'Reset everything'),
    ]),
  ]);
  bg.appendChild(modal);
  bg.classList.add('is-on');
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('is-on'); });
}

function rerender() {
  const main = document.querySelector('.main');
  if (!main) return;
  main.innerHTML = '';
  main.appendChild(h('h1', {}, 'Export'));
  main.appendChild(h('p', { class: 'lead' }, 'How Verbex saves transcripts when you click the button.'));

  main.appendChild(section({
    id: 'export',
    label: 'Default format',
    hint: 'Used when you click the button without picking a format, or when triggered by keyboard shortcut.',
    body: defaultFormat(),
  }));
  main.appendChild(section({
    id: 'timestamps',
    label: 'Timestamps',
    hint: 'Whether to embed time markers in exported files. Always present in .srt regardless.',
    body: timestamps(),
  }));
  main.appendChild(section({
    id: 'filename',
    label: 'Filename template',
    hint: 'Use {channel} {title} {date} {videoId} as placeholders. Spaces and dashes are fine.',
    body: filenameSection(),
  }));
  main.appendChild(section({
    id: 'language',
    label: 'Language',
    hint: 'Which transcript track Verbex picks when a video has multiple.',
    body: languageSection(),
  }));
  main.appendChild(section({
    id: 'shortcuts',
    label: 'Keyboard shortcut',
    hint: 'Set in Chrome under chrome://extensions/shortcuts. Verbex won\'t override existing browser bindings.',
    body: shortcutsSection(),
  }));
  main.appendChild(section({
    id: 'about',
    label: 'About',
    hint: 'Version, permissions, and credits.',
    body: aboutSection(),
  }));
}

async function main() {
  s = await getSettings();
  root.innerHTML = '';
  const app = h('div', { class: 'app' }, [
    h('header', { class: 'topbar' }, [
      h('span', { html: getLogo({ size: 26 }) }),
      h('span', { class: 'wm' }, 'Verbex'),
      h('span', { class: 'crumb' }, '/ settings'),
      h('span', { style: { flex: '1' } }),
      h('button', { class: 'vx-btn ghost', type: 'button', onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html?returning=1') }) }, 'Help & feedback'),
    ]),
    h('div', { class: 'body' }, [
      sidebar(),
      h('main', { class: 'main' }),
    ]),
  ]);
  root.appendChild(app);
  rerender();

  // Sync sidebar with scroll position.
  document.querySelector('.main')?.addEventListener('scroll', () => {
    // Body scrolls, not .main — fall through to window scroll
  });
}

main();
