import { tracks as contentTracks } from './content/tracks.ts';
import { localDay, shippedFeed } from './live/feed.ts';
import { APP_NAMES } from './live/host-probe.ts';
import type { LiveData } from './live/model.ts';
import {
  countStatuses,
  deriveTracks,
  indexLiveData,
  type Status,
  type Track,
} from './live/status.ts';

export type StatusFilter = 'all' | 'shipped' | 'active' | 'planned';

export function matchesFilter(status: Status, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'shipped')
    return status === 'live' || status === 'waiting_for_prod_sync';
  if (filter === 'active')
    return status === 'in_progress' || status === 'waiting_for_merge';
  return status === 'planned';
}

const WEEK = 7 * 86_400_000;

export function buildView(
  data: LiveData,
  now: number,
  tracks: readonly Track[] = contentTracks
) {
  const index = indexLiveData(data);
  const derived = deriveTracks(tracks, index);
  const items = derived.flatMap((track) =>
    track.milestones.flatMap((milestone) =>
      milestone.deliverables.map((deliverable) => ({
        ...deliverable,
        trackId: track.id,
        trackName: track.name,
        milestoneTitle: milestone.title,
      }))
    )
  );
  const totals = countStatuses(items);
  const recent = items
    .filter(
      (item) =>
        item.state.shippedAt &&
        now - Date.parse(item.state.shippedAt) <= WEEK &&
        Date.parse(item.state.shippedAt) <= now + 60_000
    )
    .sort((a, b) =>
      (b.state.shippedAt as string).localeCompare(a.state.shippedAt as string)
    );
  const curatedPrs = new Set(items.flatMap((item) => item.prs));
  const feed = shippedFeed(data.prs, now).filter(
    (item) => !curatedPrs.has(item.number)
  );
  const hosts = data.hosts
    .filter((host) => host.app !== 'mobile')
    .map((host) => ({ ...host, name: APP_NAMES[host.app] ?? host.app }))
    .sort(
      (a, b) =>
        platformRank(a.platform) - platformRank(b.platform) ||
        a.name.localeCompare(b.name)
    );
  return {
    tracks: derived,
    items,
    totals,
    total: items.length,
    recent,
    feed,
    hosts,
    mobile: data.hosts.find((host) => host.app === 'mobile') ?? null,
    onWorkers: hosts.filter((host) => host.platform === 'workers').length,
    today: localDay(new Date(now).toISOString()),
  };
}

function platformRank(platform: string) {
  return ['workers', 'vercel', 'store', 'unknown'].indexOf(platform);
}

export type RoadmapView = ReturnType<typeof buildView>;

/** Group already-sorted items by Vietnam calendar day. */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string) {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = localDay(at(item));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
