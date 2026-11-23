import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createSignedReadUrl: vi.fn(),
  createUploadPayload: vi.fn(),
  deleteObject: vi.fn(),
  getBearerToken: vi.fn(),
  getExternalAppById: vi.fn(),
  getMetadata: vi.fn(),
  resolveProvider: vi.fn(),
  verifyMembership: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: mocks.getBearerToken,
  verifyAppCoordinationToken: mocks.verifyToken,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyMembership,
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', async () => {
  class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  }
  return {
    WorkspaceStorageError,
    createWorkspaceStorageSignedReadUrl: mocks.createSignedReadUrl,
    createWorkspaceStorageUploadPayload: mocks.createUploadPayload,
    deleteWorkspaceStorageObjectByPath: mocks.deleteObject,
    getWorkspaceStorageObjectMetadataForProvider: mocks.getMetadata,
    resolveWorkspaceStorageProvider: mocks.resolveProvider,
  };
});

import {
  createExternalAppChatReadUrl,
  createExternalAppChatUpload,
  finalizeExternalAppChatUpload,
  isExternalAppChatDrivePath,
  requireExternalAppWorkspaceDriveAccess,
} from './workspace-drive';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const attachmentId = '44444444-4444-4444-8444-444444444444';
const path = `external-apps/cybershield35/chat/${conversationId}/${attachmentId}/brief.pdf`;

describe('external app workspace Drive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBearerToken.mockReturnValue('app-token');
    mocks.verifyToken.mockReturnValue({
      claims: {
        email: 'member@example.com',
        scopes: ['workspace:drive:read', 'workspace:drive:write'],
        sub: '11111111-1111-4111-8111-111111111111',
        target_app: 'cybershield35',
      },
      ok: true,
    });
    mocks.createAdminClient.mockResolvedValue({});
    mocks.getExternalAppById.mockResolvedValue({
      allowedWorkspaceIds: [workspaceId],
      enabled: true,
      id: 'cybershield35',
    });
    mocks.verifyMembership.mockResolvedValue({ ok: true });
    mocks.resolveProvider.mockResolvedValue({ provider: 'r2' });
  });

  it('authorizes any linked workspace MEMBER without broad Drive permission', async () => {
    const result = await requireExternalAppWorkspaceDriveAccess({
      request: new Request('https://tuturuuu.com', {
        headers: { Authorization: 'Bearer app-token' },
      }),
      requiredScopes: ['workspace:drive:write'],
      wsId: workspaceId,
    });

    expect(result.ok).toBe(true);
    expect(mocks.verifyMembership).toHaveBeenCalledWith(
      expect.objectContaining({ requiredType: 'MEMBER', wsId: workspaceId })
    );
  });

  it('rejects missing scopes and unlinked workspaces', async () => {
    mocks.verifyToken.mockReturnValue({
      claims: { scopes: [], sub: 'user', target_app: 'cybershield35' },
      ok: true,
    });
    const missingScope = await requireExternalAppWorkspaceDriveAccess({
      request: new Request('https://tuturuuu.com'),
      requiredScopes: ['workspace:drive:write'],
      wsId: workspaceId,
    });
    expect(missingScope.ok).toBe(false);
    if (!missingScope.ok) expect(missingScope.response.status).toBe(403);
  });

  it('refuses a workspace-bound bearer on any other workspace', async () => {
    const otherWorkspaceId = '55555555-5555-4555-8555-555555555555';
    mocks.getExternalAppById.mockResolvedValue({
      allowedWorkspaceIds: [workspaceId, otherWorkspaceId],
      enabled: true,
      id: 'cybershield35',
    });
    const access = (wsId: string) =>
      requireExternalAppWorkspaceDriveAccess({
        request: new Request('https://tuturuuu.com', {
          headers: { Authorization: 'Bearer app-token' },
        }),
        requiredScopes: ['workspace:drive:read'],
        wsId,
      });
    const boundClaims = {
      scopes: ['workspace:drive:read'],
      sub: '11111111-1111-4111-8111-111111111111',
      target_app: 'cybershield35',
      workspace_id: workspaceId,
    };

    mocks.verifyToken.mockReturnValueOnce({ claims: boundClaims, ok: true });
    const other = await access(otherWorkspaceId);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.response.status).toBe(403);
    expect(mocks.verifyMembership).not.toHaveBeenCalled();

    mocks.verifyToken.mockReturnValueOnce({ claims: boundClaims, ok: true });
    const bound = await access(workspaceId);
    expect(bound.ok).toBe(true);

    mocks.verifyToken.mockReturnValueOnce({ claims: boundClaims, ok: true });
    const upperCaseRoute = await access(workspaceId.toUpperCase());
    expect(upperCaseRoute.ok).toBe(true);
  });

  it('matches a root-bound bearer on the internal workspace alias', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      allowedWorkspaceIds: [ROOT_WORKSPACE_ID],
      enabled: true,
      id: 'cybershield35',
    });
    mocks.verifyToken.mockReturnValueOnce({
      claims: {
        scopes: ['workspace:drive:read'],
        sub: '11111111-1111-4111-8111-111111111111',
        target_app: 'cybershield35',
        workspace_id: ROOT_WORKSPACE_ID,
      },
      ok: true,
    });
    const result = await requireExternalAppWorkspaceDriveAccess({
      request: new Request('https://tuturuuu.com', {
        headers: { Authorization: 'Bearer app-token' },
      }),
      requiredScopes: ['workspace:drive:read'],
      wsId: 'internal',
    });
    expect(result.ok).toBe(true);
  });

  it('denies bearers from a disabled app or minted before a secret rotation', async () => {
    const request = new Request('https://tuturuuu.com', {
      headers: { Authorization: 'Bearer app-token' },
    });
    const access = () =>
      requireExternalAppWorkspaceDriveAccess({
        request,
        requiredScopes: ['workspace:drive:read'],
        wsId: workspaceId,
      });

    mocks.getExternalAppById.mockResolvedValueOnce({ enabled: false });
    const disabled = await access();
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) expect(disabled.response.status).toBe(403);

    mocks.getExternalAppById.mockResolvedValueOnce({
      allowedWorkspaceIds: [workspaceId],
      enabled: true,
      id: 'cybershield35',
      secretIssuedAt: '2026-11-01T00:00:00.000Z',
    });
    mocks.verifyToken.mockReturnValueOnce({
      claims: {
        iat: Date.parse('2026-10-31T23:59:00.000Z') / 1000,
        scopes: ['workspace:drive:read'],
        sub: '11111111-1111-4111-8111-111111111111',
        target_app: 'cybershield35',
      },
      ok: true,
    });
    const rotated = await access();
    expect(rotated.ok).toBe(false);
    if (!rotated.ok) expect(rotated.response.status).toBe(401);
    expect(mocks.verifyMembership).not.toHaveBeenCalled();
  });

  it('isolates objects to the authenticated app chat namespace', () => {
    expect(isExternalAppChatDrivePath('cybershield35', path)).toBe(true);
    expect(isExternalAppChatDrivePath('another-app', path)).toBe(false);
    expect(
      isExternalAppChatDrivePath(
        'cybershield35',
        `external-apps/cybershield35/chat/${conversationId}/../secret.pdf`
      )
    ).toBe(false);
  });

  it('creates a bounded signed upload in the app-owned folder', async () => {
    mocks.createUploadPayload.mockResolvedValue({
      filename: 'brief.pdf',
      fullPath: `${workspaceId}/${path}`,
      path,
      provider: 'r2',
      signedUrl: 'https://signed.example/upload?secret=hidden',
    });
    const result = await createExternalAppChatUpload(
      {
        admin: {} as never,
        normalizedWorkspaceId: workspaceId,
        targetApp: 'cybershield35',
        user: { email: 'member@example.com', id: 'user' },
      },
      {
        attachmentId,
        contentType: 'application/pdf',
        conversationId,
        filename: 'brief.pdf',
        size: 1024,
      }
    );
    expect(result.expiresIn).toBe(900);
    expect(mocks.createUploadPayload).toHaveBeenCalledWith(
      workspaceId,
      'brief.pdf',
      expect.objectContaining({
        path: `external-apps/cybershield35/chat/${conversationId}/${attachmentId}`,
        size: 1024,
      })
    );
  });

  it('deletes an uploaded object when finalized metadata does not match', async () => {
    mocks.getMetadata.mockResolvedValue({
      contentType: 'application/pdf',
      fullPath: `${workspaceId}/${path}`,
      path,
      size: 2048,
    });
    await expect(
      finalizeExternalAppChatUpload(
        {
          admin: {} as never,
          normalizedWorkspaceId: workspaceId,
          targetApp: 'cybershield35',
          user: { email: null, id: 'user' },
        },
        { contentType: 'application/pdf', path, provider: 'r2', size: 1024 }
      )
    ).rejects.toThrow('metadata does not match');
    expect(mocks.deleteObject).toHaveBeenCalledWith(workspaceId, path);
  });

  it('returns short-lived reads without persisting the signed URL', async () => {
    mocks.createSignedReadUrl.mockResolvedValue('https://signed.example/read');
    const result = await createExternalAppChatReadUrl(
      {
        admin: {} as never,
        normalizedWorkspaceId: workspaceId,
        targetApp: 'cybershield35',
        user: { email: null, id: 'user' },
      },
      { path, provider: 'r2' }
    );
    expect(result).toEqual({
      expiresIn: 900,
      provider: 'r2',
      signedUrl: 'https://signed.example/read',
    });
  });
});
