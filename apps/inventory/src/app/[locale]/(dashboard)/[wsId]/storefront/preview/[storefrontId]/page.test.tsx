import { describe, expect, it, vi } from 'vitest';
import InventoryStorefrontPreviewRoute from './page';

const previewMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('@/components/operator/storefront-preview-page', () => ({
  StorefrontPreviewPage: previewMock,
}));

describe('InventoryStorefrontPreviewRoute', () => {
  it('passes the workspace and storefront ids into the preview shell', async () => {
    const element = await InventoryStorefrontPreviewRoute({
      params: Promise.resolve({
        storefrontId: 'storefront_123',
        wsId: 'workspace_123',
      }),
    });

    expect(element.type).toBe(previewMock);
    expect(element.props).toEqual({
      storefrontId: 'storefront_123',
      wsId: 'workspace_123',
    });
  });
});
