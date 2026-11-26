import { cleanup, render, screen } from '@testing-library/react';
import type { Checkout } from '@tuturuuu/payment/polar';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

import Confirmation from './client-component';

afterEach(cleanup);
describe('checkout confirmation totals', () => {
  it.each([
    [0, '$0.00'],
    [950, '$9.50'],
  ])(
    'shows provider total %s instead of pre-discount base amount',
    (totalAmount, formatted) => {
      const checkout = {
        id: 'checkout-reference',
        amount: 1900,
        totalAmount,
        currency: 'usd',
        createdAt: new Date('2026-09-13T00:00:00Z'),
        product: { name: 'Pro' },
      } as Checkout;
      render(<Confirmation wsId="workspace" checkout={checkout} />);
      expect(screen.getByText(formatted)).toBeTruthy();
      expect(screen.queryByText('$19.00')).toBeNull();
      expect(screen.queryByText('Card')).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'success.view-invoices' })
          .getAttribute('href')
      ).toBe('/workspace/billing#billing-history');
      expect(screen.getByText('success.checkout-id')).toBeTruthy();
    }
  );
  it('preserves the full provider amount for zero-decimal VND', () => {
    const checkout = {
      id: 'checkout-vnd',
      totalAmount: 273_900,
      currency: 'vnd',
      createdAt: new Date('2026-11-26T00:00:00Z'),
      product: { name: 'Plus' },
    } as Checkout;
    render(<Confirmation wsId="workspace" checkout={checkout} />);
    const amount = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: 'VND',
    }).format(273_900);
    expect(screen.getByText(amount)).toBeTruthy();
  });
});
