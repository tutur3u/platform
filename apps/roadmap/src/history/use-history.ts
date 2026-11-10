import { useEffect, useMemo, useState } from 'react';
import historyUrl from '../generated/history.json?url';
import type { LiveData } from '../live/model.ts';
import { type History, parseHistory } from './build.ts';
import { combineHistory, liveEntries } from './timeline.ts';

export { historyUrl };

export type HistoryState = 'loading' | 'ready' | 'failed';

/**
 * Full project history ships as a hashed, immutable asset fetched after the
 * first paint, then merged with PRs from the live refresh.
 */
export function useHistory(live: LiveData) {
  const [history, setHistory] = useState<History | null>(null);
  const [state, setState] = useState<HistoryState>('loading');
  useEffect(() => {
    let cancelled = false;
    fetch(historyUrl, { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`history ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        setHistory(parseHistory(json));
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const combined = useMemo(
    () =>
      history ? combineHistory(history, liveEntries(live.prs, history)) : null,
    [history, live.prs]
  );
  return { history: combined, state };
}
