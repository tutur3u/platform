import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

const QuerySchema = z
  .object({
    entity: z
      .enum(['invoice', 'product', 'promotion', 'group', 'payment'])
      .optional(),
    action: z.enum(['INSERT', 'UPDATE', 'DELETE', 'RESTORE']).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
    q: z.string().trim().max(120).default(''),
    invoiceId: z.guid().optional(),
    deletedOnly: z.enum(['true', 'false']).default('false'),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (query) =>
      !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to)
  );

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    wsId,
    await resolveFinanceRouteAuthContext(req)
  );
  if (access.response) return access.response;
  const { permissions, normalizedWsId, sbAdmin, user } = access.context;
  if (
    permissions.withoutPermission('view_invoices') ||
    permissions.withoutPermission('manage_workspace_audit_logs')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  const { data, error } = await sbAdmin.rpc(
    'admin_get_finance_invoice_history',
    {
      p_ws_id: normalizedWsId,
      p_entity: parsed.data.entity,
      p_action: parsed.data.action,
      p_from: parsed.data.from,
      p_to: parsed.data.to,
      p_sort: parsed.data.sort,
      p_query: parsed.data.q,
      p_actor_id: user.id,
      p_invoice_id: parsed.data.invoiceId,
      p_deleted_only: parsed.data.deletedOnly === 'true',
      p_offset: parsed.data.offset,
      p_limit: parsed.data.limit + 1,
    }
  );
  if (error || !Array.isArray(data))
    return NextResponse.json(
      { message: 'Invoice history is unavailable' },
      { status: error?.code === 'PGRST202' ? 503 : 500 }
    );
  return NextResponse.json(
    {
      data: data.slice(0, parsed.data.limit),
      hasMore: data.length > parsed.data.limit,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
