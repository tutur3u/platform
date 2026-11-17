import { describe, expect, it, vi } from 'vitest';
import { getMailMessageSource, getMailSourceHeaders } from './mail-source';

describe('Mail raw source client', () => {
  it('loads the complete source from the authenticated mailbox route', async () => {
    const raw =
      'From: sender@example.test\r\nX-Test: one\r\nX-Test: two\r\n folded\r\n\r\nBody\r\n';
    const fetch = vi.fn().mockResolvedValue(
      new Response(raw, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    );
    expect(
      await getMailMessageSource('ws', 'box', 'message', undefined, {
        baseUrl: 'https://mail.example.test',
        fetch,
      })
    ).toBe(raw);
    expect(fetch).toHaveBeenCalledWith(
      'https://mail.example.test/api/v1/workspaces/ws/mail/mailboxes/box/messages/message/source',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' })
    );
    expect(getMailSourceHeaders(raw)).toBe(
      'From: sender@example.test\r\nX-Test: one\r\nX-Test: two\r\n folded'
    );
  });

  it.each([401, 403, 404])(
    'rejects inaccessible source (%s)',
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response('error', { status }));
      await expect(
        getMailMessageSource('ws', 'box', 'message', undefined, { fetch })
      ).rejects.toThrow('Message source unavailable');
    }
  );

  it.each([
    ['text/html', 200],
    ['text/plain', 206],
  ] as const)(
    'rejects %s status %s instead of copying a partial or HTML response',
    async (type, status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response('partial', { status, headers: { 'content-type': type } })
        );
      await expect(
        getMailMessageSource('ws', 'box', 'message', undefined, { fetch })
      ).rejects.toThrow('Invalid message source response');
    }
  );

  it('cancels oversized streams rather than copying truncated source', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 1));
      },
      cancel,
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(stream, { headers: { 'content-type': 'text/plain' } })
      );
    await expect(
      getMailMessageSource('ws', 'box', 'message', undefined, { fetch })
    ).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalled();
  });
});
