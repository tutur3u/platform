import type { ColumnDef } from '@tanstack/react-table';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { transactionCategoryColumns } from './columns';

const t = (key: string) => key;

function CategoryAmountCell({ amount }: { amount: number }) {
  const columns = transactionCategoryColumns({
    t,
    namespace: 'transaction-category-data-table',
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
          original: {
            is_expense: true,
          },
        },
      } as never)}
    </>
  );
}

function CategoryCountCell({ count }: { count: number }) {
  const columns = transactionCategoryColumns({
    t,
    namespace: 'transaction-category-data-table',
    extraData: {
      currency: 'USD',
    },
  });
  const countColumn = columns.find(
    (column) =>
      (column as ColumnDef<unknown> & { accessorKey?: string }).accessorKey ===
      'transaction_count'
  );

  if (typeof countColumn?.cell !== 'function') return null;

  return (
    <>
      {countColumn.cell({
        row: {
          getValue: (key: string) =>
            key === 'transaction_count' ? count : undefined,
          original: {},
        },
      } as never)}
    </>
  );
}

describe('transactionCategoryColumns', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Secure';
  });

  it('masks the total amount column when finance numbers are globally hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/;Secure';

    render(<CategoryAmountCell amount={123} />);

    expect(screen.getByText('•••••')).toBeVisible();
    expect(screen.queryByText(/\$123/)).not.toBeInTheDocument();
  });

  it('shows the total amount column when finance numbers are globally visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/;Secure';

    render(<CategoryAmountCell amount={123} />);

    await waitFor(() => expect(screen.getByText(/\$123/)).toBeVisible());
    expect(screen.queryByText('•••••')).not.toBeInTheDocument();
  });

  it('masks the transaction count column when finance numbers are globally hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/;Secure';

    render(<CategoryCountCell count={1234} />);

    expect(screen.getByText('•••••')).toBeVisible();
    expect(screen.queryByText('1,234')).not.toBeInTheDocument();
  });

  it('shows the transaction count column when finance numbers are globally visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/;Secure';

    render(<CategoryCountCell count={1234} />);

    await waitFor(() => expect(screen.getByText('1,234')).toBeVisible());
    expect(screen.queryByText('•••••')).not.toBeInTheDocument();
  });
});
