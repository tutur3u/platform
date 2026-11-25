import fs from 'node:fs';

const MAX_INPUT_BYTES = 4096;
const MAX_COUNT = 100_000;
/** Sane upper bound on hosts in one summary; the host list comes from the data. */
export const MAX_HOSTS = 32;
/** A producer clock may run slightly ahead of this publisher's. */
export const CLOCK_SKEW_MS = 60_000;
/**
 * Age after which the summary reads as stale. The Today card mirrors this as
 * RECOVERY_STALE_AFTER_MS in apps/web/src/lib/mastermind/fleet/recovery-contract.ts.
 */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const hostAlias = /^[a-z0-9][a-z0-9-]{0,31}$/;
const holds = [
  'memory_pair',
  'client_desks_unsettled',
  'unpushed_work_threads',
  'unknown_write_lanes',
];
const fields = {
  byStatus: ['failed', 'interrupted'],
  byReason: [
    'limit_reset_passed_still_failed',
    'limit_waiting_auto_resume_armed',
    'limit_waiting_no_auto_resume',
    'owner_paused_or_interrupted',
    'failed_no_recovery_armed',
    'unknown',
  ],
  byOwnerClass: [
    'parent_lead',
    'delegating_lead_other_host',
    'parent_settled_orphan',
    'unknown',
  ],
  byRetryEligibility: [
    'blocked_seat_exhausted',
    'held_by_owner',
    'blocked_claude_freeze',
    'eligible_codex_code_only',
    'settle_candidate',
    'unknown',
  ],
  byNextAction: [
    'owner_moves_to_admitted_seat_or_waits_for_reset',
    'owner_resumes_after_freeze_or_decides',
    'wait_for_weekly_reset_or_topup',
    'owner_resumes_on_codex_if_code_only',
    'settle_after_owner_confirms',
    'unknown',
  ],
  byProviderFamily: [
    'unknown',
    'antigravity',
    'claude',
    'codex',
    'cursor',
    'grok',
    'opencode',
  ],
  actionsExecuted: [
    'settled_superseded_children',
    'moved_client_desks_to_claudeAgent',
    'cancelled_memory_review_by_freeze',
  ],
};

function hasOnly(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;
}

export function normalizeRecoverySummary(input, now) {
  if (
    !hasOnly(input, [
      'schema',
      'sanitized',
      'generatedAt',
      'coverage',
      'total_unsettled_failed_or_interrupted',
      'by_host',
      'by_status',
      'by_reason',
      'by_owner_class',
      'by_retry_eligibility',
      'by_next_action',
      'by_provider_family',
      'actions_executed',
      'holds_preserved',
      'recovery_gap',
    ]) ||
    input.schema !== 'fleet-recovery-summary/v1' ||
    input.sanitized !== true ||
    typeof input.generatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      input.generatedAt
    )
  )
    return;
  const timestamp = Date.parse(input.generatedAt);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + CLOCK_SKEW_MS)
    return;
  if (
    new Date(timestamp).toISOString() !==
    input.generatedAt.replace(/(?<!\.\d{3})Z$/, '.000Z')
  )
    return;
  // Within the allowed skew a producer clock ahead of ours clamps to now.
  const effective = Math.min(timestamp, now.getTime());
  const generatedAt = new Date(effective).toISOString();
  const coverage = input.coverage;
  if (
    !hasOnly(coverage, [
      'hosts_read',
      'hosts_without_unsettled',
      'hosts_unread',
      'partial',
      'source',
      'note',
    ]) ||
    typeof coverage.partial !== 'boolean' ||
    !Array.isArray(coverage.hosts_read) ||
    !Array.isArray(coverage.hosts_without_unsettled)
  )
    return;
  const read = [...coverage.hosts_read, ...coverage.hosts_without_unsettled];
  const unread = Object.hasOwn(coverage, 'hosts_unread')
    ? coverage.hosts_unread
    : [];
  if (!Array.isArray(unread) || (unread.length && !coverage.partial)) return;
  const expected = [...read, ...unread];
  if (
    expected.length === 0 ||
    expected.length > MAX_HOSTS ||
    new Set(expected).size !== expected.length ||
    !expected.every((host) => typeof host === 'string' && hostAlias.test(host))
  )
    return;
  if (
    Object.hasOwn(coverage, 'hosts_unread') &&
    !expected.every((host) => /^host-(?:[1-9]|[12]\d|3[0-2])$/.test(host))
  )
    return;
  const total = input.total_unsettled_failed_or_interrupted;
  if (!validCount(total)) return;
  for (const text of [input.recovery_gap, coverage.source, coverage.note])
    if (text !== undefined && (typeof text !== 'string' || text.length > 512))
      return;
  if (
    !hasOnly(input.by_host, coverage.hosts_read) ||
    !Object.values(input.by_host).every(validCount) ||
    Object.values(input.by_host).reduce((sum, n) => sum + n, 0) !== total
  )
    return;
  const holdsPreserved = input.holds_preserved;
  if (
    !Array.isArray(holdsPreserved) ||
    holdsPreserved.length > holds.length ||
    new Set(holdsPreserved).size !== holdsPreserved.length ||
    !holdsPreserved.every((hold) => holds.includes(hold))
  )
    return;
  const breakdowns = {};
  for (const [field, keys] of Object.entries(fields)) {
    const source = field.replace(
      /[A-Z]/g,
      (letter) => '_' + letter.toLowerCase()
    );
    const values = input[source];
    const legacyKey =
      'resume_after_weekly_reset_2026-12-01T06:00+07:00_or_topup';
    if (
      !hasOnly(
        values,
        field === 'byNextAction' ? [...keys, legacyKey] : keys
      ) ||
      !Object.values(values).every(validCount) ||
      (field === 'byNextAction' &&
        Object.hasOwn(values, legacyKey) &&
        Object.hasOwn(values, 'wait_for_weekly_reset_or_topup'))
    )
      return;
    if (
      field !== 'actionsExecuted' &&
      Object.values(values).reduce((sum, n) => sum + n, 0) !== total
    )
      return;
    breakdowns[field] = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key === legacyKey ? 'wait_for_weekly_reset_or_topup' : key,
        value,
      ])
    );
  }
  return {
    generatedAt,
    stale: now.getTime() - effective > STALE_AFTER_MS,
    coverage: {
      hostsRead: read.length,
      hostsExpected: expected.length,
      partial: coverage.partial,
      hosts: expected.map((host, index) => ({
        id: Object.hasOwn(coverage, 'hosts_unread')
          ? host
          : `host-${index + 1}`,
        readAt: index < read.length ? generatedAt : null,
        ok: index < read.length,
      })),
    },
    total,
    ...breakdowns,
    holdsPreserved,
  };
}

export function readRecoverySummary(file, now) {
  if (!file) return;
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(fd);
    if (
      stat.isFile() &&
      (stat.mode & 0o777) === 0o600 &&
      stat.uid === process.getuid() &&
      stat.size <= MAX_INPUT_BYTES
    ) {
      const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = fs.readSync(
          fd,
          buffer,
          length,
          buffer.length - length,
          null
        );
        if (!read) break;
        length += read;
      }
      if (length <= MAX_INPUT_BYTES) {
        const summary = normalizeRecoverySummary(
          JSON.parse(buffer.toString('utf8', 0, length)),
          now
        );
        if (summary) return summary;
      }
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  console.warn('fleet recovery summaries dropped: 1');
}
