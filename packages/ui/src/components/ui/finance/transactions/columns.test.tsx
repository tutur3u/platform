import type { ColumnDef } from '@tanstack/react-table';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transactionColumns } from './columns';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}));

vi.mock('@tuturuuu/ui/finance/transactions/row-actions', () => ({
  TransactionRowActions: () => null,
}));

const t = (key: string) => key;

function TransactionAmountCell({ amount }: { amount: number }) {
  const columns = transactionColumns({
    t,
    namespace: 'transaction-data-table',
    extraData: {
      currency: 'USD',
    },
  });
  const amountColumn = columns.find(
    (column) =>
      (column as ColumnDef<unknown> & { accessorKey?: string }).accessorKey ===
      'amount'
  );

  if (typeof amountColumn?.cell !== 'function') return null;

  return (
    <>
      {amountColumn.cell({
        row: {
          getValue: (key: string) => (key === 'amount' ? amount : undefined),
          original: {},
        },
      } as never)}
    </>
  );
}

function TransactionColumnCell({
  accessorKey,
  original,
}: {
  accessorKey: string;
  original: Record<string, unknown>;
}) {
  const columns = transactionColumns({
    t,
    namespace: 'transaction-data-table',
    extraData: {
      currency: 'USD',
    },
  });
  const column = columns.find(
    (item) =>
      (item as ColumnDef<unknown> & { accessorKey?: string }).accessorKey ===
      accessorKey
  );

  if (typeof column?.cell !== 'function') return null;

  return (
    <>
      {column.cell({
        row: {
          getValue: (key: string) => original[key],
          original,
        },
      } as never)}
    </>
  );
}

describe('transactionColumns', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('masks the amount column when finance numbers are globally hidden', () => {
    render(<TransactionAmountCell amount={123} />);

    expect(screen.getByText('•••••')).toBeVisible();
    expect(screen.queryByText(/\$123/)).not.toBeInTheDocument();
  });

  it('shows the amount column when finance numbers are globally visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    render(<TransactionAmountCell amount={123} />);

    await waitFor(() => expect(screen.getByText(/\+\$123/)).toBeVisible());
    expect(screen.queryByText('•••••')).not.toBeInTheDocument();
  });

  it('falls back to raw RPC wallet and category names in overview rows', () => {
    render(
      <>
        <TransactionColumnCell
          accessorKey="wallet"
          original={{ wallet_name: 'Cash' }}
        />
        <TransactionColumnCell
          accessorKey="description"
          original={{ category_name: 'Food & Beverage' }}
        />
      </>
    );

    expect(screen.getByText('Cash')).toBeVisible();
    expect(screen.getByText('Food & Beverage')).toBeVisible();
  });
});
