import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';

const QuerySchema = z.object({
  endAt: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  partnerId: z.guid().optional(),
  q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  startAt: z.iso.datetime().optional(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId, {
      appSessionTargets: ['inventory'],
    });
    if (!authorization.ok) return authorization.response;

    if (!canViewInventorySales(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const parsed = QuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin.schema('private').rpc(
      'list_inventory_revenue_share_earnings' as never,
      {
        p_end_at: parsed.data.endAt ?? null,
        p_limit: parsed.data.limit,
        p_offset: parsed.data.offset,
        p_partner_id: parsed.data.partnerId ?? null,
        p_start_at: parsed.data.startAt ?? null,
        p_ws_id: authorization.value.wsId,
      } as never
    );

    if (error) {
      serverLogger.error('Failed to list inventory revenue share earnings', {
        error,
        wsId: authorization.value.wsId,
      });
      return NextResponse.json(
        { message: 'Failed to list revenue share earnings' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<{
      earning: unknown | null;
      total_count: number | null;
    }>;
    const filtered = parsed.data.q
      ? rows.filter((row) => {
          const earning = row.earning as {
            partnerName?: string;
            products?: string[];
          } | null;
          const query = parsed.data.q?.toLowerCase() ?? '';
          return (
            earning?.partnerName?.toLowerCase().includes(query) ||
            earning?.products?.some((name) =>
              name.toLowerCase().includes(query)
            )
          );
        })
      : rows;

    return NextResponse.json({
      count: rows[0]?.total_count ?? 0,
      data: filtered.map((row) => row.earning).filter(Boolean),
    });
  } catch (error) {
    serverLogger.error(
      'Failed to list inventory revenue share earnings',
      error
    );
    return NextResponse.json(
      { message: 'Failed to list revenue share earnings' },
      { status: 500 }
    );
  }
}
