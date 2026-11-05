import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  key: vi.fn(),
  plan: vi.fn(),
  credits: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: mocks.lookup }) }) }),
    }),
  }),
}));
vi.mock('../api-key-hash', () => ({ validateApiKeyHash: mocks.key }));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: mocks.plan,
  PlanModelResolutionError: class extends Error {},
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.credits,
  deductAiCredits: vi.fn(),
}));
vi.mock('../memory', () => ({ withAiMemory: vi.fn() }));

import { createPOST } from './route';

function request() {
  return new NextRequest('http://localhost/api/ai/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'fixture',
      accessKey: { id: 'key', value: 'invalid-fixture' },
      configs: { wsId: 'workspace', model: 'gemini-2.0-flash-lite' },
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({
    data: {
      id: 'key',
      key_hash: 'fixture-hash',
      scopes: ['gemini-2.0-flash-lite'],
    },
    error: null,
  });
  mocks.key.mockResolvedValue(false);
  mocks.plan.mockResolvedValue({ modelId: 'gemini-2.0-flash-lite' });
  mocks.credits.mockResolvedValue({
    allowed: false,
    errorMessage: 'private allocation state',
  });
});
describe('SR-269 public generation admission', () => {
  it('rejects invalid workspace keys before plan and credit lookups', async () => {
    const response = await createPOST()(request());
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid accessId or accessKey');
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.credits).not.toHaveBeenCalled();
  });
  it('resolves plans only after successful key validation', async () => {
    mocks.key.mockResolvedValue(true);
    expect((await createPOST()(request())).status).toBe(403);
    expect(mocks.key.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.plan.mock.invocationCallOrder[0]!
    );
    expect(mocks.plan).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: 'workspace' })
    );
  });
});
