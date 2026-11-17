import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitationAiBinding } from './contracts';
import { createCitationAiOperationStore } from './operation-store';

const mocked = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../runtime-db', () => ({ getCitationRuntimeDb: mocked.client }));

const operationId = '019a8b00-0000-7000-8000-000000000001';
const binding: CitationAiBinding = {
  userId: '00000000-0000-4000-8000-00000000a301',
  billingWsId: '00000000-0000-4000-8000-00000000a302',
  feature: 'cite_fix_ref',
  inputHash: 'a'.repeat(64),
};
const running = {
  stage: 'running',
  binding,
  attemptId: '00000000-0000-4000-8000-00000000a304',
} as const;
const settling = {
  ...running,
  stage: 'settling',
  modelId: 'synthetic-model',
  usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 5 },
  outcome: { kind: 'invalid' },
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocked.client.mockResolvedValue({ rpc: mocked.rpc });
});

describe('citation operation storage boundary', () => {
  it('binds the claim to the global operation, actor and retry-only flag', async () => {
    mocked.rpc.mockResolvedValue({
      data: { kind: 'claimed', record: running },
      error: null,
    });
    const store = createCitationAiOperationStore();
    expect(await store.claim(operationId, binding, true)).toEqual({
      claimed: true,
      record: running,
    });
    expect(mocked.rpc).toHaveBeenCalledExactlyOnceWith(
      'claim_cite_ai_operation',
      {
        p_operation_id: operationId,
        p_actor_id: binding.userId,
        p_binding: binding,
        p_retry_only: true,
      }
    );
  });

  it.each([
    ['conflict', 'OPERATION_CONFLICT'],
    ['busy', 'GENERATION_IN_PROGRESS'],
    ['expired', 'OPERATION_EXPIRED'],
  ])('maps a %s claim without exposing storage detail', async (kind, code) => {
    mocked.rpc.mockResolvedValue({ data: { kind }, error: null });
    await expect(
      createCitationAiOperationStore().claim(operationId, binding)
    ).rejects.toMatchObject({ code });
  });

  it('does not disclose another actor receipt or accept invalid stored data', async () => {
    mocked.rpc
      .mockResolvedValueOnce({ data: { kind: 'conflict' }, error: null })
      .mockResolvedValueOnce({
        data: { kind: 'existing', record: { stage: 'settled' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const store = createCitationAiOperationStore();
    await expect(
      store.read(operationId, '00000000-0000-4000-8000-00000000a303')
    ).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    await expect(store.read(operationId, binding.userId)).rejects.toMatchObject(
      {
        code: 'AI_UNAVAILABLE',
      }
    );
    await expect(store.read(operationId, binding.userId)).resolves.toBeNull();
  });

  it('fails closed on a database failure', async () => {
    mocked.client.mockRejectedValueOnce(new Error('unavailable'));
    const store = createCitationAiOperationStore();
    await expect(store.claim(operationId, binding)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(mocked.rpc).not.toHaveBeenCalled();
    mocked.rpc.mockResolvedValue({ data: true, error: { code: 'XX000' } });
    await expect(
      store.claimDeduction(operationId, settling)
    ).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it.each([
    [
      running,
      { ...running, stage: 'failed', code: 'BILLING_PENDING' } as const,
    ],
    [{ ...settling, stage: 'checkpoint' } as const, settling],
  ])(
    'passes complete CAS data and lets the database select the state TTL',
    async (previous, next) => {
      mocked.rpc.mockResolvedValue({ data: true, error: null });
      expect(
        await createCitationAiOperationStore().transition(
          operationId,
          previous,
          next
        )
      ).toBe(true);
      expect(mocked.rpc).toHaveBeenCalledExactlyOnceWith(
        'transition_cite_ai_operation',
        {
          p_operation_id: operationId,
          p_actor_id: binding.userId,
          p_previous: previous,
          p_next: next,
        }
      );
    }
  );

  it('passes the exact checkpoint and returns a lost single-winner claim', async () => {
    mocked.rpc.mockResolvedValue({ data: false, error: null });
    expect(
      await createCitationAiOperationStore().claimDeduction(
        operationId,
        settling
      )
    ).toBe(false);
    expect(mocked.rpc).toHaveBeenCalledExactlyOnceWith(
      'claim_cite_ai_deduction',
      {
        p_operation_id: operationId,
        p_actor_id: binding.userId,
        p_checkpoint: settling,
      }
    );
  });
});
