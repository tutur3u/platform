import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string; invoiceId: string }> }
) {
  const { wsId, invoiceId } = await params;
  const access = await getFinanceRouteContext(
    req,
    wsId,
    await resolveFinanceRouteAuthContext(req)
  );
  if (access.response) return access.response;
  const { permissions, normalizedWsId, sbAdmin, user } = access.context;
  if (
    (['view_invoices', 'create_invoices', 'delete_invoices'] as const).some(
      (permission) => permissions.withoutPermission(permission)
    )
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  if (!z.guid().safeParse(invoiceId).success)
    return NextResponse.json(
      { message: 'Invalid invoice ID' },
      { status: 400 }
    );
  const { data, error } = await sbAdmin.rpc('admin_restore_finance_invoice', {
    p_ws_id: normalizedWsId,
    p_invoice_id: invoiceId,
    p_actor_id: user.id,
  });
  if (error) {
    const status = ['23503', '23505', '23514'].includes(error.code)
      ? 409
      : error.code === 'PGRST202'
        ? 503
        : 500;
    return NextResponse.json(
      {
        message:
          status === 409
            ? 'Invoice references have changed. Nothing was restored; contact support.'
            : 'Unable to restore invoice',
      },
      { status }
    );
  }
  if (!data)
    return NextResponse.json(
      { message: 'Recovery snapshot not found or already restored' },
      { status: 404 }
    );
  return NextResponse.json({ message: 'success' });
}
