import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { canViewInventorySales } from '@/lib/inventory/permissions';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';
import { getInventorySales } from '@/lib/inventory/sales-rpc';

const SearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type InventorySaleListItem = {
  category_name: string | null;
  completed_at: string | null;
  created_at: string | null;
  creator_name: string | null;
  customer_name: string | null;
  id: string;
  items_count: number;
  note: string | null;
  notice: string | null;
  owners: string[];
  paid_amount: number;
  total_quantity: number;
  wallet_name: string | null;
};

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canViewInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { limit, offset } = parsed.data;
  const [salesResult, realtimeEnabled] = await Promise.all([
    getInventorySales<InventorySaleListItem>({
      limit,
      offset,
      sbAdmin,
      wsId,
    })
      .then((data) => ({ data, error: null }))
      .catch((error) => ({ data: null, error })),
    isInventoryRealtimeEnabled(wsId),
  ]);

  if (salesResult.error) {
    serverLogger.error('Error fetching inventory sales', salesResult.error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sales' },
      { status: 500 }
    );
  }

  const data = salesResult.data?.data ?? [];

  return NextResponse.json({
    data,
    count: salesResult.data?.count ?? data.length,
    realtime_enabled: realtimeEnabled,
  });
}
