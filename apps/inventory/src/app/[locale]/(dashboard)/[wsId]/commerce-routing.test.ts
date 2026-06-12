import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('Inventory commerce route redirects', () => {
  it('redirects legacy checkout pages to the checkout commerce tab', async () => {
    const { default: CheckoutPage } = await import('./checkout/page');
    const { default: CheckoutsPage } = await import('./checkouts/page');

    await expect(
      CheckoutPage({ params: Promise.resolve({ wsId: 'acme' }) })
    ).rejects.toThrow('redirect:/acme/commerce?tab=checkouts');
    await expect(
      CheckoutsPage({ params: Promise.resolve({ wsId: 'acme' }) })
    ).rejects.toThrow('redirect:/acme/commerce?tab=checkouts');
  });

  it('redirects legacy sales to the sales commerce tab', async () => {
    const { default: SalesPage } = await import('./sales/page');

    await expect(
      SalesPage({ params: Promise.resolve({ wsId: 'acme' }) })
    ).rejects.toThrow('redirect:/acme/commerce?tab=sales');
  });
});
