// Verbex page-bridge — runs in the YouTube page world. Reads the player
// response that YouTube embeds in the page, and posts it back to the content
// script via window.postMessage. Content scripts can't directly read page
// JS globals, so this thin shim is the supported way to bridge them.
(function () {
  const TAG = 'verbex.bridge.v1';

  function snapshot() {
    try {
      const r = window.ytInitialPlayerResponse;
      if (!r) return null;
      // Only forward the fields we care about — keeps the postMessage payload small.
      const captions = r.captions?.playerCaptionsTracklistRenderer || null;
      const details = r.videoDetails || null;
      const playerOverlays = r.playerOverlays?.playerOverlayRenderer || null;
      // Chapters can live in two places; capture both.
      const chaptersA = playerOverlays?.decoratedPlayerBarRenderer
        ?.decoratedPlayerBarRenderer?.playerBar
        ?.multiMarkersPlayerBarRenderer?.markersMap || null;
      return {
        captions: captions ? {
          captionTracks: captions.captionTracks || [],
          translationLanguages: captions.translationLanguages || [],
          defaultAudioTrackIndex: captions.defaultAudioTrackIndex ?? null,
        } : null,
        videoDetails: details ? {
          videoId: details.videoId,
          title: details.title,
          author: details.author,
          channelId: details.channelId,
          lengthSeconds: details.lengthSeconds,
          isLiveContent: !!details.isLiveContent,
        } : null,
        chaptersMap: chaptersA,
      };
    } catch (_) {
      return null;
    }
  }

  function post(payload) {
    window.postMessage({ source: TAG, payload }, '*');
  }

  // Reply immediately if the data is already there.
  const initial = snapshot();
  if (initial) post(initial);

  // Also respond to explicit pulls — handy after SPA nav.
  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    if (e?.data?.source !== 'verbex.host.v1') return;

    if (e.data.type === 'pull') {
      post(snapshot());
      return;
    }

    // Page-world fetch proxy. Routing caption fetches through the page
    // world is required: YouTube silently returns empty bodies when the
    // same URL is fetched from an extension's isolated world.
    if (e.data.type === 'fetch') {
      const { id, url } = e.data;
      try {
        const res = await fetch(url, { credentials: 'include' });
        const text = await res.text();
        window.postMessage({
          source: TAG, type: 'fetch-result',
          id, ok: res.ok, status: res.status, text,
        }, '*');
      } catch (err) {
        window.postMessage({
          source: TAG, type: 'fetch-result',
          id, ok: false, status: 0, error: String(err?.message || err),
        }, '*');
      }
      return;
    }
  });

  // ytInitialPlayerResponse is reassigned during SPA navigation. Poll briefly
  // after each yt-navigate-finish event to grab the fresh value.
  document.addEventListener('yt-navigate-finish', () => {
    let attempts = 0;
    const t = setInterval(() => {
      const snap = snapshot();
      attempts += 1;
      if (snap?.videoDetails?.videoId) {
        post(snap);
        clearInterval(t);
      } else if (attempts > 20) {
        clearInterval(t);
      }
    }, 150);
  });
})();
