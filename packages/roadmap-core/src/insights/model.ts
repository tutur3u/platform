import type { LiveData } from '../live/model.ts';
import type { RoadmapView } from '../view-model.ts';
import type { ActivitySnapshot } from './activity.ts';
import { allMerged } from './pulse-model.ts';
import { productionUpdates, waitingAge } from './production.ts';
import { trackedPrs } from './tracked.ts';
import { weeklyTiles } from './weekly.ts';

/**
 * Everything the page derives once per data change from the roadmap view,
 * the live data and this build's activity. The pulse adds the lazily
 * loaded history and the range on top of it.
 */
export function buildInsights(
  view: RoadmapView,
  data: LiveData,
  activity: ActivitySnapshot,
  now: number
) {
  const tracked = trackedPrs(view.items, data.hosts);
  // Build data only: the headline tiles never change when the history loads.
  const all = allMerged(activity, null);
  return {
    tracked,
    all,
    tiles: weeklyTiles({
      items: view.items,
      totals: view.totals,
      tracked,
      all,
      today: view.today,
      now,
    }),
    updates: productionUpdates(data.hosts, activity.deploys, tracked, now),
    /** The same builds over the longest range, for merge-to-production time. */
    builds: productionUpdates(data.hosts, activity.deploys, tracked, now, 90),
    waitAge: waitingAge(tracked, now),
  };
}

export type Insights = ReturnType<typeof buildInsights>;
