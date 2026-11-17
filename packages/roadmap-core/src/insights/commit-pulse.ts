import type { CommitWindow } from './commits.ts';
import type { PulsePoint } from './pulse-model.ts';
import {
  type Change,
  change,
  dayKeys,
  movingAverage,
  type Range,
  shiftDay,
} from './series.ts';

/**
 * The shipping pulse and weekly tiles counted in commits to main. A day
 * counts only inside the build's commit window; any other day is unknown
 * (null), never zero. Commits are observed only at build time, so the
 * figures end on the window's last day (`asOf`) when the reader's today is
 * later: an older page shows its own last week, never a short count.
 * Pure and portable.
 */

/** The last day the figures cover: today, or the build's last day. */
export function commitsAsOf(commits: CommitWindow, today: string) {
  return today < commits.to ? today : commits.to;
}

type DayCounts = { total: number; viaPr: number; inProd: number };

function lookup(commits: CommitWindow) {
  const byDay = new Map<string, DayCounts>(
    commits.days.map(([day, total, viaPr, inProd]) => [
      day,
      { total, viaPr, inProd },
    ])
  );
  const covers = (day: string) => day >= commits.from && day <= commits.to;
  const on = (day: string): DayCounts | null =>
    covers(day) ? (byDay.get(day) ?? { total: 0, viaPr: 0, inProd: 0 }) : null;
  return { covers, on };
}

function sum(days: readonly (DayCounts | null)[]) {
  if (days.some((day) => day === null)) return null;
  return (days as DayCounts[]).reduce(
    (all, day) => ({
      total: all.total + day.total,
      viaPr: all.viaPr + day.viaPr,
      inProd: all.inProd + day.inProd,
    }),
    { total: 0, viaPr: 0, inProd: 0 }
  );
}

export type CommitPulse = {
  range: Range;
  /** Last day shown (see commitsAsOf). */
  asOf: string;
  /**
   * Chart points: `all` and `tracked` both carry the day's commits, so the
   * stacked bar reads in production (inProd) under waiting (the rest).
   */
  points: PulsePoint[];
  totals: DayCounts;
  /** This range vs the one before it; null unless both are covered. */
  totalChange: Change | null;
  /** Every day of the range is inside the commit window. */
  complete: boolean;
  /** Per-product commits over the range, largest first. */
  products: { track: string; count: number }[];
};

export function buildCommitPulse(input: {
  commits: CommitWindow;
  today: string;
  range: Range;
}): CommitPulse {
  const { commits, range } = input;
  const today = commitsAsOf(commits, input.today);
  const { covers, on } = lookup(commits);
  const extended = dayKeys(today, range + 6);
  const days = extended.slice(6);
  const ma = movingAverage(extended.map((day) => on(day)?.total ?? null)).slice(
    6
  );
  const productsByDay = new Map<string, string[]>();
  const counts = new Map<string, number>();
  const inRange = new Set(days);
  for (const [day, index, count] of commits.products) {
    const track = commits.tracks[index] ?? 'other';
    if (!inRange.has(day)) continue;
    counts.set(track, (counts.get(track) ?? 0) + count);
    if (track === 'other') continue;
    const list = productsByDay.get(day) ?? [];
    list.push(track);
    productsByDay.set(day, list);
  }
  const points = days.map((day, index): PulsePoint => {
    const counted = on(day);
    return {
      day,
      all: counted?.total ?? null,
      tracked: counted?.total ?? 0,
      inProd: counted?.inProd ?? 0,
      viaPr: counted?.viaPr ?? 0,
      deploys: 0,
      products: [...(productsByDay.get(day) ?? [])].sort(),
      ma: ma[index] ?? null,
    };
  });
  const current = sum(days.filter(covers).map(on));
  const previous = sum(dayKeys(shiftDay(today, -range), range).map(on));
  const totals = current ?? { total: 0, viaPr: 0, inProd: 0 };
  return {
    range,
    asOf: today,
    points,
    totals,
    totalChange:
      days.every(covers) && previous
        ? change(totals.total, previous.total)
        : null,
    complete: days.every(covers),
    products: [...counts]
      .map(([track, count]) => ({ track, count }))
      .sort((a, b) => b.count - a.count || a.track.localeCompare(b.track)),
  };
}

export type CommitTiles = {
  /** Last day of "this week" (see commitsAsOf). */
  asOf: string;
  /** Commits that landed this week and production contains now. */
  shipped: number;
  /** Commits to main this week vs last; previous is null when not covered. */
  landed: { current: number; change: Change | null };
  direct: { direct: number; viaPr: number; share: number | null };
  /** Commits on main production does not contain yet, and the oldest age. */
  waiting: { count: number; oldestMs: number | null } | null;
};

/**
 * Week-over-week tiles in commits. "This week" is the last 7 Vietnam days up
 * to today; "last week" the 7 before. Shipped is a stock (landed this week
 * and in production now), so it carries no comparison: last week's commits
 * have had longer to reach production.
 */
export function commitTiles(input: {
  commits: CommitWindow;
  today: string;
  now: number;
}): CommitTiles {
  const { commits, now } = input;
  const today = commitsAsOf(commits, input.today);
  const { covers, on } = lookup(commits);
  const week = sum(dayKeys(today, 7).filter(covers).map(on)) ?? {
    total: 0,
    viaPr: 0,
    inProd: 0,
  };
  const before = sum(dayKeys(shiftDay(today, -7), 7).map(on));
  const production = commits.production;
  const oldest = production?.oldestWaitingAt
    ? Date.parse(production.oldestWaitingAt)
    : NaN;
  return {
    asOf: today,
    shipped: week.inProd,
    landed: {
      current: week.total,
      change: before ? change(week.total, before.total) : null,
    },
    direct: {
      direct: week.total - week.viaPr,
      viaPr: week.viaPr,
      share: week.total ? (week.total - week.viaPr) / week.total : null,
    },
    waiting: production
      ? {
          count: production.waiting,
          oldestMs: Number.isFinite(oldest) ? Math.max(0, now - oldest) : null,
        }
      : null,
  };
}
