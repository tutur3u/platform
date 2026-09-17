import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  confidential: false,
  toggleConfidential: vi.fn(),
}));
vi.mock('../shared/use-finance-confidential-visibility', () => ({
  FINANCE_HIDDEN_AMOUNT: '•••••',
  useFinanceConfidentialVisibility: () => ({
    isConfidential: mocks.confidential,
    toggleConfidential: mocks.toggleConfidential,
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: (data: unknown) => data,
  useQuery: mocks.query,
  useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
  useQueryClient: () => ({}),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => true }),
  useFormatter: () => ({
    dateTime: () => 'Sep 16, 2026',
    number: (value: number) => String(value),
  }),
}));
vi.mock('@tuturuuu/internal-api/finance', () => ({
  getInvoiceHistory: vi.fn(),
  restoreInvoice: vi.fn(),
}));

import { InvoiceHistory } from './invoice-history';

const entry = {
  id: '1',
  occurred_at: '2026-09-16T11:30:00Z',
  operation: 'DELETE',
  entity_type: 'invoice',
  invoice_id: 'invoice-id',
  actor_name: 'Actor',
  customer_name: 'Customer',
  changed_fields: [],
  can_restore: true,
  is_deleted: true,
  amount: 100,
  currency: 'VND',
};
describe('InvoiceHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confidential = false;
    mocks.query.mockReturnValue({
      data: { data: [entry], hasMore: false },
      isPending: false,
      isError: false,
      refetch: mocks.refetch,
    });
  });
  it('opens with deleted invoices highlighted for administrator review', () => {
    render(<InvoiceHistory wsId="workspace" canRestore />);
    expect(mocks.query.mock.calls[0]?.[0].queryKey[2]).toBe(true);
    expect(screen.getByText('recovery_review_title')).toBeInTheDocument();
    expect(screen.getByText('100 VND')).toBeInTheDocument();
    expect(screen.getByText('recovery_ready')).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'activity_show_all' }));
    expect(mocks.query.mock.lastCall?.[0].queryKey[2]).toBe(false);
  });
  it('respects finance amount visibility in the audit trail', () => {
    mocks.confidential = true;
    render(<InvoiceHistory wsId="workspace" canRestore />);
    expect(screen.queryByText('100 VND')).not.toBeInTheDocument();
    expect(screen.getByText('••••• VND')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'show_confidential' }));
    expect(mocks.toggleConfidential).toHaveBeenCalledOnce();
  });
  it('requires confirmation before restoring the invoice and payment', () => {
    render(<InvoiceHistory wsId="workspace" canRestore />);
    fireEvent.click(screen.getByRole('button', { name: 'restore_invoice' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'recovery_confirmation'
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'restore_invoice' }).at(-1)!
    );
    expect(mocks.mutate).toHaveBeenCalledWith('invoice-id');
  });
  it('does not offer restoration without mutation permission', () => {
    render(<InvoiceHistory wsId="workspace" canRestore={false} />);
    expect(
      screen.queryByRole('button', { name: 'restore_invoice' })
    ).not.toBeInTheDocument();
  });
  it('explains older deletions that lack a recovery snapshot', () => {
    mocks.query.mockReturnValue({
      data: { data: [{ ...entry, can_restore: false }] },
    });
    render(<InvoiceHistory wsId="workspace" canRestore />);
    expect(screen.getByText('recovery_unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'restore_invoice' })
    ).not.toBeInTheDocument();
  });
  it('uses server lookahead instead of guessing from a full page', () => {
    mocks.query.mockReturnValue({
      data: {
        data: Array.from({ length: 25 }, (_, id) => ({
          ...entry,
          id: String(id),
        })),
        hasMore: false,
      },
    });
    render(<InvoiceHistory wsId="workspace" canRestore />);
    expect(
      screen.getAllByRole('button', { name: 'activity_next' })[0]!
    ).toBeDisabled();
  });
  it('pages forward and resets to the first page when searching', () => {
    mocks.query.mockReturnValue({ data: { data: [entry], hasMore: true } });
    render(<InvoiceHistory wsId="workspace" canRestore />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'activity_next' })[0]!
    );
    expect(mocks.query.mock.lastCall?.[0].queryKey[3]).toBe(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'activity_search' }), {
      target: { value: 'Customer' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'activity_search_action' })
    );
    expect(mocks.query.mock.lastCall?.[0].queryKey[3]).toBe(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'activity_clear_filters' })
    );
    expect(
      screen.getByRole('textbox', { name: 'activity_search' })
    ).toHaveValue('');
  });
  it('keeps results visible but blocks stale restoration and paging while fetching', () => {
    mocks.query.mockReturnValue({
      data: { data: [entry], hasMore: true },
      isFetching: true,
      isPlaceholderData: true,
    });
    render(<InvoiceHistory wsId="workspace" canRestore />);
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'restore_invoice' })
    ).toBeDisabled();
    expect(
      screen.getAllByRole('button', { name: 'activity_next' })[0]!
    ).toBeDisabled();
    expect(screen.getByText('activity_loading')).toBeInTheDocument();
  });
  it('offers retry rather than presenting an error as empty history', () => {
    mocks.query.mockReturnValue({ isError: true, refetch: mocks.refetch });
    render(<InvoiceHistory wsId="workspace" canRestore />);
    fireEvent.click(screen.getByRole('button', { name: 'activity_retry' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText('activity_empty')).not.toBeInTheDocument();
  });
});
