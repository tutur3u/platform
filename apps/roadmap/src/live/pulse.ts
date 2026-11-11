import { localDay } from './feed.ts';
import type { LiveData } from './model.ts';

const DAY = 86_400_000;

/**
 * Merged pull requests per Vietnam-time day over the last `days` days, oldest
 * first, from the roadmap's public live data. Days with none read 0.
 */
export function shippingPulse(
  prs: LiveData['prs'],
  now: number,
  days = 14
): { day: string; merged: number }[] {
  const today = localDay(new Date(now).toISOString());
  const counts = new Map<string, number>();
  for (const pr of prs)
    if (pr.state === 'merged' && pr.mergedAt && Date.parse(pr.mergedAt) <= now)
      counts.set(
        localDay(pr.mergedAt),
        (counts.get(localDay(pr.mergedAt)) ?? 0) + 1
      );
  const start = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(start - (days - 1 - index) * DAY)
      .toISOString()
      .slice(0, 10);
    return { day, merged: counts.get(day) ?? 0 };
  });
}
