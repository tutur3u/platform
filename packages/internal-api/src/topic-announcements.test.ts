import { describe, expect, it, vi } from 'vitest';
import { uploadTopicAnnouncementAttachment } from './topic-announcements';

function createJsonResponse(payload: unknown) {
  return {
    headers: new Headers(),
    json: async () => payload,
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  };
}

describe('topic announcement upload helpers', () => {
  it('uploads attachments through central workspace signed-upload URLs', async () => {
    const file = new File(['%PDF'], 'lesson-plan.pdf', {
      type: 'application/pdf',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          contentType: 'application/pdf',
          filename: 'lesson-plan.pdf',
          fullPath:
            'ws-1/topic-announcements/attachments/upload-id-lesson-plan.pdf',
          headers: {
            'x-upload-target': 'topic-announcements',
          },
          path: 'topic-announcements/attachments/upload-id-lesson-plan.pdf',
          provider: 'r2',
          signedUrl: 'https://storage.example.com/signed-upload',
          token: 'upload-token',
        })
      )
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    const result = await uploadTopicAnnouncementAttachment('ws-1', file, {
      baseUrl: 'https://web.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const firstCallOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.example.com/api/v1/workspaces/ws-1/storage/upload-url',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(JSON.parse(String(firstCallOptions.body))).toEqual({
      contentType: 'application/pdf',
      filename: 'lesson-plan.pdf',
      path: 'topic-announcements/attachments',
      size: file.size,
      upsert: false,
    });
    expect(new Headers(firstCallOptions.headers).get('content-type')).toBe(
      'application/json'
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://storage.example.com/signed-upload',
      expect.objectContaining({
        body: file,
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer upload-token',
          'Content-Type': 'application/pdf',
          'x-upload-target': 'topic-announcements',
        },
        method: 'PUT',
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://storage.example.com/signed-upload',
      expect.objectContaining({
        body: file,
        cache: 'no-store',
        method: 'PUT',
      })
    );
    const retryOptions = fetchMock.mock.calls[2]?.[1] as {
      headers?: Record<string, string>;
    };
    expect(retryOptions.headers).toEqual({
      Authorization: 'Bearer upload-token',
      'x-upload-target': 'topic-announcements',
    });

    expect(result).toEqual({
      data: {
        contentType: 'application/pdf',
        fileName: 'lesson-plan.pdf',
        sizeBytes: file.size,
        storagePath:
          'topic-announcements/attachments/upload-id-lesson-plan.pdf',
        storageProvider: 'r2',
      },
    });
  });
});
