import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  messages: new Map<string, Row>(),
  inserts: 0,
  staleLookups: 0,
}));
vi.mock('./bootstrap', () => ({
  requireMailboxAccess: vi.fn(async () => ({
    admin: {},
    mailbox: { id: 'mailbox', address: 'me@example.test', displayName: 'Me' },
  })),
}));
vi.mock('./messages', () => ({
  getMailMessage: vi.fn(async ({ messageId }: { messageId: string }) => ({
    ...db.messages.get(messageId),
  })),
}));
vi.mock('./shared', () => {
  function table(name: string) {
    const filters = new Map<string, unknown>();
    let insertRow: Row | null = null;
    let threadLookup = false;
    const builder = {
      select: () => builder,
      delete: () => builder,
      limit: () => builder,
      not: () => builder,
      in: () => {
        threadLookup = true;
        return builder;
      },
      eq: (key: string, value: unknown) => {
        filters.set(key, value);
        return builder;
      },
      insert: (row: Row) => {
        insertRow = row;
        return builder;
      },
      async maybeSingle() {
        if (threadLookup) return { data: { thread_id: 'thread' }, error: null };
        if (db.staleLookups > 0) {
          db.staleLookups -= 1;
          return { data: null, error: null };
        }
        const row = db.messages.get(String(filters.get('id')));
        const matches =
          row &&
          row.mailbox_id === filters.get('mailbox_id') &&
          row.created_by === filters.get('created_by');
        return { data: matches ? { id: row.id } : null, error: null };
      },
      async single() {
        if (name === 'mail_threads')
          return { data: { id: 'thread' }, error: null };
        const row = insertRow as Row;
        const id = String(row.id ?? `generated-${db.inserts + 1}`);
        // Model the primary key on private.mail_messages.id.
        if (db.messages.has(id))
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          };
        db.inserts += 1;
        const saved = { ...row, id };
        db.messages.set(id, saved);
        return { data: saved, error: null };
      },
      // biome-ignore lint/suspicious/noThenProperty: Model the awaited Supabase query builder.
      then(resolve: (value: unknown) => void) {
        resolve({ error: null });
      },
    };
    return builder;
  }
  return {
    mailMessageTable: () => table('mail_messages'),
    privateTable: (_admin: unknown, name: string) => table(name),
    normalizeAddress: (value: string) => value.trim().toLowerCase(),
  };
});

import { createMailDraft } from './drafts';

const ctx = { user: { id: 'user' } } as unknown as MailRouteContext;
const payload = {
  bodyText: 'Thanks',
  clientMessageId: 'a7f3c1d2-1111-8222-9333-444455556666',
  inReplyTo: '<parent@example.test>',
  subject: 'Re: Plan',
  to: ['alice@example.test'],
};

beforeEach(() => {
  db.messages.clear();
  db.inserts = 0;
  db.staleLookups = 0;
});

it('returns the existing draft for a retried clientMessageId', async () => {
  const first = await createMailDraft({ ctx, mailboxId: 'mailbox', payload });
  const retry = await createMailDraft({ ctx, mailboxId: 'mailbox', payload });
  expect(retry?.id).toBe(first?.id);
  expect(db.inserts).toBe(1);
  expect(db.messages.size).toBe(1);
});

it('returns the winner when a concurrent retry loses the primary-key race', async () => {
  await createMailDraft({ ctx, mailboxId: 'mailbox', payload });
  // The retry's pre-check ran before the first insert became visible.
  db.staleLookups = 1;
  const retry = await createMailDraft({ ctx, mailboxId: 'mailbox', payload });
  expect(retry?.id).toBe(payload.clientMessageId);
  expect(db.inserts).toBe(1);
});

it('does not reveal or reuse another user message that owns the id', async () => {
  await createMailDraft({ ctx, mailboxId: 'mailbox', payload });
  const other = { user: { id: 'other' } } as unknown as MailRouteContext;
  await expect(
    createMailDraft({ ctx: other, mailboxId: 'mailbox', payload })
  ).rejects.toThrow('already in use');
  expect(db.inserts).toBe(1);
});
