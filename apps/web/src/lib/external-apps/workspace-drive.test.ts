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
