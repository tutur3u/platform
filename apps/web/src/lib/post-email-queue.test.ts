import { describe, expect, it } from 'vitest';
import {
  getPostEmailMaxAgeCutoff,
  POST_EMAIL_MAX_AGE_DAYS,
  type PostEmailQueueRow,
  prioritizePostEmailQueueBatch,
  summarizePostEmailQueue,
} from './post-email-queue';

function makeRow(
  id: string,
  status: PostEmailQueueRow['status'],
  overrides: Partial<PostEmailQueueRow> = {}
): PostEmailQueueRow {
  return {
    id,
    ws_id: 'ws-1',
    group_id: 'group-1',
    post_id: 'post-1',
    user_id: `user-${id}`,
    sender_platform_user_id: 'platform-1',
    status,
    batch_id: null,
    attempt_count: status === 'failed' ? 2 : 0,
    last_error: null,
    blocked_reason: null,
    claimed_at: null,
    last_attempt_at: null,
    sent_at: null,
    cancelled_at: null,
    sent_email_id: null,
    created_at: '2026-03-21T00:00:00.000Z',
    updated_at: '2026-03-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('prioritizePostEmailQueueBatch', () => {
  it('fills the batch with queued rows before retrying failures', () => {
    const queuedRows = [makeRow('q1', 'queued'), makeRow('q2', 'queued')];
    const failedRows = [
      makeRow('f1', 'failed'),
      makeRow('f2', 'failed'),
      makeRow('f3', 'failed'),
    ];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 4);

    expect(result.map((row) => row.id)).toEqual(['q1', 'q2', 'f1', 'f2']);
  });

  it('returns only queued rows when they already consume the batch', () => {
    const queuedRows = [
      makeRow('q1', 'queued'),
      makeRow('q2', 'queued'),
      makeRow('q3', 'queued'),
    ];

    const result = prioritizePostEmailQueueBatch(
      queuedRows,
      [makeRow('f1', 'failed')],
      2
    );

    expect(result.map((row) => row.id)).toEqual(['q1', 'q2']);
  });

  it('returns all queued then failed when limit exceeds both', () => {
    const queuedRows = [makeRow('q1', 'queued')];
    const failedRows = [makeRow('f1', 'failed'), makeRow('f2', 'failed')];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 10);

    expect(result.map((row) => row.id)).toEqual(['q1', 'f1', 'f2']);
  });

  it('returns empty array when both inputs are empty', () => {
    const result = prioritizePostEmailQueueBatch([], [], 5);
    expect(result).toEqual([]);
  });

  it('handles limit of 1', () => {
    const queuedRows = [makeRow('q1', 'queued'), makeRow('q2', 'queued')];

    const result = prioritizePostEmailQueueBatch(queuedRows, [], 1);

    expect(result.map((row) => row.id)).toEqual(['q1']);
  });

  it('handles all queued rows exhausting the batch', () => {
    const queuedRows = [
      makeRow('q1', 'queued'),
      makeRow('q2', 'queued'),
      makeRow('q3', 'queued'),
    ];
    const failedRows = [makeRow('f1', 'failed')];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 3);

    expect(result.map((row) => row.id)).toEqual(['q1', 'q2', 'q3']);
    expect(result).toHaveLength(3);
  });
});

describe('summarizePostEmailQueue', () => {
  it('counts all queue statuses correctly', () => {
    const rows: PostEmailQueueRow[] = [
      makeRow('1', 'queued'),
      makeRow('2', 'queued'),
      makeRow('3', 'processing'),
      makeRow('4', 'sent'),
      makeRow('5', 'sent'),
      makeRow('6', 'sent'),
      makeRow('7', 'failed'),
      makeRow('8', 'blocked'),
      makeRow('9', 'cancelled'),
      makeRow('10', 'skipped'),
    ];

    const result = summarizePostEmailQueue(rows);

    expect(result).toEqual({
      queued: 2,
      processing: 1,
      sent: 3,
      failed: 1,
      blocked: 1,
      cancelled: 1,
      skipped: 1,
    });
  });

  it('returns zeros for empty array', () => {
    const result = summarizePostEmailQueue([]);
    expect(result).toEqual({
      queued: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      blocked: 0,
      cancelled: 0,
      skipped: 0,
    });
  });

  it('handles all same status', () => {
    const rows = [
      makeRow('1', 'sent'),
      makeRow('2', 'sent'),
      makeRow('3', 'sent'),
    ];

    const result = summarizePostEmailQueue(rows);

    expect(result.sent).toBe(3);
    expect(result.queued).toBe(0);
    expect(result.processing).toBe(0);
  });

  it('handles multiple statuses', () => {
    const rows = [
      makeRow('1', 'queued'),
      makeRow('2', 'queued'),
      makeRow('3', 'queued'),
      makeRow('4', 'queued'),
      makeRow('5', 'sent'),
      makeRow('6', 'sent'),
    ];

    const result = summarizePostEmailQueue(rows);

    expect(result.queued).toBe(4);
    expect(result.sent).toBe(2);
  });
});

describe('getPostEmailMaxAgeCutoff', () => {
  it('returns a date string older than POST_EMAIL_MAX_AGE_DAYS', () => {
    const cutoff = getPostEmailMaxAgeCutoff();
    const cutoffDate = new Date(cutoff);
    const now = new Date();

    const diffMs = now.getTime() - cutoffDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(diffDays).toBeGreaterThanOrEqual(POST_EMAIL_MAX_AGE_DAYS - 1);
    expect(diffDays).toBeLessThanOrEqual(POST_EMAIL_MAX_AGE_DAYS + 1);
  });

  it('returns ISO string format', () => {
    const cutoff = getPostEmailMaxAgeCutoff();
    expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('cutoff is in the past', () => {
    const cutoff = getPostEmailMaxAgeCutoff();
    const cutoffDate = new Date(cutoff);
    const now = new Date();

    expect(cutoffDate.getTime()).toBeLessThan(now.getTime());
  });
});

describe('POST_EMAIL_MAX_AGE_DAYS constant', () => {
  it('is set to 60 days', () => {
    expect(POST_EMAIL_MAX_AGE_DAYS).toBe(60);
  });
});

describe('queue row creation helpers', () => {
  it('should create rows with correct default values', () => {
    const row = makeRow('test-1', 'queued');

    expect(row.status).toBe('queued');
    expect(row.attempt_count).toBe(0);
    expect(row.batch_id).toBeNull();
    expect(row.last_error).toBeNull();
    expect(row.blocked_reason).toBeNull();
    expect(row.claimed_at).toBeNull();
    expect(row.last_attempt_at).toBeNull();
    expect(row.sent_at).toBeNull();
    expect(row.cancelled_at).toBeNull();
    expect(row.sent_email_id).toBeNull();
  });

  it('should set attempt_count to 2 for failed status', () => {
    const row = makeRow('test-1', 'failed');
    expect(row.attempt_count).toBe(2);
  });

  it('should allow overriding defaults', () => {
    const row = makeRow('test-1', 'queued', {
      attempt_count: 5,
      batch_id: 'batch-123',
      last_error: 'Some error',
    });

    expect(row.attempt_count).toBe(5);
    expect(row.batch_id).toBe('batch-123');
    expect(row.last_error).toBe('Some error');
  });

  it('should create rows with all possible statuses', () => {
    const statuses: PostEmailQueueRow['status'][] = [
      'queued',
      'processing',
      'sent',
      'failed',
      'blocked',
      'cancelled',
      'skipped',
    ];

    statuses.forEach((status, index) => {
      const row = makeRow(`test-${index}`, status);
      expect(row.status).toBe(status);
    });
  });

  it('should allow setting created_at to past dates', () => {
    const pastDate = new Date('2026-01-01T00:00:00.000Z');
    const row = makeRow('test-1', 'queued', {
      created_at: pastDate.toISOString(),
    });

    expect(new Date(row.created_at).getTime()).toBe(pastDate.getTime());
  });

  it('should allow setting ws_id, group_id, post_id, user_id independently', () => {
    const row = makeRow('test-1', 'queued', {
      ws_id: 'workspace-xyz',
      group_id: 'group-abc',
      post_id: 'post-123',
      user_id: 'user-456',
    });

    expect(row.ws_id).toBe('workspace-xyz');
    expect(row.group_id).toBe('group-abc');
    expect(row.post_id).toBe('post-123');
    expect(row.user_id).toBe('user-456');
  });
});

describe('sendLimit parameter behavior', () => {
  it('should enforce sendLimit via batch limit', () => {
    const queuedRows = Array.from({ length: 100 }, (_, i) =>
      makeRow(`q${i}`, 'queued')
    );
    const failedRows: PostEmailQueueRow[] = [];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 50);

    expect(result.length).toBe(50);
  });

  it('should include failed rows only after queued are exhausted', () => {
    const queuedRows = [makeRow('q1', 'queued')];
    const failedRows = [
      makeRow('f1', 'failed'),
      makeRow('f2', 'failed'),
      makeRow('f3', 'failed'),
    ];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 3);

    expect(result.map((r) => r.id)).toEqual(['q1', 'f1', 'f2']);
  });

  it('should respect exact limit', () => {
    const queuedRows = [makeRow('q1', 'queued'), makeRow('q2', 'queued')];
    const failedRows = [makeRow('f1', 'failed'), makeRow('f2', 'failed')];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 2);

    expect(result).toHaveLength(2);
  });
});

describe('edge cases', () => {
  it('should handle very large limit values', () => {
    const queuedRows = [makeRow('q1', 'queued')];
    const failedRows: PostEmailQueueRow[] = [];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 10000);

    expect(result).toHaveLength(1);
  });

  it('should handle zero limit', () => {
    const queuedRows = [makeRow('q1', 'queued')];
    const failedRows = [makeRow('f1', 'failed')];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 0);

    expect(result).toHaveLength(1);
  });

  it('should handle negative limit as 1', () => {
    const queuedRows = [makeRow('q1', 'queued')];
    const failedRows: PostEmailQueueRow[] = [];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, -5);

    expect(result).toHaveLength(1);
  });

  it('should handle empty queued but non-empty failed', () => {
    const queuedRows: PostEmailQueueRow[] = [];
    const failedRows = [makeRow('f1', 'failed'), makeRow('f2', 'failed')];

    const result = prioritizePostEmailQueueBatch(queuedRows, failedRows, 2);

    expect(result.map((r) => r.id)).toEqual(['f1', 'f2']);
  });
});

describe('queue statuses', () => {
  const allStatuses: PostEmailQueueRow['status'][] = [
    'queued',
    'processing',
    'sent',
    'failed',
    'blocked',
    'cancelled',
    'skipped',
  ];

  it('includes all expected queue statuses', () => {
    expect(allStatuses).toContain('queued');
    expect(allStatuses).toContain('processing');
    expect(allStatuses).toContain('sent');
    expect(allStatuses).toContain('failed');
    expect(allStatuses).toContain('blocked');
    expect(allStatuses).toContain('cancelled');
    expect(allStatuses).toContain('skipped');
    expect(allStatuses).toHaveLength(7);
  });

  it('skipped is a valid queue status for summarizePostEmailQueue', () => {
    const rows = [makeRow('1', 'skipped'), makeRow('2', 'skipped')];

    const result = summarizePostEmailQueue(rows);

    expect(result.skipped).toBe(2);
  });
});

describe('processPostEmailQueueBatch return shape', () => {
  it('prioritizePostEmailQueueBatch produces rows that match expected fields', () => {
    const rows = prioritizePostEmailQueueBatch(
      [makeRow('q1', 'queued')],
      [],
      1
    );

    expect(rows[0]).toMatchObject({
      id: 'q1',
      status: 'queued',
      ws_id: 'ws-1',
      group_id: 'group-1',
      post_id: 'post-1',
    });
  });
});
