import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceDataState } from './invoice-data-state';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('InvoiceDataState', () => {
  it('announces loading without offering duplicate requests', () => {
    render(<InvoiceDataState loading onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('ws-invoices.loading');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('replaces loading with an actionable retry after failure', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<InvoiceDataState loading onRetry={onRetry} />);
    rerender(<InvoiceDataState loading={false} onRetry={onRetry} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'ws-invoices.load_failed'
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
