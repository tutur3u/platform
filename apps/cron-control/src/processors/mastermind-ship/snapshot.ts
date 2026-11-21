import type { ShipAppId } from './catalog';

// The sanitized ship snapshot the collector writes to the Mastermind store
// and Web serves to the owner. It carries public release facts only: SHAs,
// times, environment and Worker names, CI states and commit counts. No
// tokens, URLs with credentials, commit messages or author identities.
// Web validates it with apps/web/src/lib/mastermind/ship/contract.ts.

export const SHIP_SNAPSHOT_KEY = 'mastermind:ship:v1:snapshot';
// Collector bookkeeping (ETags, backoff, cached Worker versions) never
// reaches Web; it lives under its own key.
export const SHIP_COLLECTOR_KEY = 'mastermind:ship:v1:collector';
export const SHIP_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60_000;

export type ShipSourceState = 'ok' | 'error' | 'backoff' | 'unconfigured';
export type ShipSourceProblem =
  | 'auth'
  | 'http'
  | 'invalid'
  | 'not-configured'
  | 'rate-limited'
  | 'timeout';

export interface ShipSource {
  /** `github:<owner>` or `cloudflare`. */
  id: string;
  name: string;
  state: ShipSourceState;
  /** When this source was last attempted. */
  checkedAt: string | null;
  /** When its data was last confirmed current. */
  okAt: string | null;
  retryAt: string | null;
  problem: ShipSourceProblem | null;
}

export type ShipCiState = 'success' | 'failure' | 'pending' | 'none';

/** The newest deployment attempt for the environment, after the live one. */
export type ShipDeployState = 'ok' | 'failed' | 'running';

export interface ShipRelease {
  sha: string;
  deployedAt: string;
  environment: string;
  ci: ShipCiState;
  deploy: ShipDeployState;
}

export interface ShipWorker {
  script: string;
  versionId: string;
  /** Traffic share of `versionId` in the active deployment. */
  percentage: number;
  deployedAt: string;
  /** SHA from the version message or tag, when one was recorded. */
  sha: string | null;
}

export interface ShipEnvironment {
  release: ShipRelease | null;
  worker: ShipWorker | null;
}

export interface ShipPending {
  commits: number;
  /** True when more commits exist than one read returns. */
  capped: boolean;
  oldestAt: string | null;
  headSha: string;
}

export interface ShipApp {
  id: ShipAppId;
  name: string;
  repository: string | null;
  production: ShipEnvironment;
  /** Null when the app has no staging environment. */
  staging: ShipEnvironment | null;
  pending: ShipPending | null;
  /** Source ids this row reads, in display order. */
  sources: string[];
}

export interface ShipSnapshot {
  version: 1;
  collectedAt: string;
  trigger: 'schedule' | 'check';
  sources: ShipSource[];
  apps: ShipApp[];
}

export interface ShipCollectorState {
  version: 1;
  /** Actions-runs ETag per repository. */
  etags: Record<string, string>;
  /** Installation id per GitHub owner, when the GitHub App is used. */
  installations: Record<string, number>;
  /** Worker version facts by version id, so each version is read once. */
  versions: Record<string, { sha: string | null; createdAt: string }>;
}

export const MAX_CACHED_VERSIONS = 64;

export function emptyCollectorState(): ShipCollectorState {
  return { version: 1, etags: {}, installations: {}, versions: {} };
}

export function parseCollectorState(raw: string | null): ShipCollectorState {
  if (!raw) return emptyCollectorState();
  try {
    const value = JSON.parse(raw) as Partial<ShipCollectorState>;
    if (value?.version !== 1) return emptyCollectorState();
    const record = <T>(input: unknown, ok: (item: unknown) => item is T) =>
      Object.fromEntries(
        Object.entries(
          input && typeof input === 'object' ? (input as object) : {}
        ).filter(([, item]) => ok(item))
      ) as Record<string, T>;
    return {
      version: 1,
      etags: record(value.etags, (item): item is string => {
        return typeof item === 'string' && item.length <= 200;
      }),
      installations: record(value.installations, (item): item is number => {
        return Number.isSafeInteger(item) && (item as number) > 0;
      }),
      versions: record(
        value.versions,
        (item): item is { sha: string | null; createdAt: string } =>
          !!item &&
          typeof item === 'object' &&
          'createdAt' in item &&
          typeof item.createdAt === 'string' &&
          'sha' in item &&
          (item.sha === null || typeof item.sha === 'string')
      ),
    };
  } catch {
    return emptyCollectorState();
  }
}

/** The previous snapshot, used to carry last-known facts past a failed source. */
export function parseSnapshot(raw: string | null): ShipSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ShipSnapshot;
    return value?.version === 1 && Array.isArray(value.apps) ? value : null;
  } catch {
    return null;
  }
}

/** Keeps the newest cached versions within the bound. */
export function trimVersions(
  versions: ShipCollectorState['versions'],
  keep: ReadonlySet<string>
) {
  const entries = Object.entries(versions).sort(([a], [b]) =>
    keep.has(a) === keep.has(b) ? 0 : keep.has(a) ? -1 : 1
  );
  return Object.fromEntries(entries.slice(0, MAX_CACHED_VERSIONS));
}
