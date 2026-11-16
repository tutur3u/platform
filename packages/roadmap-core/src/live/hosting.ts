/**
 * Hosting provider and subdomain-to-apex migration state, observed at build
 * time and never carried over from an earlier build.
 *
 * Providers: each app's public build-info, probed from the build machine
 * (outside Cloudflare, so same-zone hosts classify correctly; see
 * host-probe.ts). Migration: the repo's base-path registry
 * (`ONE_ORIGIN_APP_BASE_PATHS` in packages/utils/src/app-mounts.ts) names the
 * apps that move and their paths; probes of the subdomain and the apex path
 * say how far each has moved. Anything not observed in this build is
 * "unverified"/"not verifiable", never a number from a previous build.
 *
 * Pure and portable: the build script, the page and the tests share it.
 */

export type Provider = 'workers' | 'vercel' | 'unknown';

export type MigrationState =
  | 'done'
  | 'in_progress'
  | 'not_started'
  | 'unverified';

export const MIGRATION_STATES: readonly MigrationState[] = [
  'done',
  'in_progress',
  'not_started',
  'unverified',
];

export type MigrationEntry = {
  app: string;
  /** Legacy origin, e.g. `https://tasks.tuturuuu.com`. */
  from: string;
  /** Apex URL, e.g. `https://tuturuuu.com/tasks`. */
  to: string;
  state: MigrationState;
};

export type HostingSnapshot = {
  /** When this build observed hosting (the build time), or null if never. */
  checkedAt: string | null;
  /** `probed`: observed now. `offline`: this build ran without network. */
  mode: 'probed' | 'offline' | 'missing';
  /** The base-path registry this build read (app → `/path`). */
  registry: Record<string, string>;
  providers: { app: string; provider: Provider }[];
  migration: MigrationEntry[];
};

/** What one HTTP probe saw: a response, or nothing at all. */
export type ProbeOutcome =
  | {
      ok: true;
      status: number;
      location: string | null;
      /** Answered by Vercel (x-vercel-id), not by the app's Worker. */
      vercel: boolean;
      /** Parsed build-info, when the body was JSON with a commit. */
      buildInfo: { commit: string; appName: string | null } | null;
    }
  | { ok: false };

export const SHARED_ORIGIN = 'https://tuturuuu.com';

/** The apex URL for a base path (`/tasks` → `https://tuturuuu.com/tasks`). */
export function apexUrl(basePath: string) {
  return `${SHARED_ORIGIN}${basePath}`;
}

function redirectsTo(outcome: ProbeOutcome, to: string) {
  if (!outcome.ok || ![301, 302, 307, 308].includes(outcome.status))
    return false;
  const location = (outcome.location ?? '').replace(/\/+$/, '');
  return (
    location === to ||
    location.startsWith(`${to}/`) ||
    location.startsWith(`${to}?`)
  );
}

/**
 * One app's state from its two probes:
 * - done: subdomain navigations redirect to the apex path (one-origin `on`);
 * - in_progress: the app's own Worker already answers on the apex path, but
 *   the subdomain still serves (one-origin `shadow`);
 * - not_started: both answered, and the apex path is not the app's;
 * - unverified: a probe got no answer.
 */
export function classifyMigration(
  subdomain: ProbeOutcome,
  apex: ProbeOutcome,
  to: string,
  app: string
): MigrationState {
  if (redirectsTo(subdomain, to)) return 'done';
  if (!subdomain.ok || !apex.ok) return 'unverified';
  const own =
    apex.status === 200 &&
    !apex.vercel &&
    apex.buildInfo !== null &&
    (apex.buildInfo.appName === null || apex.buildInfo.appName === app);
  return own ? 'in_progress' : 'not_started';
}

/** A snapshot for a build that observed nothing: every value unverified. */
export function offlineSnapshot(
  now: number,
  registry: Readonly<Record<string, string>>,
  probedApps: readonly { app: string; url: string }[]
): HostingSnapshot {
  return {
    checkedAt: new Date(now).toISOString(),
    mode: 'offline',
    registry: { ...registry },
    providers: probedApps.map(({ app }) => ({ app, provider: 'unknown' })),
    migration: Object.entries(registry).map(([app, basePath]) => ({
      app,
      from: subdomainOrigin(app, probedApps),
      to: apexUrl(basePath),
      state: 'unverified',
    })),
  };
}

/** The app's legacy origin: its probed host, else `<app>.tuturuuu.com`. */
export function subdomainOrigin(
  app: string,
  probedApps: readonly { app: string; url: string }[]
) {
  const probed = probedApps.find((entry) => entry.app === app);
  const origin = probed ? new URL(probed.url).origin : null;
  return origin && origin !== SHARED_ORIGIN
    ? origin
    : `https://${app}.tuturuuu.com`;
}

/** This build's provider for an app; anything not observed is unknown. */
export function providerFor(snapshot: HostingSnapshot, app: string): Provider {
  if (snapshot.mode !== 'probed') return 'unknown';
  return (
    snapshot.providers.find((entry) => entry.app === app)?.provider ?? 'unknown'
  );
}

/** Provider counts over `apps`, from this build's snapshot only. */
export function providerCounts(
  snapshot: HostingSnapshot,
  apps: readonly string[]
) {
  const counts: Record<Provider, number> = {
    workers: 0,
    vercel: 0,
    unknown: 0,
  };
  for (const app of apps) counts[providerFor(snapshot, app)] += 1;
  return counts;
}

/**
 * Migration counts over the registry only: an app outside the base-path
 * registry never counts, whatever a probe says about it.
 */
export function migrationSummary(
  snapshot: HostingSnapshot,
  registry: Readonly<Record<string, string>>
) {
  const counts: Record<MigrationState, number> = {
    done: 0,
    in_progress: 0,
    not_started: 0,
    unverified: 0,
  };
  const entries = Object.keys(registry).map((app) => {
    const entry = snapshot.migration.find((item) => item.app === app);
    const state: MigrationState =
      snapshot.mode === 'probed' && entry ? entry.state : 'unverified';
    counts[state] += 1;
    return {
      app,
      from: entry?.from ?? `https://${app}.tuturuuu.com`,
      to: entry?.to ?? apexUrl(registry[app] as string),
      state,
    };
  });
  return { entries, counts, total: entries.length };
}

/** When hosting was observed: this build's time, never a data file's. */
export function hostingAsOf(snapshot: HostingSnapshot): string | null {
  return snapshot.checkedAt;
}

/** Validate a snapshot from the build; anything malformed is "missing". */
export function parseHostingSnapshot(value: unknown): HostingSnapshot {
  const missing: HostingSnapshot = {
    checkedAt: null,
    mode: 'missing',
    registry: {},
    providers: [],
    migration: [],
  };
  if (!value || typeof value !== 'object') return missing;
  const raw = value as Partial<HostingSnapshot>;
  const checkedAt =
    typeof raw.checkedAt === 'string' &&
    !Number.isNaN(Date.parse(raw.checkedAt))
      ? raw.checkedAt
      : null;
  if (!checkedAt || (raw.mode !== 'probed' && raw.mode !== 'offline'))
    return missing;
  const providers = (Array.isArray(raw.providers) ? raw.providers : []).filter(
    (entry): entry is { app: string; provider: Provider } =>
      typeof entry?.app === 'string' &&
      ['workers', 'vercel', 'unknown'].includes(entry?.provider as string)
  );
  const migration = (Array.isArray(raw.migration) ? raw.migration : []).filter(
    (entry): entry is MigrationEntry =>
      typeof entry?.app === 'string' &&
      typeof entry?.from === 'string' &&
      typeof entry?.to === 'string' &&
      MIGRATION_STATES.includes(entry?.state as MigrationState)
  );
  const registry = Object.fromEntries(
    Object.entries(
      raw.registry && typeof raw.registry === 'object' ? raw.registry : {}
    ).filter(
      ([app, path]) =>
        /^[a-z][a-z0-9-]*$/.test(app) &&
        typeof path === 'string' &&
        /^\/[a-z][a-z0-9-]*$/.test(path)
    )
  ) as Record<string, string>;
  return { checkedAt, mode: raw.mode, registry, providers, migration };
}

/** The longest a snapshot may predate the build that embeds it. */
export const SNAPSHOT_MAX_AGE_MS = 60 * 60_000;

/**
 * The snapshot a build may embed: one written for this build (within
 * SNAPSHOT_MAX_AGE_MS of it). An older file, for example left behind before
 * a bare `vp build`, is treated as missing, so the page shows "not
 * verifiable" rather than an old observation.
 */
export function snapshotForBuild(value: unknown, buildTime: number): unknown {
  const snapshot = parseHostingSnapshot(value);
  if (!snapshot.checkedAt) return null;
  const age = buildTime - Date.parse(snapshot.checkedAt);
  return age >= -60_000 && age <= SNAPSHOT_MAX_AGE_MS ? value : null;
}
