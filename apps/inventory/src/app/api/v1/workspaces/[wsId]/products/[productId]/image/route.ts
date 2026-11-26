import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import {
  createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import {
  INVENTORY_WORKSPACE_SLUGS,
  parseStoredInventoryProductImage,
  resolveInventoryProductImagePath,
} from '@/lib/inventory-product-image';

/** Signed URLs from this route stay short-lived; readers ask again. */
const SIGNED_READ_TTL_SECONDS = 60 * 60;
const REDIRECT_CACHE_CONTROL = 'private, max-age=300';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ productId: string; wsId: string }>;
}

/**
 * Sign-on-read for a product's own image. Any inventory reader (catalog
 * view or create-sales, like the products list) may read it, without
 * drive access. The signed path comes only from the product's stored
 * `avatar_url` and must sit under the workspace's product image prefix.
 *
 * `?format=json` returns `{ signedUrl, expiresAt }` for native clients;
 * otherwise the response redirects, so the route works as an `<img src>`.
 */
export async function GET(request: Request, { params }: Params) {
  const { productId, wsId: requestedWsId } = await params;
  if (!UUID_PATTERN.test(productId)) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  // Like the other single-product routes, only Inventory app sessions (and
  // native bearer clients) read through here.
  const auth = await authorizeInventoryWorkspace(request, requestedWsId, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  if (
    !canViewInventoryCatalog(permissions) &&
    !canCreateInventorySales(permissions)
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const { data: product, error } = await sbAdmin
    .from('workspace_products')
    .select('avatar_url')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) {
    console.error('Error loading inventory product image', error);
    return NextResponse.json(
      { message: 'Error loading product image' },
      { status: 500 }
    );
  }

  const path = resolveInventoryProductImagePath(
    product?.avatar_url,
    wsId,
    await storedWorkspaceAliases(sbAdmin, wsId, product?.avatar_url)
  );
  if (!product || !path) {
    return NextResponse.json({ message: 'Image not found' }, { status: 404 });
  }

  try {
    const signedAt = Date.now();
    const signedUrl = await createWorkspaceStorageSignedReadUrl(wsId, path, {
      expiresIn: SIGNED_READ_TTL_SECONDS,
    });
    if (new URL(request.url).searchParams.get('format') === 'json') {
      return NextResponse.json(
        {
          expiresAt: new Date(
            signedAt + SIGNED_READ_TTL_SECONDS * 1000
          ).toISOString(),
          signedUrl,
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    // The browser may reuse the redirect well inside the signed URL's hour,
    // so tables do not re-sign on every mount.
    return NextResponse.redirect(signedUrl, {
      headers: { 'Cache-Control': REDIRECT_CACHE_CONTROL },
      status: 302,
    });
  } catch (signError) {
    if (signError instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: signError.message },
        { status: signError.status }
      );
    }
    console.error('Error signing inventory product image', signError);
    return NextResponse.json(
      { message: 'Error loading product image' },
      { status: 500 }
    );
  }
}

/**
 * Route slugs a stored URL may use for this workspace: `internal` for the
 * root workspace and `personal` for a personal workspace. They are looked up
 * only when the stored URL names a slug rather than the workspace UUID.
 */
async function storedWorkspaceAliases(
  sbAdmin: Awaited<ReturnType<typeof createAdminClient>>,
  wsId: string,
  avatarUrl: string | null | undefined
): Promise<string[]> {
  const workspace =
    parseStoredInventoryProductImage(avatarUrl)?.workspace.toLowerCase();
  if (
    !workspace ||
    !(INVENTORY_WORKSPACE_SLUGS as readonly string[]).includes(workspace)
  ) {
    return [];
  }
  if (workspace === 'internal') {
    return wsId === ROOT_WORKSPACE_ID ? ['internal'] : [];
  }
  const { data, error } = await sbAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', wsId)
    .maybeSingle();
  if (error) {
    console.error('Error loading workspace for product image', error);
    return [];
  }
  return data?.personal ? ['personal'] : [];
}
