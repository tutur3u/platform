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

import { GET } from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId]/route';
import { applyMailResponsePolicy } from './response-policy';

const params = {
  wsId: 'tenant',
  mailboxId: 'box',
  messageId: 'message',
  attachmentId: 'attachment',
};
const url =
  'https://mail.tuturuuu.com/api/v1/workspaces/tenant/mail/mailboxes/box/messages/message/attachments/attachment';
const canonicalCsp = "sandbox; default-src 'none'; frame-ancestors 'self'";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue({
    attachment: {
      filename: 'clip.mp4',
      content_type: 'video/mp4',
      disposition: 'attachment',
    },
    location: {
      provider: 'r2',
      bucketName: 'existing',
      objectKey: 'original-key',
    },
  });
});
describe('actual canonical attachment response through final native policy', () => {
  for (const preview of [false, true])
    it(`retains complete sandbox policy and ${preview ? 'inline' : 'download'} response`, async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
      mocks.stream.mockResolvedValue({
        body: stream,
        contentType: 'video/mp4',
        contentLength: 3,
        etag: 'original-version',
      });
      const request = new NextRequest(`${url}${preview ? '?preview=1' : ''}`);
      const supplier = await GET(request, { params: Promise.resolve(params) });
      expect(supplier.headers.get('content-security-policy')).toBe(
        canonicalCsp
      );
      supplier.headers.append('set-cookie', 'one=1; HttpOnly');
      supplier.headers.append('set-cookie', 'two=2; HttpOnly');
      const response = applyMailResponsePolicy(request, supplier);
      expect(response.body).toBe(supplier.body);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-security-policy')).toBe(
        canonicalCsp
      );
      expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-disposition')).toMatch(
        preview ? /^inline;/ : /^attachment;/
      );
      expect(response.headers.get('content-type')).toBe('video/mp4');
      expect(response.headers.get('content-length')).toBe('3');
      expect(response.headers.get('etag')).toBe('original-version');
      expect(response.headers.getSetCookie()).toEqual([
        'one=1; HttpOnly',
        'two=2; HttpOnly',
      ]);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3])
      );
      expect(mocks.stream).toHaveBeenCalledTimes(1);
    });
  it('retains supplier byte ranges, status and full CSP without reading or replaying storage twice', async () => {
    mocks.stream.mockResolvedValue({
      body: new Uint8Array([2, 3]),
      contentType: 'video/mp4',
      contentLength: 2,
      contentRange: 'bytes 1-2/5',
      etag: 'original-version',
    });
    const request = new NextRequest(`${url}?preview=1`, {
      headers: { range: 'bytes=1-2' },
    });
    const response = applyMailResponsePolicy(
      request,
      await GET(request, { params: Promise.resolve(params) })
    );
    expect(mocks.stream).toHaveBeenCalledExactlyOnceWith({
      location: {
        provider: 'r2',
        bucketName: 'existing',
        objectKey: 'original-key',
      },
      range: 'bytes=1-2',
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 1-2/5');
    expect(response.headers.get('content-length')).toBe('2');
    expect(response.headers.get('content-security-policy')).toBe(canonicalCsp);
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([2, 3])
    );
  });
  it('keeps denied attachment reads denied and does not exempt their path from defaults', async () => {
    mocks.authorized.mockResolvedValueOnce(null);
    const request = new NextRequest(`${url}?preview=1`);
    const response = applyMailResponsePolicy(
      request,
      await GET(request, { params: Promise.resolve(params) })
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});
