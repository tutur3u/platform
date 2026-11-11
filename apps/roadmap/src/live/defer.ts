/**
 * Run background work only once the page has loaded (so it has painted), the
 * tab is visible and the main thread is idle. The live GitHub refresh and
 * similar optional work go through this, so they never compete with the first
 * paint or the first interactions on a slow phone.
 */

type Listener = () => void;

type Target = {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
};

export type DeferEnv = {
  document: Target & { readyState: string; visibilityState: string };
  window: Target & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
    setTimeout(callback: () => void, ms: number): number;
    clearTimeout(handle: number): void;
  };
};

/** Longest wait for an idle period before the task runs anyway. */
export const IDLE_TIMEOUT_MS = 4_000;

export function afterIdleAndVisible(
  task: () => void,
  env: DeferEnv = {
    document: document as unknown as DeferEnv['document'],
    window: window as unknown as DeferEnv['window'],
  },
  timeout = IDLE_TIMEOUT_MS
): () => void {
  const { document: doc, window: win } = env;
  let cancelled = false;
  let cleanup: () => void = () => {};

  const idle = () => {
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(() => !cancelled && task(), {
        timeout,
      });
      cleanup = () => win.cancelIdleCallback?.(handle);
    } else {
      const handle = win.setTimeout(() => !cancelled && task(), 1_500);
      cleanup = () => win.clearTimeout(handle);
    }
  };
  const visible = () => {
    if (doc.visibilityState === 'visible') return idle();
    const onChange = () => {
      if (doc.visibilityState !== 'visible') return;
      doc.removeEventListener('visibilitychange', onChange);
      idle();
    };
    doc.addEventListener('visibilitychange', onChange);
    cleanup = () => doc.removeEventListener('visibilitychange', onChange);
  };
  if (doc.readyState === 'complete') visible();
  else {
    const onLoad = () => {
      win.removeEventListener('load', onLoad);
      visible();
    };
    win.addEventListener('load', onLoad);
    cleanup = () => win.removeEventListener('load', onLoad);
  }
  return () => {
    cancelled = true;
    cleanup();
  };
}
