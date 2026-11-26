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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route slugs that may stand for a workspace in stored URLs. */
export const INVENTORY_WORKSPACE_SLUGS = ['personal', 'internal'] as const;

function sameWorkspace(segment: string, wsId: string, aliases: string[]) {
  const value = segment.toLowerCase();
  return (
    value === wsId.toLowerCase() ||
    aliases.some((alias) => alias.toLowerCase() === value)
  );
}

/**
 * The workspace segment and product image path a stored value names, or
 * null.
 *
 * Accepts the workspace share URL (`/api/v1/workspaces/{ws}/storage/share
 * ?path=...`, relative or absolute) and signed object URLs whose object key
 * is `{ws}/inventory/media/product-featured-image/...` (Supabase signed
 * URLs and R2 presigned URLs). Values outside the product image prefix or
 * with traversal segments are rejected. The workspace segment is returned
 * unchecked; callers compare it with the workspace they serve.
 */
export function parseStoredInventoryProductImage(
  value: string | null | undefined
): { path: string; workspace: string } | null {
  if (!value) return null;
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
    return path && isInventoryProductImagePath(path)
      ? { path, workspace: segments[3]! }
      : null;
  }

  const mediaIndex = segments.findIndex(
    (segment, index) =>
      index > 0 &&
      segment === 'inventory' &&
      segments[index + 1] === 'media'
  );
  if (mediaIndex < 1) return null;
  const path = segments.slice(mediaIndex).join('/');
  return isInventoryProductImagePath(path)
    ? { path, workspace: segments[mediaIndex - 1]! }
    : null;
}

/**
 * The product image path stored in `value` for workspace `wsId`, or null.
 * [aliases] are other names that stand for the same workspace in a stored
 * URL, such as the `personal` route slug of a personal workspace. A value
 * for any other workspace is rejected.
 */
export function resolveInventoryProductImagePath(
  value: string | null | undefined,
  wsId: string,
  aliases: string[] = []
): string | null {
  if (!wsId) return null;
  const stored = parseStoredInventoryProductImage(value);
  return stored && sameWorkspace(stored.workspace, wsId, aliases)
    ? stored.path
    : null;
}

/**
 * The value an upload stores. Product images keep the stable share URL on
 * the platform origin, because signed read URLs expire; other inventory
 * media (storefront and listing images) are shown publicly and keep the
 * signed read URL.
 *
 * The share URL names the workspace by the UUID the server stored the
 * object under (the first segment of `fullPath`), never the page's route
 * slug such as `personal`, which only resolves for the signed-in user.
 */
export function inventoryUploadStoredValue({
  fullPath,
  path,
  platformOrigin,
  readUrl,
  target,
}: {
  fullPath: string | null | undefined;
  path: string;
  platformOrigin: string;
  readUrl: string;
  target: string;
}): string {
  if (
    target !== 'product-featured-image' ||
    !isInventoryProductImagePath(path)
  ) {
    return readUrl;
  }
  const wsId = fullPath?.endsWith(`/${path}`)
    ? fullPath.slice(0, -(path.length + 1))
    : null;
  if (!wsId || !UUID_PATTERN.test(wsId)) return readUrl;
  return new URL(
    buildWorkspaceStorageShareUrl(wsId, path),
    platformOrigin
  ).toString();
}
