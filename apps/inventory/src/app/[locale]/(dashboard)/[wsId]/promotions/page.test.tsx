import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/operator/inventory-operator-client', () => ({
  InventoryOperatorClient: ({ view, wsId }: { view: string; wsId: string }) => (
    <div data-view={view} data-workspace={wsId} />
  ),
}));

describe('Inventory promotions page', () => {
  it('renders the shared operator console in promotions mode', async () => {
    const { default: InventoryPromotionsPage } = await import('./page');
    const element = await InventoryPromotionsPage({
      params: Promise.resolve({ wsId: 'acme' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-view="promotions"');
    expect(html).toContain('data-workspace="acme"');
  });
});
