import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient, mockCreateClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: mockCreateClient,
}));

import { verifyHasSecrets, verifySecret } from '../workspace-helper';

const FLAG = { forceAdmin: true, name: 'ENABLE_FEE_LOCK', value: 'true' };

describe('workspace secret checks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed on an empty workspace id without reading any secrets', async () => {
    for (const wsId of ['', '   ']) {
      await expect(verifySecret({ wsId, ...FLAG })).resolves.toBe(false);
      await expect(verifyHasSecrets(wsId, ['ENABLE_FEE_LOCK'])).resolves.toBe(
        false
      );
    }
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('still reads the workspace-scoped secret for a real workspace id', async () => {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockResolvedValue({
      data: [{ name: 'ENABLE_FEE_LOCK', value: 'true' }],
      error: null,
    });
    mockCreateAdminClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq, order })) })),
    });
    const wsId = '00000000-0000-4000-8000-0000000fe010';
    await expect(verifySecret({ wsId, ...FLAG })).resolves.toBe(true);
    expect(eq).toHaveBeenCalledWith('ws_id', wsId);
  });
});
