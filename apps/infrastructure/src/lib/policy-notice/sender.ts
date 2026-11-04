import { z } from 'zod';
import {
  type PolicyNoticeDefinition,
  policyNoticeConfirmToken,
  policyNoticeVersion,
} from './definition';
import { gateError, PolicyNoticeError } from './errors';
import {
  evaluateBreaker,
  type PolicyNoticeLimits,
  resolvePolicyNoticeLimits,
} from './limits';
import type {
  PolicyNoticeClock,
  PolicyNoticeMailer,
  PolicyNoticeMode,
  PolicyNoticeResult,
  PolicyNoticeStore,
  Recipient,
  RunStatus,
  SendCounts,
  SendMode,
  StopReason,
  Suppression,
} from './types';

export { PolicyNoticeError } from './errors';

export const POLICY_NOTICE_MAX_TEST_RECIPIENTS = 5;

const requestSchema = z
  .object({
    mode: z.enum(['dry_run', 'test_list', 'live']).default('dry_run'),
    confirm: z.string().max(200).optional(),
    testRecipients: z
      .array(z.string().trim().toLowerCase().pipe(z.email()))
      .min(1)
      .max(POLICY_NOTICE_MAX_TEST_RECIPIENTS)
      .optional(),
    limits: z.unknown().optional(),
  })
  .strict();

export type PolicyNoticeRequest = z.input<typeof requestSchema>;

export interface PolicyNoticeDeps {
  store: PolicyNoticeStore;
  mailer: PolicyNoticeMailer;
  clock: PolicyNoticeClock;
  notice: PolicyNoticeDefinition;
}

function parseRequest(input: unknown, version: string) {
  const parsed = requestSchema.safeParse(input ?? {});
  if (!parsed.success) throw new PolicyNoticeError('invalid_request');
  const request = parsed.data;
  const limits = resolvePolicyNoticeLimits(request.limits);
  if ((request.mode === 'test_list') !== Boolean(request.testRecipients))
    throw new PolicyNoticeError('invalid_request');
  if (
    request.mode !== 'dry_run' &&
    request.confirm !== policyNoticeConfirmToken(request.mode, version)
  )
    throw new PolicyNoticeError('confirm_required');
  return { ...request, limits };
}

async function startRun(
  deps: PolicyNoticeDeps,
  version: string,
  mode: PolicyNoticeMode,
  actorId: string
) {
  try {
    return await deps.store.startRun({
      noticeId: deps.notice.id,
      version,
      mode,
      actorId,
    });
  } catch (error) {
    throw gateError(error) ?? error;
  }
}

class SendSession {
  readonly counts: SendCounts = {
    sent: 0,
    failed: 0,
    unknown: 0,
    suppressed: 0,
    skipped: 0,
  };
  private dispatched = false;

  constructor(
    private readonly deps: PolicyNoticeDeps,
    private readonly runId: string,
    private readonly limits: PolicyNoticeLimits,
    private readonly deadline: number
  ) {}

  get processed() {
    return (
      this.counts.sent +
      this.counts.failed +
      this.counts.unknown +
      this.counts.suppressed +
      this.counts.skipped
    );
  }

  /** False when the time budget cannot fit the next paced send. */
  private async pace() {
    const interval = 1000 / this.limits.sendsPerSecond;
    if (!this.dispatched) return this.deps.clock.now() < this.deadline;
    if (this.deps.clock.now() + interval >= this.deadline) return false;
    await this.deps.clock.sleep(interval);
    return true;
  }

  private async suppress(recipient: Recipient, suppression: Suppression) {
    const claimed = await this.deps.store.claim(
      this.runId,
      recipient.recipientHash,
      suppression
    );
    this.counts[claimed ? 'suppressed' : 'skipped']++;
  }

  /**
   * Every suppression is honoured, unsubscribes included. Returns false when
   * the time budget is spent before this recipient.
   */
  async deliver(recipient: Recipient): Promise<boolean> {
    const { store, mailer, notice } = this.deps;
    if (recipient.suppression) {
      await this.suppress(recipient, recipient.suppression);
      return true;
    }
    if (!(await this.pace())) return false;
    if (!(await store.claim(this.runId, recipient.recipientHash, null))) {
      this.counts.skipped++;
      return true;
    }

    this.dispatched = true;
    let outcome: Awaited<ReturnType<PolicyNoticeMailer['send']>>;
    try {
      outcome = await mailer.send({
        to: recipient.email,
        subject: notice.subject,
        html: notice.html,
        text: notice.text,
        noticeId: notice.id,
        replyTo: notice.replyTo,
      });
    } catch (error) {
      console.error('[PolicyNotice] Dispatch threw; outcome unknown', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      outcome = { kind: 'unknown' };
    }

    const hash = recipient.recipientHash;
    switch (outcome.kind) {
      case 'sent':
        await store.record(this.runId, hash, {
          status: 'sent',
          messageId: outcome.messageId,
        });
        this.counts.sent++;
        break;
      case 'rejected':
        await store.record(this.runId, hash, { status: 'failed' });
        this.counts.failed++;
        break;
      case 'blocked':
        await store.record(this.runId, hash, {
          status: 'suppressed',
          suppression: 'blocked',
        });
        this.counts.suppressed++;
        break;
      default:
        await store.record(this.runId, hash, { status: 'unknown' });
        this.counts.unknown++;
    }
    return true;
  }
}

async function finish(
  deps: PolicyNoticeDeps,
  runId: string,
  status: RunStatus,
  stopReason: StopReason | null,
  counts: SendCounts
) {
  await deps.store.finishRun(runId, status, stopReason, {
    sent: counts.sent,
    failed: counts.failed,
    unknown: counts.unknown,
    suppressed: counts.suppressed,
  });
}

async function runSend(
  deps: PolicyNoticeDeps,
  mode: SendMode,
  version: string,
  actorId: string,
  limits: PolicyNoticeLimits,
  testRecipients: string[] | undefined
): Promise<PolicyNoticeResult> {
  const { store, notice, clock } = deps;
  const runId = await startRun(deps, version, mode, actorId);
  const session = new SendSession(
    deps,
    runId,
    limits,
    clock.now() + limits.timeBudgetMs
  );
  const result = (
    status: RunStatus,
    stopReason: StopReason | null,
    done: boolean
  ): PolicyNoticeResult => ({
    mode,
    noticeId: notice.id,
    noticeVersion: version,
    runId,
    status,
    stopReason,
    done,
    counts: session.counts,
  });

  try {
    if (mode === 'test_list') {
      for (const recipient of await store.classify(testRecipients ?? [])) {
        if (!(await session.deliver(recipient))) {
          await finish(deps, runId, 'paused', null, session.counts);
          return result('paused', null, false);
        }
      }
      await finish(deps, runId, 'completed', null, session.counts);
      return result('completed', null, true);
    }

    while (session.processed < limits.maxSendsPerInvocation) {
      const stopReason = evaluateBreaker(
        await store.health(notice.id, version),
        limits
      );
      if (stopReason) {
        console.warn('[PolicyNotice] Run stopped by the breaker', {
          runId,
          stopReason,
        });
        await finish(deps, runId, 'stopped', stopReason, session.counts);
        return result('stopped', stopReason, false);
      }
      const page = await store.nextRecipients({
        noticeId: notice.id,
        version,
        limit: Math.min(
          limits.batchSize,
          limits.maxSendsPerInvocation - session.processed
        ),
      });
      if (page.length === 0) {
        await finish(deps, runId, 'completed', null, session.counts);
        return result('completed', null, true);
      }
      for (const recipient of page) {
        if (!(await session.deliver(recipient))) {
          await finish(deps, runId, 'paused', null, session.counts);
          return result('paused', null, false);
        }
      }
    }
    await finish(deps, runId, 'paused', null, session.counts);
    return result('paused', null, false);
  } catch (error) {
    await store
      .finishRun(runId, 'failed', 'error', null)
      .catch(() => undefined);
    throw error;
  }
}

/**
 * One-shot, resumable send of a legal/service notice. Dry run is the default
 * and returns counts only. Each invocation does a bounded amount of work and
 * reports `done`; call again until it is true. Addresses never appear in the
 * result or in logs.
 */
export async function runPolicyNotice(
  input: unknown,
  actorId: string,
  deps: PolicyNoticeDeps
): Promise<PolicyNoticeResult> {
  const version = policyNoticeVersion(deps.notice);
  const request = parseRequest(input, version);

  let result: PolicyNoticeResult;
  if (request.mode === 'dry_run') {
    const counts = await deps.store.counts({
      noticeId: deps.notice.id,
      version,
    });
    const runId = await startRun(deps, version, 'dry_run', actorId);
    await deps.store.finishRun(runId, 'completed', null, {
      eligible: counts.eligible,
      suppressed: counts.suppressed,
      already_sent: counts.alreadySent,
    });
    result = {
      mode: 'dry_run',
      noticeId: deps.notice.id,
      noticeVersion: version,
      counts,
    };
  } else {
    result = await runSend(
      deps,
      request.mode,
      version,
      actorId,
      request.limits,
      request.testRecipients
    );
  }

  console.info('[PolicyNotice] Run finished', {
    mode: result.mode,
    noticeVersion: version,
    counts: result.counts,
    ...('status' in result
      ? { status: result.status, stopReason: result.stopReason }
      : {}),
  });
  return result;
}
