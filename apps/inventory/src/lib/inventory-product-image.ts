/**
 * Product images live under one inventory media prefix in their workspace.
 * A product stores a stable share URL (or, for older uploads, a signed read
 * URL) as `avatar_url`; readers load it through the product image route,
 * which signs a fresh read URL after checking inventory access. These
 * helpers are pure so the route and client components share them.
 */

export const INVENTORY_PRODUCT_IMAGE_PREFIX =
  'inventory/media/product-featured-image/';

import { buildWorkspaceStorageShareUrl } from '@tuturuuu/storage-core/signed-url-policy';

const PARSE_BASE = 'https://inventory-product-image.invalid';

/** Whether `path` is one object directly under the product image prefix. */
export function isInventoryProductImagePath(path: string): boolean {
  if (!path.startsWith(INVENTORY_PRODUCT_IMAGE_PREFIX)) return false;
  if (/[\\%\0]/.test(path)) return false;
  const parts = path.split('/');
  return (
    parts.length === 4 &&
    parts.every((part) => part.length > 0 && part !== '.' && part !== '..') &&
    parts[3]!.trim().length > 0
  );
}

function sameWorkspace(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The product image path stored in `value` for workspace `wsId`, or null.
 *
 * Accepts the workspace share URL (`/api/v1/workspaces/{wsId}/storage/share
 * ?path=...`, relative or absolute) and signed object URLs whose object key
 * is `{wsId}/inventory/media/product-featured-image/...` (Supabase signed
 * URLs and R2 presigned URLs). Anything for another workspace, outside the
 * product image prefix, or with traversal segments is rejected.
 */
export function resolveInventoryProductImagePath(
  value: string | null | undefined,
  wsId: string
): string | null {
  if (!value || !wsId) return null;
  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  // Reject dot segments before URL normalization can erase them.
  const rawPath = value.split(/[?#]/)[0] ?? '';
  if (/(?:^|\/)(?:\.|%2e){1,2}(?=\/|$)/i.test(rawPath)) return null;

  let segments: string[];
  try {
    segments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (
    segments.length === 6 &&
    segments[0] === 'api' &&
    segments[1] === 'v1' &&
    segments[2] === 'workspaces' &&
    segments[4] === 'storage' &&
    segments[5] === 'share'
  ) {
    const path = url.searchParams.get('path');
    if (!sameWorkspace(segments[3]!, wsId) || !path) return null;
    return isInventoryProductImagePath(path) ? path : null;
  }

  const workspaceIndex = segments.findIndex(
    (segment, index) =>
      sameWorkspace(segment, wsId) &&
      segments[index + 1] === 'inventory' &&
      segments[index + 2] === 'media'
  );
  if (workspaceIndex < 0) return null;
  const path = segments.slice(workspaceIndex + 1).join('/');
  return isInventoryProductImagePath(path) ? path : null;
}

/**
 * The value an upload stores. Product images keep the stable share URL on
 * the platform origin, because signed read URLs expire; other inventory
 * media (storefront and listing images) are shown publicly and keep the
 * signed read URL.
 */
export function inventoryUploadStoredValue({
  path,
  platformOrigin,
  readUrl,
  target,
  wsId,
}: {
  path: string;
  platformOrigin: string;
  readUrl: string;
  target: string;
  wsId: string;
}): string {
  if (
    target !== 'product-featured-image' ||
    !isInventoryProductImagePath(path)
  ) {
    return readUrl;
  }
  return new URL(
    buildWorkspaceStorageShareUrl(wsId, path),
    platformOrigin
  ).toString();
}

/** Same-origin route that signs a product image on read. */
export function inventoryProductImageRoute(wsId: string, productId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(wsId)}/products/${encodeURIComponent(productId)}/image`;
}

/**
 * Image `src` for a product: workspace product images go through the
 * product image route; other values (public CDN images) render as stored.
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
  return resolveInventoryProductImagePath(avatarUrl, wsId)
    ? inventoryProductImageRoute(wsId, productId)
    : avatarUrl;
}
