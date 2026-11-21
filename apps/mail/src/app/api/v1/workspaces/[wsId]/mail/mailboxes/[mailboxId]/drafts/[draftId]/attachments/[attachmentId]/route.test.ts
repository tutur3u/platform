import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const { authorized, stream } = vi.hoisted(() => ({
  authorized: vi.fn(),
  stream: vi.fn(),
}));
vi.mock('@/lib/mail/repository', () => ({
  getAuthorizedAttachment: authorized,
}));
vi.mock('@/lib/mail/storage', () => ({ streamMailStoredObject: stream }));
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
  draftId: 'draft',
  attachmentId: 'attachment',
});
const request = new NextRequest('https://tuturuuu.com/mail/attachment');

describe('draft attachment response', () => {
  it.each([
    ['image/png', 'inline', 'image.png'],
    ['text/html', 'attachment', 'document.html'],
    ['image/svg+xml', 'attachment', 'drawing.svg'],
    ['application/pdf', 'attachment', 'document.pdf'],
  ])(
    'serves %s with disposition %s',
    async (contentType, disposition, filename) => {
      authorized.mockResolvedValue({
        attachment: { content_type: 'image/png', filename },
        location: {},
      });
      stream.mockResolvedValue({
        body: new Uint8Array([1, 2]),
        contentType,
        contentLength: 2,
      });

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(disposition);
      expect(response.headers.get('content-security-policy')).toContain(
        'sandbox'
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-type')).toBe(contentType);
      expect(response.headers.get('content-length')).toBe('2');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2])
      );
    }
  );
});
