import { resolveOwnAppApiPath } from '@tuturuuu/internal-api/client';
import { parseStoredInventoryProductImage } from './inventory-product-image';

/**
 * The product image route for browser requests from the Inventory app,
 * under the app's mount (`/inventory/api/...` on `tuturuuu.com/inventory`,
 * unchanged on the subdomain).
 */
export function inventoryProductImageRoute(wsId: string, productId: string) {
  return resolveOwnAppApiPath(
    'inventory',
    `/api/v1/workspaces/${encodeURIComponent(wsId)}/products/${encodeURIComponent(productId)}/image`
  );
}

/**
 * Image `src` for a product: workspace product images go through the
 * product image route, which checks access and signs on read; other values
 * (public CDN images) render as stored. The route, not the browser, decides
 * whether the stored workspace is the product's, so a page addressed by a
 * route slug (`personal`) still routes UUID-named images.
 */
export function inventoryProductImageSrc({
  avatarUrl,
  productId,
  wsId,
}: {
  avatarUrl: string | null | undefined;
  productId: string | null | undefined;
  wsId: string | null | undefined;
}): string | null {
  if (!avatarUrl) return null;
  if (!wsId || !productId) return avatarUrl;
  return parseStoredInventoryProductImage(avatarUrl)
    ? inventoryProductImageRoute(wsId, productId)
    : avatarUrl;
}

/**
 * Image `src` for a sale line. The line keeps the image it was sold with;
 * when that is the product's current image it is signed through the product
 * route, and an older image renders as it was stored.
 */
export function inventorySaleLineImageSrc({
  lineImageUrl,
  productAvatarUrl,
  productId,
  wsId,
}: {
  lineImageUrl: string | null | undefined;
  productAvatarUrl: string | null | undefined;
  productId: string | null | undefined;
  wsId: string | null | undefined;
}): string | null {
  if (!lineImageUrl) {
    return inventoryProductImageSrc({
      avatarUrl: productAvatarUrl,
      productId,
      wsId,
    });
  }
  if (!wsId || !productId) return lineImageUrl;
  const linePath = parseStoredInventoryProductImage(lineImageUrl)?.path;
  const currentPath = parseStoredInventoryProductImage(productAvatarUrl)?.path;
  return linePath && linePath === currentPath
    ? inventoryProductImageRoute(wsId, productId)
    : lineImageUrl;
}
