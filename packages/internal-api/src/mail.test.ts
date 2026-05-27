import { describe, expect, it, vi } from 'vitest';
import {
  getMailBootstrap,
  listMailMessages,
  sendMailMessage,
  updateMailMessageState,
} from './mail';

function jsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('mail internal API helpers', () => {
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
      (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('content-type')
    ).toBe('application/json');
    expect(
      (fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('content-type')
    ).toBe('application/json');
  });
});
