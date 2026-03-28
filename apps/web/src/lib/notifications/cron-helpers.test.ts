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
  const notification = {
    created_at: '2026-03-28T00:00:00.000Z',
    id: 'notification-1',
    scope: 'workspace',
    user_id: 'user-1',
    ws_id: 'ws-1',
  };

  it('prefers age-based skip before any other checks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));

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
        notification,
        recipientEmail: 'member@tuturuuu.com',
      }
    );

    expect(reason).toBe(NOTIFICATION_OLDER_THAN_ONE_DAY_SKIP_REASON);
    vi.useRealTimers();
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
        notification,
        recipientEmail: 'member@example.com',
      }
    );

    expect(reason).toBe(NOTIFICATION_STALE_WORKSPACE_MEMBERSHIP_SKIP_REASON);
  });

  it('skips non-internal recipient emails', async () => {
    const reason = await getNotificationSkipReason(
      {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { user_id: 'user-1' },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      },
      {
        notification,
        recipientEmail: 'member@example.com',
      }
    );

    expect(reason).toBe(
      buildNotificationUndeliverableSkipReason('external_recipient_domain')
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
                  data: { user_id: 'user-1' },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      },
      {
        notification,
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
                  data: { user_id: 'user-1' },
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
        notification,
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
                  data: { user_id: 'user-1' },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      },
      {
        errorMessage: 'Sender domain not verified in SES',
        notification,
        recipientEmail: 'member@tuturuuu.com',
      }
    );

    expect(reason).toBe(
      buildNotificationUndeliverableSkipReason('sender_domain_not_verified')
    );
  });
});
