import { describe, expect, it, vi } from 'vitest';
import {
  buildNotificationUndeliverableSkipReason,
  chunkValues,
  fetchAllChunkedPaginatedRows,
  fetchAllPaginatedRows,
  getNotificationSkipReason,
  NOTIFICATION_OLDER_THAN_ONE_DAY_SKIP_REASON,
  NOTIFICATION_STALE_WORKSPACE_MEMBERSHIP_SKIP_REASON,
} from './cron-helpers';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('queued deadline reminder cancellation', () => {
  it('does not turn a provider timeout into cancellation after a task edit', async () => {
    const from = vi.fn(() => {
      throw new Error('must not reclassify current task');
    });
    const notification = {
      id: 'notification-1',
      created_at: new Date().toISOString(),
      type: 'deadline_reminder',
      scope: 'workspace',
      user_id: 'user-1',
      ws_id: 'ws-1',
      entity_type: 'task',
      entity_id: 'task-1',
      data: { task_id: 'task-1', end_date: '2026-10-12T12:00:00Z' },
    };
    expect(
      await getNotificationSkipReason(
        { from },
        {
          membershipCache: new Map([['ws-1:user-1', true]]),
          notification,
          errorMessage: 'transport timeout',
          sendResult: { error: 'transport timeout', blockedRecipients: [] },
        }
      )
    ).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it.each(['email', 'push'])(
    'suppresses an edited deadline before %s dispatch',
    async (channel) => {
      const query = {
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'task-1',
            end_date: '2026-10-13T12:00:00Z',
            closed_at: null,
            completed_at: null,
            deleted_at: null,
            task_lists: {
              status: 'active',
              workspace_boards: { ws_id: 'ws-1' },
            },
            task_watchers: [{ user_id: 'user-1' }],
          },
          error: null,
        })),
      };
      query.eq.mockReturnValue(query);
      const from = vi.fn(() => ({ select: vi.fn(() => query) }));
      expect(
        await getNotificationSkipReason(
          { from, rpc: vi.fn(async () => ({ data: true, error: null })) },
          {
            channel,
            membershipCache: new Map([['ws-1:user-1', true]]),
            notification: {
              id: 'notification-1',
              created_at: new Date().toISOString(),
              type: 'deadline_reminder',
              scope: 'workspace',
              user_id: 'user-1',
              ws_id: 'ws-1',
              entity_type: 'task',
              entity_id: 'task-1',
              data: { task_id: 'task-1', end_date: '2026-10-12T12:00:00Z' },
            },
          }
        )
      ).toBe('skipped: task_reminder_revised');
    }
  );
});

function getRecentCreatedAt(): string {
  return new Date(Date.now() - HOUR_MS).toISOString();
}

function getStaleCreatedAt(): string {
  return new Date(Date.now() - (DAY_MS + HOUR_MS)).toISOString();
}

describe('fetchAllPaginatedRows', () => {
  it('collects rows across more than one 1000-row page', async () => {
    const rows = await fetchAllPaginatedRows<number>(async (from, to) => ({
      data: Array.from(
        { length: Math.max(0, Math.min(1001, to + 1) - from) },
        (_, index) => from + index
      ),
      error: null,
    }));

    expect(rows).toHaveLength(1001);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(1000);
  });
});

describe('fetchAllChunkedPaginatedRows', () => {
  it('reads every chunk and every page', async () => {
    const rows = await fetchAllChunkedPaginatedRows<string, string>(
      ['a', 'b'],
      async (chunk, from, to) => ({
        data: from === 0 ? chunk.map((value) => `${value}-${from}-${to}`) : [],
        error: null,
      }),
      {
        chunkSize: 1,
        pageSize: 1,
      }
    );

    expect(rows).toEqual(['a-0-0', 'b-0-0']);
  });
});

describe('chunkValues', () => {
  it('splits values using the requested chunk size', () => {
    expect(chunkValues([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('getNotificationSkipReason', () => {
  function createNotification() {
    return {
      created_at: getRecentCreatedAt(),
      id: 'notification-1',
      scope: 'workspace',
      user_id: 'user-1',
      ws_id: 'ws-1',
    };
  }

  it('prefers age-based skip before any other checks', async () => {
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(),
              })),
            })),
          })),
        })),
      },
      {
        notification: {
          ...createNotification(),
          created_at: getStaleCreatedAt(),
        },
        recipientEmail: 'member@tuturuuu.com',
      }
    );

    expect(reason).toBe(NOTIFICATION_OLDER_THAN_ONE_DAY_SKIP_REASON);
  });

  it('returns stale membership before evaluating recipient domain', async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle,
              })),
            })),
          })),
        })),
      },
      {
        notification: createNotification(),
        recipientEmail: 'member@example.com',
      }
    );

    expect(reason).toBe(NOTIFICATION_STALE_WORKSPACE_MEMBERSHIP_SKIP_REASON);
  });

  it('skips malformed recipient emails', async () => {
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { type: 'MEMBER' as const },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      },
      {
        notification: createNotification(),
        recipientEmail: 'invalid-email',
      }
    );

    expect(reason).toBe(
      buildNotificationUndeliverableSkipReason('invalid_recipient_email')
    );
  });

  it('skips blocked recipients returned by the email service', async () => {
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { type: 'MEMBER' as const },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      },
      {
        notification: createNotification(),
        recipientEmail: 'member@tuturuuu.com',
        sendResult: {
          blockedRecipients: [
            {
              details: 'blocked by blacklist',
              email: 'member@tuturuuu.com',
              reason: 'blacklist',
            },
          ],
          error: 'All recipients blocked',
        },
      }
    );

    expect(reason).toBe(
      buildNotificationUndeliverableSkipReason('blocked_recipient_blacklist')
    );
  });

  it('skips blacklisted internal recipient emails before send', async () => {
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { type: 'MEMBER' as const },
                  error: null,
                })),
              })),
            })),
          })),
        })),
        rpc: vi.fn(async (_name: string, args: { p_emails: string[] }) => ({
          data: args.p_emails.map((email) => ({
            email,
            is_blocked: email === 'member@tuturuuu.com',
            reason: null,
          })),
          error: null,
        })),
      },
      {
        notification: createNotification(),
        recipientEmail: 'member@tuturuuu.com',
      }
    );

    expect(reason).toBe(
      buildNotificationUndeliverableSkipReason('blocked_recipient_blacklist')
    );
  });

  it('skips sender-domain verification failures as undeliverable', async () => {
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { type: 'MEMBER' as const },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      },
      {
        errorMessage: 'Sender domain not verified in SES',
        notification: createNotification(),
        recipientEmail: 'member@tuturuuu.com',
      }
    );

    expect(reason).toBe(
      buildNotificationUndeliverableSkipReason('sender_domain_not_verified')
    );
  });
});
