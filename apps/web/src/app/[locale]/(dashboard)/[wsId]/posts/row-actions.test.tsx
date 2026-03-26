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
  it('does not render a queued badge when queue_status is undefined', () => {
    render(
      <PostsRowActions
        data={{
          approval_status: 'APPROVED',
          queue_status: undefined,
        }}
      />
    );

    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.queryByText('queued')).not.toBeInTheDocument();
  });

  it('does not render a queued badge for rejected rows without a queue status', () => {
    render(
      <PostsRowActions
        data={{
          approval_status: 'REJECTED',
          queue_status: undefined,
        }}
      />
    );

    expect(screen.getByText('rejected')).toBeInTheDocument();
    expect(screen.queryByText('queued')).not.toBeInTheDocument();
  });

  it('renders the queued badge when queue_status is explicitly queued', () => {
    render(
      <PostsRowActions
        data={{
          approval_status: 'APPROVED',
          queue_status: 'queued',
        }}
      />
    );

    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.getByText('queued')).toBeInTheDocument();
  });
});
