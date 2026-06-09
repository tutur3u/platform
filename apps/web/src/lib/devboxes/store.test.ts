import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { verifyDevboxRunnerToken } from './store';

describe('devbox store', () => {
  const eqMock = vi.fn();
  const fromMock = vi.fn();
  const isMock = vi.fn();
  const limitMock = vi.fn();
  const orderMock = vi.fn();
  const schemaMock = vi.fn();
  const selectMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReturnValue({ eq: eqMock });
    eqMock.mockReturnValue({ is: isMock });
    isMock.mockReturnValue({ order: orderMock });
    orderMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ select: selectMock });
    schemaMock.mockReturnValue({ from: fromMock });
    createAdminClientMock.mockResolvedValue({ schema: schemaMock });
  });

  it('accepts active runner tokens', async () => {
    limitMock.mockResolvedValue({
      data: [{ runner_id: 'runner-1' }],
      error: null,
    });

    await expect(verifyDevboxRunnerToken('tdbx_active')).resolves.toEqual({
      id: 'runner-1',
    });

    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(fromMock).toHaveBeenCalledWith('devbox_runner_tokens');
    expect(selectMock).toHaveBeenCalledWith('runner_id');
    expect(eqMock).toHaveBeenCalledWith(
      'token_hash',
      createHash('sha256').update('tdbx_active').digest('hex')
    );
    expect(isMock).toHaveBeenCalledWith('revoked_at', null);
  });

  it('rejects revoked runner tokens filtered out by the store query', async () => {
    limitMock.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(verifyDevboxRunnerToken('tdbx_revoked')).resolves.toBeNull();

    expect(isMock).toHaveBeenCalledWith('revoked_at', null);
  });
});
