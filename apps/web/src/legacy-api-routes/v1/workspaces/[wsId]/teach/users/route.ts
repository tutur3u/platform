import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
});

export const GET = withSessionAuth(
  async (
    request,
    context,
    params: { wsId: string } | Promise<{ wsId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'view_users_public_info',
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') ?? '';
    const from = Math.max(
      Number.parseInt(searchParams.get('from') ?? '0', 10) || 0,
      0
    );
    const limit = Math.min(
      Math.max(Number.parseInt(searchParams.get('limit') ?? '30', 10) || 30, 1),
      100
    );

    const query = access.sbAdmin
      .rpc(
        'get_workspace_users',
        {
          _ws_id: access.normalizedWsId,
          excluded_groups: [],
          include_archived: false,
          included_groups: [],
          link_status: 'all',
          search_query: q,
        },
        { count: 'exact' }
      )
      .order('full_name', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true, nullsFirst: false })
      .range(from, from + limit - 1);

    const { count, data, error } = await query;

    if (error) {
      serverLogger.error('Failed to fetch Teach workspace users', { error });
      return NextResponse.json(
        { message: 'Error fetching workspace users' },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count ?? 0, data: data ?? [] });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);
