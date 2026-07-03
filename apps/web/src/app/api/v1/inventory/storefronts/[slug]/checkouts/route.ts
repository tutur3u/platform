import { isInventoryEnabled } from '@tuturuuu/inventory-core/access';
import {
  getCheckoutByPublicToken,
  markCheckoutProvider,
} from '@tuturuuu/inventory-core/commerce/checkouts';
import { createInventoryPolarCheckout } from '@tuturuuu/inventory-core/commerce/polar';
import { getPublicStorefront } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { checkoutCreatePayloadSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { createSimulatedCheckoutResponse } from '@tuturuuu/inventory-core/commerce/simulated-checkout';
import { assertInventorySquareReady } from '@tuturuuu/inventory-core/commerce/square';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ slug: string }>;
}

type InventoryCheckoutRpcData = {
  publicToken?: string;
  public_token?: string;
};

type CheckoutAuthContext = Extract<
  Awaited<ReturnType<typeof resolveSessionAuthContext>>,
  { ok: true }
>;

function getUserMetadataValue(user: unknown, keys: string[]) {
  if (!user || typeof user !== 'object') return null;
  const metadata = (user as { user_metadata?: unknown }).user_metadata;
  if (!metadata || typeof metadata !== 'object') return null;

  for (const key of keys) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
}

function getCheckoutBuyerPayload(auth: CheckoutAuthContext) {
  const userWithEmail = auth.user as typeof auth.user & {
    email?: string | null;
    phone?: string | null;
  };
  const email = userWithEmail.email?.trim();
  const name =
    getUserMetadataValue(auth.user, [
      'full_name',
      'name',
      'display_name',
      'preferred_name',
    ]) ??
    email ??
    'Tuturuuu buyer';

  return {
    customerAuthUid: auth.user.id,
    customerEmail: email ?? `${auth.user.id}@users.tuturuuu.local`,
    customerName: name,
    customerPhone:
      userWithEmail.phone ??
      getUserMetadataValue(auth.user, ['phone', 'phone_number']),
  };
}

type RpcClient = {
  schema: (schema: 'private') => {
    from: (table: 'inventory_storefront_events') => {
      insert: (payload: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    };
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

type PrivateInventoryClient = ReturnType<RpcClient['schema']>;

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

async function recordCheckoutAnalyticsEvent(
  privateInventory: PrivateInventoryClient,
  {
    checkoutId,
    customerAuthUid,
    eventType,
    metadata,
    storefront,
  }: {
    checkoutId?: string | null;
    customerAuthUid: string | null;
    eventType: 'checkout_created' | 'checkout_failed';
    metadata?: Record<string, unknown>;
    storefront: {
      analyticsEnabled?: boolean;
      id: string;
      wsId: string;
    };
  }
) {
  if (!storefront.analyticsEnabled) return;

  const { error } = await privateInventory
    .from('inventory_storefront_events')
    .insert({
      checkout_session_id: checkoutId ?? null,
      customer_auth_uid: customerAuthUid,
      event_type: eventType,
      metadata: metadata ?? {},
      storefront_id: storefront.id,
      ws_id: storefront.wsId,
    });

  if (error) {
    serverLogger.error('Failed to record checkout analytics event', error);
  }
}

async function recordCheckoutAnalyticsEventWithAdmin(
  args: Parameters<typeof recordCheckoutAnalyticsEvent>[1]
) {
  try {
    const sbAdmin = (await createAdminClient()) as unknown as RpcClient;
    await recordCheckoutAnalyticsEvent(sbAdmin.schema('private'), args);
  } catch (error) {
    serverLogger.error('Failed to record checkout analytics event', error);
  }
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
    const checkoutAuth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: {
        targetApp: ['storefront', 'inventory'],
      },
    });

    if (!checkoutAuth.ok) return checkoutAuth.response;

    const buyerDefaults = getCheckoutBuyerPayload(checkoutAuth);
    // Buyer-entered details win over the session defaults (so a shopper can name
    // a different recipient/contact), but the auth uid stays authoritative.
    const checkoutPayload = {
      ...payload,
      customerAuthUid: buyerDefaults.customerAuthUid,
      customerEmail:
        payload.customerEmail?.trim() || buyerDefaults.customerEmail,
      customerName: payload.customerName?.trim() || buyerDefaults.customerName,
      customerPhone:
        payload.customerPhone?.trim() || buyerDefaults.customerPhone,
    };

    const checkoutMode = storefrontPayload.storefront.checkoutMode;

    if (checkoutMode === 'disabled') {
      return NextResponse.json(
        { message: 'Checkout is disabled for this storefront' },
        { status: 409 }
      );
    }

    if (checkoutMode === 'simulated') {
      await recordCheckoutAnalyticsEventWithAdmin({
        customerAuthUid: checkoutPayload.customerAuthUid,
        eventType: 'checkout_created',
        metadata: { checkoutMode: 'simulated' },
        storefront: storefrontPayload.storefront,
      });

      return NextResponse.json(
        createSimulatedCheckoutResponse({
          payload: checkoutPayload,
          storeSlug: slug,
          storefrontPayload,
        }),
        { status: 201 }
      );
    }

    if (checkoutMode === 'square_terminal') {
      try {
        await assertInventorySquareReady(storefrontPayload.storefront.wsId);
      } catch (error) {
        return NextResponse.json(
          {
            message:
              error instanceof Error
                ? error.message
                : 'Square Terminal is not ready',
          },
          { status: 409 }
        );
      }
    }

    const sbAdmin = (await createAdminClient()) as unknown as RpcClient;
    const privateRpc = sbAdmin.schema('private');
    const { data, error } = await privateRpc.rpc(
      'create_inventory_checkout_session',
      {
        p_payload: checkoutPayload,
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

    if (checkoutMode === 'square_terminal') {
      try {
        await markCheckoutProvider({
          checkoutId: checkout.id,
          provider: 'square_terminal',
          wsId: checkout.wsId,
        });
        const refreshedCheckout =
          (await getCheckoutByPublicToken(publicToken)) ?? checkout;
        const nextUrl = `${getStorefrontUrl(request).replace(/\/$/u, '')}/${slug}/orders/${publicToken}`;
        await recordCheckoutAnalyticsEvent(privateRpc, {
          checkoutId: checkout.id,
          customerAuthUid: checkoutPayload.customerAuthUid,
          eventType: 'checkout_created',
          metadata: { checkoutMode: 'square_terminal' },
          storefront: storefrontPayload.storefront,
        });

        return NextResponse.json(
          {
            checkout: refreshedCheckout,
            checkoutMode: 'square_terminal',
            checkoutUrl: nextUrl,
            nextUrl,
          },
          { status: 201 }
        );
      } catch (error) {
        const { error: releaseError } = await privateRpc.rpc(
          'release_inventory_checkout_session',
          {
            p_checkout_id: checkout.id,
            p_ws_id: checkout.wsId,
          }
        );

        if (releaseError) {
          serverLogger.error(
            'Failed to release inventory checkout after Square error',
            releaseError
          );
        }
        await recordCheckoutAnalyticsEvent(privateRpc, {
          checkoutId: checkout.id,
          customerAuthUid: checkoutPayload.customerAuthUid,
          eventType: 'checkout_failed',
          metadata: { checkoutMode: 'square_terminal' },
          storefront: storefrontPayload.storefront,
        });

        serverLogger.error(
          'Failed to prepare Square inventory checkout',
          error
        );
        return NextResponse.json(
          {
            message:
              error instanceof Error && error.message
                ? error.message
                : 'Failed to prepare Square Terminal checkout',
          },
          { status: 409 }
        );
      }
    }

    try {
      const polarCheckout = await createInventoryPolarCheckout({
        checkout,
        storefrontSlug: slug,
        storefrontUrl: getStorefrontUrl(request),
      });
      const refreshedCheckout =
        (await getCheckoutByPublicToken(publicToken)) ?? checkout;
      await recordCheckoutAnalyticsEvent(privateRpc, {
        checkoutId: checkout.id,
        customerAuthUid: checkoutPayload.customerAuthUid,
        eventType: 'checkout_created',
        metadata: { checkoutMode: 'polar' },
        storefront: storefrontPayload.storefront,
      });

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
          p_ws_id: checkout.wsId,
        }
      );

      if (releaseError) {
        serverLogger.error(
          'Failed to release inventory checkout after Polar error',
          releaseError
        );
      }
      await recordCheckoutAnalyticsEvent(privateRpc, {
        checkoutId: checkout.id,
        customerAuthUid: checkoutPayload.customerAuthUid,
        eventType: 'checkout_failed',
        metadata: { checkoutMode: 'polar' },
        storefront: storefrontPayload.storefront,
      });

      serverLogger.error('Failed to create Polar inventory checkout', error);
      return NextResponse.json(
        {
          message:
            error instanceof Error && error.message
              ? error.message
              : 'Failed to create Polar checkout',
        },
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
