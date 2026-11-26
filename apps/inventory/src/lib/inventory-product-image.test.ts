import { describe, expect, it } from 'vitest';
import {
  inventoryProductImageRoute,
  inventoryProductImageSrc,
  inventoryUploadStoredValue,
  isInventoryProductImagePath,
  resolveInventoryProductImagePath,
} from './inventory-product-image';

const WS = '82cf845a-49b0-459d-a5ee-1005e8de4fae';
const IMAGE = 'inventory/media/product-featured-image/upload-id-a.png';

describe('inventory product image paths', () => {
  it('accepts only one object under the product image prefix', () => {
    expect(isInventoryProductImagePath(IMAGE)).toBe(true);
    for (const path of [
      'inventory/media/product-featured-image/',
      'inventory/media/product-featured-image/a/b.png',
      'inventory/media/product-featured-image/../a.png',
      'inventory/media/product-featured-image/a%2fb.png',
      'inventory/media/listing-image/a.png',
      'drive/a.png',
    ]) {
      expect(isInventoryProductImagePath(path), path).toBe(false);
    }
  });

  it('resolves share URLs, relative or absolute, for the workspace', () => {
    const relative = `/api/v1/workspaces/${WS}/storage/share?path=${encodeURIComponent(IMAGE)}`;
    expect(resolveInventoryProductImagePath(relative, WS)).toBe(IMAGE);
    expect(
      resolveInventoryProductImagePath(`https://tuturuuu.com${relative}`, WS)
    ).toBe(IMAGE);
    expect(
      resolveInventoryProductImagePath(
        `https://tuturuuu.com${relative}`,
        '11111111-2222-4333-8444-555555555555'
      )
    ).toBeNull();
  });

  it('resolves signed object URLs by their workspace key', () => {
    expect(
      resolveInventoryProductImagePath(
        `https://x.supabase.co/storage/v1/object/sign/workspaces/${WS}/${IMAGE}?token=t`,
        WS
      )
    ).toBe(IMAGE);
    expect(
      resolveInventoryProductImagePath(
        `https://bucket.r2.example.com/${WS}/${IMAGE}?X-Amz-Signature=s`,
        WS
      )
    ).toBe(IMAGE);
    expect(
      resolveInventoryProductImagePath(`http://x.example/${WS}/${IMAGE}`, WS)
    ).toBeNull();
  });

  it('routes workspace images through the product route, others as stored', () => {
    const share = `https://tuturuuu.com/api/v1/workspaces/${WS}/storage/share?path=${encodeURIComponent(IMAGE)}`;
    expect(
      inventoryProductImageSrc({ avatarUrl: share, productId: 'p-1', wsId: WS })
    ).toBe(inventoryProductImageRoute(WS, 'p-1'));
    expect(
      inventoryProductImageSrc({
        avatarUrl: 'https://cdn.tuturuuu.com/a.png',
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe('https://cdn.tuturuuu.com/a.png');
    expect(
      inventoryProductImageSrc({ avatarUrl: share, productId: null, wsId: WS })
    ).toBe(share);
    expect(
      inventoryProductImageSrc({ avatarUrl: null, productId: 'p', wsId: WS })
    ).toBeNull();
  });

  it('stores product uploads as share URLs and other media as uploaded', () => {
    const stored = inventoryUploadStoredValue({
      path: IMAGE,
      platformOrigin: 'https://tuturuuu.com',
      readUrl: 'https://storage.example/signed',
      target: 'product-featured-image',
      wsId: WS,
    });
    expect(stored).toBe(
      `https://tuturuuu.com/api/v1/workspaces/${WS}/storage/share?path=${encodeURIComponent(IMAGE)}`
    );
    expect(resolveInventoryProductImagePath(stored, WS)).toBe(IMAGE);
    expect(
      inventoryUploadStoredValue({
        path: 'inventory/media/storefront-banner/a.png',
        platformOrigin: 'https://tuturuuu.com',
        readUrl: 'https://storage.example/banner',
        target: 'storefront-banner',
        wsId: WS,
      })
    ).toBe('https://storage.example/banner');
  });
});
