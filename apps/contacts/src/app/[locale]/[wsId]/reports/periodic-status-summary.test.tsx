import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodicStatusSummary } from './periodic-status-summary';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
describe('monthly status filters', () => {
  it('selects approval and delivery filters independently and exposes the active filter', () => {
    const change = vi.fn();
    render(
      <PeriodicStatusSummary
        approval="all"
        delivery="failed"
        onChange={change}
        counts={{
          total: 20,
          approved: 12,
          pendingReview: 5,
          delivered: 8,
          failed: 2,
          blocked: 1,
          draft: 4,
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'failed 2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'approved 12' }));
    expect(change).toHaveBeenLastCalledWith('APPROVED', 'all');
    fireEvent.click(screen.getByRole('button', { name: 'status_sent 8' }));
    expect(change).toHaveBeenLastCalledWith('all', 'sent');
    fireEvent.click(screen.getByRole('button', { name: 'total 20' }));
    expect(change).toHaveBeenLastCalledWith('all', 'all');
  });
});
