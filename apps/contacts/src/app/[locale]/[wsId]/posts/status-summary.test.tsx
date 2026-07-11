/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostStatusSummary } from './status-summary';
import type { PostEmailStatusSummary } from './types';

const setQueryStateMock = vi.fn();
const queryStateMock = {
  approvalStatus: null,
  cursor: null,
  excludedGroups: [],
  includedGroups: [],
  page: 1,
  pageSize: 10,
  queueStatus: null,
  showAll: null,
  stage: null,
  userId: null,
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('nuqs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nuqs')>();

  return {
    ...actual,
    useQueryStates: () => [queryStateMock, setQueryStateMock],
  };
});

const summary: PostEmailStatusSummary = {
  approvals: {
    approved: 4,
    pending: 2,
    rejected: 1,
    skipped: 0,
  },
  queue: {
    blocked: 0,
    cancelled: 0,
    failed: 0,
    processing: 0,
    queued: 1,
    sent: 3,
    skipped: 0,
  },
  stages: {
    approved_awaiting_delivery: 4,
    delivery_failed: 0,
    missing_check: 5,
    pending_approval: 2,
    processing: 0,
    queued: 1,
    rejected: 1,
    sent: 3,
    skipped: 0,
    undeliverable: 1,
  },
  total: 17,
};

describe('PostStatusSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces the current stage when a stage card is clicked', () => {
    render(
      <PostStatusSummary
        activeStage="sent"
        filteredCount={3}
        summary={summary}
      />
    );

    fireEvent.click(screen.getByText('pending_approval'));

    expect(setQueryStateMock).toHaveBeenCalledWith({
      page: 1,
      showAll: null,
      stage: 'pending_approval',
    });
  });

  it('uses a five-column grid on lg and above', () => {
    const { container } = render(
      <PostStatusSummary
        activeStage="sent"
        filteredCount={3}
        summary={summary}
      />
    );

    expect(container.querySelector('.lg\\:grid-cols-5')).not.toBeNull();
  });

  it('clears stage when show all recipients is clicked', () => {
    render(
      <PostStatusSummary
        activeStage="queued"
        filteredCount={1}
        summary={summary}
      />
    );

    fireEvent.click(screen.getByText('show_all_recipients'));

    expect(setQueryStateMock).toHaveBeenCalledWith({
      page: 1,
      showAll: true,
      stage: null,
    });
  });

  it('restores the default actionable stage when requested', () => {
    render(
      <PostStatusSummary
        activeStage="sent"
        filteredCount={3}
        summary={summary}
      />
    );

    fireEvent.click(screen.getByText('show_actionable_queue'));

    expect(setQueryStateMock).toHaveBeenCalledWith({
      page: 1,
      showAll: null,
      stage: 'pending_approval',
    });
  });
});
