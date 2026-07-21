import type { ColumnDef } from '@tanstack/react-table';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoiceColumns } from './columns';

vi.mock('@tuturuuu/ui/finance/invoices/row-actions', () => ({
  InvoiceRowActions: () => null,
}));

const t = (key: string) => key;

function InvoicePriceCell({ price }: { price: number }) {
  const columns = invoiceColumns({
    t,
    namespace: 'invoice-data-table',
    extraData: {
      currency: 'USD',
    },
  });
  const priceColumn = columns.find(
    (column) =>
      (column as ColumnDef<unknown> & { accessorKey?: string }).accessorKey ===
      'price'
  );

  if (typeof priceColumn?.cell !== 'function') return null;

  return (
    <>
      {priceColumn.cell({
        row: {
          getValue: (key: string) => (key === 'price' ? price : undefined),
          original: {},
        },
      } as never)}
    </>
  );
}

describe('invoiceColumns', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Secure';
  });

  it('masks amount columns when finance numbers are globally hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/;Secure';

    render(<InvoicePriceCell price={123} />);

    expect(screen.getByText('•••••')).toBeVisible();
    expect(screen.queryByText(/\$123/)).not.toBeInTheDocument();
  });

  it('shows amount columns when finance numbers are globally visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/;Secure';

    render(<InvoicePriceCell price={123} />);

    await waitFor(() => expect(screen.getByText(/\$123/)).toBeVisible());
    expect(screen.queryByText('•••••')).not.toBeInTheDocument();
  });
});
