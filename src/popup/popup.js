// Verbex toolbar popup.

import { getIcon, getLogo } from '../lib/icons.js';
import { getSettings } from '../lib/storage.js';
import { extForFormat } from '../lib/formats.js';

const root = document.getElementById('root');
const VERSION = chrome.runtime.getManifest().version;

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

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function isYouTubeWatch(url) {
  return /^https?:\/\/www\.youtube\.com\/watch/.test(url || '');
}

function parseVideoIdFromUrl(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v');
  } catch { return null; }
}

function header(settings, openSettings) {
  return h('div', { class: 'pop-header' }, [
    h('span', { html: getLogo({ size: 26 }) }),
    h('div', { style: { flex: '1' } }, [
      h('div', { class: 't' }, 'Verbex'),
      h('div', { class: 'v' }, `v${VERSION}`),
    ]),
    h('button', { class: 'gear', type: 'button', 'aria-label': 'Open settings', onclick: openSettings, html: getIcon('gear', { size: 18 }) }),
  ]);
}

function footer({ onSettings, onHelp }) {
  return h('div', { class: 'pop-foot' }, [
    h('a', { role: 'button', tabindex: '0', onclick: onSettings, onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && onSettings() }, 'Settings'),
    h('span', { class: 'sep' }),
    h('a', { role: 'button', tabindex: '0', onclick: onHelp, onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && onHelp() }, 'Help & feedback'),
    h('span', { class: 'ver' }, `v${VERSION}`),
  ]);
}

function recentList(settings, openSettings) {
  const items = settings.recentExports || [];
  if (!items.length) {
    return h('div', { class: 'recent' }, [
      h('div', { class: 'head' }, 'Recent exports'),
      h('div', { class: 'empty' }, 'Your recent exports will appear here. Try exporting a transcript to get started.'),
    ]);
  }
  const wrap = h('div', { class: 'recent' }, [
    h('div', { class: 'head' }, 'Recent exports'),
  ]);
  for (const e of items.slice(0, 5)) {
    const thumb = e.videoId ? `https://i.ytimg.com/vi/${e.videoId}/mqdefault.jpg` : '';
    wrap.appendChild(h('button', {
      class: 'row',
      type: 'button',
      onclick: () => {
        chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${e.videoId}` });
      },
    }, [
      h('div', { class: 'ph', style: thumb ? { backgroundImage: `url(${thumb})` } : {} }, thumb ? '' : 'v'),
      h('div', { class: 'info' }, [
        h('div', { class: 't' }, e.title || 'Untitled'),
        h('div', { class: 's' }, `${e.channel || 'Unknown'} · ${formatAgo(e.at)}`),
      ]),
      h('span', { class: 'fmt' }, `.${extForFormat(e.format)}`),
      h('span', { class: 'chev', html: getIcon('chevRight', { size: 12 }) }),
    ]));
  }
  return wrap;
}

function formatAgo(at) {
  if (!at) return '—';
  const diff = (Date.now() - at) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'Yesterday';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(at).toLocaleDateString();
}

function toggleFormatList(btn, tab) {
  const list = document.querySelector('.format-list');
  if (!list) return;
  const isOpen = !list.hasAttribute('hidden');
  if (isOpen) {
    list.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
    return;
  }
  // Build rows.
  list.innerHTML = '';
  const rows = [
    { id: 'clip', icon: 'copy', label: 'Copy to clipboard', sub: 'Ready to paste anywhere' },
    { id: 'txt',  icon: 'file', label: 'Download .txt',     sub: 'Plain text with timestamps' },
    { id: 'srt',  icon: 'file', label: 'Download .srt',     sub: 'Subtitle / caption file' },
    { id: 'md',   icon: 'file', label: 'Download .md',      sub: 'Markdown with chapter headings' },
  ];
  for (const r of rows) {
    const row = h('button', {
      class: 'fmt-row',
      type: 'button',
      onclick: (e) => exportInTab(tab.id, r.id, e.currentTarget),
    }, [
      h('span', { class: 'icon', html: getIcon(r.icon, { size: 16 }) }),
      h('span', { class: 'text' }, [
        h('div', { class: 't' }, r.label),
        h('div', { class: 's' }, r.sub),
      ]),
    ]);
    list.appendChild(row);
  }
  list.removeAttribute('hidden');
  btn.setAttribute('aria-expanded', 'true');
}

async function exportInTab(tabId, format, button) {
  if (button) {
    button.disabled = true;
    button.dataset.label = button.innerHTML;
    button.innerHTML = format === 'menu'
      ? `${getIcon('chevDown', { size: 14 })}<span style="margin-left:4px">Opening…</span>`
      : `<span class="vx-spinner" style="width:14px;height:14px"></span><span style="margin-left:8px">Exporting…</span>`;
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'verbex.popup-export', format });
  } catch (e) {
    if (button) {
      button.innerHTML = button.dataset.label || 'Try again';
      button.disabled = false;
    }
    return;
  }
  // Give the content script a moment to actually start the export so the
  // user sees something happened, then close.
  setTimeout(() => window.close(), 700);
}

function onVideoView(tab, settings) {
  const videoId = parseVideoIdFromUrl(tab.url);
  const fmt = settings.defaultFormat || 'txt';
  const fmtLabel = fmt === 'clip' ? 'Copy' : `.${extForFormat(fmt)}`;
  const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '';

  const card = h('div', { class: 'cur-video' }, [
    h('div', { class: 'row' }, [
      h('div', { class: 'thumb', style: thumb ? { backgroundImage: `url(${thumb})` } : {} }),
      h('div', { class: 'info' }, [
        h('div', { class: 'title' }, tab.title?.replace(/ - YouTube$/, '') || 'YouTube video'),
        h('div', { class: 'meta' }, videoId ? `youtube.com/watch?v=${videoId}` : ''),
      ]),
    ]),
    h('div', { class: 'actions' }, [
      h('button', {
        class: 'vx-btn primary', type: 'button',
        onclick: (e) => exportInTab(tab.id, fmt, e.currentTarget),
        html: `${getIcon('download', { size: 14 })}<span style="margin-left:4px">Export ${fmtLabel}</span>`,
      }),
      h('button', {
        class: 'vx-btn', type: 'button',
        'aria-haspopup': 'menu',
        onclick: (e) => toggleFormatList(e.currentTarget, tab),
        html: `${getIcon('chevDown', { size: 14 })}<span style="margin-left:4px">Format</span>`,
      }),
    ]),
    h('div', { class: 'format-list', hidden: '' }),
  ]);

  return h('div', {}, [card, recentList(settings)]);
}

function offVideoView() {
  return h('div', { class: 'off' }, [
    h('div', { class: 'hero', html: getIcon('play', { size: 24 }) }),
    h('div', { class: 't' }, 'Open a YouTube video'),
    h('div', { class: 's' }, "Verbex shows up in the action row on any video page. Shorts and Music aren't supported."),
    h('button', {
      class: 'vx-btn primary', type: 'button',
      onclick: () => chrome.tabs.create({ url: 'https://www.youtube.com/' }),
      html: `${getIcon('arrowRight', { size: 14 })}<span style="margin-left:4px">Open YouTube</span>`,
    }),
    h('div', { class: 'tip' }, [
      h('div', { class: 'hd' }, 'Tip'),
      h('div', { class: 'bd' }, 'Bind a shortcut in Chrome settings to export with a single keystroke.'),
      h('div', { class: 'keys' }, [
        h('span', { class: 'kbd' }, navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'),
        h('span', { class: 'kbd' }, '⇧'),
        h('span', { class: 'kbd' }, 'Y'),
      ]),
    ]),
  ]);
}

async function main() {
  const tab = await getActiveTab();
  const settings = await getSettings();
  const onSettings = () => chrome.runtime.openOptionsPage();
  const onHelp = () => chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html?returning=1') });
  const openSettings = () => chrome.runtime.openOptionsPage();

  root.innerHTML = '';
  root.appendChild(header(settings, openSettings));
  if (isYouTubeWatch(tab?.url)) {
    root.appendChild(onVideoView(tab, settings));
  } else {
    root.appendChild(offVideoView());
  }
  root.appendChild(footer({ onSettings, onHelp }));
}

main();
