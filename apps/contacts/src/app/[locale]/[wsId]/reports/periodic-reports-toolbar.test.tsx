import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PeriodicReportsToolbar } from './periodic-reports-toolbar';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
it('counts the draft filter and makes it visible and resettable alongside approval', async () => {
  const reset = vi.fn();
  render(
    <PeriodicReportsToolbar
      generationStatus="draft"
      approvalStatus="APPROVED"
      cadence="monthly"
      deliveryStatus="all"
      onApprovalStatusChange={vi.fn()}
      onCadenceChange={vi.fn()}
      onDeliveryStatusChange={vi.fn()}
      onQueryChange={vi.fn()}
      onReset={reset}
      onSortChange={vi.fn()}
      query=""
      isSearching={false}
      resultCount={1}
      sortBy="period"
      sortDirection="desc"
    />
  );
  const filters = screen.getByRole('button', { name: 'common.filters' });
  expect(filters).toHaveTextContent('2');
  fireEvent.click(filters);
  expect(await screen.findByText('drafts')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'common.reset' }));
  expect(reset).toHaveBeenCalledOnce();
});

it('does not count the default pending stage as a resettable filter', async () => {
  const props = {
    stageLabel: 'Pending approval',
    approvalStatus: 'all' as const,
    cadence: 'monthly' as const,
    deliveryStatus: 'all' as const,
    onApprovalStatusChange: vi.fn(),
    onCadenceChange: vi.fn(),
    onDeliveryStatusChange: vi.fn(),
    onQueryChange: vi.fn(),
    onReset: vi.fn(),
    onSortChange: vi.fn(),
    query: '',
    isSearching: false,
    resultCount: 0,
    sortBy: 'period' as const,
    sortDirection: 'desc' as const,
  };
  const { rerender } = render(<PeriodicReportsToolbar {...props} />);
  expect(
    screen.getByRole('button', { name: 'common.filters' })
  ).not.toHaveTextContent('1');
  expect(
    screen.queryByRole('button', { name: 'common.reset' })
  ).not.toBeInTheDocument();
  rerender(
    <PeriodicReportsToolbar {...props} stageLabel="Skipped" stageChanged />
  );
  expect(
    screen.getByRole('button', { name: 'common.filters' })
  ).toHaveTextContent('1');
  fireEvent.click(screen.getByRole('button', { name: 'common.filters' }));
  expect(
    await screen.findByRole('button', { name: 'common.reset' })
  ).toBeInTheDocument();
});
