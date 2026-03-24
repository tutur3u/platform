import { describe, expect, it } from 'vitest';
import { isPostEmailAgeSkipReason } from './post-email-queue';
import {
  filterAgeSkippedRows,
  filterRowsByRecentPosts,
  getEligibleReenqueuePairIds,
  getQueueIdsForOldPosts,
  getQueueIdsToReenqueue,
  getSentPairIds,
} from './post-email-queue/logic';

describe('getQueueIdsForOldPosts', () => {
  it('returns only queue ids whose posts are older than cutoff', () => {
    const queueRows = [
      { id: 'q1', post_id: 'p1' },
      { id: 'q2', post_id: 'p2' },
      { id: 'q3', post_id: 'p3' },
    ];

    const result = getQueueIdsForOldPosts(queueRows, new Set(['p1', 'p3']));

    expect(result).toEqual(['q1', 'q3']);
  });

  it('returns empty when no post is old', () => {
    const queueRows = [{ id: 'q1', post_id: 'p1' }];

    const result = getQueueIdsForOldPosts(queueRows, new Set(['p2']));

    expect(result).toEqual([]);
  });
});

describe('filterAgeSkippedRows', () => {
  it('keeps only rows with age-based skip reason', () => {
    const rows = [
      {
        id: 'q1',
        post_id: 'p1',
        user_id: 'u1',
        last_error: 'Post older than 60 days',
      },
      {
        id: 'q2',
        post_id: 'p2',
        user_id: 'u2',
        last_error: 'Blocked: blacklist',
      },
      { id: 'q3', post_id: 'p3', user_id: 'u3', last_error: null },
    ];

    const result = filterAgeSkippedRows(rows, isPostEmailAgeSkipReason);

    expect(result).toEqual([{ id: 'q1', post_id: 'p1', user_id: 'u1' }]);
  });

  it('supports age reason variants sharing the same prefix', () => {
    const rows = [
      {
        id: 'q1',
        post_id: 'p1',
        user_id: 'u1',
        last_error: 'Post older than 60 days - auto-skipped',
      },
    ];

    const result = filterAgeSkippedRows(rows, isPostEmailAgeSkipReason);

    expect(result).toEqual([{ id: 'q1', post_id: 'p1', user_id: 'u1' }]);
  });
});

describe('filterRowsByRecentPosts', () => {
  it('removes rows whose posts are not recent anymore', () => {
    const rows = [
      { id: 'q1', post_id: 'p1', user_id: 'u1' },
      { id: 'q2', post_id: 'p2', user_id: 'u2' },
      { id: 'q3', post_id: 'p3', user_id: 'u3' },
    ];

    const result = filterRowsByRecentPosts(rows, new Set(['p2', 'p3']));

    expect(result).toEqual([
      { id: 'q2', post_id: 'p2', user_id: 'u2' },
      { id: 'q3', post_id: 'p3', user_id: 'u3' },
    ]);
  });
});

describe('getEligibleReenqueuePairIds', () => {
  it('requires APPROVED, completed, and valid email', () => {
    const checks = [
      {
        post_id: 'p1',
        user_id: 'u1',
        approval_status: 'APPROVED',
        is_completed: true,
        email: 'good@example.com',
      },
      {
        post_id: 'p1',
        user_id: 'u2',
        approval_status: 'APPROVED',
        is_completed: null,
        email: 'good2@example.com',
      },
      {
        post_id: 'p1',
        user_id: 'u3',
        approval_status: 'REJECTED',
        is_completed: true,
        email: 'good3@example.com',
      },
      {
        post_id: 'p1',
        user_id: 'u4',
        approval_status: 'APPROVED',
        is_completed: true,
        email: 'not-an-email',
      },
    ];

    const result = getEligibleReenqueuePairIds(checks);

    expect([...result]).toEqual(['p1:u1']);
  });

  it('deduplicates repeated checks by pair id', () => {
    const checks = [
      {
        post_id: 'p1',
        user_id: 'u1',
        approval_status: 'APPROVED',
        is_completed: true,
        email: 'good@example.com',
      },
      {
        post_id: 'p1',
        user_id: 'u1',
        approval_status: 'APPROVED',
        is_completed: true,
        email: 'good@example.com',
      },
    ];

    const result = getEligibleReenqueuePairIds(checks);

    expect([...result]).toEqual(['p1:u1']);
  });
});

describe('getSentPairIds', () => {
  it('maps sent rows to pair-id set', () => {
    const sentRows = [
      { post_id: 'p1', receiver_id: 'u1' },
      { post_id: 'p2', receiver_id: 'u2' },
    ];

    const result = getSentPairIds(sentRows);

    expect([...result]).toEqual(['p1:u1', 'p2:u2']);
  });
});

describe('getQueueIdsToReenqueue', () => {
  it('returns only eligible and unsent queue rows', () => {
    const queueRows = [
      { id: 'q1', post_id: 'p1', user_id: 'u1' },
      { id: 'q2', post_id: 'p1', user_id: 'u2' },
      { id: 'q3', post_id: 'p2', user_id: 'u3' },
    ];

    const eligiblePairIds = new Set(['p1:u1', 'p1:u2', 'p2:u3']);
    const sentPairIds = new Set(['p1:u2']);

    const result = getQueueIdsToReenqueue(
      queueRows,
      eligiblePairIds,
      sentPairIds
    );

    expect(result).toEqual(['q1', 'q3']);
  });

  it('filters rows not present in eligible checks', () => {
    const queueRows = [
      { id: 'q1', post_id: 'p1', user_id: 'u1' },
      { id: 'q2', post_id: 'p2', user_id: 'u2' },
    ];

    const result = getQueueIdsToReenqueue(
      queueRows,
      new Set(['p1:u1']),
      new Set()
    );

    expect(result).toEqual(['q1']);
  });

  it('deduplicates queue ids when duplicate rows appear', () => {
    const queueRows = [
      { id: 'q1', post_id: 'p1', user_id: 'u1' },
      { id: 'q1', post_id: 'p1', user_id: 'u1' },
    ];

    const result = getQueueIdsToReenqueue(
      queueRows,
      new Set(['p1:u1']),
      new Set()
    );

    expect(result).toEqual(['q1']);
  });
});

describe('queue re-enqueue interplay', () => {
  it('models end-to-end filtering across queue/checks/sent tables', () => {
    const skippedRows = [
      {
        id: 'q1',
        post_id: 'p1',
        user_id: 'u1',
        last_error: 'Post older than 60 days - auto-skipped',
      },
      {
        id: 'q2',
        post_id: 'p2',
        user_id: 'u2',
        last_error: 'Post older than 60 days',
      },
      {
        id: 'q3',
        post_id: 'p3',
        user_id: 'u3',
        last_error: 'Blocked: blacklist',
      },
    ];

    const ageSkipped = filterAgeSkippedRows(
      skippedRows,
      isPostEmailAgeSkipReason
    );
    const recentRows = filterRowsByRecentPosts(ageSkipped, new Set(['p1']));

    const eligiblePairs = getEligibleReenqueuePairIds([
      {
        post_id: 'p1',
        user_id: 'u1',
        approval_status: 'APPROVED',
        is_completed: true,
        email: 'u1@example.com',
      },
      {
        post_id: 'p2',
        user_id: 'u2',
        approval_status: 'APPROVED',
        is_completed: true,
        email: 'u2@example.com',
      },
    ]);

    const sentPairs = getSentPairIds([{ post_id: 'p1', receiver_id: 'u9' }]);
    const queueIds = getQueueIdsToReenqueue(
      recentRows,
      eligiblePairs,
      sentPairs
    );

    expect(queueIds).toEqual(['q1']);
  });

  it('prevents re-enqueue when recipient was already sent', () => {
    const queueRows = [{ id: 'q1', post_id: 'p1', user_id: 'u1' }];
    const eligiblePairs = new Set(['p1:u1']);
    const sentPairs = getSentPairIds([{ post_id: 'p1', receiver_id: 'u1' }]);

    const queueIds = getQueueIdsToReenqueue(
      queueRows,
      eligiblePairs,
      sentPairs
    );

    expect(queueIds).toEqual([]);
  });
});
