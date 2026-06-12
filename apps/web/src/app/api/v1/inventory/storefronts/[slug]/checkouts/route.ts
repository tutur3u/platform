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
import { createSimulatedCheckoutResponse } from '@/lib/inventory/commerce/simulated-checkout';

interface Params {
  params: Promise<{ slug: string }>;
}

type InventoryCheckoutRpcData = {
  publicToken?: string;
  public_token?: string;
};

type RpcClient = {
  schema: (schema: 'private') => {
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

async function loadAuthorizedStorefront(request: Request, slug: string) {
  const payload = await getPublicStorefront(slug);

  if (!payload || !(await isInventoryEnabled(payload.storefront.wsId))) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (payload.storefront.visibility !== 'private') return { payload };

  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: {
      targetApp: ['storefront', 'inventory'],
    },
  });

  if (!auth.ok) return { response: auth.response };

  const membership = await verifyWorkspaceMembershipType({
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId: payload.storefront.wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      response: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { payload };
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const access = await loadAuthorizedStorefront(request, slug);
    if (access.response) return access.response;
    const storefrontPayload = access.payload;
    if (!storefrontPayload) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const payload = checkoutCreatePayloadSchema.parse(await request.json());

    if (storefrontPayload.storefront.checkoutMode === 'disabled') {
      return NextResponse.json(
        { message: 'Checkout is disabled for this storefront' },
        { status: 409 }
      );
    }

    if (storefrontPayload.storefront.checkoutMode === 'simulated') {
      return NextResponse.json(
        createSimulatedCheckoutResponse({
          payload,
          storeSlug: slug,
          storefrontPayload,
        }),
        { status: 201 }
      );
    }

    const sbAdmin = (await createAdminClient()) as unknown as RpcClient;
    const privateRpc = sbAdmin.schema('private');
    const { data, error } = await privateRpc.rpc(
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
      const { error: releaseError } = await privateRpc.rpc(
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
