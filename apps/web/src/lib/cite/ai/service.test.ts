import { describe, expect, it, vi } from 'vitest';
import { CitationAiError, type CitationDurableChargeRead } from './contracts';
import {
  actorId,
  billingWsId,
  fixture,
  now,
  operationId,
  otherId,
  request,
  signal,
  usage,
  work,
} from './service-test-fixture';

describe('citation AI operation protocol', () => {
  it('bills the server-resolved personal pool and returns a reviewable settled proposal', async () => {
    const { dependencies, service } = fixture();
    const result = await service.fix(actorId, request(), signal());
    expect(dependencies.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actorId,
        billingWsId,
        feature: 'cite_fix_ref',
      }),
      expect.any(Number)
    );
    expect(dependencies.deduct).toHaveBeenCalledWith(
      operationId(),
      expect.objectContaining({
        binding: expect.objectContaining({ userId: actorId, billingWsId }),
        usage,
      })
    );
    expect(result).toMatchObject({
      operationId: operationId(),
      needsReview: true,
      billing: { status: 'settled', creditsDeducted: 0.54 },
      work: {
        id: `cite-ai:${operationId()}`,
        provenance: { verificationStatus: 'ai_inferred' },
      },
    });
  });

  it.each(['wsId', 'billingWsId', 'userId', 'modelId', 'feature'])(
    'rejects client-controlled %s before any credit or provider call',
    async (key) => {
      const { dependencies, service } = fixture();
      await expect(
        service.fix(actorId, { ...request(), [key]: otherId }, signal())
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(dependencies.resolveBillingWorkspace).not.toHaveBeenCalled();
      expect(dependencies.generate).not.toHaveBeenCalled();
    }
  );

  it('replays the same operation without repeating generation or deduction', async () => {
    const { dependencies, service } = fixture();
    const first = await service.fix(actorId, request(), signal());
    expect(await service.fix(actorId, request(), signal())).toEqual(first);
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('does not generate or deduct again when a settled operation loses its database receipt', async () => {
    const { dependencies, service, records } = fixture();
    await service.fix(actorId, request(), signal());
    records.clear();
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({
      code: 'INVALID_AI_OUTPUT',
      status: 502,
      billingStatus: 'settled',
    });
    expect(records.size).toBe(0);
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it.each(['nullable_personal', 'same_pool_foreign_actor'])(
    'blocks another provider call after losing a receipt backed by a %s charge',
    async (kind) => {
      const { dependencies, service, records, charges } = fixture();
      await service.fix(
        kind === 'same_pool_foreign_actor' ? otherId : actorId,
        request(),
        signal()
      );
      const charge = charges.get(operationId());
      if (!charge) throw new Error('Synthetic charge fixture was not settled');
      if (kind === 'nullable_personal') charge.wsId = null;
      records.clear();
      await expect(
        service.fix(actorId, request(), signal())
      ).rejects.toMatchObject(
        kind === 'nullable_personal'
          ? { code: 'INVALID_AI_OUTPUT', status: 502, billingStatus: 'settled' }
          : { code: 'OPERATION_CONFLICT', status: 409 }
      );
      expect(records.size).toBe(0);
      expect(dependencies.generate).toHaveBeenCalledTimes(1);
      expect(dependencies.deduct).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects an expired lost receipt without a durable query or second provider call', async () => {
    const { dependencies, service, records } = fixture();
    await service.fix(actorId, request(), signal());
    records.clear();
    dependencies.now = () => now + 16 * 60000;
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'OPERATION_EXPIRED', status: 409 });
    expect(dependencies.readDurableCharge).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(0);
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('still settles an old retained receipt through readback without new-operation age checks', async () => {
    const { dependencies, service } = fixture();
    dependencies.deduct = vi.fn(async () => {
      throw new Error('lost response');
    });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'BILLING_PENDING' });
    dependencies.now = () => now + 30 * 60000;
    dependencies.recoverCharge = vi.fn(async () => 0.54);
    await expect(
      service.fix(actorId, request(), signal())
    ).resolves.toMatchObject({
      billing: { status: 'settled', creditsDeducted: 0.54 },
    });
    expect(dependencies.readDurableCharge).toHaveBeenCalledTimes(1);
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it.each(['actor', 'pool', 'input'])(
    'preserves %s binding within pool-or-actor scope when the database receipt is lost',
    async (change) => {
      const { dependencies, service, records } = fixture();
      await service.fix(actorId, request(), signal());
      records.clear();
      if (change === 'pool')
        dependencies.resolveBillingWorkspace = async () => otherId;
      const caller = change === 'actor' ? otherId : actorId;
      const input =
        change === 'input'
          ? { ...request(), input: 'Different input' }
          : request();
      await expect(service.fix(caller, input, signal())).rejects.toMatchObject({
        code: 'OPERATION_CONFLICT',
        status: 409,
      });
      expect(records.size).toBe(0);
      expect(dependencies.generate).toHaveBeenCalledTimes(1);
      expect(dependencies.deduct).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['unavailable', 'throws'])(
    'stops before claim, admission and provider when durable charge lookup %s',
    async (failure) => {
      const { dependencies, service, records } = fixture();
      dependencies.readDurableCharge = vi.fn(
        async (): Promise<CitationDurableChargeRead> => {
          if (failure === 'throws')
            throw new Error('private transaction lookup detail');
          return { kind: 'unavailable' };
        }
      );
      await expect(
        service.fix(actorId, request(), signal())
      ).rejects.toMatchObject({
        code: 'CREDIT_CHECK_FAILED',
        status: 503,
        billingStatus: 'unknown',
      });
      expect(records.size).toBe(0);
      expect(dependencies.admit).not.toHaveBeenCalled();
      expect(dependencies.generate).not.toHaveBeenCalled();
      expect(dependencies.deduct).not.toHaveBeenCalled();
    }
  );

  it('stops before provider when the post-admission lease cannot be renewed', async () => {
    const { dependencies, service, operations } = fixture();
    const transition = operations.transition;
    operations.transition = async (id, previous, next) => {
      if (previous.stage === 'running' && next.stage === 'running')
        return false;
      return transition(id, previous, next);
    };
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
    expect(dependencies.admit).toHaveBeenCalledTimes(1);
    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('canonicalizes UUID case to one receipt', async () => {
    const { dependencies, service } = fixture();
    await service.fix(
      actorId,
      { ...request(), operationId: operationId().toUpperCase() },
      signal()
    );
    await service.fix(actorId, request(), signal());
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('binds an operation to its original input, actor, and personal billing pool', async () => {
    const { dependencies, service } = fixture();
    await service.fix(actorId, request(), signal());
    await expect(
      service.fix(
        actorId,
        { ...request(), input: 'Different citation' },
        signal()
      )
    ).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    await expect(
      service.fix(otherId, request(), signal())
    ).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    dependencies.resolveBillingWorkspace = async () => otherId;
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('rejects expired new IDs while retaining readback of existing receipts', async () => {
    const { dependencies, service } = fixture();
    await expect(
      service.fix(
        actorId,
        { ...request(), operationId: operationId(now - 16 * 60000) },
        signal()
      )
    ).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' });
    expect(dependencies.generate).not.toHaveBeenCalled();
    await service.fix(actorId, request(), signal());
    dependencies.now = () => now + 16 * 60000;
    await expect(
      service.fix(actorId, request(), signal())
    ).resolves.toMatchObject({ billing: { status: 'settled' } });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
  });

  it('admits one provider call during concurrent identical and different-ID requests', async () => {
    const { dependencies, service } = fixture();
    let started: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    dependencies.generate = vi.fn(async () => {
      started();
      await pending;
      return { value: work, usage };
    });
    const first = service.fix(actorId, request(), signal());
    await entered;
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'GENERATION_IN_PROGRESS' });
    await expect(
      service.fix(
        actorId,
        { ...request(), operationId: operationId(now, '2') },
        signal()
      )
    ).rejects.toMatchObject({ code: 'GENERATION_IN_PROGRESS' });
    finish();
    await first;
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('fails closed before generation for a missing/disabled feature or unavailable operation store', async () => {
    const { dependencies, service, operations } = fixture();
    dependencies.admit = vi.fn(async () => {
      throw new CitationAiError('FEATURE_NOT_ALLOWED', 403);
    });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'FEATURE_NOT_ALLOWED' });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'FEATURE_NOT_ALLOWED' });
    expect(dependencies.admit).toHaveBeenCalledTimes(1);
    operations.read = async () => {
      throw new CitationAiError('AI_UNAVAILABLE', 503);
    };
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it.each(['denied', 'unavailable'])(
    'releases the actor without provider or billing work when grounding is %s',
    async (reason) => {
      const { actorLocks, dependencies, service } = fixture();
      const reserve = vi.mocked(dependencies.reserveGrounding);
      if (reason === 'denied') reserve.mockResolvedValueOnce(false);
      else reserve.mockRejectedValueOnce(new Error('Storage unavailable'));
      await expect(
        service.fix(actorId, request(), signal())
      ).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE',
        status: 503,
        billingStatus: undefined,
      });
      expect(actorLocks.has(actorId)).toBe(false);
      expect(dependencies.generate).not.toHaveBeenCalled();
      expect(dependencies.deduct).not.toHaveBeenCalled();
      await expect(
        service.fix(
          actorId,
          { ...request(), operationId: operationId(now, '2') },
          signal()
        )
      ).resolves.toMatchObject({ billing: { status: 'settled' } });
    }
  );

  it('reserves grounding before the SDK and charges for output when the registry fails', async () => {
    const { dependencies, service } = fixture();
    dependencies.generate = vi.fn(async () => ({
      value: { ...work, doi: '10.1234/synthetic' },
      usage,
    }));
    dependencies.ground = vi.fn(async () => {
      throw new Error('Registry unavailable');
    });
    await expect(
      service.fix(
        actorId,
        {
          ...request(),
          input: 'Check DOI 10.1234/synthetic',
        },
        signal()
      )
    ).resolves.toMatchObject({
      grounding: [{ field: 'doi', status: 'unverified' }],
      billing: { status: 'settled' },
    });
    expect(dependencies.reserveGrounding).toHaveBeenCalledTimes(1);
    expect(dependencies.reserveGrounding).toHaveBeenCalledBefore(
      dependencies.generate
    );
    expect(dependencies.ground).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('cancels before provider start without charging', async () => {
    const { dependencies, service } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.fix(actorId, request(), controller.signal)
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('reports unknown billing after a provider error and never replays the call', async () => {
    const { dependencies, service } = fixture();
    dependencies.generate = vi.fn(async () => {
      throw new Error('private provider detail');
    });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({
      code: 'BILLING_PENDING',
      billingStatus: 'unknown',
    });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({
      code: 'BILLING_PENDING',
      billingStatus: 'unknown',
    });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('preserves explicit provider refusal before the SDK call as uncharged unavailability', async () => {
    const { dependencies, service } = fixture();
    dependencies.generate = vi.fn(async () => {
      throw new CitationAiError('AI_UNAVAILABLE', 503);
    });
    let caught: unknown;
    try {
      await service.fix(actorId, request(), signal());
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
    expect(caught).not.toHaveProperty('billingStatus', 'unknown');
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('settles reported usage for invalid output and returns no fabricated citation', async () => {
    const { dependencies, service } = fixture();
    dependencies.generate = vi.fn(async () => ({
      value: { title: '' },
      usage,
    }));
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({
      code: 'INVALID_AI_OUTPUT',
      billingStatus: 'settled',
    });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({
      code: 'INVALID_AI_OUTPUT',
      billingStatus: 'settled',
    });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('never repeats ambiguous deduction; only a confirmed transaction can settle readback', async () => {
    const { dependencies, service } = fixture();
    dependencies.deduct = vi.fn(async () => {
      throw new Error('response lost');
    });
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'BILLING_PENDING' });
    dependencies.now = () => now + 180_000;
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'BILLING_PENDING' });
    expect(dependencies.recoverCharge).toHaveBeenCalledTimes(1);
    dependencies.recoverCharge = vi.fn(async () => 0.54);
    await expect(
      service.fix(actorId, request(), signal())
    ).resolves.toMatchObject({
      billing: { status: 'settled', creditsDeducted: 0.54 },
    });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).toHaveBeenCalledTimes(1);
  });

  it('does not deduct if it cannot acquire the settling fence', async () => {
    const { dependencies, service, operations } = fixture();
    const transition = operations.transition;
    operations.transition = async (id, previous, next) =>
      next.stage === 'settling' ? false : transition(id, previous, next);
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({ code: 'BILLING_PENDING' });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });

  it('reports billing uncertainty if storage fails after reported provider usage', async () => {
    const { dependencies, service, operations } = fixture();
    const transition = operations.transition;
    operations.transition = async (id, previous, next) => {
      if (next.stage === 'checkpoint') throw new Error('store unreachable');
      return transition(id, previous, next);
    };
    await expect(
      service.fix(actorId, request(), signal())
    ).rejects.toMatchObject({
      code: 'BILLING_PENDING',
      billingStatus: 'unknown',
    });
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.deduct).not.toHaveBeenCalled();
  });
});
