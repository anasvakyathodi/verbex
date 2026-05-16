# Verbex — Privacy Policy

**Effective: 2026-05-16**

## TL;DR

Verbex collects no personal data. Nothing leaves your device. We have no
servers, no analytics, no telemetry, and no third-party tracking.

---

## What Verbex stores locally

Verbex saves the following on your own device using Chrome's built-in
`chrome.storage.sync` API (Chrome syncs this via your own Google Account
between your signed-in browsers, never to Verbex's developer):

1. **Your preferences** — default export format (TXT / SRT / Markdown /
   clipboard), timestamp on/off, timestamp granularity, filename template,
   preferred caption language, human-vs-auto caption preference, and a flag
   for whether you have seen the first-run tooltip.
2. **Your recent-exports list** (maximum 12 entries) — for each export, the
   YouTube video ID, the video's title, the channel name, the format you
   chose, and the timestamp of the export, so that you can re-open recent
   transcripts from the toolbar popup.

This data:

- never leaves the Chrome sync storage tied to your own Google Account
- is never transmitted to Verbex, the developer, or any third party
- is not accessible from any external server (Verbex has no backend)

---

## What Verbex does NOT collect

- No name, email, phone number, age, address, or other personally
  identifiable information
- No health, financial, or authentication credentials
- No location, IP address, or device identifiers
- No analytics events, telemetry, crash reports, or usage metrics
- No reading of any tab other than the YouTube tab you explicitly invoke
  Verbex on
- No cookies, fingerprinting, or advertising identifiers

---

## Permissions and what they're used for

| Permission | Purpose |
|---|---|
| `activeTab` | Read the DOM of the YouTube tab you are currently viewing when you click the Verbex button, the toolbar popup, or the keyboard shortcut. Used to locate the caption track URL and read the rendered transcript panel. |
| `downloads` | Save the exported transcript file (.txt, .srt, or .md) to your Downloads folder using `chrome.downloads.download`. Triggered only when you explicitly pick a format. |
| `storage` | Persist your preferences and the local recent-exports list described above. |
| `host_permissions: *://*.youtube.com/*` | Required so the content script can inject the Transcript button into the YouTube watch page action row. Scoped to YouTube only — Verbex never accesses any other website. |

---

## Third parties

None. Verbex makes no requests to any server operated by its developer. The
only external network requests are:

- **Google Fonts** — Manrope and JetBrains Mono typeface files are fetched
  from `fonts.googleapis.com` for typography rendering inside Verbex's own
  popup, settings, and welcome pages. These are CSS and font files (no
  JavaScript), and the requests carry only the standard browser font fetch
  with no Verbex identifiers attached.
- **YouTube** — the user's existing YouTube session is used to read the
  current video's transcript data. No additional credentials, tokens, or
  user identifiers are sent.

---

## Wiping your data

- Open Verbex's **Settings** page → click **Reset all settings** to delete
  every stored preference and the recent-exports list immediately.
- Or uninstall Verbex from `chrome://extensions` — that removes all
  associated storage automatically.

---

## Changes to this policy

Material changes to this policy will be reflected in a new "Effective" date
above. The current version always lives at the public URL referenced in
Verbex's Chrome Web Store listing.

---

## Contact

Verbex is built by **Anas Vakyathodi**.

- Portfolio: <https://anasvakyathodi.github.io/>
- GitHub: <https://github.com/anasvakyathodi>

For questions about this policy or to report a privacy issue, please file
an issue on the GitHub profile above.
