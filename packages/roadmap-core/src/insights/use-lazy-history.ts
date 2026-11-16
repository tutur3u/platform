import { useCallback, useRef, useState } from 'react';
import type { History } from '../history/build.ts';
import { historyUrl } from '../history/history-url.ts';
import { observeNearViewport } from '../history/lazy-load.ts';
import { loadHistoryOnce } from './history-once.ts';

export type LazyHistory = {
  history: History | null;
  state: 'idle' | 'loading' | 'ready' | 'failed';
  /** Start loading now (a reader picked a long range). */
  load: () => void;
  /** Ref for a section: loads once it comes within 600px of the viewport. */
  nearRef: (element: Element | null) => (() => void) | undefined;
};

/**
 * The history JSON for the pulse: never fetched with the page, only when the
 * pulse section nears the viewport or a reader asks for a long range.
 */
export function useLazyHistory(): LazyHistory {
  const [history, setHistory] = useState<History | null>(null);
  const [state, setState] = useState<LazyHistory['state']>('idle');
  const started = useRef(false);
  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState('loading');
    loadHistoryOnce(historyUrl).then(
      (loaded) => {
        setHistory(loaded);
        setState('ready');
      },
      () => {
        // A later pick may retry.
        started.current = false;
        setState('failed');
      }
    );
  }, []);
  const nearRef = useCallback(
    (element: Element | null) =>
      element ? observeNearViewport(element, load) : undefined,
    [load]
  );
  return { history, state, load, nearRef };
}
