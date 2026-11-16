import { localDay } from '../live/feed.ts';
import type { HostFact, LiveData } from '../live/model.ts';
import { deployIncludes } from '../live/status.ts';
import type { RoadmapView } from '../view-model.ts';

/**
 * A merged pull request that a roadmap deliverable lists ("roadmap-tracked").
 * Its app and track come from the deliverable; `inProd` uses the same rule as
 * the Live status: the app's deployed commit is at or after the merge
 * (no app: live once merged; null: the deploy is not verifiable).
 */
export type TrackedPr = {
  number: number;
  mergedAt: string;
  day: string;
  trackId: string;
  app: string | null;
  deliverable: string;
  inProd: boolean | null;
};

type Item = Pick<
  RoadmapView['items'][number],
  'title' | 'app' | 'trackId' | 'state'
>;

export function trackedPrs(
  items: readonly Item[],
  hosts: LiveData['hosts']
): TrackedPr[] {
  const byApp = new Map<string, HostFact>(hosts.map((h) => [h.app, h]));
  const seen = new Set<number>();
  const out: TrackedPr[] = [];
  for (const item of items)
    for (const pr of item.state.prs) {
      if (pr.state !== 'merged' || !pr.mergedAt || seen.has(pr.number))
        continue;
      seen.add(pr.number);
      out.push({
        number: pr.number,
        mergedAt: pr.mergedAt,
        day: localDay(pr.mergedAt),
        trackId: item.trackId,
        app: item.app,
        deliverable: item.title,
        inProd: item.app
          ? deployIncludes(byApp.get(item.app), pr.mergedAt)
          : true,
      });
    }
  return out.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
}
