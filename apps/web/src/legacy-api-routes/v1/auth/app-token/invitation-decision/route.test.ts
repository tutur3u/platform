import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INVITATION_ACTION_SCOPE,
  invitationWorkspaceScope,
} from '@/lib/app-coordination/invitation-action-token';

const mocks = vi.hoisted(() => ({
  assignSeatToMember: vi.fn(),
  createAdminClient: vi.fn(),
  createPolarClient: vi.fn(),
  enforceSeatLimit: vi.fn(),
  getAppCoordinationSessionPolicy: vi.fn(),
  getWorkspaceInviteCandidateEmails: vi.fn(),
  getWorkspaceInviteStatus: vi.fn(),
  revokeSeatFromMember: vi.fn(),
  serverLoggerError: vi.fn(),
  serverLoggerWarn: vi.fn(),
  verifyExternalAppSecret: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => mocks.createPolarClient(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/app-coordination/external-apps', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/app-coordination/external-apps')
    >();

  return {
    ...actual,
    verifyExternalAppSecret: (
      ...args: Parameters<typeof mocks.verifyExternalAppSecret>
    ) => mocks.verifyExternalAppSecret(...args),
  };
});

vi.mock('@/lib/app-coordination/session-policy', () => ({
  getAppCoordinationSessionPolicy: (
    ...args: Parameters<typeof mocks.getAppCoordinationSessionPolicy>
  ) => mocks.getAppCoordinationSessionPolicy(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
    warn: (...args: Parameters<typeof mocks.serverLoggerWarn>) =>
      mocks.serverLoggerWarn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock('@/lib/workspace-invitations/status', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/workspace-invitations/status')>();

  return {
    ...actual,
    getWorkspaceInviteCandidateEmails: (
      ...args: Parameters<typeof mocks.getWorkspaceInviteCandidateEmails>
    ) => mocks.getWorkspaceInviteCandidateEmails(...args),
    getWorkspaceInviteStatus: (
      ...args: Parameters<typeof mocks.getWorkspaceInviteStatus>
    ) => mocks.getWorkspaceInviteStatus(...args),
  };
});

vi.mock('@/utils/polar-seat-helper', () => ({
  assignSeatToMember: (...args: Parameters<typeof mocks.assignSeatToMember>) =>
    mocks.assignSeatToMember(...args),
  revokeSeatFromMember: (
    ...args: Parameters<typeof mocks.revokeSeatFromMember>
  ) => mocks.revokeSeatFromMember(...args),
}));

vi.mock('@/utils/seat-limits', () => ({
  enforceSeatLimit: (...args: Parameters<typeof mocks.enforceSeatLimit>) =>
    mocks.enforceSeatLimit(...args),
}));

import { POST } from './route';

const appId = 'cybershield35';
const appSecret = 'ttr_app_secret_test';
const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

function createAdminMock() {
  const tableCalls: string[] = [];
  const inserts: Array<{ table: string; value: unknown }> = [];
  const privateTableCalls: string[] = [];
  const replayInserts: Array<{ table: string; value: unknown }> = [];
  let replayInsertError: { code?: string; message?: string } | null = null;
  let replayDeleteError: { code?: string; message?: string } | null = null;

  function createBuilder(table: string) {
    const builder = {
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      insert: vi.fn((value: unknown) => {
        inserts.push({ table, value });
        return Promise.resolve({ error: null });
      }),
      maybeSingle: vi.fn(() => {
        if (table === 'users') {
          return Promise.resolve({
            data: {
              avatar_url: 'https://example.com/avatar.png',
              display_name: 'Victim User',
              id: userId,
              user_private_details: {
                email: 'victim@example.com',
                full_name: 'Victim Full Name',
              },
            },
            error: null,
          });
        }

        return Promise.resolve({ data: null, error: null });
      }),
      select: vi.fn(() => builder),
    };

    Object.defineProperty(builder, 'then', {
      value: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) =>
        Promise.resolve({ data: null, error: null }).then(
          onFulfilled,
          onRejected
        ),
    });

    return builder;
  }

  function createPrivateBuilder(table: string) {
    const builder = {
      delete: vi.fn(() => builder),
      insert: vi.fn((value: unknown) => {
        replayInserts.push({ table, value });
        return Promise.resolve({ error: replayInsertError });
      }),
      lt: vi.fn(() => Promise.resolve({ error: replayDeleteError })),
    };

    return builder;
  }

  return {
    admin: {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                email: 'victim@example.com',
                user_metadata: {
                  avatar_url: 'https://example.com/auth-avatar.png',
                  display_name: 'Auth Victim',
                  full_name: 'Auth Victim Full Name',
                },
              },
            },
            error: null,
          }),
        },
      },
      from: vi.fn((table: string) => {
        tableCalls.push(table);
        return createBuilder(table);
      }),
      schema: vi.fn((schema: string) => ({
        from: vi.fn((table: string) => {
          privateTableCalls.push(`${schema}.${table}`);
          return createPrivateBuilder(table);
        }),
      })),
    },
    inserts,
    privateTableCalls,
    replayInserts,
    setReplayDeleteError: (
      error: { code?: string; message?: string } | null
    ) => {
      replayDeleteError = error;
    },
    setReplayInsertError: (
      error: { code?: string; message?: string } | null
    ) => {
      replayInsertError = error;
    },
    tableCalls,
  };
}

function createDecisionRequest(
  overrides: Partial<{
    action: 'accept' | 'reject';
    appId: string;
    appSecret: string;
    invitationActionToken: string;
    requestedScopes: string[];
    workspaceId: string;
  }> = {}
) {
  return new NextRequest(
    'http://localhost/api/v1/auth/app-token/invitation-decision',
    {
      body: JSON.stringify({
        action: 'accept',
        appId,
        appSecret,
        invitationActionToken: createInvitationToken(),
        requestedScopes: ['workspace:session', 'users:profile:read'],
        workspaceId,
        ...overrides,
      }),
      method: 'POST',
    }
  );
}

function createInvitationToken(
  overrides: Partial<Parameters<typeof createAppCoordinationToken>[0]> = {}
) {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 900,
      originApp: 'web',
      scopes: [INVITATION_ACTION_SCOPE, invitationWorkspaceScope(workspaceId)],
      targetApp: appId,
      userId,
      ...overrides,
    },
    { secret: 'test-secret' }
  ).token;
}

describe('app token invitation decision route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTURUUU_APP_COORDINATION_SECRET = 'test-secret';

    mocks.verifyExternalAppSecret.mockResolvedValue({
      app: {
        allowedScopes: ['users:profile:read'],
        allowedWorkspaceIds: [workspaceId],
        createdAt: null,
        createdBy: null,
        displayName: appId,
        enabled: true,
        id: appId,
        origins: [`https://${appId}.example.com`],
        secretIssuedAt: null,
        secretLastFour: 'test',
        updatedAt: null,
        updatedBy: null,
      },
      ok: true,
    });
    mocks.getWorkspaceInviteStatus.mockResolvedValue({
      invitation: {
        createdAt: '2026-07-04T00:00:00.000Z',
        email: null,
        source: 'direct',
        type: 'MEMBER',
        workspace: {
          avatarUrl: null,
          handle: 'cs35',
          id: workspaceId,
          logoUrl: null,
          name: 'CyberShield 35',
          personal: false,
        },
      },
      status: 'pending_invite',
    });
    mocks.getWorkspaceInviteCandidateEmails.mockResolvedValue([
      'victim@example.com',
    ]);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: null,
      ok: false,
    });
    mocks.enforceSeatLimit.mockResolvedValue({ allowed: true });
    mocks.assignSeatToMember.mockResolvedValue({
      required: false,
      success: true,
    });
    mocks.revokeSeatFromMember.mockResolvedValue(undefined);
    mocks.createPolarClient.mockReturnValue({});
    mocks.getAppCoordinationSessionPolicy.mockResolvedValue({
      policy: {
        externalAppBearerTtlSeconds: 900,
        internalAppRefreshEarlySeconds: 60,
        internalAppRefreshTtlSeconds: 86_400,
      },
    });
  });

  it('accepts a pending invitation, consumes the action token, and returns an app session', async () => {
    const { admin, inserts, privateTableCalls, replayInserts, tableCalls } =
      createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await POST(createDecisionRequest());
    const body = (await response.json()) as {
      accessToken?: string;
      invitationActionToken?: string;
      refreshToken?: string;
      scopes?: string[];
      workspaceId?: string;
    };

    expect(response.status).toBe(200);
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.scopes).toEqual(
      expect.arrayContaining(['workspace:session', 'users:profile:read'])
    );
    expect(body.invitationActionToken).toBeUndefined();
    expect(privateTableCalls).toContain(
      'private.app_token_invitation_action_replays'
    );
    expect(replayInserts).toContainEqual({
      table: 'app_token_invitation_action_replays',
      value: expect.objectContaining({
        action: 'accept',
        target_app: appId,
        token_jti: expect.any(String),
        user_id: userId,
        workspace_id: workspaceId,
      }),
    });
    expect(inserts).toContainEqual({
      table: 'workspace_members',
      value: {
        type: 'MEMBER',
        user_id: userId,
        ws_id: workspaceId,
      },
    });
    expect(tableCalls).toEqual(
      expect.arrayContaining([
        'workspace_email_invites',
        'workspace_invites',
        'workspace_members',
      ])
    );
    expect(JSON.stringify(body)).not.toContain(appSecret);
  });

  it('rejects a pending invitation without issuing a session', async () => {
    const { admin, inserts, tableCalls } = createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await POST(
      createDecisionRequest({
        action: 'reject',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'rejected' });
    expect(inserts).toEqual([]);
    expect(tableCalls).toEqual(
      expect.arrayContaining(['workspace_email_invites', 'workspace_invites'])
    );
    expect(JSON.stringify(body)).not.toContain(appSecret);
  });

  it('fails closed when the one-time action token was already consumed', async () => {
    const { admin, setReplayInsertError } = createAdminMock();
    setReplayInsertError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await POST(createDecisionRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      code: 'INVITATION_ACTION_TOKEN_ALREADY_USED',
      error: 'Invitation action token is already used',
    });
    expect(mocks.getWorkspaceInviteStatus).not.toHaveBeenCalled();
  });

  it('fails closed when the replay store is unavailable', async () => {
    const { admin, setReplayInsertError } = createAdminMock();
    setReplayInsertError({
      code: '42P01',
      message:
        'relation "private.app_token_invitation_action_replays" does not exist',
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await POST(createDecisionRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: 'INVITATION_ACTION_REPLAY_STORE_UNAVAILABLE',
      error: 'Invitation replay protection is unavailable',
    });
    expect(mocks.getWorkspaceInviteStatus).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(appSecret);
    expect(JSON.stringify(body)).not.toContain('select ');
  });

  it('rejects decisions for the wrong target app before mutating invitations', async () => {
    const { admin, inserts } = createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await POST(
      createDecisionRequest({
        invitationActionToken: createInvitationToken({
          targetApp: 'other-app',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      code: 'INVITATION_ACTION_TOKEN_INVALID_OR_EXPIRED',
      error: 'Invalid or expired invitation action token',
    });
    expect(inserts).toEqual([]);
  });

  it('returns a sanitized not-found response when no pending invitation exists', async () => {
    const { admin } = createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getWorkspaceInviteStatus.mockResolvedValue({
      status: 'not_member',
    });

    const response = await POST(createDecisionRequest());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      code: 'PENDING_INVITATION_NOT_FOUND',
      error: 'Pending invitation not found',
    });
    expect(JSON.stringify(body)).not.toContain('select ');
    expect(JSON.stringify(body)).not.toContain(appSecret);
  });
});
