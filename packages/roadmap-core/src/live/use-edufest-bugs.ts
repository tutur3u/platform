import { startTransition, useEffect, useState } from 'react';
import { afterIdleAndVisible } from './defer.ts';
import {
  type BugFeed,
  fetchEdufestBugs,
  nextBugFeed,
  parseBugFeed,
} from './edufest-bugs.ts';
import { REFRESH_MS } from './runtime-refresh.ts';
import { backoffActive, isRateLimited, startBackoff } from './use-live-data.ts';

/** The open bugs this build observed (or unavailable outside a build). */
export function initialBugFeed(): BugFeed {
  return parseBugFeed(
    typeof __ROADMAP_EDUFEST_BUGS__ === 'undefined'
      ? null
      : __ROADMAP_EDUFEST_BUGS__
  );
}

/**
 * Start from the build's observation, then re-read the open bugs in the
 * browser once idle and on the roadmap's refresh interval: one anonymous
 * search per refresh. A 403/429 starts the shared GitHub back-off.
 */
export function useEdufestBugs(initial: BugFeed): BugFeed {
  const [feed, setFeed] = useState(initial);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const at = Date.now();
      if (backoffActive(at)) {
        apply({ state: 'unavailable', reason: 'rate_limited' });
        return;
      }
      try {
        apply(
          await fetchEdufestBugs(window.fetch.bind(window), at, {
            source: 'live',
          })
        );
      } catch (error) {
        const limited = isRateLimited(error);
        if (limited) startBackoff(at);
        apply({
          state: 'unavailable',
          reason: limited ? 'rate_limited' : 'failed',
        });
      }
    };
    const apply = (next: BugFeed) => {
      if (alive)
        startTransition(() => setFeed((prev) => nextBugFeed(prev, next)));
    };
    const cancel = afterIdleAndVisible(() => void refresh());
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => {
      alive = false;
      cancel();
      window.clearInterval(poll);
    };
  }, []);

  return feed;
}
