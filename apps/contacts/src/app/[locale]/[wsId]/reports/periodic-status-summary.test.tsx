import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  PERIODIC_STAGES,
  PeriodicStatusSummary,
} from './periodic-status-summary';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
it('shows all ten stages and selects each independently', () => {
  const change = vi.fn();
  const stages = Object.fromEntries(
    PERIODIC_STAGES.map(([stage]) => [stage, 2])
  ) as Record<(typeof PERIODIC_STAGES)[number][0], number>;
  render(
    <PeriodicStatusSummary
      stage="pending"
      onChange={change}
      counts={{
        total: 20,
        draft: 2,
        pendingReview: 2,
        approved: 2,
        blocked: 2,
        delivered: 2,
        failed: 2,
        stages,
      }}
    />
  );
  expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(9);
  expect(
    screen.getByRole('button', { name: 'status_pending 2' })
  ).toHaveAttribute('aria-pressed', 'true');
  for (const [stage, label] of PERIODIC_STAGES) {
    fireEvent.click(screen.getByRole('button', { name: `${label} 2` }));
    expect(change).toHaveBeenLastCalledWith(stage);
  }
  fireEvent.click(screen.getByRole('button', { name: 'show_all_reports' }));
  expect(change).toHaveBeenLastCalledWith('all');
});
it('restores pending and keeps the toolbar accessible without counts', () => {
  const change = vi.fn();
  render(
    <PeriodicStatusSummary
      stage="all"
      onChange={change}
      toolbar={<button type="button">Date range</button>}
    />
  );
  expect(
    screen.getByRole('region', { name: 'report_status' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'status_pending' }));
  expect(change).toHaveBeenCalledWith('pending');
  expect(
    screen.getByRole('button', { name: 'Date range' })
  ).toBeInTheDocument();
  expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
});
