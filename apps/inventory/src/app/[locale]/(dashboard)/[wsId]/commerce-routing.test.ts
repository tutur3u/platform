import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  })
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
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

  it('renders sales as a first-class Inventory workspace', async () => {
    const { default: SalesPage } = await import('./sales/page');

    const page = await SalesPage({
      params: Promise.resolve({ wsId: 'acme' }),
    });

    expect(page.props).toMatchObject({ view: 'sales', wsId: 'acme' });
  });

  it('redirects the legacy Commerce sales tab to first-class Sales', async () => {
    const { default: CommercePage } = await import('./commerce/page');

    await expect(
      CommercePage({
        params: Promise.resolve({ wsId: 'acme' }),
        searchParams: Promise.resolve({ tab: 'sales' }),
      })
    ).rejects.toThrow('redirect:/acme/sales');
  });
});
