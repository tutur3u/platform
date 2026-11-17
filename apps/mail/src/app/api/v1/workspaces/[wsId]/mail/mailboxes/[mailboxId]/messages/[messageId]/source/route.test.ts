import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorized: vi.fn(), stream: vi.fn() }));
vi.mock('@/lib/mail/repository/raw-source', () => ({
  getAuthorizedMailRawSource: mocks.authorized,
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
  wsId: 'ws',
  mailboxId: 'box',
  messageId: 'message',
});
const request = () => new NextRequest('https://mail.example.test/source');
beforeEach(() => vi.clearAllMocks());

it('does not read storage when mailbox or message access is denied', async () => {
  mocks.authorized.mockResolvedValue(null);
  expect((await GET(request(), { params })).status).toBe(404);
  expect(mocks.stream).not.toHaveBeenCalled();
});

it('returns the complete stored RFC822 verbatim as private plain text', async () => {
  const raw =
    'From: sender@example.test\r\nX-Test: one\r\nX-Test: two\r\n\tfolded\r\n\r\n<script>not executable</script>\r\n';
  mocks.authorized.mockResolvedValue({
    provider: 'r2',
    bucketName: 'bucket',
    objectKey: 'raw',
  });
  mocks.stream.mockResolvedValue({ body: raw, contentType: 'text/html' });
  const response = await GET(request(), { params });
  expect(await response.text()).toBe(raw);
  expect(response.headers.get('content-type')).toBe(
    'text/plain; charset=utf-8'
  );
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toContain(
    "default-src 'none'"
  );
});
