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

it.each(['TypeError', 'private synthetic name'])(
  'logs only a safe category for pre-send errors: %s',
  async (name) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('private synthetic details');
    error.name = name;
    mocks.access.mockRejectedValueOnce(error);
    mocks.send.mockClear();
    try {
      await expect(
        sendMailMessage({
          ctx: {} as MailRouteContext,
          mailboxId: 'mailbox',
          payload: {
            to: ['host@example.test'],
            subject: 'Synthetic',
            bodyText: 'Test',
          },
        })
      ).rejects.toThrow('Mail delivery could not be confirmed');
      expect(warn).toHaveBeenCalledWith('[mail] send failed', {
        errorName: name === 'TypeError' ? 'TypeError' : 'UnknownError',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  }
);

it.each([
  'accepted',
  'unknown',
  'unclassified',
  'exception',
  'rejected',
  'persistence',
])('preserves the atomic send fence for %s outcomes', async (outcome) => {
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
  mocks.send.mockReset();
  if (outcome === 'exception') {
    mocks.send.mockRejectedValue(
      new Error('synthetic private provider exception')
    );
  } else {
    mocks.send.mockResolvedValue({
      success: outcome === 'accepted' || outcome === 'persistence',
      deliveryOutcome: outcome === 'unclassified' ? undefined : outcome,
      messageId: 'synthetic',
      error: 'synthetic private provider details',
    });
  }
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
      then(resolve: (value: unknown) => void) {
        if (update.status) status = update.status;
        resolve({
          error:
            outcome === 'persistence'
              ? { message: 'private persistence error' }
              : null,
        });
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
  const results = await Promise.allSettled([
    sendMailMessage(payload),
    sendMailMessage(payload),
  ]);
  const uncertain = ['unknown', 'unclassified', 'exception'].includes(outcome);
  expect(status).toBe(
    uncertain ? 'sending' : outcome === 'rejected' ? 'failed' : 'sent'
  );
  if (uncertain || outcome === 'persistence') {
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status).toBe('rejected');
    if (failure?.status === 'rejected') {
      expect(failure.reason.message).toBe(
        'Mail delivery could not be confirmed'
      );
      expect(String(failure.reason)).not.toContain('private');
    }
  } else {
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
  }
  await sendMailMessage(payload);

  expect(filters).toHaveLength(2);
  for (const filter of filters)
    expect(filter).toContainEqual(['status', 'draft']);
  expect(jobs).toBe(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
