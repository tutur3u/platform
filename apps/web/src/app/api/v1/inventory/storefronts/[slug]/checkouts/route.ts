import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getCheckoutByPublicToken } from '@/lib/inventory/commerce/checkouts';
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
    fn: 'create_inventory_checkout_session',
    args: Record<string, unknown>
  ) => Promise<{
    data: InventoryCheckoutRpcData | null;
    error: { message?: string } | null;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
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

    return NextResponse.json({ checkout }, { status: 201 });
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
