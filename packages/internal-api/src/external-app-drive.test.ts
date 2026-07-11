import { describe, expect, it, vi } from 'vitest';
import {
  createExternalAppDriveReadUrl,
  createExternalAppDriveUploadUrl,
  deleteExternalAppDriveObject,
  finalizeExternalAppDriveUpload,
} from './external-app-drive';

describe('external app Drive client', () => {
  it('calls the scoped Drive endpoints with no-store JSON requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ deleted: true, provider: 'r2' }),
      ok: true,
      status: 200,
    });
    const options = {
      baseUrl: 'https://tuturuuu.com',
      defaultHeaders: { Authorization: 'Bearer app-token' },
      fetch: fetchMock as typeof fetch,
    };
    const workspaceId = 'workspace id';

    await createExternalAppDriveUploadUrl(
      workspaceId,
      {
        attachmentId: 'attachment',
        contentType: 'application/pdf',
        conversationId: 'conversation',
        filename: 'brief.pdf',
        size: 10,
      },
      options
    );
    await finalizeExternalAppDriveUpload(
      workspaceId,
      { contentType: 'application/pdf', path: 'path', size: 10 },
      options
    );
    await createExternalAppDriveReadUrl(workspaceId, { path: 'path' }, options);
    await deleteExternalAppDriveObject(workspaceId, { path: 'path' }, options);

    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init.method])
    ).toEqual([
      [
        'https://tuturuuu.com/api/v1/workspaces/workspace%20id/external-apps/drive/upload-url',
        'POST',
      ],
      [
        'https://tuturuuu.com/api/v1/workspaces/workspace%20id/external-apps/drive/finalize',
        'POST',
      ],
      [
        'https://tuturuuu.com/api/v1/workspaces/workspace%20id/external-apps/drive/read-url',
        'POST',
      ],
      [
        'https://tuturuuu.com/api/v1/workspaces/workspace%20id/external-apps/drive',
        'DELETE',
      ],
    ]);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')
    ).toBe('Bearer app-token');
  });
});
