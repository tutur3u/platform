import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emailServiceMocks = vi.hoisted(() => ({
  fromWorkspace: vi.fn(),
  sendWorkspaceEmail: vi.fn(),
}));

vi.mock('@tuturuuu/email-service', () => ({
  EmailService: {
    fromWorkspace: emailServiceMocks.fromWorkspace,
  },
  sendWorkspaceEmail: emailServiceMocks.sendWorkspaceEmail,
}));

import {
  getContactVerificationStatuses,
  sendTopicVerificationEmail,
} from './email';
import {
  buildTopicAnnouncementVerificationUrl,
  hashVerificationToken,
} from './shared';

function verificationQuery(data: unknown[]) {
  return {
    in: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data, error: null })),
    select: vi.fn().mockReturnThis(),
  };
}

describe('topic announcement email helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T00:00:00.000Z'));
    emailServiceMocks.fromWorkspace.mockReset();
    emailServiceMocks.sendWorkspaceEmail.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  it('hashes verification tokens deterministically without leaking raw tokens', () => {
    expect(hashVerificationToken('token-a')).toBe(
      hashVerificationToken('token-a')
    );
    expect(hashVerificationToken('token-a')).not.toBe('token-a');
  });

  it('prefers linked confirmed accounts over pending internal verification', async () => {
    const sbAdmin = {
      from: vi.fn(() =>
        verificationQuery([
          {
            contact_id: 'contact-1',
            expires_at: '2999-01-01T00:00:00.000Z',
            status: 'pending',
          },
          {
            contact_id: 'contact-2',
            expires_at: '2999-01-01T00:00:00.000Z',
            status: 'verified',
          },
        ])
      ),
      rpc: vi.fn(async (_name: string, args: { p_contact_id: string }) => ({
        data: args.p_contact_id === 'contact-1',
        error: null,
      })),
    };

    const statuses = await getContactVerificationStatuses(sbAdmin, [
      'contact-1',
      'contact-2',
      'contact-3',
    ]);

    expect(statuses.get('contact-1')).toBe('linked_confirmed_account');
    expect(statuses.get('contact-2')).toBe('verified');
    expect(statuses.get('contact-3')).toBe('needs_verification');
  });

  it('builds verification links from the public platform origin by default', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://0.0.0.0:7803';
    process.env.NEXT_PUBLIC_WEB_APP_URL = 'http://localhost:7803';
    process.env.WEB_APP_URL = 'https://tuturuuu.localhost';
    delete process.env.TOPIC_ANNOUNCEMENT_VERIFICATION_ORIGIN;

    expect(buildTopicAnnouncementVerificationUrl('token value')).toBe(
      'https://tuturuuu.com/api/v1/topic-announcement-verifications/token%20value'
    );
  });

  it('canonicalizes explicit platform verification origins to https', () => {
    process.env.TOPIC_ANNOUNCEMENT_VERIFICATION_ORIGIN = 'http://tuturuuu.com';

    expect(buildTopicAnnouncementVerificationUrl('token-a')).toBe(
      'https://tuturuuu.com/api/v1/topic-announcement-verifications/token-a'
    );
  });

  it('does not resend verification emails during the pending cooldown', async () => {
    const query = {
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: {
          created_at: '2026-05-18T23:50:00.000Z',
          expires_at: '2026-05-26T00:00:00.000Z',
          id: 'verification-1',
        },
        error: null,
      })),
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    };
    const sbAdmin = {
      from: vi.fn(() => query),
    };

    const result = await sendTopicVerificationEmail({
      contact: {
        email: 'teacher@example.com',
        id: 'contact-1',
        name: 'Teacher',
      },
      normalizedWsId: 'workspace-1',
      request: new Request('https://tuturuuu.com/api', {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      }),
      sbAdmin,
      userId: 'user-1',
    });

    expect(result).toEqual({
      alreadyPending: true,
      expiresAt: '2026-05-26T00:00:00.000Z',
    });
    expect(emailServiceMocks.fromWorkspace).not.toHaveBeenCalled();
  });

  it('returns a rate-limited result when protected email delivery rejects the send', async () => {
    const findPendingQuery = {
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    };
    const revokePendingQuery = {
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    const insertQuery = {
      insert: vi.fn(async () => ({ error: null })),
    };
    const revokeInsertedQuery = {
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    const sbAdmin = {
      from: vi
        .fn()
        .mockReturnValueOnce(findPendingQuery)
        .mockReturnValueOnce(revokePendingQuery)
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(revokeInsertedQuery),
    };
    const send = vi.fn(async () => ({
      error: 'Recipient hourly limit exceeded',
      rateLimitInfo: {
        allowed: false,
        remaining: 0,
        retryAfter: 3600,
      },
      success: false,
    }));
    emailServiceMocks.fromWorkspace.mockResolvedValue({ send });

    const result = await sendTopicVerificationEmail({
      contact: {
        email: 'teacher@example.com',
        id: 'contact-1',
        name: 'Teacher',
      },
      normalizedWsId: 'workspace-1',
      request: new Request('https://tuturuuu.com/api', {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      }),
      sbAdmin,
      userId: 'user-1',
    });

    expect(result).toEqual({
      error: 'Recipient hourly limit exceeded',
      retryAfter: 3600,
      status: 429,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          ipAddress: '203.0.113.10',
          isInvite: true,
          wsId: 'workspace-1',
        }),
      })
    );
  });
});
