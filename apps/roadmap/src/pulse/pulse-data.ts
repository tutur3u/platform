import { BUILD_ACTIVITY } from '@tuturuuu/roadmap-core/insights/build-activity.ts';
import { localDay } from '@tuturuuu/roadmap-core/live/feed.ts';
import type { RoadmapView } from '@tuturuuu/roadmap-core/view-model.ts';
import type { RoadmapSnapshot } from '../roadmap-snapshot';

export type Product = RoadmapSnapshot['products'][number];
export const PRODUCT_KEYS = [
  'tasks',
  'calendar',
  'mail',
  'meet',
  'chat',
  'drive',
  'finance',
  'mira',
  'mobile',
  'contacts',
  'inventory',
  'mind',
  'nova',
  'upskii',
  'track',
  'forms',
] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];
export const DAY = 86_400_000;

export function calendarDays(generatedAt: string) {
  const end = Date.parse(`${localDay(generatedAt)}T00:00:00Z`);
  return Array.from({ length: 30 }, (_, index) =>
    new Date(end - (29 - index) * DAY).toISOString().slice(0, 10)
  );
}

function totals(daily: number[]) {
  return {
    commits30d: daily.reduce((sum, count) => sum + count, 0),
    commits7d: daily.slice(-7).reduce((sum, count) => sum + count, 0),
    commits7dPrev: daily.slice(-14, -7).reduce((sum, count) => sum + count, 0),
  };
}

export function buildPulseFallback(): RoadmapSnapshot | null {
  const { checkedAt, commits } = BUILD_ACTIVITY;
  if (!checkedAt || !commits) return null;
  const dates = calendarDays(checkedAt);
  const countByDay = new Map(commits.days.map(([day, count]) => [day, count]));
  const daily = dates.map((day) => countByDay.get(day) ?? 0);
  const products = PRODUCT_KEYS.map((key) => {
    const index = commits.tracks.indexOf(key === 'mind' ? 'mastermind' : key);
    const counts = new Map(
      commits.products
        .filter(([, track]) => track === index)
        .map(([day, , count]) => [day, count])
    );
    const series = dates.map((day) => counts.get(day) ?? 0);
    return { key, ...totals(series), daily: series, prs7d: 0, recent: [] };
  });
  const deploys = new Map<string, { at: string; apps: Set<string> }>();
  for (const { commit, app, builtAt } of BUILD_ACTIVITY.deploys) {
    const entry = deploys.get(commit) ?? {
      at: builtAt,
      apps: new Set<string>(),
    };
    entry.apps.add(app);
    if (builtAt < entry.at) entry.at = builtAt;
    deploys.set(commit, entry);
  }
  return {
    ...totals(daily),
    daily,
    products,
    productionSha: null,
    generatedAt: checkedAt,
    deploys: [...deploys]
      .map(([sha, entry]) => ({
        env: 'production' as const,
        sha,
        at: entry.at,
        apps: entry.apps.size,
      }))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20),
  };
}

export function productProgress(view: RoadmapView, key: ProductKey) {
  const id = key === 'mind' ? 'mastermind' : key;
  const result = { shipped: 0, inProgress: 0, next: 0 };
  for (const item of view.items) {
    if (item.trackId !== id) continue;
    const status = item.state.status;
    if (status === 'live' || status === 'waiting_for_prod_sync')
      result.shipped += 1;
    else if (status === 'planned') result.next += 1;
    else result.inProgress += 1;
  }
  return result;
}
