import type { MailMailbox, MailMessageDetail } from '@tuturuuu/internal-api';
import { expect, it, vi } from 'vitest';
import { createMailReplyActions } from './mail-reply-actions';

const message = {
  id: 'message',
  threadId: 'thread',
  subject: 'Hello',
  fromAddress: 'sender@example.com',
  fromName: 'Sender',
  references: [],
  attachments: [],
  recipients: [
    {
      kind: 'reply_to',
      address: 'support@example.com',
      displayName: 'Support',
    },
    { kind: 'to', address: 'me@example.com' },
    { kind: 'cc', address: 'colleague@example.com' },
  ],
} as unknown as MailMessageDetail;
it('honors Reply-To for Reply and Reply All without reintroducing the sender', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  const actions = createMailReplyActions(
    () => 'Quoted message',
    [{ address: 'me@example.com' }] as MailMailbox[],
    open
  );
  await actions.handleReply(message);
  expect(open).toHaveBeenLastCalledWith(
    expect.objectContaining({
      to: ['support@example.com'],
      recipientDisplayNames: { 'support@example.com': 'Support' },
    })
  );
  actions.handleReplyAll(message);
  expect(open).toHaveBeenLastCalledWith(
    expect.objectContaining({
      to: ['support@example.com'],
      cc: ['colleague@example.com'],
    })
  );
});
it('falls back to From when Reply-To is absent', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  await createMailReplyActions(() => '', [], open).handleReply({
    ...message,
    recipients: [],
  });
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ to: ['sender@example.com'] })
  );
});
it('keeps multiple Reply-To and To recipients in To and prevents Bcc disclosure', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  await createMailReplyActions(
    () => '',
    [{ address: 'me@example.com' }] as MailMailbox[],
    open
  ).handleReplyAll({
    ...message,
    recipients: [
      ...message.recipients,
      { kind: 'reply_to', address: 'team@example.com', displayName: null },
      { kind: 'to', address: 'other@example.com', displayName: null },
      { kind: 'bcc', address: 'private@example.com', displayName: null },
    ],
  });
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      to: ['support@example.com', 'team@example.com', 'other@example.com'],
      cc: ['colleague@example.com'],
    })
  );
  expect(JSON.stringify(open.mock.calls[0])).not.toContain(
    'private@example.com'
  );
});
it('replies to sent mail using its original To recipients', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  await createMailReplyActions(
    () => '',
    [{ address: 'me@example.com' }] as MailMailbox[],
    open
  ).handleReply({
    ...message,
    fromAddress: 'ME@example.com',
    recipients: [
      { kind: 'to', address: 'recipient@example.com', displayName: null },
    ],
  });
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ to: ['recipient@example.com'] })
  );
});
