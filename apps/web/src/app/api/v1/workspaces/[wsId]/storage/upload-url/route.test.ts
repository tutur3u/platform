import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canAccessFinanceTransactionStoragePath: vi.fn(),
  createWorkspaceStorageUploadPayload: vi.fn(),
  generateRandomUUID: vi.fn(() => 'upload-id'),
  logWorkspaceStorageRouteError: vi.fn(),
  resolveTopicAnnouncementsAccess: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
  validateFinanceTransactionAttachmentUploadRequest: vi.fn(),
}));

vi.mock('@tuturuuu/utils/uuid-helper', () => ({
  generateRandomUUID: mocks.generateRandomUUID,
}));

vi.mock('@/lib/finance-transaction-storage-access', () => ({
  canAccessFinanceTransactionStoragePath:
    mocks.canAccessFinanceTransactionStoragePath,
}));

vi.mock('@/lib/finance-transaction-storage-limits', () => ({
  validateFinanceTransactionAttachmentUploadRequest:
    mocks.validateFinanceTransactionAttachmentUploadRequest,
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  createWorkspaceStorageUploadPayload:
    mocks.createWorkspaceStorageUploadPayload,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

vi.mock('../../topic-announcements/shared', () => ({
  resolveTopicAnnouncementsAccess: mocks.resolveTopicAnnouncementsAccess,
  TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES: [
    'application/pdf',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
  TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PATH: 'topic-announcements/attachments',
  TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES: 10 * 1024 * 1024,
}));

vi.mock('../route-auth', () => ({
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS: ['drive', 'finance'],
  logWorkspaceStorageRouteError: mocks.logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

function permissions({
  manageDrive = false,
  manageExternalProjects = false,
}: {
  manageDrive?: boolean;
  manageExternalProjects?: boolean;
} = {}) {
  return {
    containsPermission: (permission: string) =>
      permission === 'manage_external_projects' && manageExternalProjects,
    withoutPermission: (permission: string) =>
      permission === 'manage_drive' ? !manageDrive : true,
  };
}

function setupAuth(permissionOptions: Parameters<typeof permissions>[0] = {}) {
  mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
    ok: true,
    context: {
      normalizedWsId: 'workspace-1',
      permissions: permissions(permissionOptions),
      user: { id: 'user-1' },
      userId: 'user-1',
    },
  });
  mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
  mocks.validateFinanceTransactionAttachmentUploadRequest.mockResolvedValue({
    ok: true,
  });
  mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
    context: {
      normalizedWsId: 'workspace-1',
    },
  });
  mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
    contentType: 'application/pdf',
    filename: 'lesson-plan.pdf',
    fullPath:
      'workspace-1/topic-announcements/attachments/upload-id-lesson-plan.pdf',
    headers: {
      'x-upload-target': 'topic-announcements',
    },
    path: 'topic-announcements/attachments/upload-id-lesson-plan.pdf',
    provider: 'r2',
    signedUrl: 'https://storage.example.com/upload',
    token: 'upload-token',
  });
}

async function postUploadUrl(payload: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      'http://localhost/api/v1/workspaces/workspace-1/storage/upload-url',
      {
        body: JSON.stringify(payload),
        method: 'POST',
      }
    ),
    {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    }
  );
}

describe('workspace storage upload-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.canAccessFinanceTransactionStoragePath.mockReset();
    mocks.createWorkspaceStorageUploadPayload.mockReset();
    mocks.generateRandomUUID.mockClear();
    mocks.logWorkspaceStorageRouteError.mockReset();
    mocks.resolveTopicAnnouncementsAccess.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockReset();
    mocks.validateFinanceTransactionAttachmentUploadRequest.mockReset();
    setupAuth();
  });

  it('creates signed upload URLs for Topic Announcement attachments through the central route', async () => {
    const response = await postUploadUrl({
      contentType: 'application/pdf',
      filename: 'lesson-plan.pdf',
      path: 'topic-announcements/attachments',
      size: 1234,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentType: 'application/pdf',
      filename: 'lesson-plan.pdf',
      fullPath:
        'workspace-1/topic-announcements/attachments/upload-id-lesson-plan.pdf',
      headers: {
        'x-upload-target': 'topic-announcements',
      },
      path: 'topic-announcements/attachments/upload-id-lesson-plan.pdf',
      provider: 'r2',
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
    expect(mocks.resolveTopicAnnouncementsAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'workspace-1',
      { requireManage: true }
    );
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-lesson-plan.pdf',
      {
        contentType: 'application/pdf',
        path: 'topic-announcements/attachments',
        size: 1234,
        upsert: false,
      }
    );
  });

  it('rejects Topic Announcement uploads when the feature gate is unavailable', async () => {
    mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
      response: Response.json({ message: 'Not found' }, { status: 404 }),
    });

    const response = await postUploadUrl({
      contentType: 'application/pdf',
      filename: 'lesson-plan.pdf',
      path: 'topic-announcements/attachments',
      size: 1234,
    });

    expect(response.status).toBe(404);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects Topic Announcement uploads for personal workspaces', async () => {
    mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
      response: Response.json({ message: 'Not found' }, { status: 404 }),
    });

    const response = await postUploadUrl({
      filename: 'lesson-plan.pdf',
      path: 'topic-announcements/attachments',
      size: 1234,
    });

    expect(response.status).toBe(404);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects Topic Announcement uploads without manage_users access', async () => {
    mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
      response: Response.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    });

    const response = await postUploadUrl({
      contentType: 'application/pdf',
      filename: 'lesson-plan.pdf',
      path: 'topic-announcements/attachments',
      size: 1234,
    });

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects invalid Topic Announcement attachment metadata before signing', async () => {
    const cases = [
      {
        expectedStatus: 400,
        payload: {
          filename: 'lesson-plan.pdf',
          path: 'topic-announcements/other',
          size: 1234,
        },
      },
      {
        expectedStatus: 400,
        payload: {
          filename: 'lesson-plan.pdf',
          path: 'topic-announcements/attachments',
          size: 0,
        },
      },
      {
        expectedStatus: 413,
        payload: {
          filename: 'lesson-plan.pdf',
          path: 'topic-announcements/attachments',
          size: 10 * 1024 * 1024 + 1,
        },
      },
      {
        expectedStatus: 415,
        payload: {
          contentType: 'text/plain',
          filename: 'notes.txt',
          path: 'topic-announcements/attachments',
          size: 1234,
        },
      },
    ];

    for (const { expectedStatus, payload } of cases) {
      const response = await postUploadUrl(payload);
      expect(response.status).toBe(expectedStatus);
    }
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects Topic Announcement attachment overwrite signing', async () => {
    const response = await postUploadUrl({
      contentType: 'application/pdf',
      filename: 'lesson-plan.pdf',
      path: 'topic-announcements/attachments',
      size: 1234,
      upsert: true,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Upload overwrite is not allowed for this path',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('creates generic Drive signed upload URLs only after validating upload metadata', async () => {
    setupAuth({ manageDrive: true });
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      contentType: 'text/plain',
      filename: 'upload-id-notes.txt',
      fullPath: 'workspace-1/documents/upload-id-notes.txt',
      headers: {
        'Content-Type': 'text/plain',
      },
      path: 'documents/upload-id-notes.txt',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });

    const response = await postUploadUrl({
      contentType: 'text/plain',
      filename: 'notes.txt',
      path: 'documents',
      size: 128,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentType: 'text/plain',
      filename: 'upload-id-notes.txt',
      fullPath: 'workspace-1/documents/upload-id-notes.txt',
      headers: {
        'Content-Type': 'text/plain',
      },
      path: 'documents/upload-id-notes.txt',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-notes.txt',
      {
        contentType: 'text/plain',
        path: 'documents',
        size: 128,
        upsert: false,
      }
    );
  });

  it('rejects generic Drive signed upload URLs for empty, oversized, or disallowed files', async () => {
    setupAuth({ manageDrive: true });

    const cases = [
      {
        expectedStatus: 400,
        payload: {
          contentType: 'application/pdf',
          filename: 'empty.pdf',
          path: 'documents',
          size: 0,
        },
      },
      {
        expectedStatus: 413,
        payload: {
          contentType: 'application/pdf',
          filename: 'large.pdf',
          path: 'documents',
          size: 100 * 1024 * 1024 + 1,
        },
      },
      {
        expectedStatus: 415,
        payload: {
          contentType: 'application/octet-stream',
          filename: 'script.sh',
          path: 'documents',
          size: 128,
        },
      },
    ];

    for (const { expectedStatus, payload } of cases) {
      const response = await postUploadUrl(payload);
      expect(response.status).toBe(expectedStatus);
    }
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects overwrite signing outside external-project asset paths', async () => {
    setupAuth({ manageDrive: true });

    const response = await postUploadUrl({
      contentType: 'image/png',
      filename: 'logo.png',
      path: 'logos',
      size: 128,
      upsert: true,
    });

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects external-project paths through the generic Drive upload URL route', async () => {
    setupAuth({ manageDrive: true });

    const response = await postUploadUrl({
      contentType: 'audio/wav',
      filename: 'voice.wav',
      path: 'external-projects/yoola/voice-reels/demo',
      size: 128,
      upsert: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        'External project uploads must use the external project asset upload route',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('does not let external-project managers mint generic signed upload URLs', async () => {
    setupAuth({ manageExternalProjects: true });

    const response = await postUploadUrl({
      contentType: 'audio/wav',
      filename: 'voice.wav',
      path: 'external-projects/yoola/voice-reels/demo',
      size: 128,
      upsert: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        'External project uploads must use the external project asset upload route',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects finance attachment upload signing when server-side attachment limits fail', async () => {
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(true);
    mocks.validateFinanceTransactionAttachmentUploadRequest.mockResolvedValue({
      message: 'Finance attachment exceeds 50 MB limit',
      ok: false,
      status: 413,
    });

    const response = await postUploadUrl({
      contentType: 'application/pdf',
      filename: 'receipt.pdf',
      path: 'finance/transactions/tx-1',
      size: 50 * 1024 * 1024 + 1,
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: 'Finance attachment exceeds 50 MB limit',
    });
    expect(
      mocks.validateFinanceTransactionAttachmentUploadRequest
    ).toHaveBeenCalledWith({
      path: 'finance/transactions/tx-1',
      size: 50 * 1024 * 1024 + 1,
      wsId: 'workspace-1',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });
});
