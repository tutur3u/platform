/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import PostsRowActions from './row-actions';

describe('PostsRowActions', () => {
  it('renders a missing check stage without a queued badge when queue_status is undefined', () => {
    render(
      <PostsRowActions
        data={{
          stage: 'missing_check',
          approval_status: undefined,
          queue_status: undefined,
        }}
      />
    );

    expect(screen.getByText('missing_check')).toBeInTheDocument();
    expect(screen.queryByText('queued')).not.toBeInTheDocument();
  });

  it('does not render a queued badge for rejected rows without a queue status', () => {
    render(
      <PostsRowActions
        data={{
          stage: 'rejected',
          approval_status: 'REJECTED',
          queue_status: undefined,
        }}
      />
    );

    expect(screen.getAllByText('rejected')).toHaveLength(2);
    expect(screen.queryByText('queued')).not.toBeInTheDocument();
  });

  it('renders the queued badge when queue_status is explicitly queued', () => {
    render(
      <PostsRowActions
        data={{
          stage: 'queued',
          approval_status: 'APPROVED',
          queue_status: 'queued',
        }}
      />
    );

    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.getAllByText('queued')).toHaveLength(2);
  });
});
