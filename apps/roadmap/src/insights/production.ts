import type { LiveData } from '../live/model.ts';
import type { DeployFact } from './activity.ts';
import { quantile } from './series.ts';
import type { TrackedPr } from './tracked.ts';

const DAY_MS = 86_400_000;

/**
 * One app's production build, and the roadmap-tracked work it carries.
 * Inclusion uses the same rule as the Live status: a PR is in production when
 * the deployed commit's time on main is at or after its merge. `builtAt` comes
 * from this build's probe of the app's build-info, only when it reported the
 * same commit the status engine uses.
 */
export type ProductionUpdate = {
  app: string;
  commit: string;
  /** When production was built from that commit, if observed. */
  builtAt: string | null;
  /** The deployed commit's time on main. */
  commitAt: string;
  /** Sort key: the build time when known, else the commit time. */
  at: string;
  /** Tracked PRs merged in the window that production contains. */
  live: TrackedPr[];
  /** Tracked PRs for this app merged on main but not in production yet. */
  waiting: TrackedPr[];
};

export function productionUpdates(
  hosts: LiveData['hosts'],
  deploys: readonly DeployFact[],
  tracked: readonly TrackedPr[],
  now: number,
  windowDays = 14
): ProductionUpdate[] {
  const since = now - windowDays * DAY_MS;
  const builds = new Map(deploys.map((deploy) => [deploy.app, deploy]));
  const updates: ProductionUpdate[] = [];
  for (const host of hosts) {
    if (!host.commit || !host.commitAt || host.platform === 'store') continue;
    const deployedAt = Date.parse(host.commitAt);
    const mine = tracked.filter((pr) => pr.app === host.app);
    const live = mine.filter((pr) => {
      const merged = Date.parse(pr.mergedAt);
      return merged <= deployedAt && merged >= since && merged <= now;
    });
    const waiting = mine.filter((pr) => Date.parse(pr.mergedAt) > deployedAt);
    const build = builds.get(host.app);
    const builtAt =
      build && build.commit === host.commit ? build.builtAt : null;
    if (!live.length && !waiting.length && !builtAt) continue;
    updates.push({
      app: host.app,
      commit: host.commit,
      builtAt,
      commitAt: host.commitAt,
      at: builtAt ?? host.commitAt,
      live,
      waiting,
    });
  }
  return updates.sort(
    (a, b) => b.at.localeCompare(a.at) || a.app.localeCompare(b.app)
  );
}

export type TimeToLive = {
  /** PRs measured. */
  count: number;
  medianMs: number | null;
  p90Ms: number | null;
};

/**
 * Merge → production, for tracked PRs merged since `since` that production
 * contains: the time from merge to the build that serves them now. Only that
 * build is observable (not the first build that contained the change), so
 * this is an upper bound. PRs whose app's build time was not observed are
 * left out.
 */
export function timeToLive(
  updates: readonly ProductionUpdate[],
  since: number
): TimeToLive {
  const lags: number[] = [];
  for (const update of updates) {
    if (!update.builtAt) continue;
    const built = Date.parse(update.builtAt);
    for (const pr of update.live) {
      const merged = Date.parse(pr.mergedAt);
      if (merged < since || built < merged) continue;
      lags.push(built - merged);
    }
  }
  return {
    count: lags.length,
    medianMs: quantile(lags, 0.5),
    p90Ms: quantile(lags, 0.9),
  };
}

/** How long merged work has been waiting for production: median and p90. */
export function waitingAge(
  tracked: readonly TrackedPr[],
  now: number
): TimeToLive {
  const ages = tracked
    .filter((pr) => pr.inProd === false)
    .map((pr) => now - Date.parse(pr.mergedAt))
    .filter((age) => age >= 0);
  return {
    count: ages.length,
    medianMs: quantile(ages, 0.5),
    p90Ms: quantile(ages, 0.9),
  };
}
