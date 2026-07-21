import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailUnsubscribeToken } from '@/lib/email-unsubscribe';

const createAdminClientMock = vi.fn();
const emailBlacklistUpsertMock = vi.fn();
const cancelPendingPostEmailsForRecipientEmailMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@/lib/post-email-queue', () => ({
  POST_EMAIL_UNSUBSCRIBED_RECIPIENT_REASON:
    'Recipient unsubscribed from Tuturuuu system emails.',
  cancelPendingPostEmailsForRecipientEmail: (
    ...args: Parameters<typeof cancelPendingPostEmailsForRecipientEmailMock>
  ) => cancelPendingPostEmailsForRecipientEmailMock(...args),
}));

import { GET, POST } from './route';

describe('email unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET', 'test-unsubscribe-secret');

    emailBlacklistUpsertMock.mockResolvedValue({ error: null });
    cancelPendingPostEmailsForRecipientEmailMock.mockResolvedValue(3);
    createAdminClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'email_blacklist') {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          upsert: emailBlacklistUpsertMock,
        };
      },
    });
  });

  it('globally unsubscribes a valid token and cancels pending post emails', async () => {
    const token = createEmailUnsubscribeToken('Recipient@Example.COM');
    const request = new NextRequest(
      `http://localhost/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: 'POST' }
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      cancelledPostEmails: 3,
      message: 'Unsubscribed',
    });
    expect(emailBlacklistUpsertMock).toHaveBeenCalledWith(
      {
        added_by_user_id: null,
        entry_type: 'email',
        reason: 'recipient_unsubscribed',
        value: 'recipient@example.com',
      },
      {
        onConflict: 'entry_type,value',
      }
    );
    expect(cancelPendingPostEmailsForRecipientEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        email: 'recipient@example.com',
        reason: 'Recipient unsubscribed from Tuturuuu system emails.',
      }
    );
  });

  it('rejects invalid tokens', async () => {
    const request = new NextRequest(
      'http://localhost/api/email/unsubscribe?token=invalid',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(emailBlacklistUpsertMock).not.toHaveBeenCalled();
    expect(cancelPendingPostEmailsForRecipientEmailMock).not.toHaveBeenCalled();
  });

  it('escapes token claims before rendering the confirmation page', async () => {
    const token = createEmailUnsubscribeToken(
      'attacker@example.com</span><script>alert(1)</script>'
    );
    const request = new NextRequest(
      `http://localhost/api/email/unsubscribe?token=${encodeURIComponent(token)}`
    );

    const response = await GET(request);
    const html = await response.text();

    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
