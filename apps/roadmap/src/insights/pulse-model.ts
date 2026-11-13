import type { History } from '../history/build.ts';
import { localDay } from '../live/feed.ts';
import type { ActivitySnapshot, DeployFact } from './activity.ts';
import {
  type Change,
  change,
  dayKeys,
  movingAverage,
  type Range,
  shiftDay,
  sumKnown,
} from './series.ts';
import type { TrackedPr } from './tracked.ts';

/**
 * Every merged PR in tutur3u/platform (bots and dependency updates
 * excluded), by number, from the build's search window and, once loaded,
 * the published history. A day counts only where a source covered it in
 * full; any other day is unknown (null), never zero.
 */
export type AllMerged = {
  byDay: Map<string, { number: number; track: string }[]>;
  covers: (day: string) => boolean;
  /** Search window hit its page cap: counts may be low. */
  partial: boolean;
  /** Newest covered day, for the "as of" note. */
  lastDay: string | null;
};

export function allMerged(
  activity: ActivitySnapshot,
  history: History | null
): AllMerged {
  const seen = new Map<number, { day: string; track: string }>();
  const merged = activity.merged;
  if (merged)
    for (const [number, day, track] of merged.entries)
      seen.set(number, { day, track: merged.tracks[track] ?? 'other' });
  // The history's last day may be partial: it covers the days before it.
  const historyEnd = history ? localDay(history.generatedAt) : null;
  if (history)
    for (const [number, day, track] of history.entries)
      if (!seen.has(number) && day < (historyEnd as string))
        seen.set(number, { day, track: history.tracks[track] ?? 'other' });
  const byDay = new Map<string, { number: number; track: string }[]>();
  for (const [number, { day, track }] of seen) {
    const list = byDay.get(day) ?? [];
    list.push({ number, track });
    byDay.set(day, list);
  }
  const covers = (day: string) =>
    Boolean(
      (merged && day >= merged.from && day <= merged.to) ||
      (historyEnd && day < historyEnd)
    );
  const lastDay =
    merged?.to ?? (historyEnd ? shiftDay(historyEnd, -1) : null) ?? null;
  return {
    byDay,
    covers,
    partial: merged ? !merged.complete : false,
    lastDay,
  };
}

export type PulsePoint = {
  day: string;
  /** Every merged PR; null where no source covered the day. */
  all: number | null;
  /** Roadmap-tracked PRs merged that day. */
  tracked: number;
  /** Of those, how many production contains now. */
  inProd: number;
  /** Production builds serving now that were built that day. */
  deploys: number;
  /** Tracks (products) touched that day. */
  products: string[];
  /** 7-day moving average of the primary series. */
  ma: number | null;
};

export type Pulse = {
  range: Range;
  points: PulsePoint[];
  /** The headline series: all PRs where observed, else roadmap-tracked. */
  primary: 'all' | 'tracked';
  totals: {
    all: number | null;
    tracked: number;
    inProd: number;
    deploys: number;
  };
  /** This range vs the one before it (same length). */
  allChange: Change | null;
  trackedChange: Change;
  /** Every day of the range has an "all" count. */
  allComplete: boolean;
  partial: boolean;
  lastDay: string | null;
  /** Per-product counts over the range, largest first. */
  products: { track: string; count: number }[];
};

function trackedByDay(tracked: readonly TrackedPr[]) {
  const byDay = new Map<string, TrackedPr[]>();
  for (const pr of tracked) {
    const list = byDay.get(pr.day) ?? [];
    list.push(pr);
    byDay.set(pr.day, list);
  }
  return byDay;
}

function allOn(all: AllMerged, day: string) {
  return all.covers(day) ? (all.byDay.get(day)?.length ?? 0) : null;
}

export function buildPulse(input: {
  tracked: readonly TrackedPr[];
  all: AllMerged;
  deploys: readonly DeployFact[];
  today: string;
  range: Range;
}): Pulse {
  const { all, range, today } = input;
  const tracked = trackedByDay(input.tracked);
  const deploysByDay = new Map<string, number>();
  for (const deploy of input.deploys) {
    const day = localDay(deploy.builtAt);
    deploysByDay.set(day, (deploysByDay.get(day) ?? 0) + 1);
  }
  // Six days before the range feed the first moving-average points.
  const extended = dayKeys(today, range + 6);
  const days = extended.slice(6);
  const allValues = extended.map((day) => allOn(all, day));
  const trackedValues = extended.map((day) => tracked.get(day)?.length ?? 0);
  const allInRange = allValues.slice(6);
  const primary = allInRange.some((value) => value !== null)
    ? 'all'
    : 'tracked';
  const ma = movingAverage(primary === 'all' ? allValues : trackedValues).slice(
    6
  );
  const points = days.map((day, index): PulsePoint => {
    const dayTracked = tracked.get(day) ?? [];
    const allCount = allInRange[index] ?? null;
    const products = new Set(
      allCount !== null
        ? (all.byDay.get(day) ?? []).map((entry) => entry.track)
        : dayTracked.map((pr) => pr.trackId)
    );
    products.delete('other');
    return {
      day,
      all: allCount,
      tracked: dayTracked.length,
      inProd: dayTracked.filter((pr) => pr.inProd === true).length,
      deploys: deploysByDay.get(day) ?? 0,
      products: [...products].sort(),
      ma: ma[index] ?? null,
    };
  });
  const previousDays = dayKeys(shiftDay(today, -range), range);
  const previousAll = previousDays.map((day) => allOn(all, day));
  const totalAll = sumKnown(allInRange);
  const allComplete = allInRange.every((value) => value !== null);
  const previousComplete = previousAll.every((value) => value !== null);
  const totalTracked = points.reduce((sum, p) => sum + p.tracked, 0);
  const previousTracked = previousDays.reduce(
    (sum, day) => sum + (tracked.get(day)?.length ?? 0),
    0
  );
  const counts = new Map<string, number>();
  for (const day of days) {
    const entries =
      primary === 'all'
        ? (all.byDay.get(day) ?? []).map((entry) => entry.track)
        : (tracked.get(day) ?? []).map((pr) => pr.trackId);
    if (primary === 'all' && !all.covers(day)) continue;
    for (const track of entries)
      counts.set(track, (counts.get(track) ?? 0) + 1);
  }
  return {
    range,
    points,
    primary,
    totals: {
      all: totalAll,
      tracked: totalTracked,
      inProd: points.reduce((sum, p) => sum + p.inProd, 0),
      deploys: points.reduce((sum, p) => sum + p.deploys, 0),
    },
    allChange:
      allComplete && previousComplete && totalAll !== null
        ? change(totalAll, sumKnown(previousAll) ?? 0)
        : null,
    trackedChange: change(totalTracked, previousTracked),
    allComplete,
    partial: all.partial,
    lastDay: all.lastDay,
    products: [...counts]
      .map(([track, count]) => ({ track, count }))
      .sort((a, b) => b.count - a.count || a.track.localeCompare(b.track)),
  };
}
