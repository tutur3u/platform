import { describe, expect, it } from 'vitest';
import {
  inventoryUploadStoredValue,
  isInventoryProductImagePath,
  parseStoredInventoryProductImage,
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

  it('accepts slug aliases only when the caller passes them', () => {
    const slugged = `https://tuturuuu.com/api/v1/workspaces/personal/storage/share?path=${encodeURIComponent(IMAGE)}`;
    expect(resolveInventoryProductImagePath(slugged, WS)).toBeNull();
    expect(resolveInventoryProductImagePath(slugged, WS, ['personal'])).toBe(
      IMAGE
    );
    expect(parseStoredInventoryProductImage(slugged)).toEqual({
      path: IMAGE,
      workspace: 'personal',
    });
  });

  it('stores product uploads as share URLs and other media as uploaded', () => {
    const stored = inventoryUploadStoredValue({
      fullPath: `${WS}/${IMAGE}`,
      path: IMAGE,
      platformOrigin: 'https://tuturuuu.com',
      readUrl: 'https://storage.example/signed',
      target: 'product-featured-image',
    });
    expect(stored).toBe(
      `https://tuturuuu.com/api/v1/workspaces/${WS}/storage/share?path=${encodeURIComponent(IMAGE)}`
    );
    expect(resolveInventoryProductImagePath(stored, WS)).toBe(IMAGE);
    expect(
      inventoryUploadStoredValue({
        fullPath: `${WS}/inventory/media/storefront-banner/a.png`,
        path: 'inventory/media/storefront-banner/a.png',
        platformOrigin: 'https://tuturuuu.com',
        readUrl: 'https://storage.example/banner',
        target: 'storefront-banner',
      })
    ).toBe('https://storage.example/banner');
  });

  it.each(['personal', 'internal'])(
    'names the workspace by UUID when the page uses the %s slug',
    (slug) => {
      // The page's slug never reaches the stored URL; the server's storage
      // key carries the UUID.
      const stored = inventoryUploadStoredValue({
        fullPath: `${WS}/${IMAGE}`,
        path: IMAGE,
        platformOrigin: 'https://tuturuuu.com',
        readUrl: 'https://storage.example/signed',
        target: 'product-featured-image',
      });
      expect(stored).not.toContain(`/workspaces/${slug}/`);
      expect(resolveInventoryProductImagePath(stored, WS)).toBe(IMAGE);
    }
  );

  it('keeps the signed URL when the storage key has no workspace UUID', () => {
    for (const fullPath of [
      null,
      IMAGE,
      `personal/${IMAGE}`,
      `${WS}/other.png`,
    ]) {
      expect(
        inventoryUploadStoredValue({
          fullPath,
          path: IMAGE,
          platformOrigin: 'https://tuturuuu.com',
          readUrl: 'https://storage.example/signed',
          target: 'product-featured-image',
        })
      ).toBe('https://storage.example/signed');
    }
  });
});
