import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorized: vi.fn(), stream: vi.fn() }));
vi.mock('@/lib/mail/repository', () => ({
  getAuthorizedAttachment: mocks.authorized,
}));
vi.mock('@/lib/mail/storage', () => ({ streamMailStoredObject: mocks.stream }));
vi.mock('@/lib/mail/route-utils', () => ({
  withMailContext: (
    _request: unknown,
    _workspace: unknown,
    callback: (ctx: unknown) => unknown
  ) => callback({}),
}));

import { GET } from './route';

const params = Promise.resolve({
  wsId: 'workspace',
  mailboxId: 'mailbox',
  messageId: 'message',
  attachmentId: 'attachment',
});
function request(preview = false, range?: string) {
  return new NextRequest(
    `https://mail.example.com/attachment${preview ? '?preview=1' : ''}`,
    { headers: range ? { range } : {} }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue({
    attachment: {
      filename: 'clip.mp4',
      content_type: 'video/mp4',
      disposition: 'attachment',
    },
    location: {},
  });
  mocks.stream.mockResolvedValue({
    body: new Uint8Array([1, 2]),
    contentType: 'video/mp4',
    contentLength: 2,
  });
});
describe('attachment preview route', () => {
  it('does not stream inaccessible attachments', async () => {
    mocks.authorized.mockResolvedValue(null);
    expect((await GET(request(true), { params })).status).toBe(404);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('keeps downloads as the default and opts passive media into inline preview', async () => {
    expect(
      (await GET(request(), { params })).headers.get('content-disposition')
    ).toMatch(/^attachment;/);
    const response = await GET(request(true), { params });
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox'
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('keeps active content downloadable even if marked inline', async () => {
    mocks.authorized.mockResolvedValue({
      attachment: {
        filename: 'page.html',
        disposition: 'inline',
        content_type: 'text/html',
      },
      location: {},
    });
    mocks.stream.mockResolvedValue({
      body: '<script>alert(1)</script>',
      contentType: 'text/html',
    });
    expect(
      (await GET(request(true), { params })).headers.get('content-disposition')
    ).toMatch(/^attachment;/);
  });
  it('retains video seeking ranges and partial response headers', async () => {
    mocks.stream.mockResolvedValue({
      body: new Uint8Array([1, 2]),
      contentType: 'video/mp4',
      contentLength: 2,
      contentRange: 'bytes 0-1/10',
    });
    const response = await GET(request(true, 'bytes=0-1'), { params });
    expect(mocks.stream).toHaveBeenCalledWith({
      location: {},
      range: 'bytes=0-1',
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-1/10');
  });
});
