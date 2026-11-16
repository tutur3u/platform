import { classifyTitle, isNoise, OTHER_TRACK, type Kind } from './classify.ts';
import { localDate, periodKey, type View, views } from './periods.ts';

/** Merged PR as fetched from the public GitHub API (minimal fields). */
export type RawPull = {
  number: number;
  title: string;
  mergedAt: string;
  author: { type?: string; login?: string } | null;
};

const KIND_CODE: Record<Kind, 0 | 1 | 2> = {
  feature: 0,
  fix: 1,
  maintenance: 2,
};

/** [number, local date, track index, kind code, public title | null] */
export type HistoryEntry = [number, string, number, 0 | 1 | 2, string | null];
/** [period key, total, features, fixes, per-track totals aligned to tracks] */
export type PeriodAggregate = [string, number, number, number, number[]];

export type History = {
  schema: 1;
  generatedAt: string;
  tracks: string[];
  entries: HistoryEntry[];
  aggregates: Record<View, PeriodAggregate[]>;
};

/**
 * Deterministic history from merged PRs: noise dropped, every PR classified,
 * newest first, plus per-period totals for week, month and year.
 */
export function buildHistory(
  pulls: readonly RawPull[],
  trackIds: readonly string[],
  generatedAt: string
): History {
  const tracks = [...new Set([...trackIds, OTHER_TRACK])];
  const known = new Set(tracks);
  const index = new Map(tracks.map((track, i) => [track, i]));
  const seen = new Set<number>();
  const entries: HistoryEntry[] = [];
  for (const pull of [...pulls].sort((a, b) => b.number - a.number)) {
    if (seen.has(pull.number) || !pull.mergedAt) continue;
    seen.add(pull.number);
    if (isNoise(pull.title, pull.author)) continue;
    const classified = classifyTitle(pull.title, known);
    entries.push([
      pull.number,
      localDate(pull.mergedAt),
      index.get(classified.track) as number,
      KIND_CODE[classified.kind],
      classified.title,
    ]);
  }
  entries.sort((a, b) => b[1].localeCompare(a[1]) || b[0] - a[0]);
  return {
    schema: 1,
    generatedAt,
    tracks,
    entries,
    aggregates: aggregate(entries, tracks.length),
  };
}

export function aggregate(
  entries: readonly HistoryEntry[],
  trackCount: number
): Record<View, PeriodAggregate[]> {
  const result = {} as Record<View, PeriodAggregate[]>;
  for (const view of views) {
    const periods = new Map<string, PeriodAggregate>();
    for (const [, date, track, kind] of entries) {
      const key = periodKey(date, view);
      let row = periods.get(key);
      if (!row) {
        row = [key, 0, 0, 0, Array.from({ length: trackCount }, () => 0)];
        periods.set(key, row);
      }
      row[1] += 1;
      if (kind === 0) row[2] += 1;
      if (kind === 1) row[3] += 1;
      row[4][track] += 1;
    }
    result[view] = [...periods.values()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }
  return result;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict validation of the history asset; a broken file is never rendered. */
export function parseHistory(value: unknown): History {
  if (!value || typeof value !== 'object') throw new Error('Invalid history');
  const h = value as Record<string, unknown>;
  const keys = Object.keys(h).sort().join(',');
  if (keys !== 'aggregates,entries,generatedAt,schema,tracks')
    throw new Error('Unexpected history fields');
  if (h.schema !== 1) throw new Error('Unsupported history schema');
  if (
    typeof h.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(h.generatedAt))
  )
    throw new Error('Invalid history time');
  if (
    !Array.isArray(h.tracks) ||
    !h.tracks.length ||
    h.tracks.some(
      (t) => typeof t !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(t)
    )
  )
    throw new Error('Invalid history tracks');
  const trackCount = h.tracks.length;
  if (!Array.isArray(h.entries) || h.entries.length > 50_000)
    throw new Error('Invalid history entries');
  const seen = new Set<number>();
  for (const entry of h.entries as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 5)
      throw new Error('Invalid entry');
    const [n, date, track, kind, title] = entry;
    if (!Number.isInteger(n) || n < 1 || seen.has(n as number))
      throw new Error('Invalid entry number');
    seen.add(n as number);
    if (typeof date !== 'string' || !DATE.test(date))
      throw new Error('Invalid entry date');
    if (
      !Number.isInteger(track) ||
      (track as number) < 0 ||
      (track as number) >= trackCount
    )
      throw new Error('Invalid entry track');
    if (kind !== 0 && kind !== 1 && kind !== 2)
      throw new Error('Invalid entry kind');
    if (
      title !== null &&
      (typeof title !== 'string' || !title || title.length > 120)
    )
      throw new Error('Invalid entry title');
    if (title !== null && kind !== 0)
      throw new Error('Only features carry titles');
  }
  const entries = h.entries as HistoryEntry[];
  // Aggregates must equal what the entries add up to.
  const expected = aggregate(entries, trackCount);
  if (JSON.stringify(expected) !== JSON.stringify(h.aggregates))
    throw new Error('History aggregates do not match entries');
  return {
    schema: 1,
    generatedAt: h.generatedAt,
    tracks: h.tracks as string[],
    entries,
    aggregates: expected,
  };
}
