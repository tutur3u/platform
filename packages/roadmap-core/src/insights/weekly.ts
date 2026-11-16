import type { Status } from '../live/status.ts';
import type { AllMerged } from './pulse-model.ts';
import { type Change, change, dayKeys, shiftDay } from './series.ts';
import type { TrackedPr } from './tracked.ts';

const WEEK_MS = 7 * 86_400_000;

type Item = {
  state: { status: Status; shippedAt: string | null };
};

/** Items whose last merge falls in [from, to). */
function shippedBetween(items: readonly Item[], from: number, to: number) {
  return items.filter((item) => {
    const at = item.state.shippedAt ? Date.parse(item.state.shippedAt) : NaN;
    return at >= from && at < to;
  });
}

export type WeeklyTiles = {
  /** Every merged PR this week, when observed in full. */
  mergedThisWeek: number | null;
  /** Every merged PR this week vs last; null unless both were observed. */
  merged: Change | null;
  trackedMerged: Change;
  /** Deliverables whose last PR merged this week vs last. */
  shipped: Change;
  /** Deliverables live now, and how many became live this week vs last. */
  live: { total: number; added: Change };
  /** Waiting for prod sync now, and how many joined this week vs last. */
  waiting: { total: number; added: Change };
};

/**
 * Week-over-week figures for the stat tiles. "This week" is the last 7 days
 * up to now; "last week" the 7 days before. Flows (merged, shipped, newly
 * live, newly waiting) are compared, never a stock against a guess of last
 * week's stock, which the public data cannot show.
 */
export function weeklyTiles(input: {
  items: readonly Item[];
  totals: Record<Status, number>;
  tracked: readonly TrackedPr[];
  all: AllMerged;
  today: string;
  now: number;
}): WeeklyTiles {
  const { items, now, all, today } = input;
  const thisWeek = shippedBetween(items, now - WEEK_MS, now + 60_000);
  const lastWeek = shippedBetween(items, now - 2 * WEEK_MS, now - WEEK_MS);
  const count = (list: readonly Item[], status: Status) =>
    list.filter((item) => item.state.status === status).length;
  const weekDays = dayKeys(today, 7);
  const previousDays = dayKeys(shiftDay(today, -7), 7);
  const allWeek = (days: string[]) =>
    days.every(all.covers)
      ? days.reduce((sum, day) => sum + (all.byDay.get(day)?.length ?? 0), 0)
      : null;
  const current = allWeek(weekDays);
  const previous = allWeek(previousDays);
  const trackedOn = (days: string[]) =>
    input.tracked.filter((pr) => days.includes(pr.day)).length;
  return {
    mergedThisWeek: current,
    merged:
      current !== null && previous !== null ? change(current, previous) : null,
    trackedMerged: change(trackedOn(weekDays), trackedOn(previousDays)),
    shipped: change(thisWeek.length, lastWeek.length),
    live: {
      total: input.totals.live,
      added: change(count(thisWeek, 'live'), count(lastWeek, 'live')),
    },
    waiting: {
      total: input.totals.waiting_for_prod_sync,
      added: change(
        count(thisWeek, 'waiting_for_prod_sync'),
        count(lastWeek, 'waiting_for_prod_sync')
      ),
    },
  };
}
