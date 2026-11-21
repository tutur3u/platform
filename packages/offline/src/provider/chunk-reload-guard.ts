/**
 * Recovers a page whose code chunks disappeared under it.
 *
 * A deploy replaces a route family's static assets. A page rendered by the
 * previous version still references the old chunk names, so its next lazy
 * import (or a script tag injected during navigation) 404s and the page lands
 * on the error boundary. A single full reload fetches HTML and chunks from the
 * same, current version. The reload is rate limited per tab so a chunk that is
 * genuinely missing from the current version cannot cause a reload loop.
 */

const RELOAD_STAMP_KEY = 'tuturuuu:chunk-reload-at';
/** At most one automatic reload per tab in this window. */
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

const CHUNK_ERROR_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading (?:CSS )?chunk [\w-]+ failed/iu;

/** Same-origin build output: Web's `/_next/static/` or a family's `/_f/<id>/`. */
const BUILD_ASSET_PATH = /^\/(?:_f\/[a-z0-9-]+\/)?_next\/static\//u;

export function isChunkLoadErrorMessage(message: unknown): boolean {
  return typeof message === 'string' && CHUNK_ERROR_MESSAGE.test(message);
}

export function isBuildAssetUrl(src: string, origin: string): boolean {
  try {
    const url = new URL(src, origin);
    return url.origin === origin && BUILD_ASSET_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

function errorMessage(reason: unknown): unknown {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === 'string') return reason;
  return (reason as { message?: unknown } | null)?.message;
}

interface GuardEnvironment {
  window: Window;
  now?: () => number;
  reload?: () => void;
}

/**
 * Reloads once when a build chunk fails to load. Returns the uninstaller.
 */
export function installChunkReloadGuard({
  window: win,
  now = Date.now,
  reload = () => win.location.reload(),
}: GuardEnvironment): () => void {
  const tryReload = () => {
    let last = 0;
    try {
      last = Number(win.sessionStorage.getItem(RELOAD_STAMP_KEY)) || 0;
    } catch {}
    const at = now();
    if (at - last < CHUNK_RELOAD_WINDOW_MS) return;
    try {
      win.sessionStorage.setItem(RELOAD_STAMP_KEY, String(at));
    } catch {
      // Without storage there is no loop guard; do not reload.
      return;
    }
    reload();
  };

  // Vite's preload helper reports a failed dynamic import here.
  const onPreloadError = (event: Event) => {
    event.preventDefault();
    tryReload();
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadErrorMessage(errorMessage(event.reason))) tryReload();
  };
  // Resource load failures do not bubble; listen in the capture phase.
  const onError = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target && target !== (win as unknown)) {
      const link = target as HTMLLinkElement;
      const src =
        target.tagName === 'SCRIPT'
          ? (target as HTMLScriptElement).src
          : target.tagName === 'LINK' &&
              (link.rel === 'stylesheet' || link.rel === 'modulepreload')
            ? link.href
            : '';
      if (src && isBuildAssetUrl(src, win.location.origin)) tryReload();
      return;
    }
    if (isChunkLoadErrorMessage((event as ErrorEvent).message)) tryReload();
  };

  win.addEventListener('vite:preloadError', onPreloadError);
  win.addEventListener('unhandledrejection', onRejection);
  win.addEventListener('error', onError, true);
  return () => {
    win.removeEventListener('vite:preloadError', onPreloadError);
    win.removeEventListener('unhandledrejection', onRejection);
    win.removeEventListener('error', onError, true);
  };
}
