import {
  getCheckoutByPublicToken,
  getCheckoutStorefrontAccessByPublicToken,
} from '@tuturuuu/inventory-core/commerce/checkouts';
import {
  getSimulatedOrderResponse,
  isSimulatedOrderToken,
} from '@tuturuuu/inventory-core/commerce/simulated-checkout';
import { reconcileInventorySquarePosCheckout } from '@tuturuuu/inventory-core/commerce/square';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

interface Params {
  params: Promise<{ publicToken: string }>;
}

async function authorizePrivateStorefrontOrder(
  request: Request,
  publicToken: string
) {
  const access = await getCheckoutStorefrontAccessByPublicToken(publicToken);

  if (!access) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (access.visibility !== 'private') {
    return { ok: true as const, privateOrder: false as const };
  }

  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: {
      targetApp: ['storefront', 'inventory'],
    },
  });

  if (!auth.ok) return { ok: false as const, response: auth.response };

  const membership = await verifyWorkspaceMembershipType({
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId: access.wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const, privateOrder: true as const };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    if (isSimulatedOrderToken(publicToken)) {
      const simulatedOrder = getSimulatedOrderResponse(publicToken);
      if (simulatedOrder) {
        return NextResponse.json(simulatedOrder);
      }

      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const persistedOrder = await getCheckoutByPublicToken(publicToken);

    if (!persistedOrder) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const order = await reconcileInventorySquarePosCheckout(persistedOrder);

    const authorization = await authorizePrivateStorefrontOrder(
      request,
      publicToken
    );
    if (!authorization.ok) return authorization.response;

    const headers = authorization.privateOrder
      ? { 'Cache-Control': 'private, no-store' }
      : undefined;

    return NextResponse.json({ order }, { headers });
  } catch (error) {
    console.error('Failed to load public inventory order', error);
    return NextResponse.json(
      { message: 'Failed to load order' },
      { status: 500 }
    );
  }
}
