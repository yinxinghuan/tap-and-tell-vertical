// Wait for remote media to be fully fetched + decoded by the browser BEFORE
// we swap the phase that renders them. Without this the user sees a freshly
// CDN-cached URL pop into the DOM and the <img> / <video> tag spends 0.5-3s
// downloading + decoding while the surrounding UI (tap hint, controls, etc)
// is already painted on top — looks like a broken/black screen with a
// floating "tap anywhere" hint.
//
// Both helpers resolve on SUCCESS and on FAILURE — we never block the UI
// flow on a hiccupping CDN. The downstream <img> / <video> tag will render
// whatever state it ends up in (blank → late-load is still better UX than
// hanging the loader indefinitely). Hard timeout makes that contract safe.

/**
 * Resolves when the image at `url` is fully fetched and decoded.
 * Uses HTMLImageElement.decode() when available (true "ready to paint"
 * signal) and falls back to load/error events on older engines.
 */
export function preloadImage(url: string, timeoutMs = 15000): Promise<void> {
  if (!url) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);

    const img = new Image();
    img.crossOrigin = ''; // platform R2 has no CORS; leave default
    img.src = url;

    if (typeof img.decode === 'function') {
      img.decode().then(
        () => { clearTimeout(timer); finish(); },
        () => { clearTimeout(timer); finish(); },
      );
    } else {
      img.onload = () => { clearTimeout(timer); finish(); };
      img.onerror = () => { clearTimeout(timer); finish(); };
    }
  });
}

/**
 * Resolves when enough of the video at `url` is buffered to play through
 * without re-buffering (canplaythrough event). On error/timeout the
 * downstream <video> tag will continue trying — we just stop blocking.
 */
export function preloadVideo(url: string, timeoutMs = 25000): Promise<void> {
  if (!url) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);

    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.src = url;

    const onReady = () => { clearTimeout(timer); finish(); };
    const onError = () => { clearTimeout(timer); finish(); };
    v.addEventListener('canplaythrough', onReady, { once: true });
    v.addEventListener('error', onError, { once: true });

    // Some Safari builds never fire canplaythrough for cross-origin MP4
    // without an active user gesture. canplay (lower bar — enough to start)
    // is a reasonable backup signal.
    v.addEventListener('canplay', onReady, { once: true });

    v.load();
  });
}
