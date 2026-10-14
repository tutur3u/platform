import { z } from 'zod';
import { admissionReason, readAuthority } from './authority';
import {
  type Authority,
  type AuthoritySnapshot,
  type ContextEvidence,
  type DueJob,
  evidenceSchema,
  type Identity,
  type JobStore,
  type WorkContext,
} from './contracts';

export type { ContextEvidence, WorkContext } from './contracts';
export { evidenceSchema } from './contracts';

const planSchema = z
  .object({
    occurrenceId: z.string().min(1).max(100),
    revision: z.number().int().min(1).max(3),
    title: z.literal('Review consented work context'),
    actionId: z.literal('record-dry-run'),
    permissionVersion: z.string().min(1).max(100),
    expiresAt: z.number().int().positive(),
    evidence: z.array(evidenceSchema).min(1).max(8),
  })
  .strict();
export type ReviewablePlan = z.infer<typeof planSchema>;
const approvalSchema = z
  .object({
    revision: z.number().int().min(1).max(3),
    selectedAction: z.literal('record-dry-run'),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type SelectedApproval = z.infer<typeof approvalSchema>;
export const reviewStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'), plan: planSchema }).strict(),
  z
    .object({ kind: z.literal('blocked'), reason: z.string().min(1).max(100) })
    .strict(),
  z
    .object({
      kind: z.literal('approved'),
      plan: planSchema,
      approval: approvalSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('rejected'),
      plan: planSchema,
      feedback: z.enum(['irrelevant', 'wrong-context', 'wrong-timing']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('completed'),
      plan: planSchema,
      providerCalled: z.literal(false),
      action: z.literal('record-dry-run'),
    })
    .strict(),
  z
    .object({ kind: z.literal('revoked'), reason: z.string().min(1).max(100) })
    .strict(),
]);
export type ReviewState = z.infer<typeof reviewStateSchema>;
export interface ReviewStore {
  read(): ReviewState | null;
  write(state: ReviewState): void;
  transaction<T>(operation: () => T): T;
}
export type ReviewOutcome =
  | { kind: 'denied'; reason: string }
  | { kind: 'state'; state: ReviewState };

function evidenceKey(value: ContextEvidence): string {
  return JSON.stringify([
    value.kind,
    value.actorId,
    value.personalWorkspaceId,
    value.sourceId,
    value.sourceRevision,
    value.deletionVersion,
    value.revocationVersion,
    value.consentVersion,
  ]);
}

export class PlanReviewEngine {
  constructor(
    private readonly jobs: JobStore,
    private readonly reviews: ReviewStore,
    private readonly authority: Authority,
    private readonly clock: () => number
  ) {}

  private job(identity: Identity): DueJob | null {
    const state = this.jobs.read();
    return state?.phase.kind === 'completed' &&
      state.job.actorId === identity.actorId &&
      state.job.workspaceId === identity.workspaceId
      ? state.job
      : null;
  }

  private async context(
    job: DueJob,
    plan?: ReviewablePlan
  ): Promise<WorkContext | string> {
    const now = this.clock();
    let snapshot: AuthoritySnapshot;
    try {
      snapshot = await readAuthority(this.authority, job, now);
    } catch {
      return 'authority-unavailable';
    }
    const reason = admissionReason(job, snapshot, this.clock(), 0);
    if (reason) return reason;
    if (snapshot.kind !== 'qualified') return 'authority-unqualified';
    const context = snapshot.context;
    if (
      context?.qualified !== true ||
      context.canResearch !== true ||
      context.canPlan !== true ||
      context.canDryRun !== true ||
      !context.permissionVersion
    )
      return 'context-permission-denied';
    const evidence = z
      .array(evidenceSchema)
      .min(1)
      .max(8)
      .safeParse(context.evidence);
    if (!evidence.success) return 'context-unqualified';
    const checkedAt = this.clock();
    if (checkedAt >= job.expiresAt) return 'expired';
    for (const reference of evidence.data) {
      if (
        reference.actorId !== job.actorId ||
        reference.personalWorkspaceId !== job.workspaceId ||
        String(reference.consentVersion) !== job.consentVersion ||
        !context.allowedSources.includes(reference.kind)
      )
        return 'context-scope-denied';
      if (
        Date.parse(reference.observedAt) > checkedAt ||
        checkedAt - Date.parse(reference.observedAt) > 5_000 ||
        Date.parse(reference.expiresAt) <= checkedAt
      )
        return 'context-stale';
    }
    if (
      plan &&
      (plan.permissionVersion !== context.permissionVersion ||
        plan.evidence.length !== evidence.data.length ||
        plan.evidence.map(evidenceKey).sort().join('|') !==
          evidence.data.map(evidenceKey).sort().join('|'))
    )
      return 'context-revision-conflict';
    return context;
  }

  async prepare(identity: Identity): Promise<ReviewOutcome> {
    const job = this.job(identity);
    if (!job) return { kind: 'denied', reason: 'due-receipt-required' };
    const context = await this.context(job);
    if (typeof context === 'string')
      return this.reviews.transaction(() => {
        const existing = this.reviews.read();
        if (existing) return { kind: 'state', state: existing };
        const state: ReviewState = { kind: 'blocked', reason: context };
        this.reviews.write(state);
        return { kind: 'state', state };
      });
    return this.reviews.transaction(() => {
      const existing = this.reviews.read();
      if (existing) return { kind: 'state', state: existing };
      const state: ReviewState = {
        kind: 'plan',
        plan: {
          occurrenceId: job.occurrenceId,
          revision: 1,
          title: 'Review consented work context',
          actionId: 'record-dry-run',
          permissionVersion: context.permissionVersion,
          expiresAt: Math.min(job.expiresAt, this.clock() + 60_000),
          evidence: context.evidence,
        },
      };
      this.reviews.write(state);
      return { kind: 'state', state };
    });
  }

  async approve(
    identity: Identity,
    approval: SelectedApproval
  ): Promise<ReviewOutcome> {
    const job = this.job(identity);
    const initial = this.reviews.read();
    if (!job || initial?.kind !== 'plan')
      return { kind: 'denied', reason: 'plan-required' };
    const parsed = approvalSchema.safeParse(approval);
    if (
      !parsed.success ||
      parsed.data.revision !== initial.plan.revision ||
      parsed.data.expiresAt <= this.clock() ||
      parsed.data.expiresAt > initial.plan.expiresAt
    )
      return { kind: 'denied', reason: 'approval-scope-invalid' };
    const context = await this.context(job, initial.plan);
    if (typeof context === 'string') return { kind: 'denied', reason: context };
    return this.reviews.transaction(() => {
      const current = this.reviews.read();
      if (
        current?.kind !== 'plan' ||
        current.plan.revision !== initial.plan.revision ||
        parsed.data.expiresAt <= this.clock()
      )
        return { kind: 'denied', reason: 'plan-changed' };
      const state: ReviewState = {
        kind: 'approved',
        plan: current.plan,
        approval: parsed.data,
      };
      this.reviews.write(state);
      return { kind: 'state', state };
    });
  }

  reject(
    identity: Identity,
    revision: number,
    feedback: 'irrelevant' | 'wrong-context' | 'wrong-timing'
  ): ReviewOutcome {
    if (!this.job(identity))
      return { kind: 'denied', reason: 'due-receipt-required' };
    return this.reviews.transaction(() => {
      const current = this.reviews.read();
      if (current?.kind !== 'plan' || current.plan.revision !== revision)
        return { kind: 'denied', reason: 'plan-changed' };
      const state: ReviewState = {
        kind: 'rejected',
        plan: current.plan,
        feedback,
      };
      this.reviews.write(state);
      return { kind: 'state', state };
    });
  }

  async revise(identity: Identity): Promise<ReviewOutcome> {
    const job = this.job(identity);
    const initial = this.reviews.read();
    if (!job || initial?.kind !== 'rejected' || initial.plan.revision >= 3)
      return { kind: 'denied', reason: 'revision-budget-exhausted' };
    const context = await this.context(job);
    if (typeof context === 'string') return { kind: 'denied', reason: context };
    return this.reviews.transaction(() => {
      const current = this.reviews.read();
      if (
        current?.kind !== 'rejected' ||
        current.plan.revision !== initial.plan.revision
      )
        return { kind: 'denied', reason: 'plan-changed' };
      const state: ReviewState = {
        kind: 'plan',
        plan: {
          ...current.plan,
          revision: current.plan.revision + 1,
          permissionVersion: context.permissionVersion,
          evidence: context.evidence,
        },
      };
      this.reviews.write(state);
      return { kind: 'state', state };
    });
  }

  async execute(identity: Identity): Promise<ReviewOutcome> {
    const job = this.job(identity);
    const initial = this.reviews.read();
    if (!job) return { kind: 'denied', reason: 'due-receipt-required' };
    if (initial?.kind === 'completed') return { kind: 'state', state: initial };
    if (initial?.kind !== 'approved')
      return { kind: 'denied', reason: 'selected-approval-required' };
    if (initial.approval.expiresAt <= this.clock())
      return this.invalidate(identity, 'approval-expired');
    const context = await this.context(job, initial.plan);
    if (typeof context === 'string') return this.invalidate(identity, context);
    return this.reviews.transaction(() => {
      const current = this.reviews.read();
      if (
        current?.kind !== 'approved' ||
        current.plan.revision !== initial.plan.revision ||
        current.approval.expiresAt <= this.clock()
      )
        return { kind: 'denied', reason: 'approval-changed' };
      const state: ReviewState = {
        kind: 'completed',
        plan: current.plan,
        providerCalled: false,
        action: 'record-dry-run',
      };
      this.reviews.write(state);
      return { kind: 'state', state };
    });
  }

  /** Call after authoritative correction/forget commits, before derived-index reuse. */
  invalidate(identity: Identity, reason: string): ReviewOutcome {
    if (!this.job(identity))
      return { kind: 'denied', reason: 'due-receipt-required' };
    return this.reviews.transaction(() => {
      const state: ReviewState = { kind: 'revoked', reason };
      this.reviews.write(state);
      return { kind: 'state', state };
    });
  }
}
