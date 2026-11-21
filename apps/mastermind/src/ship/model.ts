import {
  SHIP_INTERVAL_MS,
  SHIP_STALE_MS,
  type ShipApp,
  type ShipSnapshot,
  type ShipSource,
} from '../../../web/src/lib/mastermind/ship/contract';
import type { Tone } from '../components/tone';

// Framework-free view model of the ship snapshot, shared by the page, its
// rows and tests. A row is Checked (with its age), Partial (one of its
// sources failed), Stale (past three collector slots) or Unknown (never
// confirmed); no row renders without one of those.

export type FreshnessKind = 'checked' | 'partial' | 'stale' | 'unknown';

export interface Freshness {
  kind: FreshnessKind;
  tone: Tone;
  /** Oldest confirmation among the row's working sources. */
  okAt: string | null;
  /** Sources of the row that failed or are backing off. */
  failed: ShipSource[];
}

const FAILED = new Set<ShipSource['state']>(['error', 'backoff']);

export function sourceMap(snapshot: ShipSnapshot) {
  return new Map(snapshot.sources.map((source) => [source.id, source]));
}

export function rowFreshness(
  app: ShipApp,
  sources: Map<string, ShipSource>,
  now: number
): Freshness {
  const own = app.sources.flatMap((id) => {
    const source = sources.get(id);
    return source ? [source] : [];
  });
  const failed = own.filter((source) => FAILED.has(source.state));
  const working = own.filter((source) => source.state === 'ok');
  const times = (list: ShipSource[]) =>
    list.flatMap((source) => (source.okAt ? [source.okAt] : [])).sort();
  // Age from working sources only; with none, from the last confirmation.
  const okAt =
    working.length > 0
      ? (times(working)[0] ?? null)
      : (times(own).at(-1) ?? null);
  if (own.length === 0 || okAt === null)
    return { kind: 'unknown', tone: 'gray', okAt: null, failed };
  if (now - Date.parse(okAt) > SHIP_STALE_MS)
    return { kind: 'stale', tone: 'orange', okAt, failed };
  if (failed.length > 0)
    return { kind: 'partial', tone: 'orange', okAt, failed };
  return { kind: 'checked', tone: 'green', okAt, failed };
}

export const SHIP_GROUPS = [
  {
    id: 'platform',
    apps: ['web', 'calendar', 'contacts', 'meet', 'mail', 'mastermind'],
  },
  { id: 'mobile', apps: ['mobile'] },
  { id: 'upskii', apps: ['upskii'] },
  { id: 'masteryAi', apps: ['mastery-ai'] },
  { id: 'pktm', apps: ['pktm'] },
] as const satisfies readonly { id: string; apps: readonly ShipApp['id'][] }[];

export type ShipGroupId = (typeof SHIP_GROUPS)[number]['id'];

export function groupsOf(snapshot: ShipSnapshot) {
  const byId = new Map(snapshot.apps.map((app) => [app.id, app]));
  return SHIP_GROUPS.map((group) => {
    const apps = group.apps.flatMap((id) => {
      const app = byId.get(id);
      return app ? [app] : [];
    });
    return {
      id: group.id as ShipGroupId,
      apps,
      live: apps.filter((app) => app.production.release).length,
      waiting: apps.reduce((sum, app) => sum + (app.pending?.commits ?? 0), 0),
    };
  }).filter((group) => group.apps.length > 0);
}

/** Whole-page state: every configured source down hides the rows. */
export function pageKind(snapshot: ShipSnapshot): 'live' | 'partial' | 'error' {
  const configured = snapshot.sources.filter(
    (source) => source.state !== 'unconfigured'
  );
  if (configured.length > 0 && configured.every((s) => FAILED.has(s.state)))
    return 'error';
  return configured.some((s) => FAILED.has(s.state)) ? 'partial' : 'live';
}

/** The newest confirmation from any source: the last good check. */
export function lastGoodCheck(snapshot: ShipSnapshot) {
  return (
    snapshot.sources
      .flatMap((source) => (source.okAt ? [source.okAt] : []))
      .sort()
      .at(-1) ?? null
  );
}

export function nextCheckAt(snapshot: ShipSnapshot) {
  return Date.parse(snapshot.collectedAt) + SHIP_INTERVAL_MS;
}

export function shipStats(snapshot: ShipSnapshot, now: number) {
  const sources = sourceMap(snapshot);
  const apps = snapshot.apps;
  const pending = apps.filter((app) => app.pending && app.pending.commits > 0);
  const oldest = pending
    .flatMap((app) =>
      app.pending?.oldestAt ? [{ app, at: app.pending.oldestAt }] : []
    )
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  const failing = apps.filter(
    (app) => app.production.release?.ci === 'failure'
  );
  const doubtful = apps.filter((app) => {
    const kind = rowFreshness(app, sources, now).kind;
    return kind === 'stale' || kind === 'unknown';
  });
  return {
    live: apps.filter((app) => app.production.release).length,
    total: apps.length,
    waiting: pending.reduce((sum, app) => sum + app.pending!.commits, 0),
    capped: pending.some((app) => app.pending!.capped),
    oldest: oldest ?? null,
    failing,
    doubtful,
  };
}

/** Short SHA for display. */
export const shortSha = (sha: string) => sha.slice(0, 7);
