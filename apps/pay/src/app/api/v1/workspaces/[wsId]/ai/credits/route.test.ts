import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AiCreditsStatusError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  }

  return {
    AiCreditsStatusError,
    getAiCreditsStatus: vi.fn(),
    resolveSatelliteRequestActor: vi.fn(),
    resolveWorkspaceIdForPrincipal: vi.fn(),
  };
});

vi.mock('@tuturuuu/payment-core', () => ({
  AiCreditsStatusError: mocks.AiCreditsStatusError,
  getAiCreditsStatus: mocks.getAiCreditsStatus,
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolveSatelliteRequestActor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  resolveWorkspaceIdForPrincipal: mocks.resolveWorkspaceIdForPrincipal,
}));

import { GET } from './route';

const context = { params: Promise.resolve({ wsId: 'ws-1' }) };

describe('GET Pay workspace AI credits', () => {
  beforeEach(() => {
    mocks.resolveSatelliteRequestActor.mockResolvedValue({
      admin: { id: 'admin' },
      user: { id: 'user-1' },
    });
    mocks.resolveWorkspaceIdForPrincipal.mockResolvedValue('ws-1');
    mocks.getAiCreditsStatus.mockResolvedValue({
      remaining: 850,
      tier: 'FREE',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('accepts Pay and Platform app sessions', async () => {
    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(200);
    expect(mocks.resolveSatelliteRequestActor).toHaveBeenCalledWith(
      expect.any(Request),
      ['pay', 'platform']
    );
    expect(mocks.getAiCreditsStatus).toHaveBeenCalledWith({
      accessClient: { id: 'admin' },
      userId: 'user-1',
      wsId: 'ws-1',
    });
    expect(response.headers.get('cache-control')).toBe('private, max-age=30');
    expect(await response.json()).toEqual({ remaining: 850, tier: 'FREE' });
  });

  it('returns 401 without a verified app session', async () => {
    mocks.resolveSatelliteRequestActor.mockResolvedValue(null);

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.getAiCreditsStatus).not.toHaveBeenCalled();
  });

  it('preserves service authorization errors', async () => {
    mocks.getAiCreditsStatus.mockRejectedValue(
      new mocks.AiCreditsStatusError('Workspace access denied', 403)
    );

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Workspace access denied',
    });
  });
});
