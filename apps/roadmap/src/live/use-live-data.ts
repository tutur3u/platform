import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assembleLiveData,
  fetchMain,
  fetchPullFacts,
  hostFacts,
} from './github.ts';
import { parseHostsPayload } from './host-probe.ts';
import { type LiveData, mergeLiveData, parseLiveData } from './model.ts';

// v2: v1 caches may hold same-zone probes misread as Vercel; never reuse them.
const CACHE_KEY = 'tuturuuu-roadmap-live-v2';
/** Ten minutes keeps a viewer well inside GitHub's anonymous hourly quota. */
export const REFRESH_MS = 10 * 60_000;

export type LiveState = 'snapshot' | 'refreshing' | 'live' | 'failed';

function readCache(): LiveData | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? parseLiveData(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(data: LiveData) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or full storage: the page still works without a cache.
  }
}

async function fetchHosts(base: LiveData) {
  const response = await fetch('/roadmap/api/hosts', {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`hosts ${response.status}`);
  const payload = parseHostsPayload(await response.json());
  // Reuse compares for commits we already know to save GitHub calls.
  const known = new Map(base.hosts.map((host) => [host.commit, host]));
  const unknown = payload.hosts.filter(
    (probe) => probe.commit && !known.get(probe.commit)?.commitAt
  );
  const compared = await hostFacts(window.fetch.bind(window), unknown);
  return payload.hosts.map((probe) => {
    const fresh = compared.find((host) => host.app === probe.app);
    if (fresh) return fresh;
    const reuse = probe.commit ? known.get(probe.commit) : undefined;
    return {
      ...probe,
      commitAt: reuse?.commitAt ?? null,
      behindBy: reuse?.behindBy ?? null,
    };
  });
}

/**
 * Start from the data generated with the deploy, then refresh from public
 * sources in the browser. A failed refresh keeps the newest good data and
 * its real observation time; nothing is shown as fresher than it is.
 */
export function useLiveData(initial: LiveData) {
  const [data, setData] = useState(initial);
  const [state, setState] = useState<LiveState>('snapshot');
  const [now, setNow] = useState(() => Date.parse(initial.generatedAt));
  const [mounted, setMounted] = useState(false);
  const dataRef = useRef(initial);
  const busy = useRef(false);

  const apply = useCallback((next: LiveData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState('refreshing');
    const started = Date.now();
    try {
      const base = dataRef.current;
      const fetcher = window.fetch.bind(window);
      const [prs, main, hosts] = await Promise.allSettled([
        fetchPullFacts(fetcher, started, { days: 8, mergedPages: 4 }),
        fetchMain(fetcher),
        fetchHosts(base),
      ]);
      if (prs.status === 'rejected' || main.status === 'rejected')
        throw new Error('GitHub unavailable');
      const fresh = assembleLiveData({
        now: started,
        source: 'live',
        main: main.value,
        prs: prs.value,
        hosts: hosts.status === 'fulfilled' ? hosts.value : [],
      });
      const next = parseLiveData(mergeLiveData(base, fresh));
      apply(next);
      writeCache(next);
      setState('live');
    } catch {
      setState('failed');
    } finally {
      busy.current = false;
      setNow(Date.now());
    }
  }, [apply]);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const cached = readCache();
    let fresh = false;
    if (
      cached &&
      Date.parse(cached.generatedAt) > Date.parse(initial.generatedAt)
    ) {
      apply(mergeLiveData(initial, cached));
      fresh = Date.now() - Date.parse(cached.generatedAt) < REFRESH_MS;
      if (fresh) setState('live');
    }
    if (!fresh) void refresh();
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [apply, initial, refresh]);

  return { data, state, now, mounted, refresh };
}
