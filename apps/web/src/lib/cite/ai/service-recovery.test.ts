import { describe, expect, it, vi } from 'vitest';
import {
  type CitationAiUnsettled,
  type CitationDurableChargeRead,
} from './contracts';
import {
  actorId,
  fixture,
  now,
  operationId,
  request,
  signal,
} from './service-test-fixture';

const pending = {
  code: 'BILLING_PENDING',
  status: 503,
  billingStatus: 'unknown',
};

async function uncharged(
  stage: CitationAiUnsettled['stage'] = 'settling',
  timestamp = now
) {
  const test = fixture();
  const { operations, service } = test;
  const input = { ...request(), operationId: operationId(timestamp) };
  if (stage === 'settling') {
    const claim = operations.claimDeduction;
    operations.claimDeduction = async () => false;
    await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
      pending
    );
    operations.claimDeduction = claim;
  } else {
    const transition = operations.transition;
    operations.transition = async (id, previous, next) =>
      next.stage !== 'settling' && transition(id, previous, next);
    await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
      pending
    );
    operations.transition = transition;
  }
  expect(test.records.get(input.operationId)?.stage).toBe(stage);
  return { ...test, input };
}

describe('citation AI billing recovery', () => {
  it('reopens the same operation after the no-checkpoint receipt and actor lock expire', async () => {
    const { service, dependencies, operations } = fixture();
    dependencies.now = () => now + 1000;
    vi.mocked(dependencies.generate).mockRejectedValueOnce(
      new Error('provider failed')
    );
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject(pending);
    dependencies.now = () => now + 901_000 - 1;
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject(pending);
    expect(operations.claimDeduction).not.toHaveBeenCalled();
    expect(dependencies.deduct).not.toHaveBeenCalled();
    dependencies.now = () => now + 901_000;
    await expect(
      service.fix(actorId, request(), signal())
    ).resolves.toMatchObject({
      billing: { status: 'settled' },
    });
    expect(dependencies.generate).toHaveBeenCalledTimes(2);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('settles a recovered charge without dispatching another deduction', async () => {
    const { service, dependencies, input, records } = await uncharged();
    vi.mocked(dependencies.recoverCharge).mockResolvedValueOnce(0.54);
    await expect(service.fix(actorId, input, signal())).resolves.toMatchObject({
      billing: { status: 'settled', creditsDeducted: 0.54 },
    });
    expect(records.get(input.operationId)?.stage).toBe('settled');
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('keeps a young checkpoint pending without dispatching a deduction', async () => {
    const { service, dependencies, input } = await uncharged();
    dependencies.now = () => now + 179_999;
    await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
      pending
    );
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it.each(['settling', 'checkpoint'] as const)(
    'lets one stale %s retry deduct while a concurrent retry stays pending',
    async (stage) => {
      const { service, dependencies, input } = await uncharged(stage);
      dependencies.now = () => now + 180_000;
      const started = Promise.withResolvers<void>();
      const finish = Promise.withResolvers<void>();
      const deduct = dependencies.deduct;
      dependencies.deduct = vi.fn(async (id, checkpoint) => {
        started.resolve();
        await finish.promise;
        return deduct(id, checkpoint);
      });
      const first = service.fix(actorId, input, signal());
      await Promise.race([started.promise, first]);
      try {
        await expect(
          service.fix(actorId, input, signal())
        ).rejects.toMatchObject(pending);
      } finally {
        finish.resolve();
      }
      const result = await first;
      expect(await service.fix(actorId, input, signal())).toEqual(result);
      expect(dependencies.generate).toHaveBeenCalledTimes(1);
      expect(dependencies.deduct).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    { kind: 'unavailable' },
    { kind: 'charged', bindingMatches: false },
  ] satisfies CitationDurableChargeRead[])(
    'keeps an ambiguous or mismatched durable read pending',
    async (readback) => {
      const { service, dependencies, input, operations } = await uncharged();
      dependencies.now = () => now + 180_000;
      vi.mocked(dependencies.readDurableCharge).mockResolvedValueOnce(readback);
      await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
        pending
      );
      expect(operations.claimDeduction).not.toHaveBeenCalled();
      expect(dependencies.deduct).not.toHaveBeenCalled();
    }
  );

  it('checks the ledger again after winning the dispatch fence', async () => {
    const { service, dependencies, input, operations } = await uncharged();
    dependencies.now = () => now + 180_000;
    vi.mocked(dependencies.readDurableCharge)
      .mockResolvedValueOnce({ kind: 'absent' })
      .mockResolvedValueOnce({ kind: 'charged', bindingMatches: true });
    await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
      pending
    );
    expect(operations.claimDeduction).toHaveBeenCalledTimes(1);
    expect(dependencies.readDurableCharge).toHaveBeenCalledTimes(3);
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('never re-dispatches after a reconciliation deduction throws', async () => {
    const { service, dependencies, input } = await uncharged();
    dependencies.now = () => now + 180_000;
    vi.mocked(dependencies.deduct).mockRejectedValueOnce(
      new Error('Response lost')
    );
    await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
      pending
    );
    dependencies.now = () => now + 901_000;
    await expect(service.fix(actorId, input, signal())).rejects.toMatchObject(
      pending
    );
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });
});
