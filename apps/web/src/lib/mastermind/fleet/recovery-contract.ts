import { z } from 'zod';

/** Sane upper bound on hosts in one summary; the list comes from the data. */
export const RECOVERY_MAX_HOSTS = 32;
/** Age after which the Today card marks the summary stale (publisher: 2 h). */
export const RECOVERY_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

const count = z.number().int().min(0).max(100_000);
const timestamp = z.iso.datetime({ precision: 3 });
const hostId = z.string().regex(/^host-(?:[1-9]|[12]\d|3[0-2])$/);
const hold = z.enum([
  'memory_pair',
  'client_desks_unsettled',
  'unpushed_work_threads',
  'unknown_write_lanes',
]);

export const fleetRecoverySchema = z
  .strictObject({
    generatedAt: timestamp,
    stale: z.boolean(),
    coverage: z.strictObject({
      hostsRead: count,
      hostsExpected: count,
      partial: z.boolean(),
      hosts: z
        .array(
          z.strictObject({
            id: hostId,
            readAt: timestamp.nullable(),
            ok: z.boolean(),
          })
        )
        .max(RECOVERY_MAX_HOSTS),
    }),
    total: count,
    byStatus: z.partialRecord(z.enum(['failed', 'interrupted']), count),
    byReason: z.partialRecord(
      z.enum([
        'limit_reset_passed_still_failed',
        'limit_waiting_auto_resume_armed',
        'limit_waiting_no_auto_resume',
        'owner_paused_or_interrupted',
        'failed_no_recovery_armed',
        'unknown',
      ]),
      count
    ),
    byOwnerClass: z.partialRecord(
      z.enum([
        'parent_lead',
        'delegating_lead_other_host',
        'parent_settled_orphan',
        'unknown',
      ]),
      count
    ),
    byRetryEligibility: z.partialRecord(
      z.enum([
        'blocked_seat_exhausted',
        'held_by_owner',
        'blocked_claude_freeze',
        'eligible_codex_code_only',
        'settle_candidate',
        'unknown',
      ]),
      count
    ),
    byNextAction: z.partialRecord(
      z.enum([
        'owner_moves_to_admitted_seat_or_waits_for_reset',
        'owner_resumes_after_freeze_or_decides',
        'wait_for_weekly_reset_or_topup',
        'owner_resumes_on_codex_if_code_only',
        'settle_after_owner_confirms',
        'unknown',
      ]),
      count
    ),
    byProviderFamily: z.partialRecord(
      z.enum([
        'antigravity',
        'claude',
        'codex',
        'cursor',
        'grok',
        'opencode',
        'unknown',
      ]),
      count
    ),
    actionsExecuted: z.partialRecord(
      z.enum([
        'settled_superseded_children',
        'moved_client_desks_to_claudeAgent',
        'cancelled_memory_review_by_freeze',
      ]),
      count
    ),
    holdsPreserved: z.array(hold).max(hold.options.length),
  })
  .refine((value) => {
    const { coverage } = value;
    return (
      coverage.hostsExpected === coverage.hosts.length &&
      coverage.hostsExpected > 0 &&
      coverage.hostsRead === coverage.hosts.filter((host) => host.ok).length &&
      (coverage.hostsRead === coverage.hostsExpected || coverage.partial) &&
      new Set(coverage.hosts.map((host) => host.id)).size ===
        coverage.hosts.length &&
      coverage.hosts.every((host) => host.ok === (host.readAt !== null)) &&
      new Set(value.holdsPreserved).size === value.holdsPreserved.length &&
      [
        value.byStatus,
        value.byReason,
        value.byOwnerClass,
        value.byRetryEligibility,
        value.byNextAction,
        value.byProviderFamily,
      ].every(
        (group) =>
          Object.values(group).reduce((sum, n) => sum + n, 0) === value.total
      )
    );
  });
