// Verbex background service worker (MV3 module).

import { getSettings, setSettings, DEFAULTS, recordExport } from '../lib/storage.js';
import { mimeForFormat } from '../lib/formats.js';

const WELCOME_URL = chrome.runtime.getURL('src/welcome/welcome.html');

// ───────────────────────── Install / update ─────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // Seed defaults for any missing keys; preserve existing on update.
  const cur = await getSettings();
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (cur[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await setSettings(patch);

  if (details.reason === 'install') {
    chrome.tabs.create({ url: WELCOME_URL, active: false }).catch(() => {});
  }
});

// ───────────────────────── Downloads ─────────────────────────

async function saveText({ filename, mime, content }) {
  // Normalize mime — don't double-stamp charset.
  const baseMime = (mime || 'text/plain').split(';')[0].trim() || 'text/plain';
  const dataUrl = `data:${baseMime};charset=utf-8;base64,${b64utf8(content)}`;
  return new Promise((resolve, reject) => {
    try {
      chrome.downloads.download(
        { url: dataUrl, filename, conflictAction: 'uniquify', saveAs: false },
        (id) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || 'downloads.download failed'));
          if (!id) return reject(new Error('No download id returned'));
          resolve(id);
        },
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ───────────────────────── Messages from content / popup ─────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'verbex.download') {
    const mime = msg.mime || mimeForFormat(msg.format);
    saveText({ filename: msg.filename, mime, content: msg.content })
      .then((id) => sendResponse({ ok: true, id }))
      .catch((err) => {
        const message = err?.message || String(err) || 'Download failed';
        console.error('[Verbex] download failed:', message);
        sendResponse({ ok: false, error: message });
      });
    return true; // async
  }

  if (msg.type === 'verbex.record-export') {
    recordExport(msg.entry).then((list) => sendResponse({ ok: true, list }));
    return true;
  }

  if (msg.type === 'verbex.open-welcome') {
    chrome.tabs.create({ url: WELCOME_URL });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'verbex.open-settings') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'verbex.open-url') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return;
  }
});

// ───────────────────────── Keyboard command ─────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'export-transcript') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (!/^https?:\/\/www\.youtube\.com\/watch/.test(tab.url || '')) {
    // No-op off YouTube — but surface a tooltip via badge briefly.
    flashBadge(tab.id, '!');
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'verbex.shortcut-export' }).catch(() => {});
});

function flashBadge(tabId, text) {
  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#a78bfa' });
    chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 1500);
  } catch {}
}
