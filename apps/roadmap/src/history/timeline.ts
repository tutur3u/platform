import { TRACK_NAMES } from '../content/track-names.ts';
import type { PrFact } from '../live/model.ts';
import type { Status } from '../live/status.ts';
import { aggregate, type History, type HistoryEntry } from './build.ts';
import { classifyTitle, OTHER_TRACK } from './classify.ts';
import {
  isPeriodKey,
  localDate,
  periodEnd,
  periodKey,
  periodRange,
  periodStart,
  type View,
  views,
} from './periods.ts';

/** A curated deliverable as the timeline needs it. */
export type TimelineDeliverable = {
  id: string;
  title: string;
  trackId: string;
  prs: number[];
  state: { status: Status; shippedAt: string | null };
};

export const FIRST_DATE = '2022-10-20';

/**
 * PRs merged after the history asset was generated (from the live refresh),
 * classified like the build so the current period stays current.
 */
export function liveEntries(
  prs: readonly PrFact[],
  history: Pick<History, 'tracks' | 'entries' | 'generatedAt'>
): HistoryEntry[] {
  const known = new Set(history.entries.map((entry) => entry[0]));
  const index = new Map(history.tracks.map((track, i) => [track, i]));
  const tracks = new Set(history.tracks);
  const after = Date.parse(history.generatedAt);
  const entries: HistoryEntry[] = [];
  for (const pr of prs) {
    if (pr.state !== 'merged' || !pr.mergedAt || known.has(pr.number)) continue;
    if (Date.parse(pr.mergedAt) < after - 86_400_000) continue;
    const c = classifyTitle(pr.title, tracks);
    entries.push([
      pr.number,
      localDate(pr.mergedAt),
      index.get(c.track) ?? (index.get(OTHER_TRACK) as number),
      c.kind === 'feature' ? 0 : c.kind === 'fix' ? 1 : 2,
      c.title,
    ]);
  }
  return entries;
}

export function combineHistory(
  history: History,
  extra: readonly HistoryEntry[]
): History {
  if (!extra.length) return history;
  const entries = [...extra, ...history.entries].sort(
    (a, b) => b[1].localeCompare(a[1]) || b[0] - a[0]
  );
  return {
    ...history,
    entries,
    aggregates: aggregate(entries, history.tracks.length),
  };
}

/** Every period from the first merge to today, gaps filled with zero. */
export function scrubberPeriods(
  history: History | null,
  view: View,
  today: string
) {
  const totals = new Map(
    (history?.aggregates[view] ?? []).map((row) => [row[0], row[1]])
  );
  const from = history?.entries.at(-1)?.[1] ?? FIRST_DATE;
  return periodRange(from, today, view).map((key) => ({
    key,
    total: totals.get(key) ?? 0,
  }));
}

/** Chips the scrubber renders at once; arrows and keys reach the rest. */
export const SCRUBBER_WINDOW = 24;

/**
 * The slice of `periods` the scrubber renders: SCRUBBER_WINDOW chips that
 * always include `selected`, leaning toward the present. Rendering every week
 * since 2022 put 200+ buttons in the DOM for a strip that shows about ten.
 */
export function scrubberWindow<T extends { key: string }>(
  periods: readonly T[],
  selected: string,
  size = SCRUBBER_WINDOW
): T[] {
  if (periods.length <= size) return [...periods];
  const found = periods.findIndex((period) => period.key === selected);
  const index = found < 0 ? periods.length - 1 : found;
  const end = Math.min(
    periods.length,
    Math.max(index + 1 + Math.floor(size / 3), size)
  );
  return periods.slice(end - size, end);
}

/**
 * A period chip's accessible name. It starts with the chip's visible label
 * (for example "Now" or "W46"), so voice users can say what they see
 * (WCAG 2.5.3 Label in Name), then adds the period key and its count.
 */
export function periodChipName(
  visible: string,
  key: string,
  total: number,
  words: { changeOne: string; changes: string }
) {
  const count = `${total} ${total === 1 ? words.changeOne : words.changes}`;
  return visible === key
    ? `${visible}: ${count}`
    : `${visible}, ${key}: ${count}`;
}

export type TimelineGroup = {
  track: string;
  name: string;
  deliverables: TimelineDeliverable[];
  /** Identical titles (paired dev/production merges) fold into one row. */
  features: { numbers: number[]; title: string; date: string }[];
  fixes: number;
  other: number;
  total: number;
};

export function timelinePeriod(input: {
  history: History | null;
  deliverables: readonly TimelineDeliverable[];
  view: View;
  key: string;
  today: string;
}) {
  const { history, deliverables, view, key, today } = input;
  const start = periodStart(key, view);
  const end = periodEnd(key, view);
  const inPeriod = (date: string) => date >= start && date <= end;
  const owned = new Set(deliverables.flatMap((d) => d.prs));
  const groups = new Map<string, TimelineGroup>();
  const group = (track: string) => {
    let g = groups.get(track);
    if (!g) {
      g = {
        track,
        name: TRACK_NAMES[track] ?? track,
        deliverables: [],
        features: [],
        fixes: 0,
        other: 0,
        total: 0,
      };
      groups.set(track, g);
    }
    return g;
  };
  const shipped = deliverables.filter(
    (d) => d.state.shippedAt && inPeriod(localDate(d.state.shippedAt))
  );
  for (const d of shipped) {
    const g = group(d.trackId);
    g.deliverables.push(d);
    g.total += 1;
  }
  let features = 0;
  let fixes = 0;
  let total = 0;
  for (const [number, date, trackIndex, kind, title] of history?.entries ??
    []) {
    if (!inPeriod(date)) continue;
    total += 1;
    if (kind === 0) features += 1;
    if (kind === 1) fixes += 1;
    // A PR that delivers a curated item is shown once, as that deliverable.
    if (owned.has(number)) continue;
    const track = history?.tracks[trackIndex] ?? OTHER_TRACK;
    const g = group(track);
    g.total += 1;
    if (kind === 0 && title && track !== OTHER_TRACK) {
      const same = g.features.find(
        (f) => f.title.toLowerCase() === title.toLowerCase()
      );
      if (same) same.numbers.push(number);
      else g.features.push({ numbers: [number], title, date });
    } else if (kind === 1) g.fixes += 1;
    else g.other += 1;
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      Number(a.track === OTHER_TRACK) - Number(b.track === OTHER_TRACK) ||
      b.deliverables.length - a.deliverables.length ||
      b.total - a.total
  );
  return {
    view,
    key,
    start,
    end,
    isCurrent: today >= start && today <= end,
    groups: ordered,
    totals: { deliverables: shipped.length, features, fixes, total },
  };
}
export type TimelinePeriod = ReturnType<typeof timelinePeriod>;

/** Planned and in-flight work, most advanced first. */
export function plannedNext(
  deliverables: readonly TimelineDeliverable[],
  limit = 10
) {
  const rank: Partial<Record<Status, number>> = {
    waiting_for_merge: 0,
    in_progress: 1,
    planned: 2,
  };
  return deliverables
    .filter((d) => d.state.status in rank)
    .sort((a, b) => (rank[a.state.status] ?? 9) - (rank[b.state.status] ?? 9))
    .slice(0, limit);
}

/** `?view=month&period=2025-03`; anything invalid falls back to this week. */
export function parseTimelineQuery(search: string, today: string) {
  const params = new URLSearchParams(search);
  const rawView = params.get('view');
  const view: View = (views as readonly string[]).includes(rawView ?? '')
    ? (rawView as View)
    : 'week';
  const current = periodKey(today, view);
  const raw = params.get('period') ?? '';
  const first = periodKey(FIRST_DATE, view);
  const period =
    isPeriodKey(raw, view) && raw >= first && raw <= current ? raw : current;
  return { view, period };
}

export function timelineSearch(view: View, period: string, today: string) {
  if (view === 'week' && period === periodKey(today, 'week')) return '';
  const params = new URLSearchParams({ view, period });
  return `?${params}`;
}
