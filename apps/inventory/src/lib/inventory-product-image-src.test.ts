import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  inventoryProductImageRoute,
  inventoryProductImageSrc,
  inventorySaleLineImageSrc,
} from './inventory-product-image-src';

const WS = '82cf845a-49b0-459d-a5ee-1005e8de4fae';
const IMAGE = 'inventory/media/product-featured-image/upload-id-a.png';
const OLD = 'inventory/media/product-featured-image/upload-id-old.png';
const share = (path: string, ws = WS) =>
  `https://tuturuuu.com/api/v1/workspaces/${ws}/storage/share?path=${encodeURIComponent(path)}`;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function mountAt(base: string) {
  const resolver = Object.assign((path: string) => `${base}${path}`, {
    owns: () => true,
  });
  cleanups.push(registerDefaultAppBaseResolver(resolver, { app: 'inventory' }));
}

describe('inventory product image src', () => {
  it('is root-relative on the Inventory subdomain', () => {
    expect(inventoryProductImageRoute(WS, 'p-1')).toBe(
      `/api/v1/workspaces/${WS}/products/p-1/image`
    );
  });

  it('stays under the app mount at tuturuuu.com/inventory', () => {
    mountAt('/inventory');
    expect(
      inventoryProductImageSrc({
        avatarUrl: share(IMAGE),
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe(
      `/inventory/api/v1/workspaces/${WS}/products/p-1/image?v=upload-id-a.png`
    );
  });

  it('routes stored workspace images, including slug-named ones', () => {
    for (const avatarUrl of [share(IMAGE), share(IMAGE, 'personal')]) {
      expect(
        inventoryProductImageSrc({
          avatarUrl,
          productId: 'p-1',
          wsId: 'personal',
        })
      ).toBe(
        '/api/v1/workspaces/personal/products/p-1/image?v=upload-id-a.png'
      );
    }
    expect(
      inventoryProductImageSrc({
        avatarUrl: 'https://cdn.tuturuuu.com/a.png',
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe('https://cdn.tuturuuu.com/a.png');
    expect(
      inventoryProductImageSrc({
        avatarUrl: share(IMAGE),
        productId: null,
        wsId: WS,
      })
    ).toBe(share(IMAGE));
    expect(
      inventoryProductImageSrc({ avatarUrl: null, productId: 'p', wsId: WS })
    ).toBeNull();
  });

  it('changes the src when the stored image is replaced', () => {
    const before = inventoryProductImageSrc({
      avatarUrl: share(OLD),
      productId: 'p-1',
      wsId: WS,
    });
    const after = inventoryProductImageSrc({
      avatarUrl: share(IMAGE),
      productId: 'p-1',
      wsId: WS,
    });
    expect(before).toBe(
      `/api/v1/workspaces/${WS}/products/p-1/image?v=upload-id-old.png`
    );
    expect(after).not.toBe(before);
  });

  it('changes the src when a web upload replaces a signed image', () => {
    // Web uploads store signed read URLs; each upload has a unique name.
    const signed = (path: string) =>
      `https://project.supabase.co/storage/v1/object/sign/workspaces/${WS}/${path}?token=t`;
    const before = inventoryProductImageSrc({
      avatarUrl: signed(OLD),
      productId: 'p-1',
      wsId: WS,
    });
    const after = inventoryProductImageSrc({
      avatarUrl: signed(IMAGE),
      productId: 'p-1',
      wsId: WS,
    });
    expect(before).toBe(
      `/api/v1/workspaces/${WS}/products/p-1/image?v=upload-id-old.png`
    );
    expect(after).toBe(
      `/api/v1/workspaces/${WS}/products/p-1/image?v=upload-id-a.png`
    );
    // A re-signed URL for the same file keeps the same src.
    expect(
      inventoryProductImageSrc({
        avatarUrl: signed(IMAGE).replace('token=t', 'token=u'),
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe(after);
  });

  it('shows a sale line with the image it was sold with', () => {
    const route = `/api/v1/workspaces/${WS}/products/p-1/image?v=upload-id-a.png`;
    // The current image is signed through the product route.
    expect(
      inventorySaleLineImageSrc({
        lineImageUrl: share(IMAGE),
        productAvatarUrl: share(IMAGE),
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe(route);
    // An older image stays as stored rather than showing today's image.
    expect(
      inventorySaleLineImageSrc({
        lineImageUrl: share(OLD),
        productAvatarUrl: share(IMAGE),
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe(share(OLD));
    // Without a stored line image the product's image is used.
    expect(
      inventorySaleLineImageSrc({
        lineImageUrl: null,
        productAvatarUrl: share(IMAGE),
        productId: 'p-1',
        wsId: WS,
      })
    ).toBe(route);
  });
});
