import type { TutoringQueueItem } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { canEndWeakSupport } from './tutoring-end-weak-support';

const item = (overrides: Partial<TutoringQueueItem>) =>
  ({
    reason_type: 'WEAK_SUPPORT',
    review_only: false,
    ...overrides,
  }) as TutoringQueueItem;

describe('ending weak support from the queue', () => {
  it('is offered for flagged-feedback weak support', () => {
    expect(canEndWeakSupport(item({}))).toBe(true);
    expect(canEndWeakSupport(item({ reason_type: 'BOTH' }))).toBe(true);
  });

  it('is not offered for needs-tutoring group members, who leave by group removal', () => {
    expect(canEndWeakSupport(item({ support_group: true }))).toBe(false);
    expect(
      canEndWeakSupport(item({ support_group: true, review_only: true }))
    ).toBe(false);
  });

  it('stays offered on a support row that also carries flagged feedback', () => {
    expect(
      canEndWeakSupport(
        item({ support_group: true, source_feedback_id: 'feedback-1' })
      )
    ).toBe(true);
    expect(
      canEndWeakSupport(
        item({
          support_group: true,
          review_only: true,
          content_feedback_id: 'feedback-1',
        })
      )
    ).toBe(true);
  });
});
