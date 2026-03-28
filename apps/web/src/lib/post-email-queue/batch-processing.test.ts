import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const emailServiceSendMock = vi.fn();
  const fromWorkspaceAdminMock = vi.fn(async () => ({
    send: emailServiceSendMock,
  }));

  class MockEmailService {
    static fromWorkspaceAdmin = fromWorkspaceAdminMock;
  }

  return {
    EmailService: MockEmailService,
    emailServiceSendMock,
    fromWorkspaceAdminMock,
  };
});

vi.mock('@react-email/render', () => ({
  render: vi.fn(async () => '<html />'),
}));

vi.mock('@tuturuuu/email-service', () => ({
  EmailService: mocks.EmailService,
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template',
  () => ({
    default: vi.fn(() => null),
  })
);

import { sendPostEmailImmediately } from '@/lib/post-email-queue';

const WS_ID = 'ws-1';
const GROUP_ID = 'group-1';
const POST_ID = 'post-1';
const USER_ID = 'user-1';
const SENDER_PLATFORM_USER_ID = 'sender-1';
const QUEUE_ID = 'queue-1';
const RECIPIENT_EMAIL = 'blocked@tuturuuu.com';

describe('sendPostEmailImmediately', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-skips blacklisted recipients before calling the email service', async () => {
    const queueUpdates: Array<Record<string, unknown>> = [];

    const sbAdmin = {
      rpc: vi.fn(async (_name: string, args: { p_emails: string[] }) => ({
        data: args.p_emails.map((email) => ({
          email,
          is_blocked: email === RECIPIENT_EMAIL,
          reason: null,
        })),
        error: null,
      })),
      from: (table: string) => {
        switch (table) {
          case 'post_email_queue':
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: null,
                      error: null,
                    })),
                  })),
                })),
              })),
              upsert: vi.fn(() => ({
                select: vi.fn(async () => ({
                  data: [
                    {
                      attempt_count: 1,
                      batch_id: null,
                      blocked_reason: null,
                      cancelled_at: null,
                      claimed_at: null,
                      created_at: '2026-03-28T00:00:00.000Z',
                      group_id: GROUP_ID,
                      id: QUEUE_ID,
                      last_attempt_at: null,
                      last_error: null,
                      post_id: POST_ID,
                      sender_platform_user_id: SENDER_PLATFORM_USER_ID,
                      sent_at: null,
                      sent_email_id: null,
                      status: 'processing',
                      updated_at: '2026-03-28T00:00:00.000Z',
                      user_id: USER_ID,
                      ws_id: WS_ID,
                    },
                  ],
                  error: null,
                })),
              })),
              update: vi.fn((patch: Record<string, unknown>) => ({
                eq: vi.fn(async () => {
                  queueUpdates.push(patch);
                  return { error: null };
                }),
              })),
            };
          case 'user_group_posts':
            return {
              select: vi.fn(() => ({
                in: vi.fn(async () => ({
                  data: [
                    {
                      content: 'Post content',
                      created_at: '2026-03-28T00:00:00.000Z',
                      group_id: GROUP_ID,
                      id: POST_ID,
                      title: 'Post title',
                      workspace_user_groups: {
                        name: 'Group 1',
                        ws_id: WS_ID,
                      },
                    },
                  ],
                  error: null,
                })),
              })),
            };
          case 'user_group_post_checks':
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  in: vi.fn(async () => ({
                    data: [
                      {
                        approval_status: 'APPROVED',
                        is_completed: true,
                        notes: null,
                        post_id: POST_ID,
                        user: {
                          display_name: 'Blocked User',
                          email: RECIPIENT_EMAIL,
                          full_name: 'Blocked User',
                          id: USER_ID,
                        },
                        user_id: USER_ID,
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              })),
            };
          case 'sent_emails':
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  in: vi.fn(async () => ({
                    data: [],
                    error: null,
                  })),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: 'sent-1' },
                    error: null,
                  })),
                })),
              })),
            };
          case 'workspace_email_credentials':
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      source_email: 'notifications@tuturuuu.com',
                      source_name: 'Tuturuuu',
                    },
                    error: null,
                  })),
                })),
              })),
            };
          default:
            throw new Error(`Unexpected table ${table}`);
        }
      },
    };

    const result = await sendPostEmailImmediately(sbAdmin as never, {
      wsId: WS_ID,
      groupId: GROUP_ID,
      postId: POST_ID,
      userId: USER_ID,
      senderPlatformUserId: SENDER_PLATFORM_USER_ID,
    });

    expect(result).toEqual({
      id: QUEUE_ID,
      status: 'skipped',
    });
    expect(mocks.fromWorkspaceAdminMock).toHaveBeenCalledWith(WS_ID);
    expect(mocks.emailServiceSendMock).not.toHaveBeenCalled();
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({
        batch_id: null,
        blocked_reason: 'blacklist',
        last_error: 'Blocked: blacklist',
        status: 'skipped',
      })
    );
  });
});
