import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { shutdownDevboxRunner } from './agent-store';

describe('devbox agent store', () => {
  const fromMock = vi.fn();
  const runnerEqMock = vi.fn();
  const runnerUpdateMock = vi.fn();
  const schemaMock = vi.fn();
  const tokenDeleteMock = vi.fn();
  const tokenEqMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    tokenEqMock.mockResolvedValue({ error: null });
    tokenDeleteMock.mockReturnValue({ eq: tokenEqMock });
    runnerEqMock.mockResolvedValue({ error: null });
    runnerUpdateMock.mockReturnValue({ eq: runnerEqMock });
    fromMock.mockImplementation((table: string) => {
      if (table === 'devbox_runner_tokens') {
        return { delete: tokenDeleteMock };
      }
      if (table === 'devbox_runners') {
        return { update: runnerUpdateMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    schemaMock.mockReturnValue({ from: fromMock });
    createAdminClientMock.mockResolvedValue({ schema: schemaMock });
  });

  it('deletes runner tokens before marking the runner revoked', async () => {
    await expect(shutdownDevboxRunner('runner-1')).resolves.toEqual({
      message: 'Devbox runner removed from the cluster.',
      runner: { id: 'runner-1', status: 'revoked' },
    });

    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(fromMock).toHaveBeenNthCalledWith(1, 'devbox_runner_tokens');
    expect(tokenDeleteMock).toHaveBeenCalledWith();
    expect(tokenEqMock).toHaveBeenCalledWith('runner_id', 'runner-1');
    expect(fromMock).toHaveBeenNthCalledWith(2, 'devbox_runners');
    expect(runnerUpdateMock).toHaveBeenCalledWith({
      status: 'revoked',
      updated_at: expect.any(String),
    });
    expect(runnerEqMock).toHaveBeenCalledWith('id', 'runner-1');
  });
});
