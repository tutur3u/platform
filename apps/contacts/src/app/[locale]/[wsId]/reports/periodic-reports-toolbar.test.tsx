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
