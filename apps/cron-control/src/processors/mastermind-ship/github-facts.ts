import {
  environmentMatches,
  type ShipAppSpec,
  type ShipEnvName,
} from './catalog';
import { isoOrNull, SHA } from './http';
import type {
  ShipCiState,
  ShipDeployState,
  ShipPending,
  ShipRelease,
} from './snapshot';

// Pure readers of GitHub GraphQL deployment and history nodes.

export const HISTORY_PAGE = 100;

export interface Deployment {
  environment?: unknown;
  createdAt?: unknown;
  commitOid?: unknown;
  latestStatus?: { state?: unknown; createdAt?: unknown } | null;
  commit?: {
    committedDate?: unknown;
    statusCheckRollup?: { state?: unknown } | null;
  } | null;
}

function ciState(rollup: unknown): ShipCiState {
  switch (rollup) {
    case 'SUCCESS':
      return 'success';
    case 'FAILURE':
    case 'ERROR':
      return 'failure';
    case 'PENDING':
    case 'EXPECTED':
      return 'pending';
    default:
      return 'none';
  }
}

/** The newest successful deployment for one environment of one app. */
export function latestRelease(
  nodes: readonly Deployment[],
  spec: ShipAppSpec,
  env: ShipEnvName,
  hasNextPage = false,
  newest?: ShipDeployState
): (ShipRelease & { committedAt: string | null }) | null | undefined {
  const matching = nodes.filter(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      typeof node.environment === 'string' &&
      environmentMatches(spec, env, node.environment)
  );
  // The newest attempt for the environment, whatever its outcome; a later
  // page passes the first page's.
  const attempt = newest ?? deployState(matching[0]?.latestStatus?.state);
  for (const node of matching) {
    if (
      node.latestStatus?.state !== 'SUCCESS' ||
      typeof node.commitOid !== 'string' ||
      !SHA.test(node.commitOid)
    )
      continue;
    const deployedAt =
      isoOrNull(node.latestStatus.createdAt) ?? isoOrNull(node.createdAt);
    if (!deployedAt) continue;
    return {
      sha: node.commitOid,
      deployedAt,
      environment: (node.environment as string).slice(0, 100),
      ci: ciState(node.commit?.statusCheckRollup?.state),
      deploy: node === matching[0] && !newest ? 'ok' : attempt,
      committedAt: isoOrNull(node.commit?.committedDate),
    };
  }
  // A full page without a success says nothing about the live release.
  return hasNextPage ? undefined : null;
}

/** Only a newest success is `ok`; anything unfinished is `running`. */
export function deployState(state: unknown): ShipDeployState {
  switch (state) {
    case 'SUCCESS':
      return 'ok';
    case undefined:
    case null:
    case 'IN_PROGRESS':
    case 'QUEUED':
    case 'PENDING':
    case 'WAITING':
      return 'running';
    default:
      return 'failed';
  }
}

export type Commit = { oid: string; committedDate: string };

export function commits(connection: unknown): Commit[] {
  const nodes =
    connection && typeof connection === 'object' && 'nodes' in connection
      ? connection.nodes
      : null;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) =>
    node &&
    typeof node.oid === 'string' &&
    SHA.test(node.oid) &&
    isoOrNull(node.committedDate)
      ? [{ oid: node.oid, committedDate: isoOrNull(node.committedDate)! }]
      : []
  );
}

/** Commits on the branch for these histories newer than the production commit. */
export function pendingRelease(
  histories: readonly Commit[][],
  production: { sha: string; committedAt: string | null } | null,
  headSha: string
): ShipPending | null {
  if (!production?.committedAt) return null;
  const since = Date.parse(production.committedAt);
  const ahead = new Map<string, string>();
  let capped = false;
  for (const history of histories) {
    const newer = history.filter(
      (commit) =>
        commit.oid !== production.sha &&
        Date.parse(commit.committedDate) > since
    );
    if (history.length >= HISTORY_PAGE && newer.length === history.length)
      capped = true;
    for (const commit of newer) ahead.set(commit.oid, commit.committedDate);
  }
  const dates = [...ahead.values()].sort();
  return {
    commits: ahead.size,
    capped,
    oldestAt: dates[0] ?? null,
    headSha,
  };
}
