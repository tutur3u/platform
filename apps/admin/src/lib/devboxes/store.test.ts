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
  const membershipEqUserMock = vi.fn();
  const membershipEqWorkspaceMock = vi.fn();
  const membershipMaybeSingleMock = vi.fn();
  const membershipSelectMock = vi.fn();
  const privateFromMock = vi.fn();
  const publicFromMock = vi.fn();
  const runnerEqMock = vi.fn();
  const runnerLimitMock = vi.fn();
  const runnerOrderMock = vi.fn();
  const runnerSelectMock = vi.fn();
  const schemaMock = vi.fn();
  const tokenEqMock = vi.fn();
  const tokenIsMock = vi.fn();
  const tokenLimitMock = vi.fn();
  const tokenOrderMock = vi.fn();
  const tokenSelectMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    tokenLimitMock.mockResolvedValue({
      data: [{ runner_id: 'runner-1' }],
      error: null,
    });
    tokenOrderMock.mockReturnValue({ limit: tokenLimitMock });
    tokenIsMock.mockReturnValue({ order: tokenOrderMock });
    tokenEqMock.mockReturnValue({ is: tokenIsMock });
    tokenSelectMock.mockReturnValue({ eq: tokenEqMock });

    runnerLimitMock.mockResolvedValue({
      data: [
        {
          actor_id: 'user-1',
          heartbeat_enabled: true,
          id: 'runner-1',
          status: 'online',
        },
      ],
      error: null,
    });
    runnerOrderMock.mockReturnValue({ limit: runnerLimitMock });
    runnerEqMock.mockReturnValue({ order: runnerOrderMock });
    runnerSelectMock.mockReturnValue({ eq: runnerEqMock });

    membershipMaybeSingleMock.mockResolvedValue({
      data: { type: 'MEMBER' },
      error: null,
    });
    membershipEqUserMock.mockReturnValue({
      maybeSingle: membershipMaybeSingleMock,
    });
    membershipEqWorkspaceMock.mockReturnValue({ eq: membershipEqUserMock });
    membershipSelectMock.mockReturnValue({ eq: membershipEqWorkspaceMock });

    privateFromMock.mockImplementation((table: string) => {
      if (table === 'devbox_runner_tokens') {
        return { select: tokenSelectMock };
      }
      if (table === 'devbox_runners') {
        return { select: runnerSelectMock };
      }
      throw new Error(`Unexpected private table ${table}`);
    });
    publicFromMock.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return { select: membershipSelectMock };
      }
      throw new Error(`Unexpected public table ${table}`);
    });
    schemaMock.mockReturnValue({ from: privateFromMock });
    createAdminClientMock.mockResolvedValue({
      from: publicFromMock,
      schema: schemaMock,
    });
  });

  it('accepts active runner tokens', async () => {
    await expect(verifyDevboxRunnerToken('tdbx_active')).resolves.toEqual({
      heartbeatEnabled: true,
      id: 'runner-1',
    });

    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(privateFromMock).toHaveBeenCalledWith('devbox_runner_tokens');
    expect(tokenSelectMock).toHaveBeenCalledWith('runner_id');
    expect(tokenEqMock).toHaveBeenCalledWith(
      'token_hash',
      createHash('sha256').update('tdbx_active').digest('hex')
    );
    expect(tokenIsMock).toHaveBeenCalledWith('revoked_at', null);
    expect(privateFromMock).toHaveBeenCalledWith('devbox_runners');
    expect(runnerSelectMock).toHaveBeenCalledWith(
      'id, actor_id, status, heartbeat_enabled'
    );
    expect(runnerEqMock).toHaveBeenCalledWith('id', 'runner-1');
    expect(publicFromMock).toHaveBeenCalledWith('workspace_members');
    expect(membershipEqWorkspaceMock).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000000'
    );
    expect(membershipEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('rejects revoked runner tokens filtered out by the store query', async () => {
    tokenLimitMock.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(verifyDevboxRunnerToken('tdbx_revoked')).resolves.toBeNull();

    expect(tokenIsMock).toHaveBeenCalledWith('revoked_at', null);
    expect(runnerSelectMock).not.toHaveBeenCalled();
    expect(membershipSelectMock).not.toHaveBeenCalled();
  });

  it('rejects runner tokens when the runner has been revoked', async () => {
    runnerLimitMock.mockResolvedValue({
      data: [
        {
          actor_id: 'user-1',
          heartbeat_enabled: false,
          id: 'runner-1',
          status: 'revoked',
        },
      ],
      error: null,
    });

    await expect(verifyDevboxRunnerToken('tdbx_revoked')).resolves.toBeNull();

    expect(membershipSelectMock).not.toHaveBeenCalled();
  });

  it('rejects runner tokens after the owner loses root membership', async () => {
    membershipMaybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(verifyDevboxRunnerToken('tdbx_removed')).resolves.toBeNull();

    expect(membershipEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('allows registered runners to authenticate before the first heartbeat', async () => {
    runnerLimitMock.mockResolvedValue({
      data: [
        {
          actor_id: 'user-1',
          heartbeat_enabled: true,
          id: 'runner-1',
          status: 'registered',
        },
      ],
      error: null,
    });

    await expect(verifyDevboxRunnerToken('tdbx_registered')).resolves.toEqual({
      heartbeatEnabled: true,
      id: 'runner-1',
    });
  });

  it('requires online runner status for claim and event routes', async () => {
    runnerLimitMock.mockResolvedValue({
      data: [
        {
          actor_id: 'user-1',
          heartbeat_enabled: true,
          id: 'runner-1',
          status: 'registered',
        },
      ],
      error: null,
    });

    await expect(
      verifyDevboxRunnerToken('tdbx_registered', { requireOnline: true })
    ).resolves.toBeNull();
  });

  it('falls back to disabled heartbeat when the column is not visible yet', async () => {
    runnerLimitMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            "Could not find the 'heartbeat_enabled' column of 'devbox_runners' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            actor_id: 'user-1',
            id: 'runner-1',
            status: 'online',
          },
        ],
        error: null,
      });

    await expect(verifyDevboxRunnerToken('tdbx_active')).resolves.toEqual({
      heartbeatEnabled: false,
      id: 'runner-1',
    });

    expect(runnerSelectMock).toHaveBeenNthCalledWith(
      1,
      'id, actor_id, status, heartbeat_enabled'
    );
    expect(runnerSelectMock).toHaveBeenNthCalledWith(2, 'id, actor_id, status');
  });
});
