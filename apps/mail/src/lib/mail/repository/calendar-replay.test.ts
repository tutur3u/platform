import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  get: vi.fn(),
  read: vi.fn(),
  file: vi.fn(),
  draft: vi.fn(),
  upload: vi.fn(),
  send: vi.fn(),
  rows: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getMailMessage: mocks.get }));
vi.mock('../storage', () => ({ readMailStoredObject: mocks.read }));
vi.mock('./attachments', () => ({
  getAuthorizedAttachment: mocks.file,
  uploadDraftAttachment: mocks.upload,
}));
vi.mock('./drafts', () => ({ createMailDraft: mocks.draft }));
vi.mock('./send', () => ({ sendMailMessage: mocks.send }));
vi.mock('./shared', () => ({ mailMessageTable: mocks.rows }));

import { getMailInvitation, respondToMailInvitation } from './calendar';

const ctx = {
  normalizedWsId: 'workspace-a',
  user: { id: 'actor' },
} as MailRouteContext;
const source = {
  id: 'source',
  direction: 'inbound',
  threadId: 'thread',
  subject: 'Meeting',
  references: [],
  attachments: [
    {
      id: 'file',
      contentType: 'text/calendar',
      filename: 'invite.ics',
      sizeBytes: 300,
    },
  ],
};
let metadata: Record<string, unknown>;
const drafts = new Map<
  string,
  { id: string; status: string; metadata: Record<string, unknown> }
>();
const wire = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:synthetic@example.test',
  'DTSTAMP:20260930T120000Z',
  'DTSTART:20261002T063000Z',
  'ORGANIZER:mailto:host@example.test',
  'ATTENDEE:mailto:guest@example.test',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
beforeEach(() => {
  vi.resetAllMocks();
  drafts.clear();
  metadata = {};
  mocks.access.mockResolvedValue({
    mailbox: { address: 'guest@example.test' },
  });
  mocks.get.mockImplementation(async ({ messageId }) =>
    messageId === 'source' ? source : (drafts.get(messageId) ?? null)
  );
  mocks.read.mockResolvedValue(new TextEncoder().encode(wire));
  mocks.file.mockResolvedValue({ location: {} });
  mocks.draft.mockImplementation(async ({ payload }) => {
    if (!drafts.has(payload.clientMessageId))
      drafts.set(payload.clientMessageId, {
        id: payload.clientMessageId,
        status: 'draft',
        metadata: {},
      });
    return drafts.get(payload.clientMessageId);
  });
  mocks.upload.mockResolvedValue({ id: 'file' });
  mocks.send.mockImplementation(async ({ payload }) => {
    const draft = drafts.get(payload.draftId)!;
    draft.status = 'sent';
    return draft;
  });
  mocks.rows.mockImplementation(() => {
    const conditions: Record<string, unknown> = {};
    let patch: Record<string, unknown> | undefined;
    const b = {
      select: () => b,
      order: () => b,
      limit: () => b,
      update: (value: Record<string, unknown>) => {
        patch = value;
        return b;
      },
      eq: (key: string, value: unknown) => {
        conditions[key] = value;
        return b;
      },
      is: (key: string, value: unknown) => {
        conditions[key] = value;
        return b;
      },
      async maybeSingle() {
        if (patch) {
          if (conditions.metadata !== JSON.stringify(metadata))
            return { data: null, error: null };
          metadata = patch.metadata as Record<string, unknown>;
          return { data: { id: 'source' }, error: null };
        }
        if (conditions.thread_id || conditions.id === 'source')
          return {
            data: { id: 'source', metadata: structuredClone(metadata) },
            error: null,
          };
        return {
          data: drafts.get(conditions.id as string) ?? null,
          error: null,
        };
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase updates are intentionally awaitable.
      then(resolve: (value: unknown) => void) {
        const draft = drafts.get(conditions.id as string);
        if (draft && patch)
          draft.metadata = patch.metadata as Record<string, unknown>;
        resolve({ error: null });
      },
    };
    return b;
  });
});
const respond = (
  response: 'ACCEPTED' | 'DECLINED',
  requestId: string,
  context = ctx
) =>
  respondToMailInvitation({
    ctx: context,
    mailboxId: 'box',
    messageId: 'source',
    response,
    requestId,
  });
it('A accept → B decline → delayed replay A preserves B, then a fresh A sends exactly once', async () => {
  await respond('ACCEPTED', 'request-a');
  await respond('DECLINED', 'request-b');
  const latest = structuredClone(metadata);
  const originalGet = mocks.get.getMockImplementation()!;
  const originalId = [...drafts.keys()][0];
  let replayReads = 0;
  // Simulate a replay paused before its first read, then resumed after B settled.
  mocks.get.mockImplementation(async (args) =>
    args.messageId === originalId && replayReads++ === 0
      ? null
      : originalGet(args)
  );
  const replay = await respond('ACCEPTED', 'request-a');
  expect(replay).toMatchObject({ status: 'sent', response: 'DECLINED' });
  expect(metadata).toEqual(latest);
  expect((await getMailInvitation(ctx, 'box', 'source'))?.reply?.response).toBe(
    'DECLINED'
  );
  await Promise.all([
    respond('ACCEPTED', 'request-a'),
    respond('ACCEPTED', 'request-c'),
  ]);
  expect(mocks.send).toHaveBeenCalledTimes(3);
  expect((await getMailInvitation(ctx, 'box', 'source'))?.reply?.response).toBe(
    'ACCEPTED'
  );
  await respond('ACCEPTED', 'request-a');
  expect(mocks.send).toHaveBeenCalledTimes(3);
});
it('interrupted preparation resumes under another authorized workspace without another grant or draft', async () => {
  mocks.upload.mockRejectedValueOnce(
    new Error('Synthetic interrupted preparation')
  );
  await expect(respond('ACCEPTED', 'request-a')).rejects.toThrow(
    'Synthetic interrupted preparation'
  );
  const originalId = [...drafts.keys()][0]!;
  const id = '11111111-1111-4111-8111-111111111111';
  const interrupted = drafts.get(originalId)!;
  drafts.delete(originalId);
  interrupted.id = id;
  drafts.set(id, interrupted);
  (metadata.calendar_reply_claim as Record<string, unknown>).id = id;
  const other = { ...ctx, normalizedWsId: 'workspace-b' };
  const invitation = await getMailInvitation(other, 'box', 'source');
  expect(invitation?.reply?.retryRequestId).toBe('request-a');
  await respond('ACCEPTED', 'request-a', other);
  expect([...drafts.keys()]).toEqual([id]);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  mocks.access.mockResolvedValue(null);
  expect(await respond('ACCEPTED', 'request-a', other)).toBeNull();
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
