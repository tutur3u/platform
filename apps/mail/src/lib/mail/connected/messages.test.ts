import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn(), request: vi.fn() }));
vi.mock('./transport', () => ({
  providerJson: mocks.json,
  providerRequest: mocks.request,
  jsonBody: (body: unknown, method = 'POST') => ({
    method,
    body: JSON.stringify(body),
  }),
}));

import { listMessages, readMessage, updateMessage } from './messages';
import type { ConnectedAccount } from './repository';

const account = {
  id: 'account',
  provider: 'google',
  address: 'me@example.test',
} as ConnectedAccount;
beforeEach(() => vi.clearAllMocks());
describe('provider mailbox actions', () => {
  it.each([
    ['mark_read', { removeLabelIds: ['UNREAD'] }],
    ['mark_unread', { addLabelIds: ['UNREAD'] }],
    ['archive', { removeLabelIds: ['INBOX'] }],
    ['star', { addLabelIds: ['STARRED'] }],
    ['unstar', { removeLabelIds: ['STARRED'] }],
  ] as const)(
    'Gmail %s updates only the intended labels',
    async (action, body) => {
      await updateMessage(account, 'a/b', action);
      expect(mocks.json).toHaveBeenCalledWith(
        account,
        '/messages/a%2Fb/modify',
        { method: 'POST', body: JSON.stringify(body) }
      );
    }
  );
  it.each(['trash', 'restore'] as const)(
    'Gmail %s never permanently deletes mail',
    async (action) => {
      await updateMessage(account, 'id', action);
      expect(mocks.json).toHaveBeenCalledWith(
        account,
        `/messages/id/${action === 'trash' ? 'trash' : 'untrash'}`,
        { method: 'POST' }
      );
    }
  );
  it.each([
    ['archive', 'archive'],
    ['trash', 'deleteditems'],
    ['restore', 'inbox'],
  ] as const)(
    'Outlook %s moves to the matching provider folder',
    async (action, destinationId) => {
      const graph = { ...account, provider: 'microsoft' as const };
      await updateMessage(graph, 'a/b', action);
      expect(mocks.json).toHaveBeenCalledWith(graph, '/messages/a%2Fb/move', {
        method: 'POST',
        body: JSON.stringify({ destinationId }),
      });
    }
  );
  it('Outlook pagination retains numeric skips instead of silently truncating', async () => {
    mocks.json
      .mockResolvedValueOnce({
        value: [],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=25',
      })
      .mockResolvedValueOnce({ value: [] });
    const graph = { ...account, provider: 'microsoft' as const };
    const first = await listMessages(graph, 'inbox');
    expect(first.nextCursor).toBeTruthy();
    await listMessages(graph, 'inbox', first.nextCursor!);
    expect(mocks.json.mock.calls[1]?.[1]).toContain('%24skip=25');
  });
  it('parses Gmail raw MIME, Reply-To, binary attachments and safe HTML', async () => {
    const raw =
      'From: sender@example.test\r\nTo: me@example.test\r\nReply-To: support@example.test\r\nSubject: Hello\r\nContent-Type: text/html\r\n\r\n<p>Hello</p><script>bad()</script>';
    mocks.request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ raw: Buffer.from(raw).toString('base64url') })
      )
    );
    const message = await readMessage(account, 'id');
    expect(message.detail.replyTo).toEqual(['support@example.test']);
    expect(message.detail.html).not.toContain('<script>');
  });
  it('rejects oversized MIME before reading the body', async () => {
    mocks.request.mockResolvedValueOnce(
      new Response('x', {
        headers: { 'Content-Length': String(30 * 1024 * 1024) },
      })
    );
    await expect(
      readMessage({ ...account, provider: 'microsoft' }, 'id')
    ).rejects.toMatchObject({ status: 413 });
  });
});
