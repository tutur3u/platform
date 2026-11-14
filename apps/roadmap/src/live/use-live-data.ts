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
import { parseHostsPayload, RUNTIME_PROBED_APPS } from './host-probe.ts';
import type { LiveData } from './model.ts';
import {
  forgetRuntimeSnapshot,
  freshRuntime,
  readRuntimeSnapshot,
  REFRESH_MS,
  refreshRuntime,
  requireCompleteHosts,
  writeRuntimeSnapshot,
} from './runtime-refresh.ts';
export { REFRESH_MS } from './runtime-refresh.ts';

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

async function fetchHosts(base: LiveData) {
  const response = await fetch('/roadmap/api/hosts', {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`hosts ${response.status}`);
  const payload = parseHostsPayload(await response.json());
  requireCompleteHosts(
    payload,
    [...RUNTIME_PROBED_APPS.map(({ app }) => app), 'roadmap'],
    Date.now()
  );
  // Reuse compares for commits we already know to save GitHub calls.
  const known = new Map(base.hosts.map((host) => [host.commit, host]));
  const unknown = payload.hosts.filter(
    (probe) => probe.commit && !known.get(probe.commit)?.commitAt
  );
  const compared = await hostFacts(window.fetch.bind(window), unknown);
  return payload.hosts.map((probe) => {
    const fresh = compared.find((host) => host.app === probe.app);
    if (fresh) {
      if (fresh.commit && !fresh.commitAt)
        throw new Error('Incomplete host compare');
      return fresh;
    }
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
 * sources in the browser. A failed or expired refresh restores this
 * deployment's build snapshot and its real observation time.
 */
export function useLiveData(initial: LiveData) {
  const [data, setData] = useState(initial);
  const [state, setState] = useState<LiveState>('snapshot');
  const [now, setNow] = useState(() => Date.parse(initial.generatedAt));
  const [mounted, setMounted] = useState(false);
  const dataRef = useRef(initial);
  const busy = useRef<number | null>(null);
  const generation = useRef(0);

  // Fresh data re-renders most of the page: as a transition it never blocks
  // a tap or a scroll that happens at the same time.
  const apply = useCallback((next: LiveData) => {
    dataRef.current = next;
    startTransition(() => setData(next));
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current === generation.current) return;
    const started = Date.now();
    if (backoffActive(started)) {
      apply(initial);
      setState('failed');
      return;
    }
    const version = generation.current;
    busy.current = version;
    setState('refreshing');
    try {
      const result = await refreshRuntime(
        initial,
        async () => {
          const fetcher = window.fetch.bind(window);
          const [prs, main, hosts] = await Promise.allSettled([
            fetchPullFacts(fetcher, started, LIVE_SEARCH),
            fetchMain(fetcher),
            fetchHosts(initial),
          ]);
          for (const outcome of [prs, main, hosts]) {
            if (outcome.status === 'rejected') {
              if (isRateLimited(outcome.reason)) startBackoff(started);
            }
          }
          if (
            prs.status !== 'fulfilled' ||
            main.status !== 'fulfilled' ||
            hosts.status !== 'fulfilled'
          ) {
            throw new Error('Incomplete public observation');
          }
          return assembleLiveData({
            now: started,
            source: 'live',
            main: main.value,
            prs: prs.value,
            hosts: hosts.value,
          });
        },
        Date.now
      );
      if (version !== generation.current) return;
      if (result.state === 'failed') throw new Error('Refresh unavailable');
      const next = result.data;
      apply(next);
      try {
        writeRuntimeSnapshot(window.localStorage, next, __ROADMAP_BUILD_SHA__);
      } catch {
        // Storage access itself can be denied.
      }
      setState('live');
    } catch {
      if (version !== generation.current) return;
      apply(initial);
      try {
        forgetRuntimeSnapshot(window.localStorage);
      } catch {
        // The build snapshot does not depend on storage access.
      }
      setState('failed');
    } finally {
      if (busy.current === version) busy.current = null;
      if (version === generation.current)
        startTransition(() => setNow(Date.now()));
    }
  }, [apply, initial]);

  useEffect(() => {
    generation.current += 1;
    setMounted(true);
    // Hydration renders the snapshot as the server did; anything newer
    // (cache, clock, network) waits until the page is idle and visible.
    const cancel = afterIdleAndVisible(() => {
      startTransition(() => setNow(Date.now()));
      let cached = initial;
      try {
        cached = readRuntimeSnapshot(
          window.localStorage,
          initial,
          __ROADMAP_BUILD_SHA__,
          Date.now()
        );
      } catch {
        // Storage is optional.
      }
      const fresh = freshRuntime(cached, initial, Date.now());
      if (fresh) {
        apply(cached);
        setState('live');
      }
      if (!fresh) void refresh();
    });
    const tick = window.setInterval(() => {
      const at = Date.now();
      if (
        dataRef.current !== initial &&
        !freshRuntime(dataRef.current, initial, at)
      ) {
        apply(initial);
        setState('snapshot');
      }
      if (document.visibilityState === 'visible')
        startTransition(() => setNow(at));
    }, CLOCK_TICK_MS);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => {
      generation.current += 1;
      cancel();
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [apply, initial, refresh]);

  return { data, state, now, mounted, refresh };
}
