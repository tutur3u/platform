import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { afterIdleAndVisible } from './defer.ts';
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
/**
 * The browser refresh reads only the most recently updated PRs: anonymous
 * search allows ten requests a minute, so one refresh stays at four (approved,
 * one open page, two merged pages). Older facts come from the build snapshot.
 */
export const LIVE_SEARCH = { days: 8, openPages: 1, mergedPages: 2 } as const;
/** After a 403/429 from GitHub, the browser waits this long before retrying. */
export const RATE_LIMIT_BACKOFF_MS = 30 * 60_000;
/** Relative times ("this week", "today") only need minute-level freshness. */
export const CLOCK_TICK_MS = 5 * 60_000;
const BACKOFF_KEY = 'tuturuuu-roadmap-live-backoff';

export function isRateLimited(error: unknown) {
  return /\bGitHub (403|429)\b/.test(
    error instanceof Error ? error.message : String(error)
  );
}

function backoffActive(now: number) {
  try {
    return Number(window.localStorage.getItem(BACKOFF_KEY) ?? 0) > now;
  } catch {
    return false;
  }
}

function startBackoff(now: number) {
  try {
    window.localStorage.setItem(
      BACKOFF_KEY,
      String(now + RATE_LIMIT_BACKOFF_MS)
    );
  } catch {
    // Without storage the poll interval still bounds retries.
  }
}

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

  // Fresh data re-renders most of the page: as a transition it never blocks
  // a tap or a scroll that happens at the same time.
  const apply = useCallback((next: LiveData) => {
    dataRef.current = next;
    startTransition(() => setData(next));
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const started = Date.now();
    if (backoffActive(started)) return;
    busy.current = true;
    setState('refreshing');
    try {
      const base = dataRef.current;
      const fetcher = window.fetch.bind(window);
      const [prs, main, hosts] = await Promise.allSettled([
        fetchPullFacts(fetcher, started, LIVE_SEARCH),
        fetchMain(fetcher),
        fetchHosts(base),
      ]);
      if (prs.status === 'rejected' || main.status === 'rejected') {
        const reason =
          prs.status === 'rejected'
            ? prs.reason
            : (main as PromiseRejectedResult).reason;
        if (isRateLimited(reason)) startBackoff(started);
        throw new Error('GitHub unavailable');
      }
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
      startTransition(() => setNow(Date.now()));
    }
  }, [apply]);

  useEffect(() => {
    setMounted(true);
    // Hydration renders the snapshot as the server did; anything newer
    // (cache, clock, network) waits until the page is idle and visible.
    const cancel = afterIdleAndVisible(() => {
      startTransition(() => setNow(Date.now()));
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
    });
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        startTransition(() => setNow(Date.now()));
    }, CLOCK_TICK_MS);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => {
      cancel();
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [apply, initial, refresh]);

  return { data, state, now, mounted, refresh };
}
