import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PendingInvoicesParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().default(''),
  userIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
  groupByUser: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  countOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  currentMonthOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient(request);
    const { wsId } = await params;

    // Check permissions
    const permissions = await getPermissions({ wsId });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { containsPermission } = permissions;
    if (!containsPermission('view_invoices')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const params_obj: Record<string, string | string[]> = {};
    searchParams.forEach((value, key) => {
      const existing = params_obj[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          params_obj[key] = [existing, value];
        }
      } else {
        params_obj[key] = value;
      }
    });

    const parsed = PendingInvoicesParamsSchema.safeParse(params_obj);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', errors: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      page,
      pageSize,
      q,
      userIds,
      groupByUser,
      countOnly,
      currentMonthOnly,
    } = parsed.data;

    if (countOnly) {
      const rpcName = groupByUser
        ? 'get_pending_invoices_grouped_by_user_count'
        : 'get_pending_invoices_count';

      const { data: count, error: countError } = await supabase.rpc(rpcName, {
        p_ws_id: wsId,
        p_query: q || undefined,
        p_user_ids: userIds.length > 0 ? userIds : undefined,
      });

      if (countError) throw countError;
      return NextResponse.json(count || 0);
    }

    const rpcName = groupByUser
      ? 'get_pending_invoices_grouped_by_user'
      : 'get_pending_invoices';

    const offset = (page - 1) * pageSize;
    const limit = currentMonthOnly ? 10000 : pageSize;

    const { data, error } = await supabase.rpc(rpcName, {
      p_ws_id: wsId,
      p_limit: limit,
      p_offset: currentMonthOnly ? 0 : offset,
      p_query: q || undefined,
      p_user_ids: userIds.length > 0 ? userIds : undefined,
    });

    if (error) throw error;

    if (currentMonthOnly) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const currentMonthCount = (data || []).filter((invoice: any) => {
        const monthsOwed = Array.isArray(invoice.months_owed)
          ? invoice.months_owed
          : typeof invoice.months_owed === 'string'
            ? invoice.months_owed.split(',').map((m: string) => m.trim())
            : [];
        return monthsOwed.includes(currentMonth);
      }).length;

      return NextResponse.json(currentMonthCount);
    }

    // Get total count for pagination if not currentMonthOnly
    const countRpcName = groupByUser
      ? 'get_pending_invoices_grouped_by_user_count'
      : 'get_pending_invoices_count';

    const { data: totalCount, error: totalCountError } = await supabase.rpc(
      countRpcName,
      {
        p_ws_id: wsId,
        p_query: q || undefined,
        p_user_ids: userIds.length > 0 ? userIds : undefined,
      }
    );

    if (totalCountError) throw totalCountError;

    return NextResponse.json({
      data: data || [],
      count: totalCount || 0,
    });
  } catch (error) {
    console.error('Error in pending invoices API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
