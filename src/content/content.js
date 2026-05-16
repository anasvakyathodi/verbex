// Verbex content script — runs on www.youtube.com (except Shorts).
// Bootstraps the libs via dynamic import (web-accessible resources), then
// injects the action-row button, format menu, and toast system.

(async () => {
  if (!/^\/watch/.test(location.pathname)) {
    // Will be re-checked on SPA nav.
  }

  const url = (p) => chrome.runtime.getURL(p);
  const [icons, storage, transcriptMod, transcriptDom, formats, filenameMod] = await Promise.all([
    import(url('src/lib/icons.js')),
    import(url('src/lib/storage.js')),
    import(url('src/lib/transcript.js')),
    import(url('src/lib/transcript-dom.js')),
    import(url('src/lib/formats.js')),
    import(url('src/lib/filename.js')),
  ]);
  const { scrapeTranscriptFromPanel } = transcriptDom;

  const { getIcon, getLogo } = icons;
  const { getSettings } = storage;
  const {
    initPageBridge, waitForSnapshot, pullSnapshot, getSnapshotNow,
    listLanguages, pickTrack, fetchTrack, extractChapters, buildMeta,
  } = transcriptMod;
  const { toTxt, toSrt, toMarkdown, toClipboardText, wordCount, extForFormat, mimeForFormat } = formats;
  const { renderFilename } = filenameMod;

  initPageBridge();

  // ─────────────────────── DOM helpers ───────────────────────
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'aria') for (const [ak, av] of Object.entries(v)) el.setAttribute(`aria-${ak}`, av);
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    }
    return el;
  }

  function svgHtml(name, opts) {
    return getIcon(name, opts);
  }

  // ─────────────────────── State ───────────────────────
  const state = {
    settings: await getSettings(),
    snapshot: null,
    menu: null,
    button: null,
    languages: [],
    activeLanguage: null,
    busy: false,
    toastRoot: null,
    onlyLanguageNotice: false,
  };

  storage.onSettingsChange((changes) => {
    for (const k of Object.keys(changes)) {
      state.settings[k] = changes[k].newValue;
    }
  });

  // ─────────────────────── Button injection ───────────────────────
  const BUTTON_ID = 'vx-injected-root';

  function isWatchPage() {
    return location.hostname === 'www.youtube.com' && location.pathname === '/watch';
  }

  function findActionRow() {
    return (
      document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
      document.querySelector('ytd-menu-renderer.ytd-watch-metadata #top-level-buttons-computed') ||
      document.querySelector('#top-level-buttons-computed') ||
      document.querySelector('ytd-watch-metadata #actions-inner')
    );
  }

  function ensureButton() {
    if (!isWatchPage()) {
      removeButton();
      return;
    }
    if (document.getElementById(BUTTON_ID)) return;
    const row = findActionRow();
    if (!row) return;

    const host = h('div', { id: BUTTON_ID, class: 'vx-injected-host vx-host' });
    const btn = h('button', {
      class: 'vx-injected',
      type: 'button',
      title: 'Export this video\'s transcript (Verbex)',
      aria: { label: 'Export transcript', haspopup: 'menu', expanded: 'false' },
      html: `${svgHtml('download', { size: 18 })}<span>Transcript</span><span class="vx-mark-dot"></span>`,
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && !state.menu) {
        e.preventDefault();
        openMenu();
      }
    });
    host.appendChild(btn);
    row.appendChild(host);
    state.button = btn;

    maybeFirstRun(host, btn);
  }

  function removeButton() {
    const el = document.getElementById(BUTTON_ID);
    if (el) el.remove();
    state.button = null;
    closeMenu();
    closeFirstTip();
  }

  // ─────────────────────── First-run pulse + tooltip ───────────────────────
  function maybeFirstRun(host, btn) {
    if (state.settings.firstRunTooltipShown) return;
    btn.classList.add('vx-first-run');
    btn.addEventListener('animationend', () => btn.classList.remove('vx-first-run'), { once: true });

    const tip = h('div', { class: 'vx-first-tip', role: 'tooltip' }, [
      'Click to export this video\'s transcript',
      h('span', { class: 'x', role: 'button', 'aria-label': 'Dismiss', onclick: (e) => { e.stopPropagation(); closeFirstTip(); } }, '✕'),
    ]);
    host.appendChild(tip);
    state._firstTip = tip;
    setTimeout(closeFirstTip, 4500);
    storage.setSettings({ firstRunTooltipShown: true });
  }

  function closeFirstTip() {
    if (state._firstTip && state._firstTip.parentNode) {
      state._firstTip.parentNode.removeChild(state._firstTip);
    }
    state._firstTip = null;
  }

  // ─────────────────────── Format menu ───────────────────────
  function toggleMenu() {
    if (state.menu) closeMenu();
    else openMenu();
  }

  async function openMenu(opts = {}) {
    closeFirstTip();
    if (state.menu) return;
    if (!state.button) return;
    state.button.classList.add('is-open');
    state.button.setAttribute('aria-expanded', 'true');

    const host = h('div', { class: 'vx-menu-host vx-host', role: 'menu' });
    state.menu = host;
    document.body.appendChild(host);
    positionMenu();

    // Pre-fetch snapshot (don't await — render the menu now, update when ready).
    let snap = getSnapshotNow();
    if (!snap?.videoDetails?.videoId) pullSnapshot();

    renderMenu({ stage: opts.stage || 'default' });

    // Listen for outside clicks, esc, scroll.
    setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onKeydown, true);
      window.addEventListener('scroll', onScrollClose, true);
      window.addEventListener('resize', positionMenu);
    }, 0);

    // Try to fetch the snapshot in the background for any state checks.
    waitForSnapshot(3500).then((s) => {
      state.snapshot = s;
      const langs = listLanguages(s);
      state.languages = langs;
      const activeLang = pickTrack(s, state.settings);
      state.activeLanguage = activeLang;
      state.onlyLanguageNotice = computeLanguageNotice(s, activeLang);
      // If menu's still default-ish, re-render to surface notice.
      if (['default'].includes(getStage())) renderMenu({ stage: 'default' });
    }).catch(() => {
      // No snapshot — show no-transcript state if there are no tracks.
      const cur = getStage();
      if (cur === 'default') renderMenu({ stage: 'no-transcript' });
    });

    // Focus the first row for keyboard users.
    requestAnimationFrame(() => {
      const first = host.querySelector('[data-row]');
      first?.focus({ preventScroll: true });
    });
  }

  function getStage() {
    return state.menu?.dataset?.stage || 'default';
  }

  function closeMenu() {
    if (!state.menu) return;
    state.menu.remove();
    state.menu = null;
    if (state.button) {
      state.button.classList.remove('is-open');
      state.button.setAttribute('aria-expanded', 'false');
    }
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('scroll', onScrollClose, true);
    window.removeEventListener('resize', positionMenu);
  }

  function onOutside(e) {
    if (!state.menu) return;
    if (state.menu.contains(e.target)) return;
    if (state.button && state.button.contains(e.target)) return;
    closeMenu();
  }

  function onKeydown(e) {
    if (!state.menu) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      state.button?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...state.menu.querySelectorAll('[data-row]')];
      if (!rows.length) return;
      const idx = rows.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? rows[(idx + 1 + rows.length) % rows.length]
        : rows[(idx - 1 + rows.length) % rows.length];
      next.focus();
    }
  }

  function onScrollClose() {
    positionMenu();
  }

  function positionMenu() {
    if (!state.menu || !state.button) return;
    const r = state.button.getBoundingClientRect();
    const top = r.bottom + 8;
    let left = r.left;
    const menuRect = state.menu.getBoundingClientRect();
    const overflow = (left + menuRect.width) - (window.innerWidth - 12);
    if (overflow > 0) left -= overflow;
    if (left < 8) left = 8;
    state.menu.style.top = `${Math.round(top)}px`;
    state.menu.style.left = `${Math.round(left)}px`;
  }

  // Stage = 'default' | 'language-picker' | 'no-transcript' | 'working-<fmt>' | 'success-<fmt>'
  function renderMenu({ stage }) {
    if (!state.menu) return;
    state.menu.dataset.stage = stage;
    state.menu.innerHTML = '';

    if (stage === 'no-transcript') {
      const menu = h('div', { class: 'vx-menu', style: { width: '320px' } }, [
        h('div', { class: 'vx-empty' }, [
          h('div', { class: 'ic', html: svgHtml('alert', { size: 20 }) }),
          h('div', { class: 't' }, 'No transcript yet'),
          h('div', { class: 's' }, "This video doesn't have captions available. The creator may not have published them yet — try again later."),
        ]),
        h('div', { class: 'vx-empty-actions' }, [
          h('button', { class: 'vx-mini-btn', 'data-row': '1', type: 'button', onclick: closeMenu }, 'Got it'),
        ]),
      ]);
      state.menu.appendChild(menu);
      positionMenu();
      requestAnimationFrame(() => state.menu.querySelector('[data-row]')?.focus());
      return;
    }

    if (stage === 'language-picker') {
      const langs = state.languages || [];
      const menu = h('div', { class: 'vx-menu', style: { width: '300px' } });
      menu.appendChild(h('div', { class: 'vx-menu-header' }, [
        h('span', { style: { flex: '1' } }, 'Available languages'),
        h('span', { style: { color: 'var(--vx-fg-dim)' } }, String(langs.length || 0)),
      ]));
      if (!langs.length) {
        menu.appendChild(h('div', { class: 'vx-menu-row is-dim' }, [
          h('span', { class: 'icon' }),
          h('span', { class: 'label' }, 'No languages available'),
        ]));
      } else {
        for (const lang of langs) {
          const isActive = state.activeLanguage && lang.baseUrl === state.activeLanguage.baseUrl;
          const row = h('button', {
            class: `vx-menu-row ${isActive ? 'is-active' : ''}`,
            type: 'button',
            'data-row': '1',
            onclick: () => {
              state.activeLanguage = lang;
              state.onlyLanguageNotice = false;
              renderMenu({ stage: 'default' });
            },
          }, [
            h('span', { class: 'icon', html: isActive ? svgHtml('check', { size: 16 }) : '<span style="width:16px;display:inline-block"></span>' }),
            h('span', { class: 'label' }, lang.name || lang.languageCode || 'Unknown'),
            h('span', { class: 'meta' }, lang.kind === 'auto' ? 'auto' : 'human'),
          ]);
          menu.appendChild(row);
        }
      }
      menu.appendChild(h('div', { class: 'vx-menu-divider' }));
      menu.appendChild(h('button', {
        class: 'vx-menu-row',
        type: 'button',
        'data-row': '1',
        style: { color: 'var(--vx-fg-muted)' },
        onclick: () => renderMenu({ stage: 'default' }),
      }, [
        h('span', { class: 'icon', html: svgHtml('arrowRight', { size: 16 }) }),
        h('span', { class: 'label', style: { fontSize: '12.5px' } }, 'Back to export options'),
      ]));
      state.menu.appendChild(menu);
      positionMenu();
      requestAnimationFrame(() => state.menu.querySelector('[data-row]')?.focus());
      return;
    }

    // Default / working / success
    const menu = h('div', { class: 'vx-menu' });
    const meta = state.snapshot?.videoDetails;
    const dur = meta?.lengthSeconds ? fmtDur(parseInt(meta.lengthSeconds, 10)) : '';
    const header = h('div', { class: 'vx-menu-header' }, [
      h('span', { html: getLogo({ size: 14, radius: 4 }) }),
      h('span', { style: { flex: '1' } }, 'Export transcript'),
      h('span', { class: 'dur' }, dur),
    ]);
    menu.appendChild(header);

    if (state.onlyLanguageNotice) {
      const notice = h('div', { class: 'vx-notice' }, [
        h('span', { html: svgHtml('language', { size: 14 }) }),
        h('span', { style: { flex: '1' } }, [
          'Only ',
          h('b', {}, state.activeLanguage?.name || 'this language'),
          ' available',
        ]),
        h('button', {
          class: 'change',
          type: 'button',
          'data-row': '1',
          onclick: () => renderMenu({ stage: 'language-picker' }),
        }, 'Change'),
      ]);
      menu.appendChild(notice);
    }

    const rows = [
      { id: 'clip', icon: 'copy', label: 'Copy to clipboard', sub: 'Ready to paste anywhere' },
      { id: 'txt', icon: 'file', label: 'Download .txt', sub: 'Plain text with timestamps' },
      { id: 'srt', icon: 'file', label: 'Download .srt', sub: 'Subtitle / caption file' },
      { id: 'md', icon: 'file', label: 'Download .md', sub: 'Markdown with chapter headings' },
    ];

    const working = stage.startsWith('working-') ? stage.slice('working-'.length) : null;
    const success = stage.startsWith('success-') ? stage.slice('success-'.length) : null;
    const lastUsed = state.settings.defaultFormat;

    for (const r of rows) {
      const isWorking = working === r.id;
      const isSuccess = success === r.id;
      const isDim = (working || success) && !isWorking && !isSuccess;
      const classes = `vx-menu-row ${lastUsed === r.id && !working && !success ? 'is-active' : ''} ${isDim ? 'is-dim' : ''} ${isWorking ? 'is-working' : ''} ${isSuccess ? 'is-success' : ''}`;
      const iconHtml = isWorking
        ? '<span class="vx-spinner"></span>'
        : isSuccess
          ? svgHtml('check', { size: 16 })
          : svgHtml(r.icon, { size: 16 });

      const row = h('button', {
        class: classes,
        type: 'button',
        'data-row': '1',
        'data-id': r.id,
        disabled: working || success ? 'disabled' : null,
        onclick: () => onPickFormat(r.id),
      }, [
        h('span', { class: 'icon', html: iconHtml }),
        h('span', { class: 'label' }, [
          h('div', {}, r.label),
          r.sub ? h('div', { class: 'sub' }, r.sub) : null,
        ]),
        lastUsed === r.id && !working && !success ? h('span', { class: 'vx-badge' }, 'Last used') : null,
      ]);
      menu.appendChild(row);
    }

    menu.appendChild(h('div', { class: 'vx-menu-divider' }));

    menu.appendChild(h('button', {
      class: 'vx-menu-row',
      type: 'button',
      'data-row': '1',
      onclick: () => {
        chrome.runtime.sendMessage({ type: 'verbex.open-settings' });
        closeMenu();
      },
    }, [
      h('span', { class: 'icon', html: svgHtml('gear', { size: 16 }) }),
      h('span', { class: 'label' }, 'Settings'),
      h('span', { class: 'meta' }, isMac() ? '⌘,' : 'Ctrl+,'),
    ]));

    state.menu.appendChild(menu);
    positionMenu();
  }

  function isMac() {
    return /Mac|iPhone|iPad/.test(navigator.platform || '');
  }

  function fmtDur(sec) {
    if (!sec || isNaN(sec)) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  }

  function computeLanguageNotice(snap, picked) {
    if (!picked) return false;
    if (state.settings.languageMode === 'auto') return false;
    // Notice if user wanted a specific language and we couldn't match it.
    return !picked.languageCode?.startsWith(state.settings.languageMode);
  }

  // ─────────────────────── Picking a format ───────────────────────
  async function onPickFormat(id) {
    if (state.busy) return;
    state.busy = true;
    renderMenu({ stage: `working-${id}` });

    try {
      const snap = state.snapshot || await waitForSnapshot(3500);
      state.snapshot = snap;
      const track = state.activeLanguage || pickTrack(snap, state.settings);
      if (!track) throw new Error('NO_TRANSCRIPT');
      state.activeLanguage = track;

      let segments;
      try {
        segments = await fetchTrack(track);
      } catch (fe) {
        console.warn('[Verbex] caption API empty — falling back to DOM scrape', fe);
        try {
          segments = await scrapeTranscriptFromPanel({ timeoutMs: 9000 });
          // Stamp the picked track's language on the meta even though the
          // segments came from the DOM.
        } catch (de) {
          console.error('[Verbex] DOM scrape also failed:', de);
          // Last-ditch: try other language tracks via the API.
          const langs = listLanguages(snap);
          const others = langs.filter((l) => l.baseUrl !== track.baseUrl);
          for (const l of others) {
            try {
              const s = await fetchTrack(l);
              if (s.length) { segments = s; state.activeLanguage = l; break; }
            } catch (e2) { /* try next */ }
          }
          if (!segments?.length) throw fe;
        }
      }
      if (!segments.length) throw new Error('NO_TRANSCRIPT');

      const chapters = extractChapters(snap);
      const meta = buildMeta(snap, track);

      const opts = {
        includeTimestamps: state.settings.includeTimestamps,
        granularity: state.settings.timestampGranularity,
        includeChapterMarkers: state.settings.includeChapterMarkers,
      };

      if (id === 'clip') {
        const text = toClipboardText(segments, meta, chapters, opts);
        await navigator.clipboard.writeText(text);
        renderMenu({ stage: `success-${id}` });
        setTimeout(() => {
          closeMenu();
          showToast({ kind: 'info', icon: 'copy', title: 'Transcript copied', sub: `${wordCount(segments).toLocaleString()} words · ready to paste` });
        }, 220);
        await recordExport(meta, 'clip');
        state.busy = false;
        return;
      }

      let content;
      if (id === 'txt') content = toTxt(segments, meta, chapters, opts);
      else if (id === 'srt') content = toSrt(segments, meta, chapters, opts);
      else if (id === 'md') content = toMarkdown(segments, meta, chapters, opts);

      const ext = extForFormat(id);
      const filename = renderFilename(state.settings.filenameTemplate, {
        channel: meta.channel,
        title: meta.title,
        videoId: meta.videoId,
      }, ext);

      const mime = mimeForFormat(id);
      let downloadOk = false;
      let downloadErr = null;
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'verbex.download',
          filename,
          mime,
          format: id,
          content,
        });
        if (resp?.ok) downloadOk = true;
        else downloadErr = new Error(resp?.error || 'Service worker returned no response');
      } catch (e) {
        downloadErr = e instanceof Error ? e : new Error(String(e));
      }

      if (!downloadOk) {
        // Fallback: do the download from the page via Blob + <a download>.
        // This always works in content scripts, regardless of MV3 service-worker quirks.
        try {
          downloadInPage(filename, content, mime);
          downloadOk = true;
          downloadErr = null;
        } catch (e) {
          downloadErr = e instanceof Error ? e : new Error(String(e));
        }
      }

      if (!downloadOk) throw downloadErr || new Error('Download failed');

      renderMenu({ stage: `success-${id}` });
      setTimeout(() => {
        closeMenu();
        showToast({ kind: 'success', icon: 'check', title: 'Transcript downloaded', sub: filename, action: { label: 'Open', onClick: () => chrome.runtime.sendMessage({ type: 'verbex.open-url', url: `chrome://downloads/` }) } });
      }, 220);
      await recordExport(meta, id);
    } catch (err) {
      const msg = err?.message || 'Unknown error';
      console.error('[Verbex] export failed:', err);
      if (msg === 'NO_TRANSCRIPT' || msg === 'NO_TRANSCRIPT_BUTTON') {
        renderMenu({ stage: 'no-transcript' });
      } else if (msg.startsWith('CAPTION_FETCH_EMPTY')) {
        renderMenu({ stage: 'default' });
        showToast({
          kind: 'error', icon: 'alert',
          title: 'YouTube returned no caption data',
          sub: 'Try reloading the page, then click Transcript again.',
          action: { label: 'Reload', onClick: () => location.reload() },
        });
      } else {
        renderMenu({ stage: 'default' });
        showToast({ kind: 'error', icon: 'alert', title: "Couldn't export transcript", sub: msg.slice(0, 120), action: { label: 'Retry', onClick: () => onPickFormat(id) } });
      }
    } finally {
      state.busy = false;
    }
  }

  function downloadInPage(filename, content, mime) {
    const baseMime = (mime || 'text/plain').split(';')[0].trim() || 'text/plain';
    const blob = new Blob([content], { type: `${baseMime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  }

  async function recordExport(meta, format) {
    try {
      await chrome.runtime.sendMessage({
        type: 'verbex.record-export',
        entry: {
          videoId: meta.videoId,
          title: meta.title,
          channel: meta.channel,
          format,
          at: Date.now(),
        },
      });
    } catch {}
  }

  // ─────────────────────── Toasts ───────────────────────
  function ensureToastRoot() {
    if (state.toastRoot && document.body.contains(state.toastRoot)) return state.toastRoot;
    const r = h('div', { class: 'vx-toast-stack vx-host', 'aria-live': 'polite' });
    document.body.appendChild(r);
    state.toastRoot = r;
    return r;
  }

  function showToast({ kind = 'info', icon = 'check', title, sub, action, durationMs }) {
    const root = ensureToastRoot();
    const toast = h('div', { class: `vx-toast is-${kind}`, role: 'status' }, [
      h('div', { class: 'icon-wrap', html: svgHtml(icon, { size: 14 }) }),
      h('div', { class: 'body' }, [
        h('div', { class: 't' }, title || ''),
        sub ? h('div', { class: 's' }, sub) : null,
      ]),
      action ? h('button', { class: 'act', type: 'button', onclick: () => { action.onClick?.(); dismiss(); } }, action.label) : null,
      h('button', { class: 'close-x', 'aria-label': 'Dismiss', type: 'button', onclick: dismiss, html: svgHtml('close', { size: 14 }) }),
    ]);
    root.appendChild(toast);

    const dur = durationMs ?? (kind === 'error' ? 5000 : 3000);
    const t = setTimeout(dismiss, dur);
    function dismiss() {
      clearTimeout(t);
      toast.classList.add('is-out');
      setTimeout(() => toast.remove(), 200);
    }
    return dismiss;
  }

  // ─────────────────────── SPA nav handling ───────────────────────
  let lastUrl = location.href;
  function onMaybeNav() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    closeMenu();
    closeFirstTip();
    removeButton();
    state.snapshot = null;
    state.activeLanguage = null;
    state.languages = [];
    pullSnapshot();
    setTimeout(ensureButton, 200);
  }

  document.addEventListener('yt-navigate-finish', onMaybeNav);
  document.addEventListener('yt-page-data-updated', onMaybeNav);
  window.addEventListener('popstate', onMaybeNav);

  const moTarget = document.body || document.documentElement;
  const mo = new MutationObserver(() => {
    if (location.href !== lastUrl) onMaybeNav();
    if (isWatchPage() && !document.getElementById(BUTTON_ID)) ensureButton();
  });
  mo.observe(moTarget, { childList: true, subtree: true });

  // Keyboard shortcut from background, or popup export request
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'verbex.shortcut-export') {
      handleShortcut();
      sendResponse?.({ ok: true });
    } else if (msg?.type === 'verbex.popup-export') {
      if (msg.format === 'menu') {
        openMenu();
      } else {
        handleShortcut(msg.format);
      }
      sendResponse?.({ ok: true });
    }
  });

  async function handleShortcut(forceFormat) {
    if (!isWatchPage()) return;
    if (state.busy) return;
    const fmt = forceFormat || state.settings.defaultFormat || 'txt';
    // Trigger the export directly without opening the in-page menu — the
    // toast is enough feedback when the user is acting from the popup or
    // keyboard shortcut.
    onPickFormat(fmt);
  }

  // Initial inject
  ensureButton();
  // Retry a few times in case the action row mounts late.
  let retries = 0;
  const tick = setInterval(() => {
    retries += 1;
    ensureButton();
    if (document.getElementById(BUTTON_ID) || retries > 30) clearInterval(tick);
  }, 250);
})();
