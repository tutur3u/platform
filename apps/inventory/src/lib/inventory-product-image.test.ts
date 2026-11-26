import { describe, expect, it } from 'vitest';
import {
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

  it('parses http share URLs from a local platform origin', () => {
    const local = `http://localhost:7803/api/v1/workspaces/${WS}/storage/share?path=${encodeURIComponent(IMAGE)}`;
    expect(resolveInventoryProductImagePath(local, WS)).toBe(IMAGE);
    // Signed object URLs stay https only.
    expect(
      resolveInventoryProductImagePath(
        `http://x.supabase.co/storage/v1/object/sign/workspaces/${WS}/${IMAGE}?token=t`,
        WS
      )
    ).toBeNull();
  });
});
