// Verbex Welcome page.

import { getIcon, getLogo } from '../lib/icons.js';

const root = document.getElementById('root');
const VERSION = chrome.runtime.getManifest().version;
const isReturning = new URLSearchParams(location.search).get('returning') === '1';

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

function steps() {
  const data = [
    ['01', 'Open a video', 'Any youtube.com/watch URL — Shorts and Music skipped automatically.'],
    ['02', 'Click Transcript', "The button appears in YouTube's action row, native height, native shape."],
    ['03', 'Pick a format', 'TXT, SRT, or Markdown — saved instantly. Or copy straight to clipboard.'],
  ];
  return h('div', { class: 'steps' }, data.map(([n, t, s]) =>
    h('div', { class: 'step' }, [
      h('div', { class: 'n' }, n),
      h('div', { class: 't' }, t),
      h('div', { class: 's' }, s),
    ]),
  ));
}

function heroCard() {
  return h('div', { class: 'hero-card' }, [
    h('div', { class: 'chan' }, [
      h('div', { class: 'ava' }),
      h('div', { class: 'info' }, [
        h('div', { class: 'name' }, 'Sustained Focus'),
        h('div', { class: 'subs' }, '412K subscribers'),
      ]),
      h('button', { class: 'sub', type: 'button', disabled: 'disabled' }, 'Subscribe'),
    ]),
    h('div', { class: 'actions' }, [
      h('button', { class: 'hp', type: 'button', disabled: 'disabled', html: `${getIcon('check', { size: 18 })}<span>12K</span>` }),
      h('button', { class: 'hp', type: 'button', disabled: 'disabled', html: `${getIcon('link', { size: 18 })}<span>Share</span>` }),
      h('button', { class: 'hp', type: 'button', disabled: 'disabled', html: `${getIcon('download', { size: 18 })}<span>Save</span>` }),
      h('div', { style: { position: 'relative' } }, [
        h('button', { class: 'hp vx', type: 'button', disabled: 'disabled', html: `${getIcon('download', { size: 18 })}<span>Transcript</span><span class="dot"></span>` }),
        h('div', { class: 'anno' }, [
          h('div', { class: 'arrow' }),
          h('div', { class: 'label' }, 'injected here'),
        ]),
      ]),
    ]),
  ]);
}

function cta() {
  return h('div', { class: 'cta-row' }, [
    !isReturning && h('button', {
      class: 'vx-btn primary',
      type: 'button',
      onclick: () => chrome.tabs.create({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }),
      html: `${getIcon('play', { size: 14 })}<span style="margin-left:4px">Open a sample video</span>`,
    }),
    h('button', {
      class: 'vx-btn ghost',
      type: 'button',
      onclick: () => chrome.runtime.openOptionsPage(),
    }, [h('span', {}, 'Customize settings'), h('span', { style: { marginLeft: '4px' } }, '→')]),
  ]);
}

function foot() {
  return h('div', {}, [
    h('div', { class: 'foot' }, [
      h('span', {}, 'NO ACCOUNT'),
      h('span', {}, 'NO TRACKING'),
      h('span', {}, 'NO LIMITS'),
      h('span', {}, 'PERMISSIONS · activeTab · downloads · storage'),
    ]),
    h('div', { class: 'credit' }, [
      h('span', {}, 'Built by '),
      h('a', {
        href: 'https://anasvakyathodi.github.io/',
        target: '_blank',
        rel: 'noopener noreferrer',
      }, 'Anas Vakyathodi'),
      h('span', {}, ' · '),
      h('a', {
        href: 'https://github.com/anasvakyathodi',
        target: '_blank',
        rel: 'noopener noreferrer',
      }, 'GitHub'),
    ]),
  ]);
}

function main() {
  root.innerHTML = '';
  const wrap = h('div', { class: 'wrap' }, [
    h('div', { class: 'brand' }, [
      h('span', { html: getLogo({ size: 32 }) }),
      h('span', { class: 'wm' }, 'Verbex'),
      h('span', { class: 'ver' }, `v${VERSION}`),
    ]),
    h('h1', { class: 'hero', html: 'A transcript button on<br/>every YouTube video.' }),
    h('p', { class: 'lead' }, 'Click. Pick a format. File saved. No sketchy sites, no signup, no rate limits — Verbex lives inside YouTube and exports in TXT, SRT, or Markdown.'),
    heroCard(),
    steps(),
    cta(),
    foot(),
  ]);
  root.appendChild(wrap);
}

main();
