import { expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  access: vi.fn(),
  get: vi.fn(),
  draft: vi.fn(),
  rows: vi.fn(),
  privateRows: vi.fn(),
  attachments: vi.fn(),
}));
vi.mock('@tuturuuu/email-service', () => ({
  EmailService: {},
  sendWorkspaceEmail: mocks.send,
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getMailMessage: mocks.get }));
vi.mock('./drafts', () => ({
  createMailDraft: mocks.draft,
  updateMailDraft: mocks.draft,
}));
vi.mock('./attachments', () => ({
  loadOutboundAttachments: mocks.attachments,
}));
vi.mock('./shared', () => ({
  mailMessageTable: mocks.rows,
  privateTable: mocks.privateRows,
}));

import { sendMailMessage } from './send';

it('only the atomic draft claim winner creates a job and invokes the provider', async () => {
  let status = 'draft';
  let jobs = 0;
  const filters: [string, unknown][][] = [];
  const message = { id: 'reply', status: 'draft', subject: 'Synthetic reply' };
  mocks.access.mockResolvedValue({
    admin: {},
    mailbox: { address: 'guest@example.test' },
  });
  // Both callers deliberately read the same draft before either claims it.
  mocks.get.mockImplementation(async () => ({ ...message, status }));
  mocks.draft.mockResolvedValue(message);
  mocks.attachments.mockResolvedValue([]);
  mocks.send.mockResolvedValue({ success: true, messageId: 'synthetic' });
  mocks.rows.mockImplementation(() => {
    let update: { status?: string } = {};
    const eq: [string, unknown][] = [];
    const b = {
      update(value: typeof update) {
        update = value;
        return b;
      },
      eq(key: string, value: unknown) {
        eq.push([key, value]);
        return b;
      },
      select() {
        return b;
      },
      async maybeSingle() {
        filters.push(eq);
        const won = status === 'draft';
        if (won) status = 'sending';
        return { data: won ? { id: 'reply' } : null, error: null };
      },
      // biome-ignore lint/suspicious/noThenProperty: Model the awaited Supabase query builder.
      then(resolve: (value: unknown) => void) {
        if (update.status) status = update.status;
        resolve({ error: null });
      },
    };
    return b;
  });
  mocks.privateRows.mockImplementation((_admin, table) => {
    const b = {
      select() {
        return b;
      },
      eq() {
        return b;
      },
      insert() {
        jobs++;
        return b;
      },
      update() {
        return b;
      },
      async single() {
        return {
          data:
            table === 'mail_mailboxes'
              ? { domain_id: 'domain' }
              : table === 'mail_domains'
                ? { status: 'active', outbound_provider: 'ses' }
                : { id: 'job' },
          error: null,
        };
      },
      // biome-ignore lint/suspicious/noThenProperty: Model the awaited Supabase query builder.
      then(resolve: (value: unknown) => void) {
        resolve({ error: null });
      },
    };
    return b;
  });
  const payload = {
    ctx: { normalizedWsId: 'ws', user: { id: 'actor' } } as MailRouteContext,
    mailboxId: 'box',
    payload: {
      draftId: 'reply',
      to: ['host@example.test'],
      subject: 'Synthetic reply',
      bodyText: 'Accepted',
    },
  };
  await Promise.all([sendMailMessage(payload), sendMailMessage(payload)]);
  expect(filters).toHaveLength(2);
  for (const filter of filters)
    expect(filter).toContainEqual(['status', 'draft']);
  expect(jobs).toBe(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
