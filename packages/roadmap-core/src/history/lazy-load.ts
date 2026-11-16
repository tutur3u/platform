import { type History, parseHistory } from './build.ts';

/** Start loading this far before the timeline scrolls into view. */
export const HISTORY_ROOT_MARGIN = '600px 0px';

export type Observe = (
  element: Element,
  onNear: () => void
) => (() => void) | undefined;

/** Calls `onNear` once `element` comes within HISTORY_ROOT_MARGIN of view. */
export const observeNearViewport: Observe = (element, onNear) => {
  if (typeof IntersectionObserver === 'undefined') {
    onNear();
    return undefined;
  }
  const observer = new IntersectionObserver(
    (records) => {
      if (records.some((record) => record.isIntersecting)) {
        observer.disconnect();
        onNear();
      }
    },
    { rootMargin: HISTORY_ROOT_MARGIN }
  );
  observer.observe(element);
  return () => observer.disconnect();
};

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch the history JSON once `element` nears the viewport. Returns a cancel
 * function; nothing is requested before `observe` reports the timeline near.
 */
export function loadHistoryWhenNear(
  element: Element,
  handlers: {
    onLoading: () => void;
    onLoaded: (history: History) => void;
    onFailed: () => void;
  },
  url: string,
  observe: Observe = observeNearViewport,
  fetchImpl: Fetch = (input, init) => fetch(input, init)
) {
  let cancelled = false;
  const stop = observe(element, () => {
    handlers.onLoading();
    fetchImpl(url, { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`history ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (!cancelled) handlers.onLoaded(parseHistory(json));
      })
      .catch(() => {
        if (!cancelled) handlers.onFailed();
      });
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}
