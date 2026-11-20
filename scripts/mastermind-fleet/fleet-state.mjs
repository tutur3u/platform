// Builds the Mastermind fleet sync v1 snapshot from the local T3 state
// database. Reads metadata only (titles, statuses, providers, timestamps);
// message bodies, prompts and runtime requests are never selected. The Web
// route validates and scrubs again; see
// apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
import { createHash } from 'node:crypto';

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

/** Light first pass; the server scrub is authoritative. */
export function tidyText(value, max) {
  const text = String(value ?? '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ')
    .replace(/(~|\.{1,2})?\/[\w.@-]+(\/[\w.@-]+)+\/?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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
      `SELECT thread_id, status, provider, requested_at, completed_at FROM (
         SELECT r.*, ROW_NUMBER() OVER (
           PARTITION BY thread_id ORDER BY ordinal DESC) AS rn
           FROM orchestration_v2_projection_runs r
          WHERE requested_at >= ? OR completed_at >= ?)
        WHERE rn = 1`
    )
    .all(since, since);
  const ids = [...new Set([...active, ...recent].map((row) => row.thread_id))];
  const threads = new Map();
  const lookup = db.prepare(
    `SELECT t.thread_id, t.title, t.updated_at, t.archived_at, t.deleted_at,
            t.payload_json, p.title AS project_title
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
      `SELECT environment_id, label, last_reached_at
         FROM peer_environment_links`
    )
    .all();
  return { active, recent, threads, peers };
}

function peerStatus(lastReachedAt, now) {
  if (!lastReachedAt) return 'offline';
  const age = now.getTime() - Date.parse(lastReachedAt);
  if (age <= 10 * 60 * 1000) return 'online';
  if (age <= 2 * 60 * 60 * 1000) return 'stale';
  return 'offline';
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
  const consider = (threadId, state, provider, startedAt) => {
    const thread = rows.threads.get(threadId);
    if (
      !thread ||
      thread.archived_at ||
      thread.deleted_at ||
      seen.has(threadId)
    )
      return;
    seen.add(threadId);
    const payload = parsePayload(thread.payload_json);
    const parent = payload?.lineage?.parentThreadId;
    lanes.push({
      threadId,
      title: thread.title,
      lane: {
        id: opaqueId('lane', threadId),
        title: tidyText(thread.title, 80) || 'Untitled lane',
        ...(thread.project_title
          ? { project: tidyText(thread.project_title, 40) }
          : {}),
        ...(provider ? { provider: tidyText(provider, 24) } : {}),
        ...(payload?.modelSelection?.model
          ? { model: tidyText(payload.modelSelection.model, 40) }
          : {}),
        machineId: localMachine.id,
        state,
        ...(parent ? { parentId: opaqueId('lane', parent) } : {}),
        ...(startedAt ? { startedAt } : {}),
        updatedAt: thread.updated_at,
      },
    });
  };

  for (const [threadId, entry] of byThread)
    consider(
      threadId,
      runState(entry.statuses),
      entry.provider,
      entry.startedAt
    );
  for (const run of rows.recent) {
    if (byThread.has(run.thread_id)) continue;
    consider(
      run.thread_id,
      run.status === 'failed' ? 'failed' : 'idle',
      run.provider,
      undefined
    );
  }

  const counts = { running: 0, waiting: 0, queued: 0, idle: 0, failed: 0 };
  for (const { lane } of lanes) counts[lane.state] += 1;

  const orchestratorEntry = lanes
    .filter((entry) => orchestratorPattern.test(entry.title))
    .sort(
      (a, b) =>
        STATE_ORDER[a.lane.state] - STATE_ORDER[b.lane.state] ||
        b.lane.updatedAt.localeCompare(a.lane.updatedAt)
    )[0];
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
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        b.updatedAt.localeCompare(a.updatedAt)
    )
    .slice(0, MAX_LANES);

  const machines = [
    {
      id: localMachine.id,
      label: tidyText(localMachine.label, 40) || 'This Mac',
      // The publisher itself is the heartbeat; `receivedAt` carries its age.
      status: 'online',
    },
    ...rows.peers.map((peer) => ({
      id: slugify(peer.label, opaqueId('machine', peer.environment_id)),
      label: tidyText(peer.label, 40) || 'Machine',
      status: peerStatus(peer.last_reached_at, now),
      ...(peer.last_reached_at ? { lastSeenAt: peer.last_reached_at } : {}),
    })),
  ]
    .filter(
      (machine, index, all) =>
        all.findIndex((other) => other.id === machine.id) === index
    )
    .slice(0, MAX_MACHINES);

  return {
    version: 1,
    generatedAt: now.toISOString(),
    orchestrator,
    counts,
    machines,
    lanes: sortedLanes,
    decisions,
  };
}

/** Content hash that ignores `generatedAt`, for publish-on-change. */
export function contentHash(state) {
  const { generatedAt: _generatedAt, ...content } = state;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
