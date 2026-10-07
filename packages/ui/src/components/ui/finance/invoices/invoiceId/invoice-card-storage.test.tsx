import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import InvoiceCard from './invoice-card';

const capture = vi.hoisted(() => vi.fn());
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('html2canvas-pro', () => ({ default: capture }));
vi.mock('../../shared/use-finance-confidential-visibility', () => ({
  useFinanceConfidentialVisibility: () => ({ isConfidential: false }),
}));
const invoice: ComponentProps<typeof InvoiceCard>['invoice'] = {
  category_id: 'synthetic-category',
  completed_at: null,
  creator_id: null,
  customer_id: null,
  note: null,
  notice: null,
  paid_amount: 0,
  platform_creator_id: null,
  subscription_months: null,
  transaction_id: null,
  valid_until: null,
  wallet_id: 'synthetic-wallet',
  ws_id: 'synthetic-workspace',
  id: 'synthetic-invoice',
  created_at: '2026-10-01T10:00:00Z',
  price: 0,
  total_diff: 0,
  customer_display_name: 'Synthetic customer',
  customer_full_name: null,
  wallet: null,
  creator: null,
};
beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  capture.mockResolvedValue({
    toBlob: (callback: BlobCallback) => callback(null),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  capture.mockReset();
  window.history.replaceState({}, '', '/');
});
for (const kind of ['getItem', 'getter'])
  it(`renders the actual invoice and enters PNG export after ${kind} denial`, async () => {
    const storage = window.localStorage;
    if (kind === 'getItem')
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw new DOMException('Synthetic denied storage', 'SecurityError');
      });
    else
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Synthetic denied getter', 'SecurityError');
        },
      });
    window.history.replaceState({}, '', '/?image=true');
    try {
      render(
        <InvoiceCard
          lang="en"
          configs={[]}
          invoice={invoice}
          products={[]}
          promotions={[]}
        />
      );
      expect(
        await screen.findByRole('tab', { name: 'invoices.full' })
      ).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Synthetic customer')).toBeInTheDocument();
      await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
      expect(capture.mock.calls[0]?.[0]).toBe(
        document.getElementById('printable-area')
      );
      await waitFor(() => expect(window.location.search).toBe(''));
    } finally {
      if (kind === 'getter')
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          writable: true,
          value: storage,
        });
    }
  });
it('retains a valid saved compact preference in the actual invoice', async () => {
  window.localStorage.setItem('invoice-compact-view', 'true');
  render(
    <InvoiceCard
      lang="en"
      configs={[]}
      invoice={invoice}
      products={[]}
      promotions={[]}
    />
  );
  expect(
    await screen.findByRole('tab', { name: 'invoices.compact' })
  ).toHaveAttribute('aria-selected', 'true');
  expect(capture).not.toHaveBeenCalled();
});
