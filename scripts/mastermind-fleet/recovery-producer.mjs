import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { peerMachineIds, slugify } from './fleet-state.mjs';
import { readPeers } from './peer-lanes.mjs';
import {
  MAX_HOSTS,
  normalizeRecoverySummary,
  STALE_AFTER_MS,
} from './recovery-summary.mjs';

const STATUS = ['failed', 'interrupted'];
const MAX_PAGES = 20;
const LOG_BYTES = 256 * 1024;
const HOLDS = [
  'memory_pair',
  'client_desks_unsettled',
  'unpushed_work_threads',
  'unknown_write_lanes',
];
const ACTIONS = [
  'settled_superseded_children',
  'moved_client_desks_to_claudeAgent',
  'cancelled_memory_review_by_freeze',
];

export function readLocal(db) {
  return db
    .prepare(`
    SELECT r.status, r.provider,
           json_extract(t.payload_json, '$.lineage.parentThreadId') AS parent,
           json_extract(p.payload_json, '$.settledOverride') = 'settled' AS parentSettled,
           CASE WHEN json_extract(t.payload_json, '$.limitRecovery.runId') = r.run_id
             THEN json_extract(t.payload_json, '$.limitRecovery.resetAt') END AS resetAt,
           json_extract(t.payload_json, '$.limitRecovery.autoResume') AS autoResume
    FROM orchestration_v2_projection_threads t
    JOIN orchestration_v2_projection_runs r ON r.run_id = (
      SELECT latest.run_id FROM orchestration_v2_projection_runs latest
      WHERE latest.thread_id = t.thread_id ORDER BY latest.ordinal DESC LIMIT 1
    )
    LEFT JOIN orchestration_v2_projection_threads p
      ON p.thread_id = json_extract(t.payload_json, '$.lineage.parentThreadId')
    WHERE t.archived_at IS NULL AND t.deleted_at IS NULL
      AND json_extract(t.payload_json, '$.settledOverride') IS NOT 'settled'
      AND r.status IN ('failed', 'interrupted')
  `)
    .all();
}

export async function listRecoveryThreads(call) {
  const rows = new Map();
  let cursor = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await call('t3_thread_list', {
      allProjects: true,
      includeSubagents: true,
      statuses: STATUS,
      limit: 100,
      cursor,
    });
    if (!Array.isArray(result?.threads) || result.threads.length > 100)
      throw new Error('invalid recovery listing');
    for (const row of result.threads) {
      if (
        typeof row?.threadId !== 'string' ||
        rows.has(row.threadId) ||
        !STATUS.includes(row.status) ||
        typeof row.settled !== 'boolean'
      )
        throw new Error('invalid recovery row');
      rows.set(
        row.threadId,
        row.settled
          ? null
          : {
              status: row.status,
              provider: row.providerInstanceId,
              parent: row.parentThreadId,
              remote: true,
            }
      );
    }
    if (result.nextCursor === null) return [...rows.values()].filter(Boolean);
    if (!Number.isInteger(result.nextCursor) || result.nextCursor <= cursor)
      throw new Error('invalid recovery cursor');
    cursor = result.nextCursor;
  }
  throw new Error('recovery page limit');
}

function providerFamily(provider) {
  if (typeof provider !== 'string') return 'unknown';
  if (/^claude(?:Agent|_|$)/.test(provider)) return 'claude';
  if (/^codex(?:_|$)/.test(provider)) return 'codex';
  return ['antigravity', 'cursor', 'grok', 'opencode'].includes(provider)
    ? provider
    : 'unknown';
}

function classify(row, now) {
  const reset = Date.parse(row.resetAt);
  let reason = row.remote ? 'unknown' : 'failed_no_recovery_armed';
  if (row.status === 'interrupted') reason = 'owner_paused_or_interrupted';
  else if (Number.isFinite(reset)) {
    if (reset <= now.getTime()) reason = 'limit_reset_passed_still_failed';
    else
      reason = row.autoResume
        ? 'limit_waiting_auto_resume_armed'
        : 'limit_waiting_no_auto_resume';
  }
  return {
    by_status: row.status,
    by_reason: reason,
    by_owner_class: row.parentSettled
      ? 'parent_settled_orphan'
      : row.parent
        ? 'unknown'
        : 'parent_lead',
    by_retry_eligibility:
      row.status === 'failed' && reset > now.getTime()
        ? 'blocked_seat_exhausted'
        : 'unknown',
    by_next_action:
      row.status === 'failed' && reset > now.getTime()
        ? 'owner_moves_to_admitted_seat_or_waits_for_reset'
        : 'unknown',
    by_provider_family: providerFamily(row.provider),
  };
}

// The sweep log is free prose. Count only explicit, timestamped aggregate
// receipts with an exact action key; never infer an action from prose or a title.
export function readActionReceipts(file, now) {
  let fd;
  const actions = {};
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return actions;
    const offset = Math.max(0, stat.size - LOG_BYTES);
    const buffer = Buffer.alloc(stat.size - offset);
    const length = fs.readSync(fd, buffer, 0, buffer.length, offset);
    const lines = buffer.toString('utf8', 0, length).split('\n');
    if (offset) lines.shift();
    if (lines.at(-1) !== '') lines.pop();
    for (const line of lines) {
      const match = /^(\d{4}-\d\d-\d\d \d\d:\d\d) ICT \| (\w+)=(\d{1,5})$/.exec(
        line
      );
      if (!match || !ACTIONS.includes(match[2])) continue;
      const age =
        now.getTime() - Date.parse(match[1].replace(' ', 'T') + ':00+07:00');
      if (age >= 0 && age <= STALE_AFTER_MS)
        actions[match[2]] = Number(match[3]);
    }
    return actions;
  } catch (error) {
    if (error.code === 'ENOENT') return actions;
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function buildSummary(hosts, actions, now) {
  if (hosts.length > MAX_HOSTS || !hosts.some((host) => host.rows))
    throw new Error('recovery coverage unavailable');
  const coverage = {
    hosts_read: [],
    hosts_without_unsettled: [],
    hosts_unread: [],
    partial: false,
    source: 'Read-only T3 thread projections',
    note: 'Holds and eligibility grant no retry permission.',
  };
  const summary = {
    schema: 'fleet-recovery-summary/v1',
    sanitized: true,
    generatedAt: now.toISOString(),
    coverage,
    total_unsettled_failed_or_interrupted: 0,
    by_host: {},
    by_status: {},
    by_reason: {},
    by_owner_class: {},
    by_retry_eligibility: {},
    by_next_action: {},
    by_provider_family: {},
    actions_executed: actions,
    holds_preserved: HOLDS,
  };
  hosts.forEach(({ rows }, index) => {
    const slot = `host-${index + 1}`;
    if (!rows) {
      coverage.partial = true;
      coverage.hosts_unread.push(slot);
      return;
    }
    if (!rows.length) {
      coverage.hosts_without_unsettled.push(slot);
      return;
    }
    coverage.hosts_read.push(slot);
    summary.by_host[slot] = rows.length;
    summary.total_unsettled_failed_or_interrupted += rows.length;
    for (const row of rows)
      for (const [field, value] of Object.entries(classify(row, now)))
        summary[field][value] = (summary[field][value] ?? 0) + 1;
  });
  if (summary.by_reason.limit_reset_passed_still_failed)
    summary.recovery_gap =
      'Recorded reset time passed while the run remained failed.';
  if (!normalizeRecoverySummary(summary, now))
    throw new Error('invalid recovery summary');
  return summary;
}

export function writeSummary(file, summary, beforeRename = () => {}) {
  const contents = JSON.stringify(summary) + '\n';
  if (Buffer.byteLength(contents) > 4096)
    throw new Error('recovery summary too large');
  const temp = path.join(path.dirname(file), `.summary-${randomUUID()}.tmp`);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    try {
      fs.fchmodSync(fd, 0o600);
      fs.writeFileSync(fd, contents);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    beforeRename();
    fs.renameSync(temp, file);
  } catch (error) {
    fs.unlinkSync(temp);
    throw error;
  }
}

async function main() {
  const home = os.homedir();
  const root = path.join(home, '.local/share/fleet-sync');
  const now = new Date();
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'config.json'), 'utf8')
  );
  const db = new DatabaseSync(path.join(home, '.t3/userdata/statev2.sqlite'), {
    readOnly: true,
  });
  let local;
  let links;
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000');
    local = readLocal(db);
    links = db
      .prepare(`
      SELECT environment_id, label, last_reached_at, secret_name, urls_json,
             expires_at, linked_at, fenced
      FROM peer_environment_links ORDER BY linked_at, environment_id
    `)
      .all();
  } finally {
    db.close();
  }
  const localId = slugify(
    config.machineId || config.machineLabel || os.hostname(),
    'local'
  );
  const ids = peerMachineIds(links, localId);
  const expected = new Set([
    ...links.map((link) => link.environment_id),
    ...(config.usageMachines ?? [])
      .filter((machine) => machine.id !== localId)
      .map((machine) => machine.environmentId),
  ]);
  if (expected.size >= MAX_HOSTS) throw new Error('too many recovery hosts');
  const { peers } = await readPeers({
    links,
    secretsDir: path.join(home, '.t3/userdata/secrets'),
    now,
    listThreads: listRecoveryThreads,
  });
  const byEnvironment = new Map(
    peers.map((peer) => [peer.environment_id, peer])
  );
  // Usage-only machines have no thread endpoint or credential in usageMachines.
  // Keep their slot unread. No shell transport is used by this program.
  const hosts = [
    { rows: local },
    ...[...expected]
      .sort((a, b) => (ids.get(a) ?? a).localeCompare(ids.get(b) ?? b))
      .map((id) => {
        const peer = byEnvironment.get(id);
        return {
          rows:
            peer?.live && peer.laneCoverage === 'complete'
              ? peer.threads
              : null,
        };
      }),
  ];
  const actions = readActionReceipts(
    path.join(home, '.t3/scratch/automations/limit-recovery.log'),
    now
  );
  writeSummary(
    path.join(root, 'recovery/summary.json'),
    buildSummary(hosts, actions, now)
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fail = () => {
    console.error('fleet recovery producer failures: 1');
    process.exit(1);
  };
  const watchdog = setTimeout(fail, 25_000);
  main().then(() => clearTimeout(watchdog), fail);
}
