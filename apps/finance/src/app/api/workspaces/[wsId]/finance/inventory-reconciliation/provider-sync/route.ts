import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { syncInventoryFinanceProviderHistory } from '@tuturuuu/inventory-core/finance-reconciliation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const payloadSchema = z.object({
  cursor: z.string().max(2000).optional(),
  environment: z.enum(['production', 'sandbox']).default('production'),
  limit: z.number().int().min(1).max(100).default(100),
  provider: z.enum(['polar', 'square']),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { message: 'Invalid provider synchronization request' },
        { status: 400 }
      );
    }
    const { wsId } = await params;
    const access = await getFinanceRouteContext(
      request,
      wsId,
      await resolveFinanceRouteAuthContext(request)
    );
    if (access.response) return access.response;
    const { normalizedWsId, permissions } = access.context;
    if (permissions.withoutPermission('manage_finance')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const result = await syncInventoryFinanceProviderHistory({
      cursor: payload.data.cursor,
      environment: payload.data.environment,
      limit: payload.data.limit,
      provider: payload.data.provider === 'polar' ? 'polar' : 'square_terminal',
      wsId: normalizedWsId,
    });
    return NextResponse.json({
      ...result,
      hasMore: Boolean(result.nextCursor),
    });
  } catch (error) {
    console.error('Inventory Finance provider sync failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { message: 'Failed to synchronize provider history' },
      { status: 500 }
    );
  }
}
