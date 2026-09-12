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
    fireEvent.click(screen.getByRole('button', { name: 'unapproved 8' }));
    expect(change).toHaveBeenLastCalledWith('UNAPPROVED', 'all', 'all');
    fireEvent.click(screen.getByRole('button', { name: 'approved 12' }));
    expect(change).toHaveBeenLastCalledWith('APPROVED', 'all', 'all');
    fireEvent.click(screen.getByRole('button', { name: 'status_sent 8' }));
    expect(change).toHaveBeenLastCalledWith('all', 'sent', 'all');
    fireEvent.click(screen.getByRole('button', { name: 'drafts 4' }));
    expect(change).toHaveBeenLastCalledWith('all', 'all', 'draft');
    fireEvent.click(screen.getByRole('button', { name: 'show_all_reports' }));
    expect(change).toHaveBeenLastCalledWith('all', 'all', 'all');
  });
  it('restores unapproved reports from the total view and renders its toolbar', () => {
    const change = vi.fn();
    render(
      <PeriodicStatusSummary
        approval="all"
        delivery="all"
        onChange={change}
        toolbar={<button type="button">Date range</button>}
      />
    );
    expect(screen.getByText('total_reports')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'show_all_reports' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'unapproved' }));
    expect(change).toHaveBeenCalledWith('UNAPPROVED', 'all', 'all');
    expect(
      screen.getByRole('button', { name: 'Date range' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });
});
