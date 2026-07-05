import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emailServiceMocks = vi.hoisted(() => ({
  fromWorkspace: vi.fn(),
  sendWorkspaceEmail: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
}));

vi.mock('@tuturuuu/email-service', () => ({
  EmailService: {
    fromWorkspace: emailServiceMocks.fromWorkspace,
  },
  sendWorkspaceEmail: emailServiceMocks.sendWorkspaceEmail,
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider:
    storageMocks.downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider:
    storageMocks.getWorkspaceStorageObjectMetadataForProvider,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  getSecret: vi.fn(),
  getSecrets: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
}));

import {
  buildTopicAnnouncementVerificationUrl,
  hashTopicAnnouncementVerificationToken,
} from '@/lib/topic-announcements-verification';
import {
  getContactVerificationStatuses,
  sendTopicAnnouncement,
  sendTopicVerificationEmail,
} from './email';

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
    storageMocks.downloadWorkspaceStorageObjectForProvider.mockReset();
    storageMocks.getWorkspaceStorageObjectMetadataForProvider.mockReset();
    storageMocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue(
      {
        contentType: 'application/pdf',
        fullPath: 'workspace-1/topic-announcements/a/lesson-plan.pdf',
        path: 'topic-announcements/a/lesson-plan.pdf',
        provider: 'supabase',
        size: 6,
        updatedAt: '2026-06-02T00:00:00.000Z',
      }
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  it('hashes verification tokens deterministically without leaking raw tokens', () => {
    expect(hashTopicAnnouncementVerificationToken('token-a')).toBe(
      hashTopicAnnouncementVerificationToken('token-a')
    );
    expect(hashTopicAnnouncementVerificationToken('token-a')).not.toBe(
      'token-a'
    );
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

  it('downloads image and PDF attachments before sending an announcement email', async () => {
    const announcement = {
      body: 'Please review the attachment.',
      class_label: 'EGET1',
      day_label: 'Saturday',
      id: 'announcement-1',
      place: 'Center 1',
      room: '6',
      session_date: '2026-06-01',
      start_time: '16:30:00',
      status: 'draft',
      title: 'Unit 3 speaking practice',
      topic: 'Practice speaking about weekend plans.',
    };
    const contact = {
      email: 'teacher@example.com',
      id: 'contact-1',
    };
    const updateQuery = {
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'topic_announcements') {
          return {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: announcement,
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
            update: updateQuery.update,
          };
        }
        if (table === 'topic_announcement_recipients') {
          return {
            eq: vi.fn(async () => ({
              data: [{ contact, contact_id: contact.id }],
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'topic_announcement_contact_verifications') {
          return verificationQuery([]);
        }
        if (table === 'topic_announcement_attachments') {
          return {
            eq: vi.fn().mockReturnThis(),
            order: vi.fn(async () => ({
              data: [
                {
                  content_type: 'application/pdf',
                  file_name:
                    '1314c279-8f86-4674-83e4-811190d22166-lesson-plan.pdf',
                  size_bytes: 6,
                  storage_path:
                    'topic-announcements/attachments/lesson-plan.pdf',
                  storage_provider: 'supabase',
                },
              ],
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'workspaces') {
          return {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: { name: 'Workspace One' },
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };
    storageMocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
      contentType: 'application/pdf',
    });
    emailServiceMocks.sendWorkspaceEmail.mockResolvedValue({
      auditId: 'audit-1',
      messageId: 'message-1',
      success: true,
    });

    const result = await sendTopicAnnouncement({
      actorUserId: 'user-1',
      announcementId: announcement.id,
      normalizedWsId: 'workspace-1',
      request: new Request('https://tuturuuu.com/api'),
      resend: false,
      sbAdmin,
    });

    expect(result).toEqual({ auditId: 'audit-1', messageId: 'message-1' });
    expect(
      storageMocks.downloadWorkspaceStorageObjectForProvider
    ).toHaveBeenCalledWith(
      'workspace-1',
      'supabase',
      'topic-announcements/attachments/lesson-plan.pdf'
    );
    expect(emailServiceMocks.sendWorkspaceEmail).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        content: expect.objectContaining({
          attachments: [
            {
              contentType: 'application/pdf',
              data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
              filename: 'lesson-plan.pdf',
            },
          ],
        }),
        metadata: expect.objectContaining({
          attachments: [
            {
              contentType: 'application/pdf',
              fileName: 'lesson-plan.pdf',
              sizeBytes: 6,
            },
          ],
        }),
      })
    );
  });

  it('marks announcements failed instead of sending attachments with invalid stored metadata', async () => {
    const announcement = {
      body: 'Please review the attachment.',
      class_label: 'EGET1',
      day_label: 'Saturday',
      id: 'announcement-1',
      place: 'Center 1',
      room: '6',
      session_date: '2026-06-01',
      start_time: '16:30:00',
      status: 'draft',
      title: 'Unit 3 speaking practice',
      topic: 'Practice speaking about weekend plans.',
    };
    const contact = {
      email: 'teacher@example.com',
      id: 'contact-1',
    };
    const updateQuery = {
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'topic_announcements') {
          return {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: announcement,
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
            update: updateQuery.update,
          };
        }
        if (table === 'topic_announcement_recipients') {
          return {
            eq: vi.fn(async () => ({
              data: [{ contact, contact_id: contact.id }],
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'topic_announcement_contact_verifications') {
          return verificationQuery([]);
        }
        if (table === 'topic_announcement_attachments') {
          return {
            eq: vi.fn().mockReturnThis(),
            order: vi.fn(async () => ({
              data: [
                {
                  content_type: 'application/pdf',
                  file_name: 'lesson-plan.pdf',
                  size_bytes: 6,
                  storage_path:
                    'topic-announcements/attachments/lesson-plan.pdf',
                  storage_provider: 'supabase',
                },
              ],
              error: null,
            })),
            select: vi.fn().mockReturnThis(),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };
    storageMocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue(
      {
        contentType: 'application/pdf',
        fullPath: 'workspace-1/topic-announcements/attachments/lesson-plan.pdf',
        path: 'topic-announcements/attachments/lesson-plan.pdf',
        provider: 'supabase',
        size: 7,
        updatedAt: '2026-06-02T00:00:00.000Z',
      }
    );

    const result = await sendTopicAnnouncement({
      actorUserId: 'user-1',
      announcementId: announcement.id,
      normalizedWsId: 'workspace-1',
      request: new Request('https://tuturuuu.com/api'),
      resend: false,
      sbAdmin,
    });

    expect(result).toEqual({ error: 'INVALID_ATTACHMENT', status: 400 });
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error:
          'INVALID_ATTACHMENT: Topic Announcement attachment metadata does not match the uploaded file',
        status: 'failed',
        updated_by: 'user-1',
      })
    );
    expect(
      storageMocks.downloadWorkspaceStorageObjectForProvider
    ).not.toHaveBeenCalled();
    expect(emailServiceMocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });
});
