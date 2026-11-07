import raw from './snapshot.json' with { type: 'json' };

export type SourceStatus = 'planned' | 'active' | 'blocked';
export type RoadmapFilter = SourceStatus | 'deployed' | 'all';
export const filters: RoadmapFilter[] = [
  'all',
  'active',
  'blocked',
  'planned',
  'deployed',
];

function sourceStatus(value: string): SourceStatus {
  if (value === 'planned' || value === 'active' || value === 'blocked')
    return value;
  throw new Error('A source snapshot cannot attest a deployed state');
}

if (
  !/^[a-f0-9]{40}$/.test(raw.sourceCommit) ||
  !Number.isFinite(Date.parse(raw.checkedAt))
) {
  throw new Error('Roadmap source identity or freshness is invalid');
}

export const snapshot = {
  ...raw,
  apps: raw.apps.map((app) => ({ ...app, status: sourceStatus(app.status) })),
};
export type RoadmapApp = (typeof snapshot.apps)[number];

export function filterProducts(
  products: readonly RoadmapApp[],
  query: string,
  status: RoadmapFilter
) {
  const normalized = query.trim().toLocaleLowerCase('en');
  return products.filter(
    (app) =>
      (status === 'all' || app.status === status) &&
      (!normalized || app.name.toLocaleLowerCase('en').includes(normalized))
  );
}

export function isSnapshotStale(checkedAt: string, now: number) {
  return now - Date.parse(checkedAt) > 24 * 60 * 60 * 1000;
}
