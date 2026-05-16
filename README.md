# Verbex — YouTube Transcript Exporter

A free Chrome extension (Manifest V3) that adds a **Transcript** button to every
YouTube watch page. Click → pick a format (TXT / SRT / Markdown / Clipboard) →
done. No signup, no rate limits, no AI bills.

This is the **v1.0 MVP** — pure transcript export. AI features (Ask AI, Quote
Cards, Smart Chapters, Library) live behind v1.1+ phases per the design.

---

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this project's root folder (the one containing `manifest.json`).
5. The welcome tab opens automatically.
6. Navigate to any `youtube.com/watch?v=…` page — the button appears in the
   action row alongside Share / Save / etc.

---

## Project layout

```
verbex/
├── manifest.json
├── README.md
└── src/
    ├── background/
    │   └── service-worker.js          # downloads, install hook, command shortcut
    ├── content/
    │   ├── content.js                 # button injection + menu + toast on YouTube
    │   ├── content.css                # scoped .vx-* styles
    │   └── page-bridge.js             # page-world script (reads ytInitialPlayerResponse)
    ├── popup/
    │   └── popup.{html,css,js}        # 360px toolbar popup
    ├── options/
    │   └── options.{html,css,js}      # full-page settings
    ├── welcome/
    │   └── welcome.{html,css,js}      # first-run page
    ├── lib/
    │   ├── transcript.js              # fetch + parse YouTube caption tracks
    │   ├── formats.js                 # TXT / SRT / MD converters
    │   ├── storage.js                 # chrome.storage.sync wrapper
    │   ├── filename.js                # {channel}/{title}/{date}/{videoId} template
    │   └── icons.js                   # inline SVG icon set + brand mark
    └── assets/
        ├── styles/
        │   ├── tokens.css             # design tokens (vx-*)
        │   └── base.css               # buttons / radios / toggles / kbd
        └── icons/
            ├── icon.svg               # source mark
            ├── icon-16.png
            ├── icon-32.png
            ├── icon-48.png
            └── icon-128.png
```

---

## Features (v1.0 scope)

- **Native-feeling injection** — the button sits in YouTube's action row at
  36 px height with the same pill shape, inheriting Roboto from the page.
- **Three export formats** — TXT, SRT, Markdown — plus copy-to-clipboard.
- **Chapter-aware exports** — YouTube's chapter markers become headers in MD,
  `NOTE Chapter — …` blocks in SRT, and `## chapter [mm:ss]` sections in TXT.
- **Language picker** — surfaces all available caption tracks and a
  human-vs-auto preference.
- **Settings page** — default format, timestamp granularity (every line / 10s /
  30s / chapter only), filename template, language preference, keyboard shortcut.
- **Toolbar popup** — current-video card, recent exports, off-YouTube empty state.
- **Welcome page** — annotated hero, three-step explainer, sample-video CTA.
- **Toasts** — success / copied / error (with Retry) / preparing.
- **Keyboard shortcut** — `Ctrl/Cmd + Shift + Y` (configurable at
  `chrome://extensions/shortcuts`) exports in the default format.
- **Accessibility** — focus rings, arrow-key menu navigation, ARIA roles,
  `prefers-reduced-motion` respected.

---

## Design system

All tokens mirror the Claude Design handoff bundle (`styles.css`):

- Accent — `oklch(0.72 0.17 290)` — electric violet, distinct from YouTube red.
- Fonts — Manrope (sans) + JetBrains Mono (mono), loaded from Google Fonts.
- Surfaces — `#0a0a0b → #26262b` dark-first; light tokens defined under `.vx-light`.
- Pill — 36 px height, 18 px radius — matches YouTube's native action button.

See `src/assets/styles/tokens.css` for the full token list.

---

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the YouTube tab's DOM when the user clicks. |
| `downloads` | Save the exported file. |
| `storage` | Persist settings + recent-exports list. |
| `host_permissions: *://*.youtube.com/*` | Scoped to YouTube only. No "read and change all your data on websites" warning. |

---

## How the transcript fetch works

1. The content script injects `page-bridge.js` into the YouTube page world.
2. The bridge reads `window.ytInitialPlayerResponse` and posts the relevant
   slice (caption tracks, video details, chapters) back via `window.postMessage`.
3. The content script picks a caption track based on user settings (language +
   human-vs-auto), then fetches `track.baseUrl + '&fmt=json3'` — YouTube's
   timed-text JSON endpoint.
4. The JSON is normalised into `{ start, end, text }` segments and run through
   the format converters in [`src/lib/formats.js`](src/lib/formats.js).
5. The file is sent to the service worker, which calls `chrome.downloads.download`
   with a data URL.

No third-party services, no LLM APIs, no server. The user's existing YouTube
session does all the heavy lifting.

---

## Verifying end-to-end

A short manual checklist:

1. Open `chrome://extensions`, **Developer mode** on, **Load unpacked** → pick this folder.
2. Welcome tab opens. Close it or click "Open a sample video".
3. On any `youtube.com/watch?v=…`, the **Transcript** pill appears next to
   Share / Save. First time only: one bounce + a 4-second tooltip.
4. Click → format menu opens, anchored under the pill, with `.txt` (default)
   showing the "Last used" badge.
5. Pick `.txt` → spinner in row → check → menu closes → bottom-right toast →
   file in Downloads named like `Channel — Title.txt`.
6. Pick **Copy to clipboard** on a different video → info toast confirms.
7. Try a video with no captions → in-menu "No transcript yet" empty state
   (not a toast, per spec §4.4).
8. Open the toolbar popup on a video — current-video card + recent exports.
9. Open the toolbar popup off YouTube — empty state with **Open YouTube** CTA.
10. Open Settings → change default to `.md` → switch the granularity pill →
    return to a video → "Last used" badge has moved to `.md`.
11. Set the shortcut at `chrome://extensions/shortcuts` → press it on any
    video → instant download in the default format.

---

## What's not built (intentionally)

Per the spec's `§13 Out of Scope` and the design's v1.1/v1.2/v2 phase labels,
none of the following ship in v1.0:

- AI summarisation, Ask AI, Quote Cards, Smart Chapters, Library.
- Notion / Google Docs / Obsidian integrations.
- Bulk channel or playlist export.
- Mobile, Firefox, Safari.
- Analytics dashboards, user accounts.

These map cleanly onto the design's later artboards (19–27); the architecture
here makes them straightforward to layer on without rewriting v1.0.

---

## Support

If Verbex saves you time, you can buy me a coffee:
**[paypal.me/anasvakyathodi](https://paypal.me/anasvakyathodi)**

Not required, not asked for inside the extension — just appreciated.

---

Built by **[Anas Vakyathodi](https://anasvakyathodi.github.io/)** ·
[GitHub](https://github.com/anasvakyathodi) ·
[PayPal](https://paypal.me/anasvakyathodi)
