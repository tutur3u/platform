import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitationAiBinding, CitationAiCheckpoint } from './contracts';
import {
  admitCitationAi,
  deductCitationAi,
  recoverCitationCharge,
  readCitationDurableCharge,
} from './billing';

const mocked = vi.hoisted(() => ({
  from: vi.fn(),
  check: vi.fn(),
  deduct: vi.fn(),
  plan: vi.fn(),
  cap: vi.fn(),
  price: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: mocked.from,
    schema: () => ({ from: mocked.from }),
  }),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocked.check,
  deductAiCredits: mocked.deduct,
}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: mocked.plan,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: mocked.cap,
  readOutputPricePerToken: mocked.price,
}));

const lookupNow = Date.parse('2026-11-16T12:00:00Z');
function operationIdAt(timestamp: number) {
  const hex = timestamp.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000001`;
}
const operationId = operationIdAt(lookupNow - 5 * 60000);

const binding: CitationAiBinding = {
  userId: '00000000-0000-4000-8000-00000000a201',
  billingWsId: '00000000-0000-4000-8000-00000000a202',
  feature: 'cite_fix_ref',
  inputHash: 'a'.repeat(64),
};
function row(data: unknown, error: unknown = null) {
  const eq = vi.fn();
  const contains = vi.fn();
  const gte = vi.fn();
  const lte = vi.fn();
  const or = vi.fn();
  const chain = {
    select: vi.fn(),
    eq,
    contains,
    gte,
    lte,
    or,
    maybeSingle: vi.fn(async (): Promise<unknown> => ({ data, error })),
    limit: vi.fn(async (): Promise<unknown> => ({ data, error })),
  };
  chain.select.mockReturnValue(chain);
  eq.mockReturnValue(chain);
  contains.mockReturnValue(chain);
  gte.mockReturnValue(chain);
  lte.mockReturnValue(chain);
  or.mockReturnValue(chain);
  return chain;
}

function timedLedger(
  createdAt: string,
  id = operationId,
  identity: { wsId?: string | null; userId?: string } = {}
) {
  const entries = [
    {
      ws_id: identity.wsId === undefined ? binding.billingWsId : identity.wsId,
      user_id: identity.userId ?? binding.userId,
      feature: binding.feature,
      metadata: {
        citeOperationId: id,
        citeBillingWorkspaceId: binding.billingWsId,
        citeInputHash: binding.inputHash,
      },
      created_at: createdAt,
    },
  ];
  const query = row(entries);
  let from = Number.NEGATIVE_INFINITY;
  let through = Number.POSITIVE_INFINITY;
  const identityFilters: Array<(entry: (typeof entries)[number]) => boolean> =
    [];
  query.eq.mockImplementation((column: string, value: string) => {
    if (column === 'ws_id')
      identityFilters.push((entry) => entry.ws_id === value);
    if (column === 'user_id')
      identityFilters.push((entry) => entry.user_id === value);
    return query;
  });
  query.or.mockImplementation((expression: string) => {
    const values = /^ws_id\.eq\.([a-f0-9-]+),user_id\.eq\.([a-f0-9-]+)$/.exec(
      expression
    );
    identityFilters.push((entry) =>
      Boolean(
        values && (entry.ws_id === values[1] || entry.user_id === values[2])
      )
    );
    return query;
  });
  query.gte.mockImplementation((_column: string, value: string) => {
    from = Date.parse(value);
    return query;
  });
  query.lte.mockImplementation((_column: string, value: string) => {
    through = Date.parse(value);
    return query;
  });
  query.limit.mockImplementation(async () => ({
    data: entries.filter(
      (entry) =>
        Date.parse(entry.created_at) >= from &&
        Date.parse(entry.created_at) <= through &&
        identityFilters.every((matches) => matches(entry))
    ),
    error: null,
  }));
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(lookupNow);
  mocked.from.mockReset();
  mocked.from.mockImplementation((table: string) => {
    if (table === 'ai_credit_feature_access') return row({ enabled: true });
    if (table === 'ai_credit_plan_allocations')
      return row({ markup_multiplier: 1.25 });
    if (table === 'ai_gateway_models')
      return row({ output_price_per_token: 0.00001 });
    throw new Error('Unexpected test table');
  });
  mocked.plan.mockResolvedValue({
    allocationId: 'allocation-id',
    modelId: 'google/synthetic-model',
    tier: 'FREE',
  });
  mocked.check.mockResolvedValue({
    allowed: true,
    remainingCredits: 20,
    maxOutputTokens: 4000,
    errorCode: null,
  });
  mocked.cap.mockResolvedValue(1000);
  mocked.price.mockResolvedValue(0.00002);
  mocked.deduct.mockResolvedValue({ success: true, creditsDeducted: 0.2 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('citation feature and personal credit admission', () => {
  it.each([
    { response: undefined },
    { response: { error: null } },
    { response: { data: { enabled: true } } },
    {
      response: {
        data: { enabled: true },
        error: { message: 'private database detail' },
      },
    },
    { response: { data: { enabled: 'true' }, error: null } },
  ])(
    'rejects malformed feature responses before credit allowance',
    async ({ response }) => {
      const query = row(null);
      query.maybeSingle.mockResolvedValue(response);
      mocked.from.mockReturnValue(query);
      await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
        code: 'CREDIT_CHECK_FAILED',
        status: 503,
      });
      expect(mocked.check).not.toHaveBeenCalled();
      expect(mocked.cap).not.toHaveBeenCalled();
    }
  );

  it.each([
    { response: undefined },
    { response: { data: [] } },
    { response: { data: [], error: { message: 'private database detail' } } },
    { response: { error: null } },
  ])(
    'keeps malformed ledger envelopes unavailable rather than absent or settled',
    async ({ response }) => {
      const query = row(null);
      query.limit.mockResolvedValue(response);
      mocked.from.mockReturnValue(query);
      expect(await readCitationDurableCharge(operationId, binding)).toEqual({
        kind: 'unavailable',
      });
      expect(await recoverCitationCharge(operationId, binding)).toBeNull();
      expect(mocked.deduct).not.toHaveBeenCalled();
    }
  );

  it('distinguishes an absent durable charge from a failed transaction lookup', async () => {
    mocked.from
      .mockReturnValueOnce(row([]))
      .mockReturnValueOnce(row(null, { message: 'private failure' }));
    expect(await readCitationDurableCharge(operationId, binding)).toEqual({
      kind: 'absent',
    });
    expect(await readCitationDurableCharge(operationId, binding)).toEqual({
      kind: 'unavailable',
    });
    mocked.from.mockImplementationOnce(() => {
      throw new Error('private transport detail');
    });
    expect(await readCitationDurableCharge(operationId, binding)).toEqual({
      kind: 'unavailable',
    });
  });

  it('finds an already-charged operation by pool or actor and returns no amount or proposal', async () => {
    const query = row([
      {
        ws_id: binding.billingWsId,
        user_id: binding.userId,
        feature: binding.feature,
        metadata: {
          citeOperationId: operationId,
          citeBillingWorkspaceId: binding.billingWsId,
          citeInputHash: binding.inputHash,
        },
      },
    ]);
    mocked.from.mockReturnValue(query);
    expect(await readCitationDurableCharge(operationId, binding)).toEqual({
      kind: 'charged',
      bindingMatches: true,
    });
    expect(query.select).toHaveBeenCalledWith('ws_id,user_id,feature,metadata');
    expect(query.or).toHaveBeenCalledExactlyOnceWith(
      `ws_id.eq.${binding.billingWsId},user_id.eq.${binding.userId}`
    );
    expect(query.contains).toHaveBeenCalledExactlyOnceWith('metadata', {
      citeOperationId: operationId,
    });
    expect(query.eq).toHaveBeenCalledExactlyOnceWith(
      'transaction_type',
      'deduction'
    );
    expect(query.gte).toHaveBeenCalledExactlyOnceWith(
      'created_at',
      '2026-11-16T11:53:00.000Z'
    );
    expect(query.lte).toHaveBeenCalledExactlyOnceWith(
      'created_at',
      '2026-11-16T12:01:00.000Z'
    );
    expect(mocked.deduct).not.toHaveBeenCalled();
  });

  it('keeps the original admissible operation timestamp as the lower bound on same-ID replay', async () => {
    const oldestAccepted = operationIdAt(lookupNow - 15 * 60000);
    const query = timedLedger('2026-11-16T11:46:00.000Z', oldestAccepted);
    mocked.from.mockReturnValue(query);
    expect(await readCitationDurableCharge(oldestAccepted, binding)).toEqual({
      kind: 'charged',
      bindingMatches: true,
    });
    expect(query.gte).toHaveBeenCalledWith(
      'created_at',
      '2026-11-16T11:43:00.000Z'
    );
    expect(query.lte).toHaveBeenCalledWith(
      'created_at',
      '2026-11-16T12:01:00.000Z'
    );
  });

  it.each([
    'nullable_personal',
    'same_pool_foreign_actor',
    'same_actor_foreign_pool',
  ])(
    'retains the indexed %s charge and compares its actual workspace and metadata binding',
    async (kind) => {
      const foreignId = '00000000-0000-4000-8000-00000000a209';
      const query = timedLedger('2026-11-16T11:58:00.000Z', operationId, {
        wsId:
          kind === 'nullable_personal'
            ? null
            : kind === 'same_actor_foreign_pool'
              ? foreignId
              : binding.billingWsId,
        userId: kind === 'same_pool_foreign_actor' ? foreignId : binding.userId,
      });
      mocked.from.mockReturnValue(query);
      expect(await readCitationDurableCharge(operationId, binding)).toEqual({
        kind: 'charged',
        bindingMatches: kind === 'nullable_personal',
      });
      expect(query.or).toHaveBeenCalledExactlyOnceWith(
        `ws_id.eq.${binding.billingWsId},user_id.eq.${binding.userId}`
      );
      expect(mocked.deduct).not.toHaveBeenCalled();
    }
  );

  it.each(['userId', 'billingWsId'])(
    'refuses an invalid %s before constructing the PostgREST identity expression',
    async (field) => {
      const unsafeBinding = {
        ...binding,
        [field]: `${binding.userId},ws_id.not.is.null`,
      };
      expect(
        await readCitationDurableCharge(operationId, unsafeBinding)
      ).toEqual({ kind: 'unavailable' });
      expect(mocked.from).not.toHaveBeenCalled();
    }
  );

  it('includes late visible settlement and the accepted future timestamp tolerance', async () => {
    const query = timedLedger('2026-11-16T12:00:59.999Z');
    mocked.from.mockReturnValueOnce(query);
    expect(await readCitationDurableCharge(operationId, binding)).toEqual({
      kind: 'charged',
      bindingMatches: true,
    });
    const futureAccepted = operationIdAt(lookupNow + 60000);
    const futureQuery = timedLedger('2026-11-16T11:59:30.000Z', futureAccepted);
    mocked.from.mockReturnValueOnce(futureQuery);
    expect(await readCitationDurableCharge(futureAccepted, binding)).toEqual({
      kind: 'charged',
      bindingMatches: true,
    });
  });

  it.each([
    'operation-id',
    operationId.replace('-7000-', '-4000-'),
    operationIdAt(lookupNow - 15 * 60000 - 1),
    operationIdAt(lookupNow + 60001),
  ])(
    'refuses malformed or inadmissible operation IDs before a ledger query',
    async (id) => {
      expect(await readCitationDurableCharge(id, binding)).toEqual({
        kind: 'unavailable',
      });
      expect(mocked.from).not.toHaveBeenCalled();
      expect(mocked.deduct).not.toHaveBeenCalled();
    }
  );

  it.each(['actor', 'pool', 'input', 'feature'])(
    'rejects conflicting %s binding returned through pool-or-actor scope',
    async (field) => {
      mocked.from.mockReturnValue(
        row([
          {
            ws_id:
              field === 'pool'
                ? '00000000-0000-4000-8000-00000000a204'
                : binding.billingWsId,
            user_id:
              field === 'actor'
                ? '00000000-0000-4000-8000-00000000a203'
                : binding.userId,
            feature: field === 'feature' ? 'chat' : binding.feature,
            metadata: {
              citeOperationId: operationId,
              citeBillingWorkspaceId:
                field === 'pool'
                  ? '00000000-0000-4000-8000-00000000a204'
                  : binding.billingWsId,
              citeInputHash:
                field === 'input' ? 'b'.repeat(64) : binding.inputHash,
            },
          },
        ])
      );
      expect(await readCitationDurableCharge(operationId, binding)).toEqual({
        kind: 'charged',
        bindingMatches: false,
      });
      expect(mocked.deduct).not.toHaveBeenCalled();
    }
  );

  it.each([
    { data: null },
    { data: [{ user_id: 'invalid' }] },
    {
      data: [
        { ws_id: null, user_id: null, feature: null, metadata: null },
        { ws_id: null, user_id: null, feature: null, metadata: null },
      ],
    },
  ])(
    'fails closed for malformed or ambiguous identity-scoped charge data',
    async ({ data }) => {
      mocked.from.mockReturnValue(row(data));
      expect(await readCitationDurableCharge(operationId, binding)).toEqual({
        kind: 'unavailable',
      });
    }
  );

  it.each([null, { enabled: false }])(
    'requires an explicit enabled feature row before legacy allowance',
    async (feature) => {
      const query = row(feature);
      mocked.from.mockReturnValue(query);
      await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
        code: 'FEATURE_NOT_ALLOWED',
        status: 403,
      });
      expect(query.eq).toHaveBeenCalledWith('tier', 'FREE');
      expect(query.eq).toHaveBeenCalledWith('feature', 'cite_fix_ref');
      expect(mocked.check).not.toHaveBeenCalled();
      expect(mocked.cap).not.toHaveBeenCalled();
    }
  );

  it('fails closed when the feature lookup is unavailable', async () => {
    mocked.from.mockReturnValue(
      row(null, { message: 'private database error' })
    );
    await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
      code: 'CREDIT_CHECK_FAILED',
      status: 503,
    });
    expect(mocked.check).not.toHaveBeenCalled();
  });

  it('reuses server plan selection, input preflight, markup and output affordability', async () => {
    mocked.from
      .mockReturnValueOnce(row({ enabled: true }))
      .mockReturnValueOnce(row({ markup_multiplier: 1.25 }));
    expect(await admitCitationAi(binding, 900)).toEqual({
      modelId: 'google/synthetic-model',
      maxOutputTokens: 1000,
    });
    expect(mocked.plan).toHaveBeenCalledWith({
      wsId: binding.billingWsId,
      capability: 'language',
    });
    expect(mocked.check).toHaveBeenCalledWith(
      binding.billingWsId,
      'google/synthetic-model',
      'cite_fix_ref',
      { userId: binding.userId, estimatedInputTokens: 900 }
    );
    expect(mocked.cap).toHaveBeenCalledWith(
      expect.anything(),
      'google/synthetic-model',
      4000,
      20,
      1.25,
      0.00002
    );
  });

  it('prices the combined response cap at the flat reasoning rate when all output tiers are cheaper', async () => {
    mocked.price.mockResolvedValue(0.000001);
    await admitCitationAi(binding, 900);
    expect(mocked.cap).toHaveBeenCalledWith(
      expect.anything(),
      'google/synthetic-model',
      4000,
      20,
      1.25,
      0.00001
    );
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '0.00001'])(
    'refuses missing/invalid flat reasoning pricing before authorizing output',
    async (baseRate) => {
      mocked.from
        .mockReturnValueOnce(row({ enabled: true }))
        .mockReturnValueOnce(row({ markup_multiplier: 1.25 }))
        .mockReturnValueOnce(row({ output_price_per_token: baseRate }));
      await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
        code: 'CREDIT_CHECK_FAILED',
        status: 503,
      });
      expect(mocked.cap).not.toHaveBeenCalled();
    }
  );

  it('refuses invalid tier pricing instead of ignoring the ceiling', async () => {
    mocked.price.mockResolvedValue(null);
    await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
      code: 'CREDIT_CHECK_FAILED',
      status: 503,
    });
    expect(mocked.cap).not.toHaveBeenCalled();
  });

  it('does not invent an affordable output cap when pricing or allocation is missing', async () => {
    mocked.from
      .mockReturnValueOnce(row({ enabled: true }))
      .mockReturnValueOnce(row(null));
    await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
      code: 'CREDIT_CHECK_FAILED',
    });
    mocked.from
      .mockReturnValueOnce(row({ enabled: true }))
      .mockReturnValueOnce(row({ markup_multiplier: 1 }));
    mocked.cap.mockResolvedValue(null);
    await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
      code: 'CREDITS_EXHAUSTED',
    });
  });

  it('rejects a numeric-string markup multiplier before authorizing output', async () => {
    mocked.from
      .mockReturnValueOnce(row({ enabled: true }))
      .mockReturnValueOnce(row({ markup_multiplier: '1.25' }));
    await expect(admitCitationAi(binding, 900)).rejects.toMatchObject({
      code: 'CREDIT_CHECK_FAILED',
      status: 503,
    });
    expect(mocked.cap).not.toHaveBeenCalled();
  });

  it('passes actual usage and operation metadata without an execution FK or private citation text', async () => {
    const checkpoint: CitationAiCheckpoint = {
      binding,
      modelId: 'google/synthetic-model',
      usage: { inputTokens: 100, outputTokens: 90, reasoningTokens: 20 },
      outcome: { kind: 'invalid' },
    };
    await deductCitationAi(operationId, checkpoint);
    expect(mocked.deduct).toHaveBeenCalledExactlyOnceWith({
      wsId: binding.billingWsId,
      userId: binding.userId,
      modelId: checkpoint.modelId,
      feature: 'cite_fix_ref',
      ...checkpoint.usage,
      metadata: {
        source: 'cite_fix_ref',
        citeOperationId: operationId,
        citeBillingWorkspaceId: binding.billingWsId,
        citeInputHash: binding.inputHash,
      },
    });
  });

  it.each([
    { data: [] },
    { data: [{ amount: -1 }, { amount: -1 }] },
    { data: [{ amount: 1 }] },
  ])('keeps missing or ambiguous charge readback unknown', async ({ data }) => {
    mocked.from.mockReturnValue(row(data));
    expect(await recoverCitationCharge(operationId, binding)).toBeNull();
    expect(mocked.deduct).not.toHaveBeenCalled();
  });

  it('reads a single actor/feature/original-pool transaction without filtering nullable ws_id', async () => {
    const query = row([{ amount: -0.4 }]);
    mocked.from.mockReturnValue(query);
    expect(await recoverCitationCharge(operationId, binding)).toBe(0.4);
    expect(query.eq).toHaveBeenCalledWith('user_id', binding.userId);
    expect(query.eq).toHaveBeenCalledWith('feature', 'cite_fix_ref');
    expect(query.eq).toHaveBeenCalledWith('transaction_type', 'deduction');
    expect(query.eq).not.toHaveBeenCalledWith('ws_id', expect.anything());
    expect(query.contains).toHaveBeenCalledWith('metadata', {
      citeOperationId: operationId,
      citeBillingWorkspaceId: binding.billingWsId,
      citeInputHash: binding.inputHash,
    });
  });
});
