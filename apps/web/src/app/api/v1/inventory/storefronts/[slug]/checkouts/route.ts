import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { isInventoryEnabled } from '@/lib/inventory/access';
import { getCheckoutByPublicToken } from '@/lib/inventory/commerce/checkouts';
import { createInventoryPolarCheckout } from '@/lib/inventory/commerce/polar';
import { getPublicStorefront } from '@/lib/inventory/commerce/public-storefront';
import { checkoutCreatePayloadSchema } from '@/lib/inventory/commerce/schemas';

interface Params {
  params: Promise<{ slug: string }>;
}

type InventoryCheckoutRpcData = {
  publicToken?: string;
  public_token?: string;
};

type RpcClient = {
  rpc: (
    fn:
      | 'create_inventory_checkout_session'
      | 'release_inventory_checkout_session',
    args: Record<string, unknown>
  ) => Promise<{
    data: InventoryCheckoutRpcData | null;
    error: { message?: string } | null;
  }>;
};

function getStorefrontUrl(request: Request) {
  const configured =
    process.env.NEXT_PUBLIC_STOREFRONT_APP_URL ||
    process.env.STOREFRONT_APP_URL;

  if (configured) return configured;

  const url = new URL(request.url);
  if (url.hostname.includes('storefront.')) return url.origin;

  return process.env.NODE_ENV === 'production'
    ? 'https://storefront.tuturuuu.com'
    : 'http://localhost:7822';
}

async function authorizeCheckoutAccess(request: Request, slug: string) {
  const payload = await getPublicStorefront(slug);

  if (!payload || !(await isInventoryEnabled(payload.storefront.wsId))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  if (payload.storefront.visibility !== 'private') return null;

  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: {
      targetApp: ['storefront', 'inventory'],
    },
  });

  if (!auth.ok) return auth.response;

  const membership = await verifyWorkspaceMembershipType({
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId: payload.storefront.wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const accessResponse = await authorizeCheckoutAccess(request, slug);
    if (accessResponse) return accessResponse;

    const payload = checkoutCreatePayloadSchema.parse(await request.json());
    const sbAdmin = (await createAdminClient()) as unknown as RpcClient;
    const { data, error } = await sbAdmin.rpc(
      'create_inventory_checkout_session',
      {
        p_payload: payload,
        p_storefront_slug: slug,
      }
    );

    if (error) {
      return NextResponse.json(
        { message: error.message ?? 'Unable to reserve inventory' },
        { status: 409 }
      );
    }

    const publicToken = data?.publicToken ?? data?.public_token;
    if (!publicToken) {
      serverLogger.error('Inventory checkout RPC returned no public token', {
        data,
        slug,
      });
      return NextResponse.json(
        { message: 'Checkout reservation failed' },
        { status: 500 }
      );
    }

    const checkout = await getCheckoutByPublicToken(publicToken);
    if (!checkout) {
      return NextResponse.json(
        { message: 'Checkout reservation failed' },
        { status: 500 }
      );
    }

    try {
      const polarCheckout = await createInventoryPolarCheckout({
        checkout,
        storefrontSlug: slug,
        storefrontUrl: getStorefrontUrl(request),
      });
      const refreshedCheckout =
        (await getCheckoutByPublicToken(publicToken)) ?? checkout;

      return NextResponse.json(
        {
          checkout: refreshedCheckout,
          checkoutUrl: polarCheckout.checkoutUrl,
        },
        { status: 201 }
      );
    } catch (error) {
      const { error: releaseError } = await sbAdmin.rpc(
        'release_inventory_checkout_session',
        {
          p_checkout_id: checkout.id,
        }
      );

      if (releaseError) {
        serverLogger.error(
          'Failed to release inventory checkout after Polar error',
          releaseError
        );
      }

      serverLogger.error('Failed to create Polar inventory checkout', error);
      return NextResponse.json(
        { message: 'Failed to create Polar checkout' },
        { status: 409 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid checkout payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to create inventory checkout', error);
    return NextResponse.json(
      { message: 'Failed to create checkout' },
      { status: 500 }
    );
  }
}
