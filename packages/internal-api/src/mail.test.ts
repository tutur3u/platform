import { describe, expect, it, vi } from 'vitest';
import {
  bulkUpdateMailMessages,
  bulkUpdateMailThreads,
  copyMailDraftAttachments,
  createMailLabel,
  generateMailAiDraft,
  getMailBootstrap,
  getMailCatchAllConfiguration,
  getMailMailboxSettings,
  getMailThread,
  listMailDomains,
  listMailMessages,
  listMailThreads,
  sendMailMessage,
  suggestMailLabels,
  updateMailCatchAllConfiguration,
  updateMailMailboxSettings,
  updateMailMessageState,
  upsertMailDomain,
} from './mail';

function jsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('mail internal API helpers', () => {
  it('defaults mail helpers to the configured mail app origin outside apps/mail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ labels: [], mailboxes: [], user: {} }));

    vi.stubEnv('MAIL_APP_URL', 'https://mail.example.com');

    try {
      await getMailBootstrap('personal', {
        fetch: fetchMock as unknown as typeof fetch,
      });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mail.example.com/api/v1/workspaces/personal/mail/bootstrap',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('fetches bootstrap through the workspace mail API with cache bypass', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ labels: [], mailboxes: [], user: {} }));

    await getMailBootstrap('personal', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/personal/mail/bootstrap',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('serializes list params into the mailbox messages API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        messages: [],
        pagination: { page: 1, pageSize: 40, total: 0 },
      })
    );

    await listMailMessages(
      'personal',
      'mailbox-1',
      { folder: 'sent', page: 2, query: 'invoice' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/messages?folder=sent&page=2&query=invoice',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('sends messages and state mutations as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        message: { id: 'message-1' },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await sendMailMessage(
      'personal',
      'mailbox-1',
      {
        bodyText: 'Hello',
        subject: 'Hi',
        to: ['person@example.com'],
      },
      options
    );
    await updateMailMessageState(
      'personal',
      'mailbox-1',
      'message-1',
      { action: 'mark_read' },
      options
    );

    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('content-type')
    ).toBe('application/json');
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('content-type')
    ).toBe('application/json');
  });

  it('lists and updates platform mail domains through the mail app', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ domains: [] }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listMailDomains(options);
    await upsertMailDomain(
      {
        cloudflareAccountId: 'account-1',
        cloudflareRoutingRuleId: null,
        cloudflareZoneId: 'zone-1',
        domain: 'mail.example.com',
        inboundProvider: 'cloudflare',
        outboundProvider: 'cloudflare',
        status: 'verifying',
        verificationState: {},
      },
      options
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://internal.example.com/api/v1/mail/domains'
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('addresses threads and mailbox organization through scoped routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getMailThread('personal', 'mailbox-1', 'thread/one', options);
    await createMailLabel(
      'personal',
      'mailbox-1',
      { color: 'slate', name: 'Invoices' },
      options
    );
    await bulkUpdateMailMessages(
      'personal',
      'mailbox-1',
      {
        action: 'add_label',
        labelId: 'label-1',
        messageIds: ['message-1'],
      },
      options
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/threads/thread%2Fone'
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('uses dedicated thread, mailbox-settings, and catch-all routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listMailThreads(
      'personal',
      'mailbox-1',
      { folder: 'inbox' },
      options
    );
    await bulkUpdateMailThreads(
      'personal',
      'mailbox-1',
      { action: 'archive', threadIds: ['thread-1'] },
      options
    );
    await getMailMailboxSettings('personal', 'mailbox-1', options);
    await updateMailMailboxSettings(
      'personal',
      'mailbox-1',
      { senderName: 'Tuturuuu Mail' },
      options
    );
    await getMailCatchAllConfiguration('domain/one', options);
    await updateMailCatchAllConfiguration(
      'domain/one',
      {
        autoDraftEnabled: false,
        enabled: true,
        targetMailboxId: '00000000-0000-0000-0000-000000000001',
      },
      options
    );

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/threads?folder=inbox',
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/threads/bulk',
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/settings',
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/settings',
      'https://internal.example.com/api/v1/mail/domains/domain%2Fone/catch-all',
      'https://internal.example.com/api/v1/mail/domains/domain%2Fone/catch-all',
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('copies selected source attachments into a scoped draft', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ attachments: [] }));
    await copyMailDraftAttachments(
      'personal',
      'mailbox-1',
      'draft-1',
      { attachmentIds: ['attachment-1'], sourceMessageId: 'message-1' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/drafts/draft-1/attachments',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses mailbox-scoped AI draft and labeling routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await generateMailAiDraft(
      'personal',
      'mailbox-1',
      { instructions: 'Follow up politely', mode: 'follow_up' },
      options
    );
    await suggestMailLabels(
      'personal',
      'mailbox-1',
      { action: 'classify', threadIds: ['thread-1'] },
      options
    );

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/ai/draft',
      'https://internal.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox-1/ai/labels',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
  });
});
