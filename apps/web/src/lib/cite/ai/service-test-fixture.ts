import { randomUUID } from 'node:crypto';
import { CiteWorkSchema } from '@tuturuuu/cite';
import { vi } from 'vitest';
import {
  CitationAiError,
  type CitationAiBinding,
  type CitationAiCheckpoint,
  type CitationAiOperation,
  type CitationAiOperationStore,
  type CitationDurableChargeRead,
  citationAiOperationSchema,
} from './contracts';
import {
  type CitationAiDependencies,
  createCitationAiService,
} from './service';

export const actorId = '00000000-0000-4000-8000-00000000a101';
export const billingWsId = '00000000-0000-4000-8000-00000000a102';
export const otherId = '00000000-0000-4000-8000-00000000a103';
export const now = Date.parse('2026-11-16T08:00:00Z');
export const signal = () => new AbortController().signal;
export function operationId(timestamp = now, suffix = '1') {
  const hex = timestamp.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-${suffix.padStart(12, '0')}`;
}
export const work = CiteWorkSchema.parse({
  id: 'synthetic-model-id',
  type: 'book',
  title: 'Atlas of imagined estuaries',
  authors: [{ kind: 'person', family: 'Vale', given: 'Mira' }],
  issued: { year: 2024 },
  provenance: { sourceCaptureMethod: 'manual', verificationStatus: 'manual' },
});
export const usage = { inputTokens: 140, outputTokens: 90, reasoningTokens: 0 };
export const request = () => ({
  operationId: operationId(),
  input: 'Vale, M. (2024). Atlas of imagined estuaries.',
});

/** In-memory protocol fixture. Real database atomicity remains an integration boundary. */
export function fixture() {
  const records = new Map<string, CitationAiOperation>();
  const actorLocks = new Map<string, { id: string; until: number }>();
  const expiry = new Map<string, number>();
  const deductionClaims = new Set<string>();
  const clock = () => (dependencies.now ?? Date.now)();
  const charges = new Map<
    string,
    { wsId: string | null; binding: CitationAiBinding }
  >();
  const operations: CitationAiOperationStore = {
    async claim(id, binding, retryOnly) {
      const existing = await this.read(id, binding.userId);
      if (existing) return { claimed: false, record: existing };
      const expired = records.get(id);
      const canRetry =
        expired?.stage === 'failed' && expired.code === 'BILLING_PENDING';
      if (retryOnly && !canRetry)
        throw new CitationAiError('OPERATION_EXPIRED', 409);
      if (
        canRetry &&
        JSON.stringify(expired.binding) !== JSON.stringify(binding)
      )
        throw new CitationAiError('OPERATION_CONFLICT', 409);
      if ((actorLocks.get(binding.userId)?.until ?? 0) > clock())
        throw new CitationAiError('GENERATION_IN_PROGRESS', 409);
      const record = citationAiOperationSchema.parse({
        stage: 'running',
        binding,
        attemptId: randomUUID(),
      });
      records.set(id, record);
      expiry.set(id, clock() + 3600_000);
      actorLocks.set(binding.userId, { id, until: clock() + 120_000 });
      return { claimed: true, record };
    },
    async transition(id, previous, next) {
      if (
        JSON.stringify(records.get(id)) !==
        JSON.stringify(citationAiOperationSchema.parse(previous))
      )
        return false;
      records.set(id, citationAiOperationSchema.parse(next));
      const pending =
        next.stage === 'failed' && next.code === 'BILLING_PENDING';
      expiry.set(id, clock() + (pending ? 900_000 : 3600_000));
      const active = actorLocks.get(previous.binding.userId);
      if (active?.id === id) {
        if (next.stage === 'settled' || (next.stage === 'failed' && !pending))
          actorLocks.delete(previous.binding.userId);
        else
          active.until =
            clock() +
            (next.stage === 'settling' || pending ? 900_000 : 120_000);
      }
      return true;
    },
    claimDeduction: vi.fn<CitationAiOperationStore['claimDeduction']>(
      async (id, record) => {
        if (records.get(id)?.stage !== record.stage || deductionClaims.has(id))
          return false;
        deductionClaims.add(id);
        return true;
      }
    ),
    async read(id, userId) {
      if ((expiry.get(id) ?? 0) <= clock()) return null;
      const record = records.get(id) ?? null;
      if (record && record.binding.userId !== userId)
        throw new CitationAiError('OPERATION_CONFLICT', 409);
      return record;
    },
  };
  const dependencies: CitationAiDependencies = {
    operations,
    resolveBillingWorkspace: vi.fn(async () => billingWsId),
    admit: vi.fn(async () => ({
      modelId: 'google/synthetic-plan-model',
      maxOutputTokens: 1024,
    })),
    reserveGrounding: vi.fn(async () => true),
    generate: vi.fn(async () => ({ value: work, usage })),
    ground: vi.fn(async () => null),
    deduct: vi.fn(async (id: string, checkpoint: CitationAiCheckpoint) => {
      charges.set(id, {
        wsId: checkpoint.binding.billingWsId,
        binding: checkpoint.binding,
      });
      return { success: true, creditsDeducted: 0.54 };
    }),
    recoverCharge: vi.fn(async () => null),
    readDurableCharge: vi.fn(
      async (
        id: string,
        binding: CitationAiBinding
      ): Promise<CitationDurableChargeRead> => {
        const charged = charges.get(id);
        if (
          !charged ||
          (charged.wsId !== binding.billingWsId &&
            charged.binding.userId !== binding.userId)
        )
          return { kind: 'absent' };
        return {
          kind: 'charged',
          bindingMatches:
            charged.binding.userId === binding.userId &&
            (charged.wsId === null || charged.wsId === binding.billingWsId) &&
            charged.binding.billingWsId === binding.billingWsId &&
            charged.binding.feature === binding.feature &&
            charged.binding.inputHash === binding.inputHash,
        };
      }
    ),
    now: () => now,
  };
  return {
    dependencies,
    records,
    charges,
    operations,
    actorLocks,
    service: createCitationAiService(dependencies),
  };
}
