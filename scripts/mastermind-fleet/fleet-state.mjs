// Builds the Mastermind fleet sync v1 snapshot from the local T3 state
// database. Reads metadata only (titles, statuses, providers, timestamps);
// message bodies, prompts and runtime requests are never selected. The Web
// route validates and scrubs again; see
// apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
import { createHash } from 'node:crypto';
import { supersedeFailures } from './lane-outcomes.mjs';
import { classifyPeer } from './peer-lanes.mjs';
import { fleetText } from './scrub.mjs';

export const ACTIVE_RUN_STATUSES = [
  'queued',
  'preparing',
  'starting',
  'running',
  'waiting',
];
const STATE_ORDER = { running: 0, waiting: 1, queued: 2, failed: 3, idle: 4 };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LANES = 300;
const MAX_MACHINES = 32;
const ACTIVE_STATES = new Set(['running', 'waiting', 'queued']);
/** Run statuses that ended without finishing or failing the work. */
export const CANCELLED_RUN_STATUSES = new Set([
  'cancelled',
  'interrupted',
  'rolled_back',
]);
const RESOLUTIONS = new Set(['recovered', 'quotaRecovered', 'cancelled']);
const fleetCountStates = new Set(Object.keys(STATE_ORDER));

export function opaqueId(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

export function slugify(value, fallback = 'machine') {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

/** Text as the Web route will store it, within the edge guard's limits. */
export function tidyText(value, max) {
  return fleetText(String(value ?? ''), max);
}

/**
 * A contract timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`), or undefined for
 * anything unparseable or outside years 0000-9999, which the schema refuses.
 */
export function isoTime(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  const iso = new Date(ms).toISOString();
  return /^\d{4}-\d{2}-\d{2}T/.test(iso) ? iso : undefined;
}

/** Newest first, then the opaque id, so equal rows order the same each run. */
function compareLanes(a, b) {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.id.localeCompare(b.id)
  );
}

function optionalText(key, value, max) {
  const text = tidyText(value, max);
  return text ? { [key]: text } : {};
}

function runState(statuses) {
  if (statuses.some((s) => ['running', 'preparing', 'starting'].includes(s)))
    return 'running';
  if (statuses.includes('waiting')) return 'waiting';
  return 'queued';
}

function parsePayload(json) {
  try {
    return JSON.parse(json) ?? {};
  } catch {
    return {};
  }
}

/** Reads the rows the snapshot needs from an open read-only database. */
export function readFleetRows(db, now = new Date()) {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const active = db
    .prepare(
      `SELECT thread_id, status, provider, requested_at
         FROM orchestration_v2_projection_runs
        WHERE status IN (${ACTIVE_RUN_STATUSES.map(() => '?').join(',')})`
    )
    .all(...ACTIVE_RUN_STATUSES);
  const recent = db
    .prepare(
      `SELECT thread_id, status, provider, requested_at, completed_at,
              had_failure, quota_resumed FROM (
         SELECT r.*, ROW_NUMBER() OVER (
           PARTITION BY thread_id ORDER BY ordinal DESC) AS rn,
           MAX(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) OVER (
             PARTITION BY thread_id) AS had_failure,
           json_extract(payload_json, '$.usageLimitContinuationOfRunId')
             IS NOT NULL AS quota_resumed
           FROM orchestration_v2_projection_runs r
          WHERE requested_at >= ? OR completed_at >= ?)
        WHERE rn = 1`
    )
    .all(since, since);
  const ids = [...new Set([...active, ...recent].map((row) => row.thread_id))];
  const threads = new Map();
  const lookup = db.prepare(
    `SELECT t.thread_id, t.title, t.updated_at, t.archived_at, t.deleted_at,
            t.payload_json, t.project_id, p.title AS project_title
       FROM orchestration_v2_projection_threads t
       LEFT JOIN projection_projects p ON p.project_id = t.project_id
      WHERE t.thread_id = ?`
  );
  for (const id of ids) {
    const row = lookup.get(id);
    if (row) threads.set(id, row);
  }
  const peers = db
    .prepare(
      `SELECT environment_id, label, last_reached_at, secret_name, urls_json,
              expires_at, linked_at, fenced
         FROM peer_environment_links
        ORDER BY linked_at, environment_id`
    )
    .all();
  return { active, recent, threads, peers };
}

/**
 * Machine ids for every peer, keyed by environment: the slugged label, or the
 * label plus an environment hash when another machine already holds it.
 */
export function peerMachineIds(peers, localId) {
  const taken = new Set([localId]);
  const ids = new Map();
  for (const peer of peers) {
    const base = slugify(peer.label, opaqueId('machine', peer.environment_id));
    let id = base;
    for (let n = 0; taken.has(id); n++)
      id = `${base.slice(0, 40)}-${opaqueId('m', `${peer.environment_id}:${n}`).slice(2, 10)}`;
    taken.add(id);
    ids.set(peer.environment_id, id);
  }
  return ids;
}

/**
 * Pure snapshot builder. `decisions` are already-validated decision records
 * from the orchestrator's decisions folder.
 */
export function buildFleetState(
  rows,
  {
    now = new Date(),
    localMachine = { id: 'local', label: 'This Mac' },
    orchestratorPattern = /^\[Iris\]/i,
    orchestratorLabel = 'Iris',
    decisions = [],
  } = {}
) {
  const byThread = new Map();
  for (const run of rows.active) {
    const entry = byThread.get(run.thread_id) ?? {
      statuses: [],
      provider: run.provider,
      startedAt: run.requested_at,
    };
    entry.statuses.push(run.status);
    if (run.status === 'running' || run.requested_at < entry.startedAt)
      entry.startedAt = run.requested_at;
    byThread.set(run.thread_id, entry);
  }

  const lanes = [];
  const seen = new Set();
  // `projectKey` (never published) compares projects for supersession: the
  // title when known, else the machine and project id, so two lanes whose
  // titles failed to resolve never read as the same project.
  const projectKey = (machineId, title, id) =>
    tidyText(title, 40) || (id ? `unknown:${machineId}:${id}` : undefined);
  // `attemptAt` (never published) orders attempts for supersession: when
  // the newest run ended, or started while it is active. A peer listing
  // reports only the thread's update time.
  const pushLane = (threadId, title, lane, key, attemptAt) => {
    seen.add(threadId);
    lanes.push({ threadId, title, lane, projectKey: key, attemptAt });
  };
  const consider = (
    threadId,
    state,
    provider,
    startedAt,
    resolution,
    endedAt
  ) => {
    const thread = rows.threads.get(threadId);
    if (
      !thread ||
      thread.archived_at ||
      thread.deleted_at ||
      seen.has(threadId)
    )
      return;
    const updatedAt = isoTime(thread.updated_at);
    if (!updatedAt) return;
    const started = isoTime(startedAt);
    const payload = parsePayload(thread.payload_json);
    // T3's thread list leaves side chats out on every machine, so the local
    // count does too.
    if (payload?.lineage?.sideChat) return;
    const parent = payload?.lineage?.parentThreadId;
    pushLane(
      threadId,
      thread.title,
      {
        id: opaqueId('lane', threadId),
        title: tidyText(thread.title, 80) || 'Untitled lane',
        ...optionalText('project', thread.project_title, 40),
        ...optionalText('provider', provider, 24),
        ...optionalText('model', payload?.modelSelection?.model, 40),
        machineId: localMachine.id,
        state,
        ...(resolution ? { resolution } : {}),
        ...(parent ? { parentId: opaqueId('lane', parent) } : {}),
        ...(started ? { startedAt: started } : {}),
        updatedAt,
      },
      projectKey(localMachine.id, thread.project_title, thread.project_id),
      isoTime(endedAt) ?? started ?? updatedAt
    );
  };

  for (const [threadId, entry] of byThread)
    consider(
      threadId,
      runState(entry.statuses),
      entry.provider,
      entry.startedAt
    );
  // A thread's newest run decides its state. A later finished run on a
  // thread that failed in the window recovered it, as a quota recovery when
  // T3 resumed it after a usage limit; a cancelled, interrupted or rolled
  // back run ended it without failing.
  for (const run of rows.recent) {
    if (byThread.has(run.thread_id)) continue;
    consider(
      run.thread_id,
      run.status === 'failed' ? 'failed' : 'idle',
      run.provider,
      undefined,
      CANCELLED_RUN_STATUSES.has(run.status)
        ? 'cancelled'
        : run.status === 'completed' && run.had_failure
          ? run.quota_resumed
            ? 'quotaRecovered'
            : 'recovered'
          : undefined,
      run.completed_at ?? run.requested_at
    );
  }

  // Threads on linked environments carry their own machine's id. Machines past
  // the cap are left out with their lanes; a thread listed twice keeps the
  // local row, then a live listing over a cached one.
  const machineIds = peerMachineIds(rows.peers, localMachine.id);
  const peers = rows.peers
    .map((peer) => ({
      ...peer,
      machineId: machineIds.get(peer.environment_id),
    }))
    .slice(0, MAX_MACHINES - 1);
  const byFreshness = [
    ...peers.filter((peer) => peer.live !== false),
    ...peers.filter((peer) => peer.live === false),
  ];
  for (const peer of byFreshness)
    for (const thread of peer.threads ?? []) {
      const updatedAt = isoTime(thread.updatedAt);
      if (seen.has(thread.threadId) || !updatedAt) continue;
      pushLane(
        thread.threadId,
        thread.title,
        {
          id: opaqueId('lane', thread.threadId),
          title: tidyText(thread.title, 80) || 'Untitled lane',
          ...optionalText('project', thread.projectTitle, 40),
          ...optionalText('provider', thread.provider, 24),
          ...optionalText('model', thread.model, 40),
          machineId: peer.machineId,
          state: thread.state,
          ...(thread.state === 'idle' && RESOLUTIONS.has(thread.resolution)
            ? { resolution: thread.resolution }
            : {}),
          ...(thread.parentThreadId
            ? { parentId: opaqueId('lane', thread.parentThreadId) }
            : {}),
          updatedAt,
        },
        projectKey(peer.machineId, thread.projectTitle, thread.projectId)
      );
    }

  // `failed` holds only failures nobody picked up again; recovered and
  // cancelled lanes count under `idle` and again under their resolution.
  supersedeFailures(lanes);
  const counts = {
    running: 0,
    waiting: 0,
    queued: 0,
    idle: 0,
    failed: 0,
    recovered: 0,
    quotaRecovered: 0,
    cancelled: 0,
  };
  for (const { lane } of lanes) {
    counts[lane.state] += 1;
    if (lane.resolution) counts[lane.resolution] += 1;
  }
  for (const peer of peers)
    for (const [state, extra] of Object.entries(peer.extraCounts ?? {}))
      if (fleetCountStates.has(state) && Number.isInteger(extra) && extra > 0)
        counts[state] += extra;

  const orchestratorEntry = lanes
    .filter((entry) => orchestratorPattern.test(entry.title))
    .sort((a, b) => compareLanes(a.lane, b.lane))[0];
  const orchestrator = {
    label: orchestratorLabel,
    state: !orchestratorEntry
      ? 'offline'
      : orchestratorEntry.lane.state === 'running'
        ? 'running'
        : orchestratorEntry.lane.state === 'waiting' ||
            orchestratorEntry.lane.state === 'queued'
          ? 'waiting'
          : 'idle',
    ...(orchestratorEntry
      ? { lastActiveAt: orchestratorEntry.lane.updatedAt }
      : {}),
  };

  const sortedLanes = lanes
    .map((entry) => entry.lane)
    .sort(compareLanes)
    .slice(0, MAX_LANES);

  const machines = [
    {
      id: localMachine.id,
      label: tidyText(localMachine.label, 40) || 'This Mac',
      lastSeenAt: now.toISOString(),
      status: 'online',
      ...(localMachine.todayOutcomes
        ? { todayOutcomes: localMachine.todayOutcomes }
        : {}),
    },
    ...peers.map((peer) => {
      const lastSeenAt = isoTime(peer.lastSeenAt ?? peer.last_reached_at);
      return {
        id: peer.machineId,
        label: tidyText(peer.label, 40) || 'Machine',
        status:
          peer.status ??
          classifyPeer(
            { reachedNow: false, lastSeenAt, expiresAt: peer.expires_at },
            now
          ),
        ...(lastSeenAt ? { lastSeenAt } : {}),
      };
    }),
  ];

  // Every machine's active lanes before the cap, overflow included. Kept off
  // the wire (non-enumerable): the contract has no per-machine count yet.
  const machineActive = {};
  for (const { lane } of lanes)
    if (ACTIVE_STATES.has(lane.state))
      machineActive[lane.machineId] = (machineActive[lane.machineId] ?? 0) + 1;
  for (const peer of peers)
    for (const [state, extra] of Object.entries(peer.extraCounts ?? {}))
      if (ACTIVE_STATES.has(state) && Number.isInteger(extra) && extra > 0)
        machineActive[peer.machineId] =
          (machineActive[peer.machineId] ?? 0) + extra;

  const state = {
    version: 1,
    generatedAt: now.toISOString(),
    orchestrator,
    counts,
    machines,
    lanes: sortedLanes,
    decisions,
  };
  Object.defineProperty(state, 'machineActive', { value: machineActive });
  return state;
}

/** Content hash that ignores `generatedAt` and machine ages, for publish-on-change. */
export function contentHash(state) {
  const { generatedAt: _generatedAt, ...content } = state;
  // Every live probe refreshes `lastSeenAt`; the heartbeat publish carries
  // it, so only a status change forces an early publish.
  content.machines = content.machines.map(
    ({ lastSeenAt: _lastSeenAt, todayOutcomes, ...machine }) => {
      if (!todayOutcomes) return machine;
      const { observedAt: _observedAt, ...counts } = todayOutcomes;
      return { ...machine, todayOutcomes: counts };
    }
  );
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
