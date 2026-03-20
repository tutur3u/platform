import { describe, expect, it } from 'vitest';
import {
  type PostEmailQueueRow,
  prioritizePostEmailQueueBatch,
} from './post-email-queue';

function makeRow(
  id: string,
  status: PostEmailQueueRow['status']
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
});
