import { type RefObject, useEffect, useMemo, useState } from 'react';
import historyUrl from '../generated/history.json?url';
import type { LiveData } from '../live/model.ts';
import type { History } from './build.ts';
import { loadHistoryWhenNear } from './lazy-load.ts';
import { combineHistory, liveEntries } from './timeline.ts';

export { historyUrl };

export type HistoryState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Full project history (~240 KB) ships as a hashed, immutable asset. It is
 * fetched only when the timeline nears the viewport, never on load and never
 * speculatively, then merged with PRs from the live refresh.
 */
export function useHistory(live: LiveData, target: RefObject<Element | null>) {
  const [history, setHistory] = useState<History | null>(null);
  const [state, setState] = useState<HistoryState>('idle');
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    return loadHistoryWhenNear(
      element,
      {
        onLoading: () => setState('loading'),
        onLoaded: (next) => {
          setHistory(next);
          setState('ready');
        },
        onFailed: () => setState('failed'),
      },
      historyUrl
    );
  }, [target]);
  const combined = useMemo(
    () =>
      history ? combineHistory(history, liveEntries(live.prs, history)) : null,
    [history, live.prs]
  );
  return { history: combined, state };
}
