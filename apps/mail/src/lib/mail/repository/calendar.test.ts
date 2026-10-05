import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  get: vi.fn(),
  file: vi.fn(),
  read: vi.fn(),
  legacy: vi.fn(),
  draft: vi.fn(),
  upload: vi.fn(),
  send: vi.fn(),
  claim: vi.fn(),
  rows: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getMailMessage: mocks.get }));
vi.mock('./attachments', () => ({
  getAuthorizedAttachment: mocks.file,
  uploadDraftAttachment: mocks.upload,
}));
vi.mock('../storage', () => ({ readMailStoredObject: mocks.read }));
vi.mock('./calendar-source', () => ({
  readLegacyCalendarSource: mocks.legacy,
}));
vi.mock('./drafts', () => ({ createMailDraft: mocks.draft }));
vi.mock('./send', () => ({ sendMailMessage: mocks.send }));
vi.mock('./calendar-claim', () => ({ claimCalendarReply: mocks.claim }));
vi.mock('./shared', () => ({ mailMessageTable: mocks.rows }));

import { getMailInvitation, respondToMailInvitation } from './calendar';

const ctx = { normalizedWsId: 'ws', user: { id: 'actor' } } as MailRouteContext;
const source = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:google-synthetic@example.test',
  'DTSTAMP:20260930T120000Z',
  'DTSTART:20261002T063000Z',
  'SEQUENCE:3',
  'ORGANIZER:mailto:host@example.test',
  'ATTENDEE;RSVP=TRUE:mailto:guest@example.test',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const message = {
  id: 'message',
  mailboxId: 'box',
  threadId: 'thread',
  direction: 'inbound',
  internetMessageId: '<invite@example.test>',
  subject: 'Meeting',
  references: [],
  attachments: [
    {
      id: 'file',
      contentType: 'text/calendar',
      filename: 'invite.ics',
      sizeBytes: 200,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    admin: {},
    mailbox: { address: 'guest@example.test' },
  });
  mocks.get.mockImplementation(async ({ messageId }) =>
    messageId === 'message' ? message : null
  );
  mocks.file.mockResolvedValue({ location: {} });
  mocks.read.mockResolvedValue(new TextEncoder().encode(source));
  mocks.claim.mockResolvedValue({ status: 'claimed' });
  mocks.draft.mockResolvedValue({ id: 'draft', status: 'draft' });
  mocks.upload.mockResolvedValue({ id: 'reply-file' });
  mocks.send.mockResolvedValue({ status: 'sent' });
  mocks.rows.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    for (const key of ['select', 'eq', 'order', 'limit', 'update'])
      builder[key] = () => builder;
    builder.maybeSingle = async () => ({
      data: { id: 'message' },
      error: null,
    });
    // biome-ignore lint/suspicious/noThenProperty: Model the awaited Supabase query builder.
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ error: null });
    return builder;
  });
});
it('enforces sending roles and exact invited mailbox before reading bytes', async () => {
  mocks.access.mockResolvedValue(null);
  expect(await getMailInvitation(ctx, 'box', 'message')).toBeNull();
  expect(mocks.access).toHaveBeenCalledWith(ctx, 'box', [
    'owner',
    'admin',
    'sender',
  ]);
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.access.mockResolvedValue({
    mailbox: { address: 'uninvited@example.test' },
  });
  expect(await getMailInvitation(ctx, 'box', 'message')).toBeNull();
  expect(mocks.send).not.toHaveBeenCalled();
});
it('refuses grouped identities and superseded invitation messages', async () => {
  mocks.access.mockResolvedValue({
    mailbox: { address: 'guest@example.test', groupPolicy: {} },
  });
  expect(await getMailInvitation(ctx, 'box', 'message')).toBeNull();
  expect(mocks.get).not.toHaveBeenCalled();
  mocks.access.mockResolvedValue({
    mailbox: { address: 'guest@example.test' },
  });
  mocks.rows.mockImplementation(() => {
    const b: Record<string, unknown> = {};
    for (const key of ['select', 'eq', 'order', 'limit']) b[key] = () => b;
    b.maybeSingle = async () => ({
      data: { id: 'later-cancellation' },
      error: null,
    });
    return b;
  });
  expect(await getMailInvitation(ctx, 'box', 'message')).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
});
it('sends only a derived organizer-addressed calendar REPLY and keeps stable identity on retry', async () => {
  const payload = {
    ctx,
    mailboxId: 'box',
    messageId: 'message',
    response: 'ACCEPTED' as const,
    requestId: '8238cb8a-ed38-4c98-a673-e038ee5b464a',
  };
  expect(await respondToMailInvitation(payload)).toMatchObject({
    status: 'sent',
  });
  const upload = mocks.upload.mock.calls[0]![0];
  expect(upload.contentType).toContain('method=REPLY');
  expect(new TextDecoder().decode(upload.bytes)).toContain(
    'UID:google-synthetic@example.test\r\nSEQUENCE:3'
  );
  expect(mocks.send.mock.calls[0]![0].payload.to).toEqual([
    'host@example.test',
  ]);
  const id = mocks.draft.mock.calls[0]![0].payload.clientMessageId;
  mocks.get.mockImplementation(async ({ messageId }) =>
    messageId === 'message' ? message : { status: 'sent' }
  );
  expect(await respondToMailInvitation(payload)).toMatchObject({
    status: 'sent',
  });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.claim.mock.calls[1]![3]).toBe(id);
});
it('never retries a competing or uncertain send claim', async () => {
  mocks.claim.mockResolvedValue({ status: 'sending' });
  expect(
    await respondToMailInvitation({
      ctx,
      mailboxId: 'box',
      messageId: 'message',
      response: 'DECLINED',
      requestId: '8238cb8a-ed38-4c98-a673-e038ee5b464a',
    })
  ).toEqual({ status: 'sending', response: 'DECLINED' });
  expect(mocks.draft).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('accepts authorized duplicate calendar parts but refuses conflicting requests', async () => {
  mocks.get.mockResolvedValue({
    ...message,
    attachments: [
      ...message.attachments,
      {
        ...message.attachments[0],
        id: 'alternative',
        filename: 'attachment-1',
      },
    ],
  });
  mocks.read
    .mockResolvedValueOnce(new TextEncoder().encode(source))
    .mockResolvedValueOnce(
      new TextEncoder().encode(source.replaceAll('\r\n', '\n'))
    );
  expect(await getMailInvitation(ctx, 'box', 'message')).not.toBeNull();
  expect(mocks.file).toHaveBeenCalledTimes(2);
  mocks.read
    .mockResolvedValueOnce(new TextEncoder().encode(source))
    .mockResolvedValueOnce(
      new TextEncoder().encode(source.replace('SEQUENCE:3', 'SEQUENCE:4'))
    );
  expect(await getMailInvitation(ctx, 'box', 'message')).toBeNull();
});
it('refuses oversized competing calendar files rather than ignoring them', async () => {
  mocks.get.mockResolvedValue({
    ...message,
    attachments: [
      ...message.attachments,
      { ...message.attachments[0], id: 'oversized', sizeBytes: 300000 },
    ],
  });
  expect(await getMailInvitation(ctx, 'box', 'message')).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
});
