import { describe, expect, it } from 'vitest';
import { EASY_CENTER_TUTORING_POLICY } from './tutoring-policy';
import {
  isWeakContentReviewDue,
  unchangedFeedbackSince,
} from './tutoring-queue-rules';

describe('weak tutoring content review', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');

  it('alerts after the configured interval with unchanged teacher content', () => {
    const since = unchangedFeedbackSince([
      { content: 'Practice Unit 3', createdAt: '2026-09-26T12:00:00Z' },
      { content: 'Practice  Unit 3', createdAt: '2026-09-12T12:00:00Z' },
    ]);
    expect(since).toBe('2026-09-12T12:00:00Z');
    expect(
      isWeakContentReviewDue(EASY_CENTER_TUTORING_POLICY, since, now)
    ).toBe(true);
  });

  it('resets the interval when the content changes and can be disabled', () => {
    const since = unchangedFeedbackSince([
      { content: 'New lesson', createdAt: '2026-09-26T12:00:00Z' },
      { content: 'Old lesson', createdAt: '2026-09-01T12:00:00Z' },
    ]);
    expect(since).toBe('2026-09-26T12:00:00Z');
    expect(
      isWeakContentReviewDue(EASY_CENTER_TUTORING_POLICY, since, now)
    ).toBe(false);
    expect(
      isWeakContentReviewDue(
        { ...EASY_CENTER_TUTORING_POLICY, weakContentReviewDays: 0 },
        '2026-01-01T00:00:00Z',
        now
      )
    ).toBe(false);
  });
});
