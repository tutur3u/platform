import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

const InvoiceQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const pageSize = 10;

type InvoiceProjection = {
  id: string;
  notice: string | null;
  note: string | null;
  created_at: string | null;
  price: number | null;
  total_diff: number | null;
};

function unavailable() {
  return NextResponse.json(
    { message: 'Contact billing is unavailable' },
    { status: 500 }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; userId: string }> }
) {
  await connection();
  const { wsId, userId } = await params;
  const access = await getFinanceRouteContext(
    request,
    wsId,
    await resolveFinanceRouteAuthContext(request)
  );
  if (access.response) return access.response;
  const { normalizedWsId, permissions, sbAdmin } = access.context;
  if (
    permissions.withoutPermission('view_invoices') ||
    permissions.withoutPermission('view_users_private_info')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const contactId = z.guid().safeParse(userId);
  const query = InvoiceQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!contactId.success || !query.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const { data: contact, error: contactError } = await sbAdmin
    .from('workspace_users')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('id', contactId.data)
    .maybeSingle();
  if (contactError) return unavailable();
  if (!contact) {
    return NextResponse.json({ message: 'Contact not found' }, { status: 404 });
  }

  const offset = (query.data.page - 1) * pageSize;
  const [{ data: invoices, error: invoiceError, count }, pending] =
    await Promise.all([
      sbAdmin
        .from('finance_invoices')
        .select('id, notice, note, created_at, price, total_diff', {
          count: 'exact',
        })
        .eq('ws_id', normalizedWsId)
        .eq('customer_id', contact.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1),
      query.data.page === 1
        ? sbAdmin.rpc('get_pending_invoices_grouped_by_user', {
            p_ws_id: normalizedWsId,
            p_user_ids: [contact.id],
            p_limit: 1,
          })
        : undefined,
    ]);

  if (invoiceError || pending?.error || count == null) return unavailable();
  const outstanding = pending?.data?.[0];
  if (outstanding && outstanding.user_id !== contact.id) return unavailable();

  return NextResponse.json(
    {
      data: (invoices ?? []).map((invoice: InvoiceProjection) => ({
        id: invoice.id,
        notice: invoice.notice,
        note: invoice.note,
        created_at: invoice.created_at,
        price:
          invoice.price == null
            ? null
            : invoice.price + (invoice.total_diff ?? 0),
      })),
      count,
      ...(query.data.page === 1
        ? { outstanding: outstanding?.potential_total ?? 0 }
        : {}),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
