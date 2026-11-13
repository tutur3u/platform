import type { HostFact, LiveData, PrFact } from './model.ts';

export const statuses = [
  'live',
  'waiting_for_prod_sync',
  'waiting_for_merge',
  'in_progress',
  'planned',
] as const;
export type Status = (typeof statuses)[number];

export type Deliverable = {
  id: string;
  title: string;
  /** Public PRs in tutur3u/platform that deliver this item. */
  prs: number[];
  /** Deployed surface whose production build must contain the merge. */
  app: string | null;
  /** Shown only while no PR evidence exists. Never `live`: that needs proof. */
  fallback: 'planned' | 'in_progress';
  /** A hosting move: live only while the app's public probe answers from Workers. */
  requires?: 'workers';
};

export type Milestone = {
  id: string;
  title: string;
  summary?: string;
  deliverables: Deliverable[];
};

export type Track = {
  id: string;
  name: string;
  summary: string;
  milestones: Milestone[];
};

export type DeliverableState = {
  status: Status;
  /** Latest merge time once every delivering PR is merged. */
  shippedAt: string | null;
  /** Merged, but the deploy cannot be observed publicly. */
  unverifiedDeploy: boolean;
  prs: PrFact[];
};

export function indexLiveData(data: LiveData) {
  return {
    prs: new Map(data.prs.map((pr) => [pr.number, pr])),
    hosts: new Map(data.hosts.map((host) => [host.app, host])),
  };
}
export type LiveIndex = ReturnType<typeof indexLiveData>;

export function deployIncludes(host: HostFact | undefined, mergedAt: string) {
  if (!host?.commit || !host.commitAt) return null;
  return Date.parse(host.commitAt) >= Date.parse(mergedAt);
}

/**
 * Status comes only from evidence:
 * - live: every PR merged and the app's deployed commit is at or after the
 *   last merge on main (or nothing needs deploying);
 * - waiting_for_prod_sync: merged, deploy not observed yet;
 * - waiting_for_merge: every unmerged PR is open, ready and approved;
 * - in_progress: any other open PR;
 * - otherwise the curated fallback (planned or in progress), never live.
 */
export function deriveDeliverable(
  deliverable: Deliverable,
  index: LiveIndex
): DeliverableState {
  const prs = deliverable.prs
    .map((number) => index.prs.get(number))
    .filter((pr): pr is PrFact => Boolean(pr));
  const relevant = prs.filter((pr) => pr.state !== 'closed');
  if (!relevant.length)
    return {
      status: deliverable.fallback,
      shippedAt: null,
      unverifiedDeploy: false,
      prs,
    };
  const open = relevant.filter((pr) => pr.state === 'open');
  if (open.length) {
    const ready = open.every((pr) => !pr.draft && pr.approved);
    return {
      status: ready ? 'waiting_for_merge' : 'in_progress',
      shippedAt: null,
      unverifiedDeploy: false,
      prs,
    };
  }
  const shippedAt = relevant
    .map((pr) => pr.mergedAt as string)
    .sort()
    .at(-1) as string;
  if (!deliverable.app)
    return { status: 'live', shippedAt, unverifiedDeploy: false, prs };
  const host = index.hosts.get(deliverable.app);
  if (deliverable.requires === 'workers') {
    const onWorkers = host?.platform === 'workers';
    return {
      status: onWorkers ? 'live' : 'waiting_for_prod_sync',
      shippedAt,
      unverifiedDeploy: !host || host.platform === 'unknown',
      prs,
    };
  }
  const included = deployIncludes(host, shippedAt);
  return {
    status: included ? 'live' : 'waiting_for_prod_sync',
    shippedAt,
    unverifiedDeploy: included === null,
    prs,
  };
}

export function deriveTracks(tracks: readonly Track[], index: LiveIndex) {
  return tracks.map((track) => {
    const milestones = track.milestones.map((milestone) => {
      const deliverables = milestone.deliverables.map((deliverable) => ({
        ...deliverable,
        state: deriveDeliverable(deliverable, index),
      }));
      return {
        ...milestone,
        deliverables,
        counts: countStatuses(deliverables),
      };
    });
    const all = milestones.flatMap((milestone) => milestone.deliverables);
    return {
      ...track,
      milestones,
      counts: countStatuses(all),
      total: all.length,
    };
  });
}
export type DerivedTrack = ReturnType<typeof deriveTracks>[number];

export function countStatuses(
  items: readonly { state: DeliverableState }[]
): Record<Status, number> {
  const counts = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<
    Status,
    number
  >;
  for (const item of items) counts[item.state.status] += 1;
  return counts;
}

/** Share of deliverables shipped (live or merged awaiting deploy). */
export function shippedShare(counts: Record<Status, number>) {
  const total = statuses.reduce((sum, s) => sum + counts[s], 0);
  if (!total) return 0;
  return (counts.live + counts.waiting_for_prod_sync) / total;
}
