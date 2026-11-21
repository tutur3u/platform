// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_WINDOW_MS,
  installChunkReloadGuard,
  isBuildAssetUrl,
  isChunkLoadErrorMessage,
} from './chunk-reload-guard';

const ORIGIN = 'https://tuturuuu.com';

function setup(start = 1_000_000) {
  let clock = start;
  const reload = vi.fn();
  const uninstall = installChunkReloadGuard({
    window,
    now: () => clock,
    reload,
  });
  return {
    reload,
    uninstall,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function failScript(src: string) {
  const script = document.createElement('script');
  script.src = src;
  document.head.append(script);
  script.dispatchEvent(new Event('error'));
  script.remove();
}

afterEach(() => {
  sessionStorage.clear();
});

describe('chunk error detection', () => {
  it.each([
    'TypeError: Failed to fetch dynamically imported module: https://tuturuuu.com/_f/dashboard/_next/static/chunks/Co2UefxK.js',
    'TypeError: Importing a module script failed.',
    'ChunkLoadError: Loading chunk 123 failed.',
    'Error: Unable to preload CSS for /_f/dashboard/_next/static/css/a.css',
  ])('recognises %s', (message) => {
    expect(isChunkLoadErrorMessage(message)).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadErrorMessage('TypeError: x is undefined')).toBe(false);
    expect(isChunkLoadErrorMessage(undefined)).toBe(false);
  });

  it.each([
    [`${ORIGIN}/_next/static/chunks/a.js`, true],
    [`${ORIGIN}/_f/dashboard/_next/static/chunks/a.js`, true],
    [`${ORIGIN}/tasks/assets/index-abc.js`, false],
    ['https://cdn.example/_next/static/chunks/a.js', false],
  ])('classifies %s as a build asset: %s', (src, expected) => {
    expect(isBuildAssetUrl(src, ORIGIN)).toBe(expected);
  });
});

describe('installChunkReloadGuard', () => {
  it('reloads once on a failed dynamic import preload', () => {
    const { reload, uninstall } = setup();
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    uninstall();
  });

  it('reloads when a same-origin build script fails to load', () => {
    const { reload, uninstall } = setup();
    failScript(
      `${window.location.origin}/_f/dashboard/_next/static/chunks/x.js`
    );
    expect(reload).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it('ignores a failing build image', () => {
    const { reload, uninstall } = setup();
    const img = document.createElement('img');
    img.src = `${window.location.origin}/_next/static/media/logo.png`;
    document.body.append(img);
    img.dispatchEvent(new Event('error'));
    img.remove();
    expect(reload).not.toHaveBeenCalled();
    uninstall();
  });

  it('ignores a failing third-party script', () => {
    const { reload, uninstall } = setup();
    failScript('https://cdn.example/widget.js');
    expect(reload).not.toHaveBeenCalled();
    uninstall();
  });

  it('reloads on an unhandled chunk import rejection', () => {
    const { reload, uninstall } = setup();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', {
      value: new TypeError('Failed to fetch dynamically imported module: x'),
    });
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it('does not reload again inside the window, so a missing chunk cannot loop', () => {
    const { reload, uninstall, advance } = setup();
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    advance(CHUNK_RELOAD_WINDOW_MS - 1);
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    advance(2);
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(2);
    uninstall();
  });

  it('stops listening after uninstall', () => {
    const { reload, uninstall } = setup();
    uninstall();
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).not.toHaveBeenCalled();
  });
});
