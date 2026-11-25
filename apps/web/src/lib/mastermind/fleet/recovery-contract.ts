import { z } from 'zod';

const count = z.number().int().min(0).max(100_000);
const timestamp = z.iso.datetime({ precision: 3 });
const hostId = z.enum([
  'host-1',
  'host-2',
  'host-3',
  'host-4',
  'host-5',
  'host-6',
]);
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
        .max(hostId.options.length),
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
      ]),
      count
    ),
    byOwnerClass: z.partialRecord(
      z.enum([
        'parent_lead',
        'delegating_lead_other_host',
        'parent_settled_orphan',
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
      ]),
      count
    ),
    byProviderFamily: z.partialRecord(
      z.enum(['antigravity', 'claude', 'codex', 'cursor', 'grok', 'opencode']),
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
