import { createHash } from 'node:crypto';
import type { CiteWork } from '@tuturuuu/cite';
import {
  CitationAiError,
  CITE_AI_FEATURE,
  type CitationAiBinding,
  type CitationAiCheckpoint,
  type CitationAiOperation,
  type CitationAiOperationStore,
  type CitationAiUsage,
  type CitationDurableChargeRead,
  citationFixRequestSchema,
  usageSchema,
  validateCitationOperationTime,
} from './contracts';
import { prepareCitationFixProposal } from './proposal';
import { estimateCitationInputTokens } from './prompt';

export interface CitationAiDependencies {
  operations: CitationAiOperationStore;
  resolveBillingWorkspace: (actorId: string) => Promise<string>;
  admit: (
    binding: CitationAiBinding,
    estimatedInputTokens: number
  ) => Promise<{ modelId: string; maxOutputTokens: number }>;
  /** AI_UNAVAILABLE without billingStatus is reserved for explicit refusal before any SDK call. */
  generate: (input: {
    input: string;
    existingWork?: CiteWork;
    modelId: string;
    maxOutputTokens: number;
    signal: AbortSignal;
  }) => Promise<{ value: unknown; usage: CitationAiUsage }>;
  ground: (identifier: string, signal: AbortSignal) => Promise<CiteWork | null>;
  deduct: (
    operationId: string,
    checkpoint: CitationAiCheckpoint
  ) => Promise<{ success: boolean; creditsDeducted: number }>;
  recoverCharge: (
    operationId: string,
    binding: CitationAiBinding
  ) => Promise<number | null>;
  readDurableCharge: (
    operationId: string,
    binding: CitationAiBinding
  ) => Promise<CitationDurableChargeRead>;
  now?: () => number;
}

function sameBinding(a: CitationAiBinding, b: CitationAiBinding) {
  return (
    a.userId === b.userId &&
    a.billingWsId === b.billingWsId &&
    a.feature === b.feature &&
    a.inputHash === b.inputHash
  );
}
function present(
  operationId: string,
  record: Extract<CitationAiOperation, { stage: 'settled' }>
) {
  if (record.outcome.kind === 'invalid')
    throw new CitationAiError('INVALID_AI_OUTPUT', 502, 'settled');
  return {
    operationId,
    ...record.outcome.proposal,
    billing: {
      status: 'settled' as const,
      creditsDeducted: record.creditsDeducted,
    },
  };
}
function failed(
  record: Extract<CitationAiOperation, { stage: 'failed' }>
): never {
  const status =
    record.code === 'CANCELLED'
      ? 499
      : record.code === 'GENERATION_FAILED'
        ? 502
        : record.code === 'FEATURE_NOT_ALLOWED' ||
            record.code === 'CREDITS_EXHAUSTED'
          ? 403
          : 503;
  throw new CitationAiError(
    record.code,
    status,
    record.code === 'BILLING_PENDING' ? 'unknown' : undefined
  );
}

export function createCitationAiService(dependencies: CitationAiDependencies) {
  const { operations } = dependencies;
  async function settlement(operationId: string, record: CitationAiOperation) {
    if (record.stage === 'settled') return present(operationId, record);
    if (record.stage === 'failed') return failed(record);
    if (record.stage === 'running')
      throw new CitationAiError('GENERATION_IN_PROGRESS', 409, 'unknown');
    if (record.stage === 'settling') {
      let charged: number | null = null;
      try {
        charged = await dependencies.recoverCharge(operationId, record.binding);
      } catch {
        /* Unknown charge state is never permission to repeat deduction. */
      }
      if (charged === null || !Number.isFinite(charged) || charged < 0)
        throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
      const settled = {
        ...record,
        stage: 'settled',
        creditsDeducted: charged,
      } as const;
      try {
        await operations.transition(operationId, record, settled, true);
      } catch {
        /* Readback has already confirmed the charge. */
      }
      return present(operationId, settled);
    }
    const settling = { ...record, stage: 'settling' } as const;
    let acquired: boolean;
    try {
      acquired = await operations.transition(operationId, record, settling);
    } catch {
      throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
    }
    if (!acquired) {
      let current: CitationAiOperation | null;
      try {
        current = await operations.read(operationId, record.binding.userId);
      } catch {
        throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
      }
      if (current?.stage === 'settled') return present(operationId, current);
      throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
    }
    let charge: { success: boolean; creditsDeducted: number };
    try {
      charge = await dependencies.deduct(operationId, record);
    } catch {
      throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
    }
    if (
      !charge.success ||
      !Number.isFinite(charge.creditsDeducted) ||
      charge.creditsDeducted < 0
    )
      throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
    const settled = {
      ...record,
      stage: 'settled',
      creditsDeducted: charge.creditsDeducted,
    } as const;
    try {
      await operations.transition(operationId, settling, settled, true);
    } catch {
      /* A confirmed charge may return its result; the settling fence prevents a second deduction. */
    }
    return present(operationId, settled);
  }

  return {
    async fix(actorId: string, rawInput: unknown, requestSignal: AbortSignal) {
      const parsed = citationFixRequestSchema.safeParse(rawInput);
      if (!parsed.success) throw new CitationAiError('INVALID_INPUT', 400);
      const input = parsed.data;
      const now = (dependencies.now ?? Date.now)();
      const billingWsId = await dependencies.resolveBillingWorkspace(actorId);
      const binding: CitationAiBinding = {
        userId: actorId,
        billingWsId,
        feature: CITE_AI_FEATURE,
        inputHash: createHash('sha256')
          .update(
            JSON.stringify({
              input: input.input,
              existingWork: input.existingWork,
            })
          )
          .digest('hex'),
      };
      const existing = await operations.read(input.operationId, actorId);
      if (existing) {
        if (!sameBinding(existing.binding, binding))
          throw new CitationAiError('OPERATION_CONFLICT', 409);
        return settlement(input.operationId, existing);
      }
      validateCitationOperationTime(input.operationId, now);
      let durable: CitationDurableChargeRead;
      try {
        durable = await dependencies.readDurableCharge(
          input.operationId,
          binding
        );
      } catch {
        durable = { kind: 'unavailable' };
      }
      if (durable.kind === 'unavailable')
        throw new CitationAiError('CREDIT_CHECK_FAILED', 503, 'unknown');
      if (durable.kind === 'charged') {
        if (!durable.bindingMatches)
          throw new CitationAiError('OPERATION_CONFLICT', 409);
        // The durable charge survives the lost proposal; it never admits reconstruction by another provider call.
        throw new CitationAiError('INVALID_AI_OUTPUT', 502, 'settled');
      }
      const claim = await operations.claim(input.operationId, binding);
      if (!sameBinding(claim.record.binding, binding))
        throw new CitationAiError('OPERATION_CONFLICT', 409);
      if (!claim.claimed) return settlement(input.operationId, claim.record);
      if (claim.record.stage !== 'running')
        throw new CitationAiError('AI_UNAVAILABLE', 503);
      let providerStarted = false;
      let admission: { modelId: string; maxOutputTokens: number };
      let generated: { value: unknown; usage: CitationAiUsage };
      try {
        requestSignal.throwIfAborted();
        admission = await dependencies.admit(
          binding,
          estimateCitationInputTokens(input.input, input.existingWork)
        );
        if (
          !admission.modelId ||
          admission.modelId.length > 256 ||
          !Number.isSafeInteger(admission.maxOutputTokens) ||
          admission.maxOutputTokens < 1 ||
          admission.maxOutputTokens > 8192
        )
          throw new CitationAiError('CREDIT_CHECK_FAILED', 503);
        requestSignal.throwIfAborted();
        if (
          !(await operations.transition(
            input.operationId,
            claim.record,
            claim.record
          ))
        )
          throw new CitationAiError('AI_UNAVAILABLE', 503);
        requestSignal.throwIfAborted();
        providerStarted = true;
        generated = await dependencies.generate({
          input: input.input,
          existingWork: input.existingWork,
          modelId: admission.modelId,
          maxOutputTokens: admission.maxOutputTokens,
          signal: AbortSignal.any([requestSignal, AbortSignal.timeout(35000)]),
        });
      } catch (error) {
        const refusedBeforeSdk =
          error instanceof CitationAiError &&
          error.code === 'AI_UNAVAILABLE' &&
          error.billingStatus === undefined;
        const safe =
          providerStarted && !refusedBeforeSdk
            ? new CitationAiError('BILLING_PENDING', 503, 'unknown')
            : requestSignal.aborted
              ? new CitationAiError('CANCELLED', 499)
              : error instanceof CitationAiError
                ? error
                : new CitationAiError('AI_UNAVAILABLE', 503);
        const code =
          safe.code === 'FEATURE_NOT_ALLOWED' ||
          safe.code === 'CREDITS_EXHAUSTED' ||
          safe.code === 'CREDIT_CHECK_FAILED' ||
          safe.code === 'AI_UNAVAILABLE' ||
          safe.code === 'CANCELLED' ||
          safe.code === 'BILLING_PENDING'
            ? safe.code
            : 'GENERATION_FAILED';
        try {
          await operations.transition(
            input.operationId,
            claim.record,
            { stage: 'failed', binding, code },
            code !== 'BILLING_PENDING'
          );
        } catch {
          /* The existing running receipt still forbids a second provider call. */
        }
        throw safe;
      }
      const usage = usageSchema.safeParse(generated.usage);
      if (!usage.success) {
        try {
          await operations.transition(input.operationId, claim.record, {
            stage: 'failed',
            binding,
            code: 'BILLING_PENDING',
          });
        } catch {
          /* Retain the operation fence even when usage cannot be checkpointed. */
        }
        throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
      }
      const proposal = await prepareCitationFixProposal(
        generated.value,
        input,
        dependencies.ground,
        AbortSignal.any([requestSignal, AbortSignal.timeout(12000)]),
        now
      );
      const checkpoint: CitationAiOperation = {
        stage: 'checkpoint',
        binding,
        modelId: admission.modelId,
        usage: usage.data,
        outcome: proposal
          ? { kind: 'proposal', proposal }
          : { kind: 'invalid' },
      };
      let checkpointed = false;
      try {
        checkpointed = await operations.transition(
          input.operationId,
          claim.record,
          checkpoint
        );
      } catch {
        /* Known provider usage with unavailable checkpoint storage remains unsettled. */
      }
      if (!checkpointed)
        throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
      return settlement(input.operationId, checkpoint);
    },
  };
}
