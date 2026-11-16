import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { citationAiOperationSchema, type CitationAiBinding } from './contracts';
import { createCitationAiOperationStore } from './operation-store';

const mocked = vi.hoisted(() => ({
  client: vi.fn(),
  eval: vi.fn(),
  get: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: mocked.client,
}));
const operationId = '019a8b00-0000-7000-8000-000000000001';
const binding: CitationAiBinding = {
  userId: '00000000-0000-4000-8000-00000000a301',
  billingWsId: '00000000-0000-4000-8000-00000000a302',
  feature: 'cite_fix_ref',
  inputHash: 'a'.repeat(64),
};
const running = citationAiOperationSchema.parse({ stage: 'running', binding });

beforeEach(() => {
  vi.clearAllMocks();
  mocked.client.mockResolvedValue({ eval: mocked.eval, get: mocked.get });
  mocked.eval.mockResolvedValue([1, JSON.stringify(running)]);
  mocked.get.mockResolvedValue(null);
});

describe('citation operation storage boundary', () => {
  it('uses a global operation ID and a hashed actor key within one atomic-script hash slot', async () => {
    const result = await createCitationAiOperationStore().claim(
      operationId,
      binding
    );
    expect(result).toEqual({ claimed: true, record: running });
    const hash = createHash('sha256').update(binding.userId).digest('hex');
    expect(mocked.eval).toHaveBeenCalledWith(
      expect.any(String),
      [
        `cite:ai:{operations}:operation:${operationId}`,
        `cite:ai:{operations}:actor:${hash}:active`,
      ],
      [JSON.stringify(running), 3600, operationId]
    );
  });

  it('does not disclose another actor receipt or accept invalid stored data', async () => {
    mocked.get.mockResolvedValue(running);
    await expect(
      createCitationAiOperationStore().read(
        operationId,
        '00000000-0000-4000-8000-00000000a303'
      )
    ).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    mocked.get.mockResolvedValue('{"stage":"settled"}');
    await expect(
      createCitationAiOperationStore().read(operationId, binding.userId)
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('fails closed without a store and refuses an occupied actor slot', async () => {
    mocked.client.mockResolvedValueOnce(null);
    await expect(
      createCitationAiOperationStore().claim(operationId, binding)
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(mocked.eval).not.toHaveBeenCalled();
    mocked.eval.mockResolvedValueOnce([-1, '']);
    await expect(
      createCitationAiOperationStore().claim(operationId, binding)
    ).rejects.toMatchObject({ code: 'GENERATION_IN_PROGRESS' });
  });

  it('canonicalizes CAS bytes and retains the actor fence for ambiguous billing', async () => {
    const store = createCitationAiOperationStore();
    const previous = { binding, stage: 'running' } as const;
    const next = { stage: 'failed', binding, code: 'BILLING_PENDING' } as const;
    mocked.eval.mockResolvedValue(1);
    expect(await store.transition(operationId, previous, next)).toBe(true);
    expect(mocked.eval).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      [
        JSON.stringify(running),
        JSON.stringify(citationAiOperationSchema.parse(next)),
        3600,
        operationId,
        '0',
        3600,
      ]
    );
  });
});
