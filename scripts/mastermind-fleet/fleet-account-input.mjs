// Private adapter from each machine's T3 provider rows and lane listing to the
// fleet merge input. Raw account identity is hashed here and goes no further:
// apps/docs/platform/features/mobile-mastermind.mdx#fleet-account-view
import { createHash } from 'node:crypto';
import {
  FLEET_MAX_READINGS,
  FLEET_MAX_ROWS,
  mergeFleetAccounts,
} from './fleet-account-merge.mjs';
import { ACTIVE_RUN_STATUSES } from './fleet-state.mjs';

const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,47}$/i;
const FINGERPRINT = /^[a-f0-9]{64}$/i;
const WINDOW_KINDS = new Set(['session', 'weekly', 'monthly', 'other']);
// One login can hold several quota accounts here, one per workspace.
const WORKSPACE_PROVIDERS = new Set(['claude', 'codex']);
const ACTIVE_LANE_STATES = new Set(['running', 'waiting', 'queued']);

const isId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;
const text = (value) => (typeof value === 'string' ? value.trim() : '');

function opaqueKey(prefix, parts) {
  const digest = createHash('sha256')
    .update(JSON.stringify(['tuturuuu-fleet-account-v1', ...parts]))
    .digest('hex');
  return `${prefix}-${digest.slice(0, 32)}`;
}

/** agent-quota's driver mapping; any other driver keeps its own name. */
export function fleetProvider(driver, instanceId) {
  if (
    driver === 'acpRegistry_github_copilot' ||
    (driver === 'acpRegistry' && instanceId === 'acpRegistry_github_copilot')
  )
    return 'copilot';
  if (driver === 'claudeAgent') return 'claude';
  return typeof driver === 'string' && PROVIDER.test(driver) ? driver : null;
}

/**
 * An opaque key that is equal on every host signed in to one provider account,
 * or null when the row does not establish which account it uses. A config-home
 * path or an instance id never does: both repeat across hosts and logins.
 */
export function providerAccountKey(provider, row) {
  if (row?.auth?.status !== 'authenticated') return null;
  const email = text(row.auth.email).toLowerCase();
  const workspace = text(row.auth.workspaceId);
  if (email.includes('@') && (workspace || !WORKSPACE_PROVIDERS.has(provider)))
    return opaqueKey('acct', [provider, 'login', email, workspace]);
  const fingerprint = text(row.usageLimits?.credentialFingerprint);
  return FINGERPRINT.test(fingerprint)
    ? opaqueKey('acct', [provider, 'fingerprint', fingerprint.toLowerCase()])
    : null;
}

function scopeFor(window) {
  const scope = {};
  for (const key of ['modelIds', 'providerIds']) {
    const ids = window[key];
    if (ids === undefined || ids === null) continue;
    if (!Array.isArray(ids) || !ids.every(isId)) return null;
    if (ids.length) scope[key] = [...ids];
  }
  return scope;
}

/** Kept as reported; only a missing value may read as an unstarted window. */
function reportedTime(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : 'invalid';
}

/** Every window with its scope; the merge decides which readings count. */
function readingsFor(row) {
  const limits = row.usageLimits;
  if (
    !row.enabled ||
    !row.installed ||
    row.auth?.status !== 'authenticated' ||
    !limits ||
    limits.unavailable ||
    !Array.isArray(limits.windows) ||
    limits.windows.length > FLEET_MAX_READINGS
  )
    return [];
  return limits.windows.flatMap((window) => {
    if (!window || typeof window !== 'object') return [];
    const known = WINDOW_KINDS.has(window.kind);
    const kind = known ? window.kind : 'unknown';
    const scope = scopeFor(window);
    if (!scope) return [];
    return [
      {
        windowId: isId(window.id) ? window.id : kind,
        kind,
        scope,
        usedPercent: Number.isFinite(window.usedPercent)
          ? window.usedPercent
          : null,
        resetsAt: reportedTime(window.resetsAt),
        observedAt: reportedTime(limits.checkedAt),
        authoritative: known,
      },
    ];
  });
}

/**
 * One private row per provider instance of a `server.getConfig` reply, never
 * collapsed across aliases. Null when the reply cannot be read row by row.
 */
export function projectFleetRows(config) {
  const providers = config?.providers;
  if (!Array.isArray(providers) || providers.length > FLEET_MAX_ROWS)
    return null;
  const rows = new Map();
  for (const row of providers) {
    if (!isId(row?.instanceId)) continue;
    const provider = fleetProvider(row.driver, row.instanceId);
    if (!provider) continue;
    if (rows.has(row.instanceId)) return null;
    rows.set(row.instanceId, {
      instanceId: row.instanceId,
      provider,
      accountKey: providerAccountKey(provider, row),
      readings: readingsFor(row),
    });
  }
  return [...rows.values()];
}

/** A lane list, or null when any active lane has no provider instance. */
function lanesFrom(rows) {
  return rows.every((row) => isId(row.instanceId)) ? rows : null;
}

/** Active lanes of the publishing host; held queued runs use no quota. */
export function readLocalLanes(db) {
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT thread_id, provider_instance_id
           FROM orchestration_v2_projection_runs
          WHERE status IN (${ACTIVE_RUN_STATUSES.map(() => '?').join(',')})
            AND NOT (status = 'queued'
              AND json_extract(payload_json, '$.queueHeld') IS 1)`
      )
      .all(...ACTIVE_RUN_STATUSES);
    return lanesFrom(
      rows.map((row) => ({
        threadId: row.thread_id,
        instanceId: row.provider_instance_id,
      }))
    );
  } catch {
    // An unreadable projection must not read as zero lanes.
    return null;
  }
}

/** Active lanes of a linked host, only from a live and complete listing. */
export function peerLanes(peer) {
  if (
    peer?.live !== true ||
    peer.laneCoverage !== 'complete' ||
    !Array.isArray(peer.threads) ||
    Object.values(peer.extraCounts ?? {}).some((count) => count !== 0)
  )
    return null;
  return lanesFrom(
    peer.threads
      .filter((thread) => ACTIVE_LANE_STATES.has(thread.state))
      .map((thread) => ({
        threadId: thread.threadId,
        instanceId: thread.provider,
      }))
  );
}

/**
 * Lane sources by fleet machine id. `environmentId` is the linked
 * environment the lanes came from, null for the publishing host.
 */
export function fleetLaneSources({ localId, localLanes, peers, ids }) {
  return new Map([
    [localId, { environmentId: null, lanes: localLanes }],
    ...peers.map((peer) => [
      ids.get(peer.environment_id),
      { environmentId: peer.environment_id, lanes: peerLanes(peer) },
    ]),
  ]);
}

const countBy = (values) =>
  values.reduce(
    (counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
    new Map()
  );

/**
 * Builds the private merge input. `machines` lists every fleet machine as
 * `{ id, environmentId, rows }`, with null `rows` when its quota was not read;
 * `complete` is false when some fleet or configured machine is left out.
 */
export function buildFleetAccountInput({ machines, complete, laneSources }) {
  const environments = countBy(machines.map((m) => m.environmentId));
  const linked = new Set(
    [...laneSources.values()].map((source) => source.environmentId)
  );
  // A thread active on two hosts cannot be attributed to either.
  const threadHosts = countBy(
    [...laneSources.values()].flatMap((source) => [
      ...new Set((source.lanes ?? []).map((lane) => lane.threadId)),
    ])
  );
  const hosts = machines.map(({ id, environmentId, rows }) => {
    if (!rows)
      return { host: id, read: 'failed', lanes: 'unknown', accounts: [] };
    const source = laneSources.get(id);
    // Quota and lanes must describe one environment, read once.
    const sameEnvironment =
      environments.get(environmentId) === 1 &&
      (source?.environmentId === null
        ? !linked.has(environmentId)
        : source?.environmentId === environmentId);
    const lanes = sameEnvironment ? source.lanes : null;
    const instances = new Set(rows.map((row) => row.instanceId));
    const counted =
      Boolean(lanes) &&
      lanes.every(
        (lane) =>
          instances.has(lane.instanceId) && threadHosts.get(lane.threadId) === 1
      );
    return {
      host: id,
      read: 'ok',
      lanes: counted ? 'counted' : 'unknown',
      accounts: rows.map((row) => ({
        accountKey:
          row.accountKey ?? opaqueKey('unidentified', [id, row.instanceId]),
        provider: row.provider,
        instanceId: row.instanceId,
        activeLanes: counted
          ? new Set(
              lanes
                .filter((lane) => lane.instanceId === row.instanceId)
                .map((lane) => lane.threadId)
            ).size
          : 'unknown',
        readings: row.readings,
      })),
    };
  });
  return { v: 1, coverage: complete ? 'complete' : 'partial', hosts };
}

/** Builds the input from the collector's private reads and merges it. */
export function mergeCollectedAccounts(collected, laneSources, now) {
  return mergeFleetAccounts(
    buildFleetAccountInput({ ...collected, laneSources }),
    now
  );
}

/** The private file body: the merged view, or a closed reason for none. */
export function fleetAccountsView(usageSnapshot, laneSources, now) {
  const unavailable = (reason) => ({
    v: 1,
    generatedAt: now.toISOString(),
    status: 'unavailable',
    reason,
  });
  if (!usageSnapshot) return unavailable('usage_unavailable');
  try {
    return {
      status: 'ok',
      ...usageSnapshot.mergeAccounts(laneSources, now),
    };
  } catch (error) {
    return unavailable(
      error?.message === 'fleet_input_invalid'
        ? 'fleet_input_invalid'
        : 'fleet_merge_failed'
    );
  }
}
