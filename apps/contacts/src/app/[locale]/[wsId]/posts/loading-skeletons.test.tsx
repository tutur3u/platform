/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PostStatusSummarySkeleton,
  PostsTableSkeleton,
} from './loading-skeletons';

describe('daily report loading skeletons', () => {
  it('matches all ten review-stage cards while summary data loads', () => {
    const { container } = render(<PostStatusSummarySkeleton />);

    expect(
      container.querySelectorAll('[class*="rounded-xl"][class*="border"]')
    ).toHaveLength(11);
  });

  it('renders the requested number of stable table rows', () => {
    const { container } = render(<PostsTableSkeleton rows={6} />);

    expect(
      container.querySelectorAll('[class*="last:border-b-0"]')
    ).toHaveLength(6);
  });
});
